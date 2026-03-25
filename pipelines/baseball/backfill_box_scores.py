"""
Backfill MLB box score stats for retrosheet CoreMatch rows that have no
BaseballTeamMatchStats yet.

The original backfill_history.py only fetched box scores for *newly inserted*
matches. All 22k retrosheet matches were already in the DB, so box scores were
never fetched for them. This script fixes that.

Matching strategy:
  - provider_id format: retrosheet-{year}-{YYYYMMDD}-{vis_abbr}-vs-{home_abbr}
  - Fetches MLB Stats API schedule per date → box score per game_pk
  - Matches via Retrosheet abbreviation lookup

Estimated runtime: ~2 hours for all 22k matches (1600 unique dates × ~16 API calls)
Run on Railway or locally:
    python -m pipelines.baseball.backfill_box_scores
    python -m pipelines.baseball.backfill_box_scores --start-year 2020
    python -m pipelines.baseball.backfill_box_scores --start-year 2022 --end-year 2024
"""

from __future__ import annotations

import argparse
import logging
import time
from collections import defaultdict
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from db.models.baseball import BaseballTeamMatchStats
from db.models.mvp import CoreMatch
from db.session import SessionLocal

log = logging.getLogger(__name__)

MLB_STATS_BASE = "https://statsapi.mlb.com/api/v1"

# MLB Stats API abbreviation → Retrosheet abbreviation (copied from backfill_history.py)
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


def _safe_float(v) -> float | None:
    try:
        return float(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def _safe_int(v) -> int | None:
    try:
        return int(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def _fetch_schedule(date_ymd: str) -> list[dict]:
    """Fetch all regular-season games for a date. Returns list of game dicts."""
    try:
        r = httpx.get(
            f"{MLB_STATS_BASE}/schedule",
            params={"sportId": 1, "date": date_ymd, "gameType": "R"},
            timeout=20,
        )
        r.raise_for_status()
        data = r.json()
        dates = data.get("dates", [])
        if not dates:
            return []
        return dates[0].get("games", [])
    except Exception as exc:
        log.warning("Schedule fetch failed for %s: %s", date_ymd, exc)
        return []


def _fetch_boxscore(game_pk: int) -> dict | None:
    try:
        r = httpx.get(f"{MLB_STATS_BASE}/game/{game_pk}/boxscore", timeout=20)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        log.warning("Box score fetch failed for gamePk %s: %s", game_pk, exc)
        return None


def _upsert_stats(
    db: Session,
    match_id: str,
    team_id: str,
    is_home: bool,
    batting: dict,
    pitching: dict,
    fielding: dict,
) -> bool:
    """Insert stats row if not already present. Returns True if inserted."""
    existing = db.query(BaseballTeamMatchStats).filter_by(
        match_id=match_id, team_id=team_id
    ).first()
    if existing is not None:
        return False

    db.add(BaseballTeamMatchStats(
        match_id=match_id,
        team_id=team_id,
        is_home=is_home,
        runs=_safe_int(batting.get("runs")),
        hits=_safe_int(batting.get("hits")),
        doubles=_safe_int(batting.get("doubles")),
        triples=_safe_int(batting.get("triples")),
        home_runs=_safe_int(batting.get("homeRuns")),
        rbi=_safe_int(batting.get("rbi")),
        walks=_safe_int(batting.get("baseOnBalls")),
        strikeouts_batting=_safe_int(batting.get("strikeOuts")),
        left_on_base=_safe_int(batting.get("leftOnBase")),
        batting_avg=_safe_float(batting.get("avg")),
        obp=_safe_float(batting.get("obp")),
        slg=_safe_float(batting.get("slg")),
        ops=_safe_float(batting.get("ops")),
        era=_safe_float(pitching.get("era")),
        innings_pitched=_safe_float(pitching.get("inningsPitched")),
        hits_allowed=_safe_int(pitching.get("hits")),
        earned_runs=_safe_int(pitching.get("earnedRuns")),
        walks_allowed=_safe_int(pitching.get("baseOnBalls")),
        strikeouts_pitching=_safe_int(pitching.get("strikeOuts")),
        whip=_safe_float(pitching.get("whip")),
        errors=_safe_int(fielding.get("errors")),
        double_plays=_safe_int(fielding.get("doublePlays")),
        created_at=datetime.now(timezone.utc),
    ))
    return True


def _parse_retrosheet_provider_id(provider_id: str) -> tuple[str, str, str] | None:
    """
    Parse 'retrosheet-{year}-{YYYYMMDD}-{vis_abbr}-vs-{home_abbr}'
    into (date_ymd, vis_abbr, home_abbr). Returns None on parse failure.
    """
    try:
        # Strip 'retrosheet-YYYY-' prefix
        without_prefix = provider_id[len("retrosheet-"):]          # YYYY-YYYYMMDD-VIS-vs-HOME
        parts = without_prefix.split("-", 2)                        # [YYYY, YYYYMMDD, rest]
        if len(parts) < 3:
            return None
        date_str = parts[1]                                         # YYYYMMDD
        rest     = parts[2]                                         # VIS-vs-HOME
        vis_abbr, home_abbr = rest.split("-vs-", 1)
        date_ymd = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
        return date_ymd, vis_abbr.strip(), home_abbr.strip()
    except Exception:
        return None


def run(start_year: int = 2015, end_year: int = 2024) -> int:
    db: Session = SessionLocal()
    total_inserted = 0

    try:
        # All retrosheet matches without stats
        existing_ids = {
            row[0]
            for row in db.query(BaseballTeamMatchStats.match_id).distinct().all()
        }
        # Track pairs inserted in this run to avoid duplicate inserts within a batch
        inserted_pairs: set[tuple[str, str]] = set()
        pending: list[CoreMatch] = (
            db.query(CoreMatch)
            .filter(
                CoreMatch.sport == "baseball",
                CoreMatch.status == "finished",
                CoreMatch.provider_id.like("retrosheet-%"),
            )
            .all()
        )
        pending = [
            m for m in pending
            if m.id not in existing_ids
            and m.kickoff_utc.year >= start_year
            and m.kickoff_utc.year <= end_year
        ]
        log.info("%d retrosheet matches need box scores.", len(pending))

        if not pending:
            log.info("Nothing to do.")
            return 0

        # Group by date
        by_date: dict[str, list[CoreMatch]] = defaultdict(list)
        for m in pending:
            parsed = _parse_retrosheet_provider_id(m.provider_id)
            if parsed:
                date_ymd, _, _ = parsed
                by_date[date_ymd].append(m)
            else:
                log.debug("Could not parse provider_id: %s", m.provider_id)

        log.info("%d unique dates to process.", len(by_date))

        for batch_idx, (date_ymd, day_matches) in enumerate(sorted(by_date.items())):
            log.info(
                "[%d/%d] %s — %d matches pending",
                batch_idx + 1, len(by_date), date_ymd, len(day_matches),
            )

            # Build match lookup: (vis_retro_abbr, home_retro_abbr) → CoreMatch
            match_lookup: dict[tuple[str, str], CoreMatch] = {}
            for m in day_matches:
                parsed = _parse_retrosheet_provider_id(m.provider_id)
                if parsed:
                    _, vis_abbr, home_abbr = parsed
                    match_lookup[(vis_abbr, home_abbr)] = m

            games = _fetch_schedule(date_ymd)
            time.sleep(0.25)

            if not games:
                continue

            date_inserted = 0
            for game in games:
                game_pk = game.get("gamePk")
                if not game_pk:
                    continue

                boxscore = _fetch_boxscore(game_pk)
                time.sleep(0.25)
                if not boxscore:
                    continue

                try:
                    teams = boxscore["teams"]
                    away_abbr_mlb = teams["away"]["team"]["abbreviation"]
                    home_abbr_mlb = teams["home"]["team"]["abbreviation"]
                except (KeyError, TypeError):
                    continue

                retro_away = MLB_TO_RETROSHEET.get(away_abbr_mlb, away_abbr_mlb)
                retro_home = MLB_TO_RETROSHEET.get(home_abbr_mlb, home_abbr_mlb)

                match = match_lookup.get((retro_away, retro_home))
                if match is None:
                    log.debug(
                        "  No CoreMatch for %s vs %s (%s vs %s) on %s",
                        away_abbr_mlb, home_abbr_mlb, retro_away, retro_home, date_ymd,
                    )
                    continue

                for side, is_home, team_id in [
                    ("away", False, match.away_team_id),
                    ("home", True,  match.home_team_id),
                ]:
                    pair = (match.id, team_id)
                    if pair in inserted_pairs:
                        continue
                    ts = teams[side].get("teamStats", {})
                    inserted = _upsert_stats(
                        db,
                        match_id=match.id,
                        team_id=team_id,
                        is_home=is_home,
                        batting=ts.get("batting", {}),
                        pitching=ts.get("pitching", {}),
                        fielding=ts.get("fielding", {}),
                    )
                    if inserted:
                        inserted_pairs.add(pair)
                        date_inserted += 1

            if date_inserted:
                db.commit()
                total_inserted += date_inserted
                log.info("  +%d rows (total so far: %d)", date_inserted, total_inserted)

        log.info("Backfill complete. %d team-match rows inserted.", total_inserted)
        return total_inserted

    except Exception:
        db.rollback()
        log.exception("Backfill failed")
        raise
    finally:
        db.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    parser = argparse.ArgumentParser(description="Backfill MLB box score stats for retrosheet matches")
    parser.add_argument("--start-year", type=int, default=2015)
    parser.add_argument("--end-year",   type=int, default=2024)
    args = parser.parse_args()
    n = run(start_year=args.start_year, end_year=args.end_year)
    print(f"Done. {n} rows inserted.")


if __name__ == "__main__":
    main()
