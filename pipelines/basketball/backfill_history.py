"""
Ingest historical NBA seasons from the NBA Stats API.

Source: stats.nba.com/stats/leagueGameLog (no auth, just needs correct headers)
Covers: NBA regular seasons 2015-16 through 2024-25

Each GameLog row maps to a CoreMatch (finished) record.

Usage:
    python -m pipelines.basketball.backfill_history
    python -m pipelines.basketball.backfill_history --dry-run
    python -m pipelines.basketball.backfill_history --start-season 2015-16 --end-season 2023-24
"""

from __future__ import annotations

import argparse
import logging
import time
import uuid
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy.orm import Session

from db.models.mvp import CoreLeague, CoreMatch, CoreTeam
from db.session import SessionLocal

log = logging.getLogger(__name__)

NBA_STATS_URL = "https://stats.nba.com/stats/leagueGameLog"

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


def run(seasons: list[str] | None = None, dry_run: bool = False) -> int:
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
    parser.add_argument("--end-season",   default="2023-24",
                        help="Last season to backfill e.g. '2023-24'")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")

    # Build season list from range
    start_year = int(args.start_season[:4])
    end_year   = int(args.end_season[:4])
    selected = [s for s in SEASONS
                if int(s[:4]) >= start_year and int(s[:4]) <= end_year]

    n = run(seasons=selected, dry_run=args.dry_run)
    print(f"Done. {n} games ingested.")


if __name__ == "__main__":
    main()
