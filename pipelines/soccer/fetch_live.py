"""
Fetch live soccer fixtures and results from football-data.org and ingest them.

Free-tier covers: PL, BL1, SA, PD, FL1, CL, EC  (7 competitions)
Rate limit: 10 req / min  → we sleep between requests.

Usage (one-shot):
    python -m pipelines.soccer.fetch_live
    python -m pipelines.soccer.fetch_live --competitions PL BL1
    python -m pipelines.soccer.fetch_live --dry-run

The ingestion dict format is identical to the CSV schema consumed by
ingest_matches.ingest_from_dicts().
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from config.settings import settings
from pipelines.soccer.ingest_matches import ingest_from_dicts

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_URL = "https://api.football-data.org/v4"

# Free-tier competition codes (all accessible without a paid plan)
FREE_COMPETITIONS = ["PL", "BL1", "SA", "PD", "FL1", "CL", "EC"]

STATUS_MAP = {
    "SCHEDULED":  "scheduled",
    "TIMED":      "scheduled",
    "IN_PLAY":    "live",
    "PAUSED":     "live",
    "LIVE":       "live",
    "FINISHED":   "finished",
    "POSTPONED":  "postponed",
    "SUSPENDED":  "postponed",
    "CANCELLED":  "cancelled",
}

OUTCOME_MAP = {
    "HOME_TEAM": "H",
    "AWAY_TEAM": "A",
    "DRAW":      "D",
}

# ---------------------------------------------------------------------------
# API client
# ---------------------------------------------------------------------------

def _get(path: str, params: dict | None = None) -> dict:
    """Make a single authenticated GET request. Raises on non-2xx."""
    url = f"{BASE_URL}{path}"
    headers = {"X-Auth-Token": settings.FOOTBALL_DATA_API_KEY}
    resp = httpx.get(url, headers=headers, params=params or {}, timeout=15)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Transform
# ---------------------------------------------------------------------------

def _transform_match(match: dict[str, Any]) -> dict[str, Any] | None:
    """Convert a football-data.org match object to an ingest row dict.

    Returns None if either team entry is missing (bye / TBD matches).
    """
    home = match.get("homeTeam", {})
    away = match.get("awayTeam", {})

    if not home.get("id") or not away.get("id"):
        return None

    competition = match.get("competition", {})
    season_raw  = match.get("season", {}).get("startDate", "")
    season      = season_raw[:4] if season_raw else None

    status_raw  = match.get("status", "SCHEDULED")
    status      = STATUS_MAP.get(status_raw, "scheduled")

    score_ft    = match.get("score", {}).get("fullTime", {})
    home_score  = score_ft.get("home")   # int or None
    away_score  = score_ft.get("away")   # int or None
    winner_raw  = match.get("score", {}).get("winner")
    outcome     = OUTCOME_MAP.get(winner_raw) if winner_raw else None

    # Live state
    minute = match.get("minute")  # int or None — current match minute
    score = match.get("score", {})
    ht = score.get("halfTime", {})
    ht_home = ht.get("home")
    ht_away = ht.get("away")

    # Derive live_clock
    if status_raw == "PAUSED" or (minute is not None and minute == 45):
        live_clock = "HT"
    elif minute is not None:
        live_clock = f"{minute}'"
    else:
        live_clock = None

    # Derive current_period (1 = first half, 2 = second half)
    if status == "live":
        if live_clock == "HT":
            current_period = 1
        elif minute is not None:
            current_period = 1 if minute <= 45 else 2
        else:
            current_period = None
    else:
        current_period = None

    # State blob
    current_state = None
    if status == "live":
        current_state = {
            "minute": minute,
            "ht_home": ht_home,
            "ht_away": ht_away,
        }

    # Normalise kickoff to ISO string with Z suffix
    utc_date    = match.get("utcDate", "")

    return {
        "provider_id":            f"fd-{match['id']}",
        "league_provider_id":     f"fd-league-{competition.get('id', 0)}",
        "league_name":            competition.get("name", "Unknown"),
        "home_team_provider_id":  f"fd-team-{home['id']}",
        "home_team_name":         home.get("name", "Unknown"),
        "away_team_provider_id":  f"fd-team-{away['id']}",
        "away_team_name":         away.get("name", "Unknown"),
        "kickoff_utc":            utc_date.replace("Z", "+00:00"),
        "status":                 status,
        "home_score":             str(home_score) if home_score is not None else "",
        "away_score":             str(away_score) if away_score is not None else "",
        "outcome":                outcome or "",
        "season":                 season or "",
        "venue":                  match.get("venue") or "",
        "live_clock":             live_clock or "",
        "current_period":         current_period,
        "current_state_json":     json.dumps(current_state) if current_state is not None else None,
    }


# ---------------------------------------------------------------------------
# Main fetch logic
# ---------------------------------------------------------------------------

def fetch_competition(code: str, statuses: list[str], req_delay: float = 6.5) -> list[dict]:
    """
    Fetch matches for one competition code filtered by status(es).

    req_delay: seconds to sleep between requests to respect the 10 req/min limit.
    """
    rows: list[dict] = []
    for status in statuses:
        try:
            log.info("Fetching %s/%s ...", code, status)
            data = _get(f"/competitions/{code}/matches", params={"status": status})
            for m in data.get("matches", []):
                row = _transform_match(m)
                if row:
                    rows.append(row)
            log.info("  → %d matches", len(data.get("matches", [])))
        except httpx.HTTPStatusError as exc:
            log.warning("  HTTP %s for %s/%s: %s", exc.response.status_code, code, status, exc)
        except Exception as exc:
            log.warning("  Error fetching %s/%s: %s", code, status, exc)
        finally:
            time.sleep(req_delay)   # stay under 10 req/min

    return rows


def fetch_all(
    competitions: list[str] | None = None,
    dry_run: bool = False,
    run_predict: bool = True,
) -> int:
    """
    Fetch upcoming fixtures (SCHEDULED/TIMED) and recent results (FINISHED)
    for all configured competitions, ingest them, then optionally run predictions.

    Returns total number of rows ingested.
    """
    if not settings.FOOTBALL_DATA_API_KEY:
        log.error(
            "FOOTBALL_DATA_API_KEY is not set. "
            "Get a free key at https://www.football-data.org/client/register"
        )
        return 0

    comps = competitions or FREE_COMPETITIONS
    statuses = ["SCHEDULED", "FINISHED"]

    all_rows: list[dict] = []
    for code in comps:
        rows = fetch_competition(code, statuses)
        all_rows.extend(rows)

    log.info("Total rows fetched: %d", len(all_rows))

    if not all_rows:
        log.warning("No rows returned — nothing to ingest.")
        return 0

    if dry_run:
        log.info("DRY RUN — skipping ingest and prediction steps.")
        return len(all_rows)

    ingested = ingest_from_dicts(all_rows)
    log.info("Ingested %d rows.", ingested)

    if run_predict:
        log.info("Running prediction pipeline ...")
        try:
            from db.session import SessionLocal
            from db.models.mvp import CoreMatch, ModelRegistry
            from pipelines.soccer.predict_soccer import _load_live_model, run_predictions
            session = SessionLocal()
            try:
                payload = _load_live_model(session)
                matches = (
                    session.query(CoreMatch)
                    .filter(CoreMatch.status == "scheduled")
                    .all()
                )
                n_pred = run_predictions(session, matches, payload)
                session.commit()
                log.info("Predictions generated: %d", n_pred)
            finally:
                session.close()
        except RuntimeError as exc:
            log.info("Skipping predictions: %s", exc)
        except Exception as exc:
            log.error("Prediction pipeline failed: %s", exc)

    return ingested


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch live soccer data from football-data.org")
    parser.add_argument(
        "--competitions", nargs="*", default=None,
        help="Competition codes to fetch (default: all free-tier comps). E.g. --competitions PL BL1"
    )
    parser.add_argument("--dry-run", action="store_true", help="Fetch and transform but do not write to DB")
    parser.add_argument("--no-predict", action="store_true", help="Skip prediction pipeline after ingest")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")

    n = fetch_all(
        competitions=args.competitions,
        dry_run=args.dry_run,
        run_predict=not args.no_predict,
    )
    print(f"Done. {n} rows processed.")


if __name__ == "__main__":
    main()
