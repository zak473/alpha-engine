"""
Fetch fixtures and live scores from Highlightly for soccer, basketball, baseball, hockey.
Ingests into CoreMatch via ingest_from_dicts. Augments (not replaces) existing data sources.

Usage:
    python -m pipelines.highlightly.fetch_all
    python -m pipelines.highlightly.fetch_all --dry-run
"""
from __future__ import annotations

import argparse
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from config.settings import settings
from pipelines.highlightly.client import get_matches
from pipelines.soccer.ingest_matches import ingest_from_dicts

log = logging.getLogger(__name__)


# ── Status mapping ─────────────────────────────────────────────────────────────

FINISHED_DESCRIPTIONS = {
    "finished", "final", "ft", "aet", "pen", "after extra time",
    "after penalties", "awarded", "walkover", "ended",
}
LIVE_DESCRIPTIONS = {
    "1st half", "2nd half", "half time", "ht", "extra time", "et",
    "1st quarter", "2nd quarter", "3rd quarter", "4th quarter",
    "1st period", "2nd period", "3rd period", "overtime", "ot",
    "in progress", "in-progress", "live",
}


_PRE_MATCH_DESCRIPTIONS = {
    "not started", "scheduled", "tbd", "postponed", "cancelled",
    "suspended", "abandoned", "delayed", "fixture", "upcoming",
    "to be announced", "to be determined",
}


def _map_status(description: str | None) -> str:
    if not description:
        return "scheduled"
    d = description.lower().strip()
    if d in FINISHED_DESCRIPTIONS or d.startswith("final"):
        return "finished"
    if d in LIVE_DESCRIPTIONS:
        return "live"
    if d in _PRE_MATCH_DESCRIPTIONS:
        return "scheduled"
    # Unknown description: treat as scheduled to avoid false "live" matches
    return "scheduled"


def _parse_score(current: str | None) -> tuple[str, str]:
    """Parse '1 - 2' → ('1', '2'). Returns ('', '') on failure."""
    if not current:
        return "", ""
    parts = current.replace(" ", "").split("-")
    if len(parts) == 2:
        try:
            return str(int(parts[0])), str(int(parts[1]))
        except ValueError:
            pass
    return "", ""


def _derive_outcome(home_score: str, away_score: str, sport: str) -> str:
    """Derive H/D/A from scores. No draws in basketball, baseball, hockey."""
    if not home_score or not away_score:
        return ""
    try:
        h, a = int(home_score), int(away_score)
        if h > a:
            return "H"
        elif a > h:
            return "A"
        else:
            return "D" if sport == "soccer" else ""
    except ValueError:
        return ""


# ── Transform functions ─────────────────────────────────────────────────────────

def _transform(match: dict[str, Any], sport: str) -> dict[str, Any] | None:
    home = (match.get("homeTeam") or {})
    away = (match.get("awayTeam") or {})
    home_name = (home.get("name") or "").strip()
    away_name = (away.get("name") or "").strip()
    if not home_name or not away_name:
        return None

    match_id = match.get("id", "")
    kickoff = match.get("date", "")
    league_data = match.get("league") or {}
    country_data = match.get("country") or {}
    state = match.get("state") or {}
    score_data = state.get("score") or {}
    description = state.get("description") or ""

    league_id = league_data.get("id", "unknown")
    league_name = league_data.get("name") or country_data.get("name") or sport.title()

    status = _map_status(description)

    # Score parsing
    home_score, away_score = _parse_score(score_data.get("current"))

    outcome = ""
    if status == "finished":
        outcome = _derive_outcome(home_score, away_score, sport)

    season = kickoff[:4] if kickoff else datetime.now(timezone.utc).strftime("%Y")
    sport_slug = home_name.lower().replace(" ", "-").replace(".", "")
    away_slug = away_name.lower().replace(" ", "-").replace(".", "")

    return {
        "sport":                  sport,
        "provider_id":            f"hl-{sport}-{match_id}",
        "league_provider_id":     f"hl-league-{sport}-{league_id}",
        "league_name":            league_name,
        "home_team_provider_id":  f"hl-{sport}-team-{home.get('id', sport_slug)}",
        "home_team_name":         home_name,
        "away_team_provider_id":  f"hl-{sport}-team-{away.get('id', away_slug)}",
        "away_team_name":         away_name,
        "kickoff_utc":            kickoff,
        "status":                 status,
        "home_score":             home_score,
        "away_score":             away_score,
        "outcome":                outcome,
        "season":                 season,
        "venue":                  "",
    }


# ── Main fetch ─────────────────────────────────────────────────────────────────

SPORTS = ["soccer", "basketball", "baseball", "hockey"]


def fetch_today(dry_run: bool = False) -> int:
    """Fetch today + tomorrow — used by the 30-second live-score job."""
    if not settings.HIGHLIGHTLY_API_KEY:
        return 0

    now = datetime.now(timezone.utc)
    dates = [now.strftime("%Y-%m-%d"), (now + timedelta(days=1)).strftime("%Y-%m-%d")]
    all_rows: list[dict] = []

    for sport in SPORTS:
        for date in dates:
            try:
                matches = get_matches(sport, date)
                rows = [r for m in matches if (r := _transform(m, sport))]
                all_rows.extend(rows)
                time.sleep(0.1)
            except Exception as exc:
                log.warning("[highlightly:live] %s %s failed: %s", sport, date, exc)

    if not all_rows or dry_run:
        return len(all_rows)

    return ingest_from_dicts(all_rows)


def fetch_all(dry_run: bool = False, days_back: int = 2, days_ahead: int = 7) -> int:
    if not settings.HIGHLIGHTLY_API_KEY:
        log.error("[highlightly] HIGHLIGHTLY_API_KEY not set — skipping.")
        return 0

    now = datetime.now(timezone.utc)
    dates = [
        (now + timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(-days_back, days_ahead + 1)
    ]

    all_rows: list[dict] = []

    for sport in SPORTS:
        for date in dates:
            try:
                log.info("[highlightly] Fetching %s matches for %s ...", sport, date)
                matches = get_matches(sport, date)
                rows = [r for m in matches if (r := _transform(m, sport))]
                log.info("[highlightly]   → %d rows for %s %s", len(rows), sport, date)
                all_rows.extend(rows)
                time.sleep(0.2)
            except Exception as exc:
                log.warning("[highlightly] %s %s failed: %s", sport, date, exc)

    log.info("[highlightly] Total rows to ingest: %d", len(all_rows))
    if not all_rows:
        return 0
    if dry_run:
        log.info("[highlightly] DRY RUN — skipping ingest.")
        return len(all_rows)

    ingested = ingest_from_dicts(all_rows)
    log.info("[highlightly] Ingested %d rows.", ingested)
    return ingested


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Highlightly sports fixtures + scores")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = fetch_all(dry_run=args.dry_run)
    print(f"Done. {n} rows processed.")


if __name__ == "__main__":
    main()
