"""
Ingest historical NBA seasons from the NBA Stats API.

Source: stats.nba.com/stats/leagueGameLog (no auth, just needs correct headers)
Covers: NBA regular seasons 2015-16 through 2024-25

Each GameLog row maps to a CoreMatch (finished) record.
Box score team stats are stored in BasketballTeamMatchStats.

Usage:
    python -m pipelines.basketball.backfill_history
    python -m pipelines.basketball.backfill_history --dry-run
    python -m pipelines.basketball.backfill_history --start-season 2015-16 --end-season 2023-24
    python -m pipelines.basketball.backfill_history --no-box-scores
"""

from __future__ import annotations

import argparse
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy.orm import Session

from db.models.basketball import BasketballTeamMatchStats
from db.models.mvp import CoreLeague, CoreMatch, CoreTeam
from db.session import SessionLocal

log = logging.getLogger(__name__)

NBA_STATS_URL = "https://stats.nba.com/stats/leagueGameLog"
NBA_BOX_SCORE_URL = "https://stats.nba.com/stats/boxscoretraditionalv2"

NBA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer":    "https://www.nba.com/",
    "Origin":     "https://www.nba.com",
    "Accept":     "application/json, text/plain, */*",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token":  "true",
}

# All seasons we want to backfill (NBA season format: "2015-16", etc.)
SEASONS = [
    "2015-16", "2016-17", "2017-18", "2018-19", "2019-20",
    "2020-21", "2021-22", "2022-23", "2023-24",
]


def _fetch_season_games(season: str, season_type: str = "Regular Season") -> list[dict]:
    """
    Fetch all game logs for a given season.
    Returns list of game dicts with home/away team, scores, date.
    """
    params = {
        "LeagueID":       "00",
        "Season":         season,
        "SeasonType":     season_type,
        "PlayerOrTeam":   "T",    # Team-level logs
        "Direction":      "ASC",
        "Sorter":         "DATE",
        "Counter":        "0",
    }
    try:
        resp = httpx.get(
            NBA_STATS_URL,
            params=params,
            headers=NBA_HEADERS,
            timeout=30,
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()

        result_set = data["resultSets"][0]
        headers_list = result_set["headers"]
        rows = result_set["rowSet"]

        # Convert rows to dicts
        games = [dict(zip(headers_list, row)) for row in rows]
        log.info("  %s %s: %d team-game rows", season, season_type, len(games))
        return games
    except httpx.HTTPStatusError as e:
        log.warning("  HTTP %s for season %s: %s", e.response.status_code, season, e)
        return []
    except Exception as e:
        log.warning("  Error fetching %s: %s", season, e)
        return []


def _pair_games(team_rows: list[dict]) -> list[dict]:
    """
    NBA stats leagueGameLog has one row per team per game.
    Pair home (MATCHUP contains "vs.") and away (MATCHUP contains "@") rows.
    Returns list of merged game dicts.
    """
    home_games: dict[str, dict] = {}
    away_games: dict[str, dict] = {}

    for row in team_rows:
        game_id   = row.get("GAME_ID", "")
        matchup   = row.get("MATCHUP", "")
        if "vs." in matchup:
            home_games[game_id] = row
        elif "@" in matchup:
            away_games[game_id] = row

    paired = []
    for game_id, home in home_games.items():
        away = away_games.get(game_id)
        if away:
            paired.append({"home": home, "away": away, "game_id": game_id})

    return paired


def _fetch_box_score(game_id: str) -> list[dict]:
    """
    Fetch TeamStats box score rows for a single game from boxscoretraditionalv2.
    Returns a list of up to 2 team dicts (home and away).
    Returns [] on any error.
    """
    params = {
        "GameID":       game_id,
        "StartPeriod":  "0",
        "EndPeriod":    "10",
        "StartRange":   "0",
        "EndRange":     "28800",
        "RangeType":    "0",
    }
    try:
        resp = httpx.get(
            NBA_BOX_SCORE_URL,
            params=params,
            headers=NBA_HEADERS,
            timeout=30,
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()

        # Find the "TeamStats" result set (index 1)
        team_stats_set = None
        for rs in data.get("resultSets", []):
            if rs.get("name") == "TeamStats":
                team_stats_set = rs
                break

        if team_stats_set is None:
            log.warning("  BoxScore %s: TeamStats result set not found", game_id)
            return []

        headers_list = team_stats_set["headers"]
        rows = team_stats_set["rowSet"]
        result = [dict(zip(headers_list, row)) for row in rows]
        return result
    except httpx.HTTPStatusError as e:
        log.warning("  BoxScore HTTP %s for game %s: %s", e.response.status_code, game_id, e)
        return []
    except Exception as e:
        log.warning("  BoxScore error for game %s: %s", game_id, e)
        return []
    finally:
        time.sleep(0.3)


def _safe_int(value: Any) -> int | None:
    """Convert value to int, returning None if value is None or conversion fails."""
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _upsert_box_score(
    db: Session,
    match_id: str,
    team_id: str,
    is_home: bool,
    row: dict,
) -> None:
    """
    Insert a BasketballTeamMatchStats row if one doesn't already exist
    for the given (match_id, team_id) pair.
    """
    existing = (
        db.query(BasketballTeamMatchStats)
        .filter_by(match_id=match_id, team_id=team_id)
        .first()
    )
    if existing is not None:
        return

    stats = BasketballTeamMatchStats(
        match_id=match_id,
        team_id=team_id,
        is_home=is_home,
        # Scoring
        points=_safe_int(row.get("PTS")),
        # Shooting
        fg_made=_safe_int(row.get("FGM")),
        fg_attempted=_safe_int(row.get("FGA")),
        fg_pct=row.get("FG_PCT"),
        fg3_made=_safe_int(row.get("FG3M")),
        fg3_attempted=_safe_int(row.get("FG3A")),
        fg3_pct=row.get("FG3_PCT"),
        ft_made=_safe_int(row.get("FTM")),
        ft_attempted=_safe_int(row.get("FTA")),
        ft_pct=row.get("FT_PCT"),
        # Rebounds
        rebounds_offensive=_safe_int(row.get("OREB")),
        rebounds_defensive=_safe_int(row.get("DREB")),
        rebounds_total=_safe_int(row.get("REB")),
        # Playmaking / defense
        assists=_safe_int(row.get("AST")),
        steals=_safe_int(row.get("STL")),
        blocks=_safe_int(row.get("BLK")),
        turnovers=_safe_int(row.get("TO")),
        fouls=_safe_int(row.get("PF")),
        # Advanced
        plus_minus=_safe_int(row.get("PLUS_MINUS")),
        created_at=datetime.now(timezone.utc),
    )
    db.add(stats)


def _upsert_league(db: Session, provider_id: str, name: str) -> str:
    league = db.query(CoreLeague).filter_by(provider_id=provider_id).first()
    if league is None:
        league = CoreLeague(
            name=name, provider_id=provider_id, sport="basketball", tier=1, is_active=True,
        )
        db.add(league)
        db.flush()
    return league.id


def _upsert_team(db: Session, provider_id: str, name: str, league_id: str) -> str:
    team = db.query(CoreTeam).filter_by(provider_id=provider_id).first()
    if team is None:
        team = CoreTeam(name=name, provider_id=provider_id, league_id=league_id, is_active=True)
        db.add(team)
        db.flush()
    return team.id


def run(
    seasons: list[str] | None = None,
    dry_run: bool = False,
    box_scores: bool = True,
) -> int:
    if seasons is None:
        seasons = SEASONS

    db: Session = SessionLocal()
    grand_total = 0

    try:
        if not dry_run:
            league_id = _upsert_league(db, "nba-stats", "NBA")
            db.commit()
        else:
            league_id = "dry-run"

        for season in seasons:
            log.info("=== NBA %s ===", season)
            team_rows = _fetch_season_games(season)
            if not team_rows:
                log.warning("  No data for %s — skipping", season)
                time.sleep(2)
                continue

            games = _pair_games(team_rows)
            log.info("  %d games paired", len(games))

            inserted = skipped = 0
            for g in games:
                home = g["home"]
                away = g["away"]

                game_id   = g["game_id"]
                date_str  = home.get("GAME_DATE", "")
                home_name = (home.get("TEAM_NAME") or home.get("TEAM_ABBREVIATION") or "").strip()
                away_name = (away.get("TEAM_NAME") or away.get("TEAM_ABBREVIATION") or "").strip()

                if not home_name or not away_name or not date_str:
                    skipped += 1
                    continue

                try:
                    dt = datetime.strptime(date_str[:10], "%Y-%m-%d")
                except ValueError:
                    try:
                        dt = datetime.strptime(date_str, "%b %d, %Y")
                    except ValueError:
                        skipped += 1
                        continue

                try:
                    home_pts = int(home.get("PTS") or 0)
                    away_pts = int(away.get("PTS") or 0)
                except (ValueError, TypeError):
                    skipped += 1
                    continue

                provider_id = f"nba-stats-{game_id}"
                outcome     = "H" if home_pts > away_pts else "A" if away_pts > home_pts else "D"

                if not dry_run:
                    home_abbr = (home.get("TEAM_ABBREVIATION") or "").strip()
                    away_abbr = (away.get("TEAM_ABBREVIATION") or "").strip()
                    home_pid  = f"nba-{home_abbr.lower()}"
                    away_pid  = f"nba-{away_abbr.lower()}"
                    home_id   = _upsert_team(db, home_pid, home_name, league_id)
                    away_id   = _upsert_team(db, away_pid, away_name, league_id)

                    existing = db.query(CoreMatch).filter_by(provider_id=provider_id).first()
                    if existing is None:
                        match = CoreMatch(
                            id=str(uuid.uuid4()),
                            provider_id=provider_id,
                            league_id=league_id,
                            sport="basketball",
                            season=season,
                            home_team_id=home_id,
                            away_team_id=away_id,
                            kickoff_utc=dt,
                            status="finished",
                            home_score=home_pts,
                            away_score=away_pts,
                            outcome=outcome,
                            is_neutral=False,
                        )
                        db.add(match)
                        db.flush()  # ensure match.id is populated before box score insert

                        if box_scores:
                            try:
                                box_rows = _fetch_box_score(game_id)
                                for row in box_rows:
                                    row_abbr = (row.get("TEAM_ABBREVIATION") or "").strip()
                                    is_home_val = row_abbr == home_abbr
                                    team_id_val = home_id if is_home_val else away_id
                                    _upsert_box_score(db, match.id, team_id_val, is_home_val, row)
                            except Exception as exc:
                                log.warning(
                                    "  Box score insert failed for game %s: %s", game_id, exc
                                )

                        inserted += 1
                        grand_total += 1

            if not dry_run:
                db.commit()

            log.info("  Inserted %d, skipped %d", inserted, skipped)
            time.sleep(1.0)  # polite delay between season requests

        log.info("Basketball history backfill complete. %d games ingested.", grand_total)
    except Exception:
        db.rollback()
        log.exception("Basketball history backfill failed")
        raise
    finally:
        db.close()

    return grand_total


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest NBA historical game data from stats.nba.com")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--start-season", default="2015-16",
                        help="First season to backfill e.g. '2015-16'")
    parser.add_argument("--end-season",   default="2024-25",
                        help="Last season to backfill e.g. '2023-24'")
    parser.add_argument("--no-box-scores", dest="box_scores", action="store_false",
                        help="Skip fetching box score stats for each game")
    parser.set_defaults(box_scores=True)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")

    # Build season list from range
    start_year = int(args.start_season[:4])
    end_year   = int(args.end_season[:4])
    selected = [s for s in SEASONS
                if int(s[:4]) >= start_year and int(s[:4]) <= end_year]

    n = run(seasons=selected, dry_run=args.dry_run, box_scores=args.box_scores)
    print(f"Done. {n} games ingested.")


if __name__ == "__main__":
    main()
