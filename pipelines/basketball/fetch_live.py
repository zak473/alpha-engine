"""
Fetch live NBA fixtures + scores from the free NBA Stats API (no key required).

Source: stats.nba.com/stats/scoreboardv2
Covers: NBA regular season, playoffs, preseason.

Usage:
    python -m pipelines.basketball.fetch_live
    python -m pipelines.basketball.fetch_live --dry-run
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import date, timedelta, datetime, timezone
from typing import Any, Optional

import requests

from pipelines.soccer.ingest_matches import ingest_from_dicts

log = logging.getLogger(__name__)

NBA_BASE = "https://stats.nba.com/stats"
NBA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.nba.com/",
    "Host": "stats.nba.com",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
    "Accept": "application/json",
}


def _rows_to_dicts(result_set: dict) -> list[dict]:
    headers = result_set["headers"]
    return [dict(zip(headers, row)) for row in result_set["rowSet"]]


def _get_scoreboard(game_date: date) -> list[dict]:
    date_str = game_date.strftime("%m/%d/%Y")
    try:
        resp = requests.get(
            f"{NBA_BASE}/scoreboardv2",
            headers=NBA_HEADERS,
            params={"DayOffset": "0", "LeagueID": "00", "GameDate": date_str},
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        result_sets = {rs["name"]: rs for rs in data.get("resultSets", [])}
        games = _rows_to_dicts(result_sets["GameHeader"]) if "GameHeader" in result_sets else []
        line_scores = _rows_to_dicts(result_sets["LineScore"]) if "LineScore" in result_sets else []
        return games, line_scores
    except Exception as exc:
        log.warning("NBA scoreboard error for %s: %s", game_date, exc)
        return [], []


def _build_rows(games: list[dict], line_scores: list[dict], game_date: date) -> list[dict]:
    # Build score lookup: game_id → {home_pts, away_pts}
    score_map: dict[str, dict] = {}
    for ls in line_scores:
        gid = str(ls.get("GAME_ID", ""))
        team_city = (ls.get("TEAM_CITY_NAME") or "").strip()
        team_name = (ls.get("TEAM_NAME") or "").strip()
        full_name = f"{team_city} {team_name}".strip()
        pts = ls.get("PTS")
        is_home = ls.get("TEAM_ABBREVIATION") == ls.get("TEAM_ABBREVIATION")  # will use ordering

        if gid not in score_map:
            score_map[gid] = {"teams": [], "pts": []}
        score_map[gid]["teams"].append(full_name)
        score_map[gid]["pts"].append(pts)

    rows = []
    season = str(game_date.year)

    for game in games:
        game_id = str(game.get("GAME_ID", ""))
        home_team = (game.get("HOME_TEAM_NAME") or
                     f"{game.get('HOME_TEAM_CITY','')} {game.get('HOME_TEAM_NAME','')}".strip())
        visitor_team = (game.get("VISITOR_TEAM_NAME") or
                        f"{game.get('VISITOR_TEAM_CITY','')} {game.get('VISITOR_TEAM_NAME','')}".strip())

        # Try richer name lookup from line scores
        sm = score_map.get(game_id, {})
        teams = sm.get("teams", [])
        pts_list = sm.get("pts", [])

        if len(teams) >= 2:
            visitor_team = teams[0]
            home_team = teams[1]
            visitor_pts = pts_list[0]
            home_pts = pts_list[1]
        else:
            home_pts = game.get("PTS_H") or game.get("HOME_TEAM_SCORE")
            visitor_pts = game.get("PTS_V") or game.get("VISITOR_TEAM_SCORE")

        if not home_team or not visitor_team:
            continue

        game_status = game.get("GAME_STATUS_ID", 1)
        game_status_text = (game.get("GAME_STATUS_TEXT") or "").strip()

        if game_status == 3:
            status = "finished"
        elif game_status == 2:
            status = "live"
        else:
            status = "scheduled"

        home_score = str(int(home_pts)) if home_pts is not None else ""
        away_score = str(int(visitor_pts)) if visitor_pts is not None else ""

        outcome = ""
        if status == "finished" and home_score and away_score:
            outcome = "H" if int(home_score) > int(away_score) else "A"

        game_time = (game.get("GAME_DATE_EST") or "").replace("T", " ").replace("Z", "")
        kickoff = game.get("GAME_DATE_EST") or f"{game_date.isoformat()}T00:00:00Z"

        arena = (game.get("ARENA_NAME") or "").strip()

        rows.append({
            "sport":                  "basketball",
            "provider_id":            f"nba-{game_id}",
            "league_provider_id":     "nba-league-nba",
            "league_name":            "NBA",
            "home_team_provider_id":  f"nba-team-{home_team.lower().replace(' ', '-')}",
            "home_team_name":         home_team,
            "away_team_provider_id":  f"nba-team-{visitor_team.lower().replace(' ', '-')}",
            "away_team_name":         visitor_team,
            "kickoff_utc":            kickoff,
            "status":                 status,
            "home_score":             home_score,
            "away_score":             away_score,
            "outcome":                outcome,
            "season":                 season,
            "venue":                  arena,
            "odds_home":              "",
            "odds_away":              "",
        })

    return rows


def fetch_all(dry_run: bool = False) -> int:
    today = date.today()
    all_rows: list[dict] = []

    # Fetch today + yesterday + tomorrow
    for delta in [-1, 0, 1]:
        d = today + timedelta(days=delta)
        games, line_scores = _get_scoreboard(d)
        rows = _build_rows(games, line_scores, d)
        log.info("NBA %s: %d games", d, len(rows))
        all_rows.extend(rows)
        time.sleep(0.5)

    if not all_rows:
        log.warning("No NBA data found.")
        return 0

    if dry_run:
        return len(all_rows)

    ingested = ingest_from_dicts(all_rows)
    log.info("Ingested %d basketball rows.", ingested)
    return ingested


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch live NBA fixtures + scores")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = fetch_all(dry_run=args.dry_run)
    print(f"Done. {n} rows processed.")


if __name__ == "__main__":
    main()
