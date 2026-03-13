"""
Fetch live NHL fixtures + scores from The Odds API and ingest them.

Uses TENNIS_API_KEY (shared The Odds API key).
Covers: NHL, AHL, KHL, SHL, Liiga, and other major leagues.

Two passes per sport key:
  1. /odds  — upcoming fixtures (status=scheduled)
  2. /scores — commenced + not completed → status=live; completed → status=finished

Usage:
    python -m pipelines.hockey.fetch_live
    python -m pipelines.hockey.fetch_live --dry-run
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from config.settings import settings
from pipelines.soccer.ingest_matches import ingest_from_dicts

log = logging.getLogger(__name__)

BASE_URL = "https://api.the-odds-api.com/v4"


def _get(path: str, params: dict | None = None) -> Any:
    url = f"{BASE_URL}{path}"
    p = {"apiKey": settings.TENNIS_API_KEY, **(params or {})}
    resp = httpx.get(url, params=p, timeout=15)
    resp.raise_for_status()
    return resp.json()


def _get_active_hockey_sports() -> list[dict]:
    try:
        sports = _get("/sports", {"all": "false"})
        return [
            s for s in sports
            if s.get("group", "").lower() == "ice hockey"
            and not s.get("has_outrights", False)
            and "_winner" not in s.get("key", "")
        ]
    except Exception as exc:
        log.warning("Could not fetch sports list: %s", exc)
        return []


def _extract_h2h_odds(event: dict[str, Any]) -> tuple[str, str]:
    for bm in (event.get("bookmakers") or []):
        for mkt in (bm.get("markets") or []):
            if mkt.get("key") != "h2h":
                continue
            outcomes = {o["name"]: o["price"] for o in (mkt.get("outcomes") or [])}
            home_t = event.get("home_team", "")
            away_t = event.get("away_team", "")
            h = outcomes.get(home_t) or outcomes.get("home")
            a = outcomes.get(away_t) or outcomes.get("away")
            if h and a:
                return str(h), str(a)
    return "", ""


def _transform_fixture(event: dict[str, Any], sport_title: str, sport_key: str) -> dict[str, Any] | None:
    home = (event.get("home_team") or "").strip()
    away = (event.get("away_team") or "").strip()
    if not home or not away:
        return None

    kickoff = event.get("commence_time", "")
    season  = kickoff[:4] if kickoff else ""
    odds_home, odds_away = _extract_h2h_odds(event)

    return {
        "sport":                  "hockey",
        "provider_id":            f"odds-hockey-{event['id']}",
        "league_provider_id":     f"odds-league-{sport_key}",
        "league_name":            sport_title,
        "home_team_provider_id":  f"odds-hockey-{sport_key}-{home.lower().replace(' ', '-')}",
        "home_team_name":         home,
        "away_team_provider_id":  f"odds-hockey-{sport_key}-{away.lower().replace(' ', '-')}",
        "away_team_name":         away,
        "kickoff_utc":            kickoff,
        "status":                 "scheduled",
        "home_score":             "",
        "away_score":             "",
        "outcome":                "",
        "season":                 season,
        "venue":                  "",
        "odds_home":              odds_home,
        "odds_away":              odds_away,
    }


def _transform_score_event(event: dict[str, Any], sport_key: str) -> dict[str, Any] | None:
    home = (event.get("home_team") or "").strip()
    away = (event.get("away_team") or "").strip()
    if not home or not away:
        return None

    event_id    = event.get("id", "")
    kickoff     = event.get("commence_time", "")
    completed   = event.get("completed", False)
    season      = kickoff[:4] if kickoff else ""
    sport_title = event.get("sport_title", sport_key)

    now = datetime.now(timezone.utc)
    try:
        commence_dt = datetime.fromisoformat(kickoff.replace("Z", "+00:00"))
        started = commence_dt <= now
    except Exception:
        started = False

    if completed:
        status = "finished"
    elif started:
        status = "live"
    else:
        return None

    scores = event.get("scores") or []
    home_score = away_score = ""
    outcome = ""
    if len(scores) >= 2:
        score_map = {s.get("name", ""): s.get("score", "") for s in scores}
        h = score_map.get(home, "")
        a = score_map.get(away, "")
        try:
            home_score = str(int(h)) if h else ""
            away_score = str(int(a)) if a else ""
            if completed and home_score and away_score:
                outcome = "H" if int(home_score) > int(away_score) else "A"
        except ValueError:
            home_score = away_score = ""

    return {
        "sport":                  "hockey",
        "provider_id":            f"odds-hockey-{event_id}",
        "league_provider_id":     f"odds-league-{sport_key}",
        "league_name":            sport_title,
        "home_team_provider_id":  f"odds-hockey-{sport_key}-{home.lower().replace(' ', '-')}",
        "home_team_name":         home,
        "away_team_provider_id":  f"odds-hockey-{sport_key}-{away.lower().replace(' ', '-')}",
        "away_team_name":         away,
        "kickoff_utc":            kickoff,
        "status":                 status,
        "home_score":             home_score,
        "away_score":             away_score,
        "outcome":                outcome,
        "season":                 season,
        "venue":                  "",
    }


def fetch_all(dry_run: bool = False) -> int:
    if not settings.TENNIS_API_KEY:
        log.error("TENNIS_API_KEY (The Odds API) not set.")
        return 0

    active_sports = _get_active_hockey_sports()
    if not active_sports:
        log.warning("No active hockey sports found.")
        return 0

    log.info("Active hockey leagues: %s", [s["title"] for s in active_sports])

    fixture_rows: list[dict] = []
    score_rows:   list[dict] = []

    for sport in active_sports:
        key   = sport["key"]
        title = sport["title"]

        try:
            log.info("Fetching hockey fixtures: %s ...", title)
            events = _get(f"/sports/{key}/odds", {"regions": "eu", "markets": "h2h", "oddsFormat": "decimal"})
            rows = [r for ev in events if (r := _transform_fixture(ev, title, key))]
            log.info("  → %d fixtures", len(rows))
            fixture_rows.extend(rows)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != 404:
                log.warning("  HTTP %s for %s/odds: %s", exc.response.status_code, key, exc)
        except Exception as exc:
            log.warning("  Fixture error for %s: %s", key, exc)
        time.sleep(0.3)

        try:
            log.info("Fetching hockey scores: %s ...", key)
            events = _get(f"/sports/{key}/scores", {"daysFrom": "2"})
            rows = [r for ev in events if (r := _transform_score_event(ev, key))]
            log.info("  → %d live/finished score rows", len(rows))
            score_rows.extend(rows)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != 404:
                log.warning("  HTTP %s for %s/scores: %s", exc.response.status_code, key, exc)
        except Exception as exc:
            log.warning("  Scores error for %s: %s", key, exc)
        time.sleep(0.3)

    all_rows = fixture_rows + score_rows
    log.info(
        "Total hockey rows to ingest: %d (%d fixtures + %d scores)",
        len(all_rows), len(fixture_rows), len(score_rows),
    )

    if not all_rows:
        log.warning("No hockey data found.")
        return 0

    if dry_run:
        return len(all_rows)

    ingested = ingest_from_dicts(all_rows)
    log.info("Ingested %d hockey rows.", ingested)
    return ingested


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch live hockey fixtures + scores")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = fetch_all(dry_run=args.dry_run)
    print(f"Done. {n} rows processed.")


if __name__ == "__main__":
    main()
