"""
Fetch live tennis fixtures + in-play scores from The Odds API and ingest them.

Free tier: 500 requests/month — ATP, WTA, Grand Slams, ITF.
Register (no CC) at https://the-odds-api.com/#get-access

Two passes per run:
  1. /odds  — upcoming fixtures (status=scheduled)
  2. /scores — commenced + not completed → status=live; completed → status=finished

Usage:
    python -m pipelines.tennis.fetch_live
    python -m pipelines.tennis.fetch_live --dry-run
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

KNOWN_TENNIS_SPORTS = [
    "tennis_atp_aus_open",
    "tennis_atp_french_open",
    "tennis_atp_us_open",
    "tennis_atp_wimbledon",
    "tennis_wta_aus_open",
    "tennis_wta_french_open",
    "tennis_wta_us_open",
    "tennis_wta_wimbledon",
    "tennis_atp_double",
    "tennis_wta_double",
]


def _get(path: str, params: dict | None = None) -> Any:
    url = f"{BASE_URL}{path}"
    p = {"apiKey": settings.TENNIS_API_KEY, **(params or {})}
    resp = httpx.get(url, params=p, timeout=15)
    resp.raise_for_status()
    return resp.json()


def _get_active_tennis_sports() -> list[str]:
    try:
        sports = _get("/sports", {"all": "false"})
        keys = [s["key"] for s in sports if s.get("group", "").lower() == "tennis" and s.get("active")]
        log.info("Active tennis sports: %s", keys)
        return keys or KNOWN_TENNIS_SPORTS
    except Exception as exc:
        log.warning("Could not fetch sports list: %s — using fallback list", exc)
        return KNOWN_TENNIS_SPORTS


def _extract_odds(event: dict[str, Any], home: str, away: str) -> tuple[float | None, float | None]:
    """Extract best available decimal odds for home and away from bookmakers list."""
    bookmakers = event.get("bookmakers") or []
    for bm in bookmakers:
        for market in bm.get("markets") or []:
            if market.get("key") == "h2h":
                price_map = {o["name"]: o["price"] for o in market.get("outcomes") or []}
                h = price_map.get(home)
                a = price_map.get(away)
                if h and a:
                    return float(h), float(a)
    return None, None


def _transform_fixture(event: dict[str, Any], sport_title: str) -> dict[str, Any] | None:
    home = (event.get("home_team") or "").strip()
    away = (event.get("away_team") or "").strip()
    if not home or not away:
        return None

    sport_key = event.get("sport_key", "")
    event_id  = event.get("id", "")
    kickoff   = event.get("commence_time", "")
    season    = kickoff[:4] if kickoff else ""
    odds_home, odds_away = _extract_odds(event, home, away)

    return {
        "sport":                  "tennis",
        "provider_id":            f"odds-{event_id}",
        "league_provider_id":     f"odds-league-{sport_key}",
        "league_name":            sport_title,
        "home_team_provider_id":  f"odds-player-{sport_key}-{home.lower().replace(' ', '-')}",
        "home_team_name":         home,
        "away_team_provider_id":  f"odds-player-{sport_key}-{away.lower().replace(' ', '-')}",
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
        "odds_draw":              None,
    }


def _transform_score_event(event: dict[str, Any], sport_title: str) -> dict[str, Any] | None:
    """Convert a /scores API event into an ingest row with live/finished status."""
    home = (event.get("home_team") or "").strip()
    away = (event.get("away_team") or "").strip()
    if not home or not away:
        return None

    sport_key  = event.get("sport_key", "")
    event_id   = event.get("id", "")
    kickoff    = event.get("commence_time", "")
    completed  = event.get("completed", False)
    season     = kickoff[:4] if kickoff else ""

    # Determine if match has actually started
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
        # Hasn't started yet — skip (odds endpoint already handles these)
        return None

    # Extract scores: API returns [{"name": player, "score": "6"}, ...]
    # Use set count (number of sets won) as a simple integer score
    scores = event.get("scores") or []
    home_score = away_score = ""
    outcome = ""
    if len(scores) >= 2:
        # Scores may be in either home/away order — match by name
        score_map = {s.get("name", ""): s.get("score", "") for s in scores}
        h = score_map.get(home, "")
        a = score_map.get(away, "")
        # Score values are strings like "6", "4" (sets) or "1", "0"
        try:
            home_score = str(int(h)) if h else ""
            away_score = str(int(a)) if a else ""
            if completed and home_score and away_score:
                outcome = "H" if int(home_score) > int(away_score) else ("A" if int(away_score) > int(home_score) else "D")
        except ValueError:
            home_score = away_score = ""

    return {
        "sport":                  "tennis",
        "provider_id":            f"odds-{event_id}",
        "league_provider_id":     f"odds-league-{sport_key}",
        "league_name":            sport_title,
        "home_team_provider_id":  f"odds-player-{sport_key}-{home.lower().replace(' ', '-')}",
        "home_team_name":         home,
        "away_team_provider_id":  f"odds-player-{sport_key}-{away.lower().replace(' ', '-')}",
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
        log.error(
            "TENNIS_API_KEY not set. "
            "Get a free key at https://the-odds-api.com/#get-access"
        )
        return 0

    active_sports = _get_active_tennis_sports()
    fixture_rows: list[dict] = []
    score_rows: list[dict] = []

    for sport_key in active_sports:
        # Pass 1: upcoming fixtures
        try:
            log.info("Fetching tennis fixtures: %s ...", sport_key)
            events = _get(
                f"/sports/{sport_key}/odds",
                {"regions": "eu", "markets": "h2h", "oddsFormat": "decimal"},
            )
            sport_title = events[0].get("sport_title", sport_key) if events else sport_key
            rows = [r for ev in events if (r := _transform_fixture(ev, sport_title))]
            log.info("  → %d fixtures", len(rows))
            fixture_rows.extend(rows)
        except httpx.HTTPStatusError as exc:
            sport_title = sport_key
            if exc.response.status_code != 404:
                log.warning("  HTTP %s for %s/odds: %s", exc.response.status_code, sport_key, exc)
        except Exception as exc:
            sport_title = sport_key
            log.warning("  Fixture error for %s: %s", sport_key, exc)
        time.sleep(0.3)

        # Pass 2: in-play / recent scores
        try:
            log.info("Fetching tennis scores: %s ...", sport_key)
            events = _get(
                f"/sports/{sport_key}/scores",
                {"daysFrom": "1"},
            )
            rows = [r for ev in events if (r := _transform_score_event(ev, sport_key))]
            log.info("  → %d live/finished score rows", len(rows))
            score_rows.extend(rows)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != 404:
                log.warning("  HTTP %s for %s/scores: %s", exc.response.status_code, sport_key, exc)
        except Exception as exc:
            log.warning("  Scores error for %s: %s", sport_key, exc)
        time.sleep(0.3)

    # Ingest fixtures first (scheduled), then scores (live/finished) — scores win on upsert
    all_rows = fixture_rows + score_rows
    log.info("Total tennis rows to ingest: %d (%d fixtures + %d scores)", len(all_rows), len(fixture_rows), len(score_rows))

    if not all_rows:
        log.warning("No tennis data found.")
        return 0

    if dry_run:
        log.info("DRY RUN — skipping ingest.")
        return len(all_rows)

    ingested = ingest_from_dicts(all_rows)
    log.info("Ingested %d tennis rows.", ingested)
    return ingested


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch live tennis fixtures")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = fetch_all(dry_run=args.dry_run)
    print(f"Done. {n} rows processed.")


if __name__ == "__main__":
    main()
