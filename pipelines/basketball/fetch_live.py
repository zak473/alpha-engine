"""
Fetch live basketball fixtures + scores from The Odds API and ingest them.

Uses the same API key as tennis (TENNIS_API_KEY / The Odds API).
Covers: NBA, Euroleague, NCAAB, NBL, WNBA.

Two passes per sport key:
  1. /odds  — upcoming fixtures (status=scheduled)
  2. /scores — commenced + not completed → status=live; completed → status=finished

Usage:
    python -m pipelines.basketball.fetch_live
    python -m pipelines.basketball.fetch_live --dry-run
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


def _get_active_basketball_sports() -> list[dict]:
    try:
        sports = _get("/sports", {"all": "false"})
        return [s for s in sports if s.get("group", "").lower() == "basketball"]
    except Exception as exc:
        log.warning("Could not fetch sports list: %s", exc)
        return []


def _transform_fixture(event: dict[str, Any], sport_title: str, sport_key: str) -> dict[str, Any] | None:
    home = (event.get("home_team") or "").strip()
    away = (event.get("away_team") or "").strip()
    if not home or not away:
        return None

    kickoff = event.get("commence_time", "")
    season  = kickoff[:4] if kickoff else ""

    return {
        "sport":                  "basketball",
        "provider_id":            f"odds-bball-{event['id']}",
        "league_provider_id":     f"odds-league-{sport_key}",
        "league_name":            sport_title,
        "home_team_provider_id":  f"odds-bball-{sport_key}-{home.lower().replace(' ', '-')}",
        "home_team_name":         home,
        "away_team_provider_id":  f"odds-bball-{sport_key}-{away.lower().replace(' ', '-')}",
        "away_team_name":         away,
        "kickoff_utc":            kickoff,
        "status":                 "scheduled",
        "home_score":             "",
        "away_score":             "",
        "outcome":                "",
        "season":                 season,
        "venue":                  "",
    }


def _transform_score_event(event: dict[str, Any], sport_key: str) -> dict[str, Any] | None:
    """Convert a /scores API event into an ingest row with live/finished status."""
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
        return None  # not started yet — fixtures endpoint handles these

    # Scores: API returns [{"name": team, "score": "112"}, ...]
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
        "sport":                  "basketball",
        "provider_id":            f"odds-bball-{event_id}",
        "league_provider_id":     f"odds-league-{sport_key}",
        "league_name":            sport_title,
        "home_team_provider_id":  f"odds-bball-{sport_key}-{home.lower().replace(' ', '-')}",
        "home_team_name":         home,
        "away_team_provider_id":  f"odds-bball-{sport_key}-{away.lower().replace(' ', '-')}",
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

    active_sports = _get_active_basketball_sports()
    if not active_sports:
        log.warning("No active basketball sports found.")
        return 0

    log.info("Active basketball leagues: %s", [s["title"] for s in active_sports])

    fixture_rows: list[dict] = []
    score_rows:   list[dict] = []

    for sport in active_sports:
        key   = sport["key"]
        title = sport["title"]

        # Pass 1: upcoming fixtures
        try:
            log.info("Fetching basketball fixtures: %s ...", title)
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

        # Pass 2: in-play / recent scores
        try:
            log.info("Fetching basketball scores: %s ...", key)
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

    # Fixtures first (scheduled), then scores (live/finished) — scores win on upsert
    all_rows = fixture_rows + score_rows
    log.info(
        "Total basketball rows to ingest: %d (%d fixtures + %d scores)",
        len(all_rows), len(fixture_rows), len(score_rows),
    )

    if not all_rows:
        log.warning("No basketball data found.")
        return 0

    if dry_run:
        return len(all_rows)

    ingested = ingest_from_dicts(all_rows)
    log.info("Ingested %d basketball rows.", ingested)
    return ingested


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch live basketball fixtures + scores")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = fetch_all(dry_run=args.dry_run)
    print(f"Done. {n} rows processed.")


if __name__ == "__main__":
    main()
