"""
Fetch live MLB fixtures + scores from the free MLB Stats API (no key required).

Source: https://statsapi.mlb.com/api/v1/schedule
Covers: MLB regular season, playoffs, spring training.

Usage:
    python -m pipelines.baseball.fetch_live
    python -m pipelines.baseball.fetch_live --dry-run
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import date, timedelta

import httpx

from pipelines.soccer.ingest_matches import ingest_from_dicts

log = logging.getLogger(__name__)

MLB_BASE = "https://statsapi.mlb.com/api/v1"


def _get_schedule(game_date: date) -> list[dict]:
    try:
        resp = httpx.get(
            f"{MLB_BASE}/schedule",
            params={"sportId": "1", "date": game_date.strftime("%Y-%m-%d"), "hydrate": "linescore,team"},
            timeout=20,
        )
        resp.raise_for_status()
        games = []
        for d in resp.json().get("dates", []):
            games.extend(d.get("games", []))
        return games
    except Exception as exc:
        log.warning("MLB schedule error for %s: %s", game_date, exc)
        return []


def _build_rows(games: list[dict], game_date: date) -> list[dict]:
    rows = []
    season = str(game_date.year)

    for game in games:
        game_pk = str(game.get("gamePk", ""))
        if not game_pk:
            continue

        home_data = game.get("teams", {}).get("home", {})
        away_data = game.get("teams", {}).get("away", {})
        home_team = (home_data.get("team", {}).get("name") or "").strip()
        away_team = (away_data.get("team", {}).get("name") or "").strip()
        if not home_team or not away_team:
            continue

        abstract_state = game.get("status", {}).get("abstractGameState", "")
        status_code = game.get("status", {}).get("statusCode", "")

        if abstract_state == "Final" or status_code in ("F", "FT", "FR", "FO"):
            status = "finished"
        elif abstract_state == "Live" or status_code in ("I", "IR", "MA"):
            status = "live"
        else:
            status = "scheduled"

        home_score = home_data.get("score") or game.get("linescore", {}).get("teams", {}).get("home", {}).get("runs")
        away_score = away_data.get("score") or game.get("linescore", {}).get("teams", {}).get("away", {}).get("runs")
        home_score_str = str(int(home_score)) if home_score is not None else ""
        away_score_str = str(int(away_score)) if away_score is not None else ""

        outcome = ""
        if status == "finished" and home_score_str != "" and away_score_str != "":
            h, a = int(home_score_str), int(away_score_str)
            outcome = "home_win" if h > a else "away_win"

        kickoff = game.get("gameDate") or f"{game_date.isoformat()}T00:00:00Z"
        venue_data = game.get("venue", {})
        venue = venue_data.get("name", "") if isinstance(venue_data, dict) else ""

        rows.append({
            "sport":                  "baseball",
            "provider_id":            f"mlb-{game_pk}",
            "league_provider_id":     "mlb-league-mlb",
            "league_name":            "MLB",
            "home_team_provider_id":  f"mlb-team-{home_team.lower().replace(' ', '-')}",
            "home_team_name":         home_team,
            "away_team_provider_id":  f"mlb-team-{away_team.lower().replace(' ', '-')}",
            "away_team_name":         away_team,
            "kickoff_utc":            kickoff,
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

    for delta in [-1, 0, 1]:
        d = today + timedelta(days=delta)
        games = _get_schedule(d)
        rows = _build_rows(games, d)
        log.info("MLB %s: %d games", d, len(rows))
        all_rows.extend(rows)
        time.sleep(0.3)

    if not all_rows:
        log.warning("No MLB data found.")
        return 0

    if dry_run:
        return len(all_rows)

    ingested = ingest_from_dicts(all_rows)
    log.info("Ingested %d baseball rows.", ingested)
    return ingested


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch live MLB fixtures + scores")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = fetch_all(dry_run=args.dry_run)
    print(f"Done. {n} rows processed.")


if __name__ == "__main__":
    main()
