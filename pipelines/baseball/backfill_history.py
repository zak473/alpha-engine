"""
Ingest historical MLB seasons from the Retrosheet game log files.

Source: https://www.retrosheet.org/gamelogs/
Format: GLYYYYMMDD.TXT (fixed-field CSV, 161 fields per game)
No API key required — data is free for non-commercial use.

Fields used (0-based index from Retrosheet spec):
  0  = Date (YYYYMMDD)
  3  = Visiting team abbrev
  6  = Home team abbrev
  9  = Visiting score (runs)
  10 = Home score (runs)
  159= Visiting league (A = AL, N = NL)
  160= Home league

Seasons loaded: 2015-2024

Usage:
    python -m pipelines.baseball.backfill_history
    python -m pipelines.baseball.backfill_history --dry-run
    python -m pipelines.baseball.backfill_history --start-year 2019 --end-year 2024
    python -m pipelines.baseball.backfill_history --no-box-scores
"""

from __future__ import annotations

import argparse
import csv
import io
import logging
import time
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy.orm import Session

from db.models.baseball import BaseballTeamMatchStats
from db.models.mvp import CoreLeague, CoreMatch, CoreTeam
from db.session import SessionLocal

log = logging.getLogger(__name__)

RETROSHEET_BASE = "https://www.retrosheet.org/gamelogs"
MLB_STATS_BASE = "https://statsapi.mlb.com/api/v1"

# MLB team abbreviation → full name
TEAM_NAMES: dict[str, str] = {
    "ANA": "Los Angeles Angels",
    "ARI": "Arizona Diamondbacks",
    "ATL": "Atlanta Braves",
    "BAL": "Baltimore Orioles",
    "BOS": "Boston Red Sox",
    "CHA": "Chicago White Sox",
    "CHN": "Chicago Cubs",
    "CIN": "Cincinnati Reds",
    "CLE": "Cleveland Guardians",
    "COL": "Colorado Rockies",
    "DET": "Detroit Tigers",
    "HOU": "Houston Astros",
    "KCA": "Kansas City Royals",
    "LAA": "Los Angeles Angels",
    "LAN": "Los Angeles Dodgers",
    "MIA": "Miami Marlins",
    "MIL": "Milwaukee Brewers",
    "MIN": "Minnesota Twins",
    "NYA": "New York Yankees",
    "NYN": "New York Mets",
    "OAK": "Oakland Athletics",
    "PHI": "Philadelphia Phillies",
    "PIT": "Pittsburgh Pirates",
    "SDN": "San Diego Padres",
    "SEA": "Seattle Mariners",
    "SFN": "San Francisco Giants",
    "SLN": "St. Louis Cardinals",
    "TBA": "Tampa Bay Rays",
    "TEX": "Texas Rangers",
    "TOR": "Toronto Blue Jays",
    "WAS": "Washington Nationals",
    # Old abbrevs that occasionally appear
    "FLO": "Miami Marlins",
    "MON": "Montreal Expos",
    "MFW": "Milwaukee Brewers",
}

# MLB Stats API abbreviation → Retrosheet abbreviation
MLB_TO_RETROSHEET: dict[str, str] = {
    "LAA": "ANA", "LAD": "LAN", "CHW": "CHA", "CHC": "CHN",
    "CLE": "CLE", "NYY": "NYA", "NYM": "NYN", "SD":  "SDN",
    "SF":  "SFN", "STL": "SLN", "TB":  "TBA", "WSH": "WAS",
    "KC":  "KCA", "MIL": "MIL", "MIN": "MIN", "OAK": "OAK",
    "PHI": "PHI", "PIT": "PIT", "SEA": "SEA", "TEX": "TEX",
    "TOR": "TOR", "ATL": "ATL", "ARI": "ARI", "BAL": "BAL",
    "BOS": "BOS", "CIN": "CIN", "COL": "COL", "DET": "DET",
    "HOU": "HOU", "MIA": "MIA",
}


def _safe_float(val: Any) -> float | None:
    """Return float(val) or None if val is None or an empty string."""
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _fetch_gamelogs(year: int) -> list[list[str]]:
    """
    Download the game log zip for a given year, extract the .TXT and parse.
    Returns list of field lists (one per game).
    """
    url = f"{RETROSHEET_BASE}/gl{year}.zip"
    log.info("  Fetching %s ...", url)
    try:
        resp = httpx.get(url, timeout=30, follow_redirects=True)
        resp.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            # The file inside is typically GL{YEAR}.TXT or GLYYYYMMDD.TXT
            txt_files = [n for n in zf.namelist() if n.upper().endswith(".TXT")]
            if not txt_files:
                log.warning("    No .TXT files in zip")
                return []
            games = []
            for fname in txt_files:
                content = zf.read(fname).decode("latin-1")
                reader = csv.reader(io.StringIO(content))
                for row in reader:
                    if len(row) >= 11:  # need at least date + teams + scores
                        games.append(row)
            log.info("    %d game rows", len(games))
            return games
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            log.info("    Not found (404) — skipping %d", year)
            return []
        log.warning("    HTTP %s: %s", e.response.status_code, url)
        return []
    except zipfile.BadZipFile:
        log.warning("    Bad zip file for %d", year)
        return []
    except Exception as e:
        log.warning("    Error fetching %d: %s", year, e)
        return []


def _fetch_mlb_boxscores_for_date(date_str_ymd: str) -> list[dict]:
    """
    Fetch all regular-season box scores from the MLB Stats API for a given date.

    Args:
        date_str_ymd: Date in YYYY-MM-DD format.

    Returns:
        List of dicts with keys: away_abbr, home_abbr, home_stats, away_stats.
        Each *_stats dict contains nested batting, pitching, and fielding sub-dicts.
        Returns [] on any error.
    """
    try:
        schedule_resp = httpx.get(
            f"{MLB_STATS_BASE}/schedule",
            params={"sportId": 1, "date": date_str_ymd, "gameType": "R"},
            timeout=20,
        )
        schedule_resp.raise_for_status()
        data = schedule_resp.json()
    except Exception as exc:
        log.warning("    MLB schedule fetch failed for %s: %s", date_str_ymd, exc)
        return []

    try:
        games_raw = data["dates"][0]["games"]
    except (KeyError, IndexError):
        return []

    results: list[dict] = []

    for game in games_raw:
        game_pk = game.get("gamePk")
        if game_pk is None:
            continue

        time.sleep(0.2)

        try:
            box_resp = httpx.get(
                f"{MLB_STATS_BASE}/game/{game_pk}/boxscore",
                timeout=20,
            )
            box_resp.raise_for_status()
            box = box_resp.json()
        except Exception as exc:
            log.warning("    Box score fetch failed for gamePk %s: %s", game_pk, exc)
            continue

        try:
            teams = box["teams"]
            away_team = teams["away"]
            home_team = teams["home"]

            away_abbr = away_team["team"]["abbreviation"]
            home_abbr = home_team["team"]["abbreviation"]

            def _extract_stats(side: dict) -> dict:
                ts = side.get("teamStats", {})
                return {
                    "batting":  ts.get("batting",  {}),
                    "pitching": ts.get("pitching", {}),
                    "fielding": ts.get("fielding", {}),
                }

            results.append({
                "away_abbr":  away_abbr,
                "home_abbr":  home_abbr,
                "away_stats": _extract_stats(away_team),
                "home_stats": _extract_stats(home_team),
            })
        except (KeyError, TypeError) as exc:
            log.warning("    Could not parse box score for gamePk %s: %s", game_pk, exc)
            continue

    return results


def _upsert_baseball_box_score(
    db: Session,
    match_id: str,
    team_id: str,
    is_home: bool,
    stats: dict,
) -> None:
    """
    Insert a BaseballTeamMatchStats row if one does not already exist for the
    given match_id / team_id combination.
    """
    existing = (
        db.query(BaseballTeamMatchStats)
        .filter_by(match_id=match_id, team_id=team_id)
        .first()
    )
    if existing is not None:
        return

    batting  = stats.get("batting",  {})
    pitching = stats.get("pitching", {})
    fielding = stats.get("fielding", {})

    row = BaseballTeamMatchStats(
        match_id=match_id,
        team_id=team_id,
        is_home=is_home,
        # Batting
        runs=batting.get("runs"),
        hits=batting.get("hits"),
        doubles=batting.get("doubles"),
        triples=batting.get("triples"),
        home_runs=batting.get("homeRuns"),
        rbi=batting.get("rbi"),
        walks=batting.get("baseOnBalls"),
        strikeouts_batting=batting.get("strikeOuts"),
        left_on_base=batting.get("leftOnBase"),
        batting_avg=_safe_float(batting.get("avg")),
        obp=_safe_float(batting.get("obp")),
        slg=_safe_float(batting.get("slg")),
        ops=_safe_float(batting.get("ops")),
        # Pitching
        era=_safe_float(pitching.get("era")),
        innings_pitched=_safe_float(pitching.get("inningsPitched")),
        hits_allowed=pitching.get("hits"),
        earned_runs=pitching.get("earnedRuns"),
        walks_allowed=pitching.get("baseOnBalls"),
        strikeouts_pitching=pitching.get("strikeOuts"),
        whip=_safe_float(pitching.get("whip")),
        # Fielding
        errors=fielding.get("errors"),
        double_plays=fielding.get("doublePlays"),
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)


def _parse_date(s: str) -> datetime | None:
    try:
        return datetime.strptime(s[:8], "%Y%m%d")
    except Exception:
        return None


def _upsert_league(db: Session, provider_id: str, name: str) -> str:
    league = db.query(CoreLeague).filter_by(provider_id=provider_id).first()
    if league is None:
        league = CoreLeague(
            name=name,
            provider_id=provider_id,
            sport="baseball",
            tier=1,
            is_active=True,
        )
        db.add(league)
        db.flush()
    return league.id


def _upsert_team(db: Session, provider_id: str, name: str, league_id: str) -> str:
    team = db.query(CoreTeam).filter_by(provider_id=provider_id).first()
    if team is None:
        team = CoreTeam(
            name=name,
            provider_id=provider_id,
            league_id=league_id,
            is_active=True,
        )
        db.add(team)
        db.flush()
    return team.id


def run_year(
    db: Session,
    year: int,
    league_id: str,
    dry_run: bool,
    box_scores: bool = True,
) -> tuple[int, int]:
    games = _fetch_gamelogs(year)
    inserted = skipped = 0

    # Maps YYYYMMDD date string → list of CoreMatch objects inserted this run.
    # Used for the box-score second pass.
    date_match_index: dict[str, list[CoreMatch]] = {}

    for fields in games:
        try:
            date_str  = fields[0]   # YYYYMMDD
            vis_abbr  = fields[3].strip()
            home_abbr = fields[6].strip()

            if not vis_abbr or not home_abbr:
                skipped += 1
                continue

            # Scores
            try:
                vis_score  = int(fields[9])
                home_score = int(fields[10])
            except (ValueError, IndexError):
                skipped += 1
                continue

            dt = _parse_date(date_str)
            if dt is None:
                skipped += 1
                continue

            vis_name  = TEAM_NAMES.get(vis_abbr,  vis_abbr)
            home_name = TEAM_NAMES.get(home_abbr, home_abbr)

            provider_id = f"retrosheet-{year}-{date_str}-{vis_abbr}-vs-{home_abbr}"

            if not dry_run:
                vis_id  = _upsert_team(db, f"mlb-{vis_abbr}",  vis_name,  league_id)
                home_id = _upsert_team(db, f"mlb-{home_abbr}", home_name, league_id)

                existing = db.query(CoreMatch).filter_by(provider_id=provider_id).first()
                if existing is None:
                    outcome = (
                        "H" if home_score > vis_score else
                        "A" if vis_score > home_score else
                        "D"
                    )
                    match = CoreMatch(
                        id=str(uuid.uuid4()),
                        provider_id=provider_id,
                        league_id=league_id,
                        sport="baseball",
                        season=str(year),
                        home_team_id=home_id,
                        away_team_id=vis_id,
                        kickoff_utc=dt,
                        status="finished",
                        home_score=home_score,
                        away_score=vis_score,
                        outcome=outcome,
                        is_neutral=False,
                    )
                    db.add(match)
                    db.flush()
                    inserted += 1

                    if box_scores:
                        date_match_index.setdefault(date_str, []).append(match)

        except Exception as exc:
            log.debug("  Skipping row: %s", exc)
            skipped += 1
            continue

    # --- Box score second pass ---
    if not dry_run and box_scores and date_match_index:
        log.info("  Fetching MLB box scores for %d unique dates ...", len(date_match_index))
        box_inserted = 0

        for date_str, matches in sorted(date_match_index.items()):
            # Convert YYYYMMDD → YYYY-MM-DD for the MLB Stats API
            date_ymd = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"

            bs_games = _fetch_mlb_boxscores_for_date(date_ymd)
            if not bs_games:
                continue

            # Build a quick lookup: (retro_vis_abbr, retro_home_abbr) → CoreMatch
            match_lookup: dict[tuple[str, str], CoreMatch] = {}
            for m in matches:
                # provider_id = "retrosheet-{year}-{date_str}-{vis_abbr}-vs-{home_abbr}"
                parts = m.provider_id.split("-")
                # parts: ['retrosheet', year, date_str, vis_abbr, 'vs', home_abbr]
                # Robust extraction via the known fixed separator ' -vs- '
                try:
                    _, rest = m.provider_id.split(f"retrosheet-{year}-{date_str}-", 1)
                    vis_part, home_part = rest.split("-vs-", 1)
                    match_lookup[(vis_part, home_part)] = m
                except ValueError:
                    log.warning("    Could not parse provider_id: %s", m.provider_id)
                    continue

            for bs in bs_games:
                try:
                    retro_away = MLB_TO_RETROSHEET.get(bs["away_abbr"], bs["away_abbr"])
                    retro_home = MLB_TO_RETROSHEET.get(bs["home_abbr"], bs["home_abbr"])

                    match = match_lookup.get((retro_away, retro_home))
                    if match is None:
                        log.debug(
                            "    No CoreMatch for %s vs %s on %s (retro: %s vs %s)",
                            bs["away_abbr"], bs["home_abbr"], date_ymd,
                            retro_away, retro_home,
                        )
                        continue

                    away_team_id = match.away_team_id
                    home_team_id = match.home_team_id

                    _upsert_baseball_box_score(
                        db, match.id, away_team_id, is_home=False, stats=bs["away_stats"]
                    )
                    _upsert_baseball_box_score(
                        db, match.id, home_team_id, is_home=True, stats=bs["home_stats"]
                    )
                    box_inserted += 2

                except Exception as exc:
                    log.warning("    Box score upsert error: %s", exc)
                    continue

        log.info("  Box score rows inserted: %d", box_inserted)

    if not dry_run:
        db.commit()

    return inserted, skipped


def run(
    start_year: int = 2015,
    end_year: int = 2024,
    dry_run: bool = False,
    box_scores: bool = True,
) -> int:
    db: Session = SessionLocal()
    grand_total = 0

    try:
        # One MLB league record shared across all seasons
        league_pid  = "retrosheet-mlb"
        league_name = "MLB"
        if not dry_run:
            league_id = _upsert_league(db, league_pid, league_name)
            db.commit()
        else:
            league_id = "dry-run"

        for year in range(start_year, end_year + 1):
            log.info("=== MLB %d ===", year)
            inserted, skipped = run_year(db, year, league_id, dry_run, box_scores=box_scores)
            log.info("  inserted=%d  skipped=%d", inserted, skipped)
            grand_total += inserted
            time.sleep(0.5)

        log.info("Baseball history backfill complete. %d games ingested.", grand_total)
    except Exception:
        db.rollback()
        log.exception("Baseball history backfill failed")
        raise
    finally:
        db.close()

    return grand_total


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest Retrosheet MLB historical game logs")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--start-year", type=int, default=2015)
    parser.add_argument("--end-year",   type=int, default=2024)
    parser.add_argument(
        "--no-box-scores",
        action="store_true",
        help="Skip fetching MLB Stats API box scores (only ingest CoreMatch rows)",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = run(
        start_year=args.start_year,
        end_year=args.end_year,
        dry_run=args.dry_run,
        box_scores=not args.no_box_scores,
    )
    print(f"Done. {n} games ingested.")


if __name__ == "__main__":
    main()
