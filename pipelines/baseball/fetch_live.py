"""
Fetch live baseball fixtures + scores from The Odds API and ingest them.
Covers: MLB, MLB Preseason, NCAA Baseball.
Uses the same TENNIS_API_KEY (The Odds API).

Two passes per sport key:
  1. /odds  — upcoming fixtures (status=scheduled)
  2. /scores — commenced + not completed → status=live; completed → status=finished
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
    resp = httpx.get(
        f"{BASE_URL}{path}",
        params={"apiKey": settings.TENNIS_API_KEY, **(params or {})},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def _transform_fixture(event: dict[str, Any], sport_title: str, sport_key: str) -> dict[str, Any] | None:
    home = (event.get("home_team") or "").strip()
    away = (event.get("away_team") or "").strip()
    if not home or not away:
        return None
    kickoff = event.get("commence_time", "")
    return {
        "sport":                  "baseball",
        "provider_id":            f"odds-bb-{event['id']}",
        "league_provider_id":     f"odds-league-{sport_key}",
        "league_name":            sport_title,
        "home_team_provider_id":  f"odds-bb-{sport_key}-{home.lower().replace(' ', '-')}",
        "home_team_name":         home,
        "away_team_provider_id":  f"odds-bb-{sport_key}-{away.lower().replace(' ', '-')}",
        "away_team_name":         away,
        "kickoff_utc":            kickoff,
        "status":                 "scheduled",
        "home_score":             "",
        "away_score":             "",
        "outcome":                "",
        "season":                 kickoff[:4] if kickoff else "",
        "venue":                  "",
    }


def _transform_score_event(event: dict[str, Any], sport_key: str) -> dict[str, Any] | None:
    """Convert a /scores API event into an ingest row with live/finished status."""
    home = (event.get("home_team") or "").strip()
    away = (event.get("away_team") or "").strip()
    if not home or not away:
        return None

    event_id  = event.get("id", "")
    kickoff   = event.get("commence_time", "")
    completed = event.get("completed", False)
    season    = kickoff[:4] if kickoff else ""
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

    # Scores: API returns [{"name": team, "score": "5"}, ...]
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
        "sport":                  "baseball",
        "provider_id":            f"odds-bb-{event_id}",
        "league_provider_id":     f"odds-league-{sport_key}",
        "league_name":            sport_title,
        "home_team_provider_id":  f"odds-bb-{sport_key}-{home.lower().replace(' ', '-')}",
        "home_team_name":         home,
        "away_team_provider_id":  f"odds-bb-{sport_key}-{away.lower().replace(' ', '-')}",
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

    sports = _get("/sports", {"all": "false"})
    active = [
        s for s in sports
        if s.get("group", "").lower() == "baseball"
        and not s.get("has_outrights", False)
        and "_winner" not in s.get("key", "")
    ]

    if not active:
        log.warning("No active baseball leagues found.")
        return 0

    log.info("Active baseball leagues: %s", [s["title"] for s in active])

    fixture_rows: list[dict] = []
    score_rows: list[dict] = []

    for sport in active:
        key, title = sport["key"], sport["title"]

        # Pass 1: upcoming fixtures
        try:
            log.info("Fetching baseball fixtures: %s ...", title)
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
            log.info("Fetching baseball scores: %s ...", key)
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
        "Total baseball rows to ingest: %d (%d fixtures + %d scores)",
        len(all_rows), len(fixture_rows), len(score_rows),
    )

    if not all_rows:
        return 0
    if dry_run:
        log.info("DRY RUN — skipping ingest.")
        return len(all_rows)

    ingested = ingest_from_dicts(all_rows)
    log.info("Ingested %d baseball rows.", ingested)
    return ingested


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch live baseball fixtures + scores")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    print(f"Done. {fetch_all(dry_run=args.dry_run)} rows processed.")


if __name__ == "__main__":
    main()
