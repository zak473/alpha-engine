"""
Fetch live NHL fixtures + scores from the free NHL Stats API (no key required).

Source: https://api-web.nhle.com/v1
Covers: NHL regular season, playoffs, preseason.

Usage:
    python -m pipelines.hockey.fetch_live
    python -m pipelines.hockey.fetch_live --dry-run
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import date, timedelta
from typing import Any, Optional

import httpx

from pipelines.soccer.ingest_matches import ingest_from_dicts

log = logging.getLogger(__name__)

NHL_BASE = "https://api-web.nhle.com/v1"


def _get(path: str) -> Optional[Any]:
    try:
        resp = httpx.get(f"{NHL_BASE}{path}", timeout=20, follow_redirects=True)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        log.warning("NHL API error %s: %s", path, exc)
        return None


def _team_name(team: dict) -> str:
    name = team.get("name", {})
    if isinstance(name, dict):
        return (name.get("default") or "").strip()
    common = team.get("commonName", {})
    if isinstance(common, dict):
        place = (team.get("placeName", {}).get("default") or "").strip()
        n = (common.get("default") or "").strip()
        return f"{place} {n}".strip() if place else n
    return str(name).strip()


def _get_schedule(game_date: date) -> list[dict]:
    data = _get(f"/schedule/{game_date.isoformat()}")
    if not data:
        return []
    games = []
    for week in data.get("gameWeek", []):
        games.extend(week.get("games", []))
    return games


def _get_scores(game_date: date) -> list[dict]:
    data = _get(f"/score/{game_date.isoformat()}")
    if not data:
        return []
    return data.get("games", [])


def _build_rows(games: list[dict], game_date: date) -> list[dict]:
    rows = []
    season = str(game_date.year)

    for game in games:
        game_id = str(game.get("id", ""))
        if not game_id:
            continue

        home_data = game.get("homeTeam", {})
        away_data = game.get("awayTeam", {})
        home_team = _team_name(home_data)
        away_team = _team_name(away_data)
        if not home_team or not away_team:
            continue

        game_state = (game.get("gameState") or "").upper()
        game_type = game.get("gameType", 2)  # 1=preseason, 2=regular, 3=playoffs

        if game_state in ("OFF", "FINAL"):
            status = "finished"
        elif game_state in ("LIVE", "CRIT", "LIVEOD"):
            status = "live"
        else:
            status = "scheduled"

        home_score = home_data.get("score")
        away_score = away_data.get("score")
        home_score_str = str(int(home_score)) if home_score is not None else ""
        away_score_str = str(int(away_score)) if away_score is not None else ""

        outcome = ""
        if status == "finished" and home_score_str and away_score_str:
            outcome = "H" if int(home_score_str) > int(away_score_str) else "A"

        start_time = game.get("startTimeUTC") or f"{game_date.isoformat()}T00:00:00Z"
        venue = game.get("venue", {}).get("default", "") if isinstance(game.get("venue"), dict) else ""

        league_type = {1: "NHL Preseason", 2: "NHL", 3: "NHL Playoffs"}.get(game_type, "NHL")

        rows.append({
            "sport":                  "hockey",
            "provider_id":            f"nhl-{game_id}",
            "league_provider_id":     f"nhl-league-{league_type.lower().replace(' ', '-')}",
            "league_name":            league_type,
            "home_team_provider_id":  f"nhl-team-{home_team.lower().replace(' ', '-')}",
            "home_team_name":         home_team,
            "away_team_provider_id":  f"nhl-team-{away_team.lower().replace(' ', '-')}",
            "away_team_name":         away_team,
            "kickoff_utc":            start_time,
            "status":                 status,
            "home_score":             home_score_str,
            "away_score":             away_score_str,
            "outcome":                outcome,
            "season":                 season,
            "venue":                  venue,
            "odds_home":              "",
            "odds_away":              "",
        })

    return rows


def fetch_all(dry_run: bool = False) -> int:
    today = date.today()
    all_rows: list[dict] = []

    # Schedule: today + next 2 days
    for delta in [0, 1, 2]:
        d = today + timedelta(days=delta)
        games = _get_schedule(d)
        rows = _build_rows(games, d)
        log.info("NHL schedule %s: %d games", d, len(rows))
        all_rows.extend(rows)
        time.sleep(0.2)

    # Scores: yesterday + today (live + finished)
    for delta in [-1, 0]:
        d = today + timedelta(days=delta)
        games = _get_scores(d)
        rows = _build_rows(games, d)
        log.info("NHL scores %s: %d games", d, len(rows))
        all_rows.extend(rows)
        time.sleep(0.2)

    if not all_rows:
        log.warning("No NHL data found.")
        return 0

    if dry_run:
        return len(all_rows)

    ingested = ingest_from_dicts(all_rows)
    log.info("Ingested %d hockey rows.", ingested)
    return ingested


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch live NHL fixtures + scores")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = fetch_all(dry_run=args.dry_run)
    print(f"Done. {n} rows processed.")


if __name__ == "__main__":
    main()
