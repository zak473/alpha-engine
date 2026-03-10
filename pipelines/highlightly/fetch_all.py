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
import json as _json

from pipelines.highlightly.client import (
    extract_odds, get_extras, get_highlights, get_leagues,
    get_matches, get_odds, get_standings,
)
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

# Sports where a draw is a valid outcome
_DRAW_SPORTS = {"soccer"}


def _logo(obj: dict | None) -> str | None:
    """Extract logo/image URL from a Highlightly entity dict (team, league, country)."""
    if not obj:
        return None
    return (
        obj.get("logo") or obj.get("image") or obj.get("imageUrl") or
        obj.get("logoUrl") or obj.get("flag") or obj.get("badge") or
        obj.get("emblem") or obj.get("crest")
    ) or None


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

    # Logos
    home_logo = _logo(home)
    away_logo = _logo(away)
    league_logo = _logo(league_data) or _logo(country_data)

    status = _map_status(description)

    # Score parsing
    home_score, away_score = _parse_score(score_data.get("current"))

    outcome = ""
    if status == "finished":
        outcome = _derive_outcome(home_score, away_score, sport)

    # Live clock + period extraction
    live_clock: str | None = None
    current_period: int | None = None
    if status == "live":
        elapsed = (
            state.get("elapsed") or state.get("minute") or
            state.get("clock") or state.get("timer")
        )
        if elapsed is not None:
            live_clock = f"{elapsed}'"
        elif description:
            live_clock = description  # e.g. "Half Time", "45+2'"

        d_lower = description.lower().strip() if description else ""
        if any(k in d_lower for k in ("1st half", "first half")):
            current_period = 1
        elif any(k in d_lower for k in ("2nd half", "second half")):
            current_period = 2
        elif d_lower in ("ht", "half time", "half-time"):
            current_period = 0
        elif any(k in d_lower for k in ("extra time", "et", "overtime", "ot")):
            current_period = 3
        elif elapsed is not None:
            elapsed_int = int(elapsed) if str(elapsed).isdigit() else 0
            current_period = 1 if elapsed_int <= 45 else 2

    season = kickoff[:4] if kickoff else datetime.now(timezone.utc).strftime("%Y")
    sport_slug = home_name.lower().replace(" ", "-").replace(".", "")
    away_slug = away_name.lower().replace(" ", "-").replace(".", "")

    # Extract odds that may be embedded directly in the match response
    odds_home, odds_draw, odds_away = extract_odds(match, sport)
    # For non-draw sports, clear the draw odds even if API returned something
    if sport not in _DRAW_SPORTS:
        odds_draw = None

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
        "venue":                  state.get("venue") or match.get("venue") or "",
        "live_clock":             live_clock,
        "current_period":         current_period,
        "odds_home":              odds_home,
        "odds_draw":              odds_draw,
        "odds_away":              odds_away,
        "home_team_logo_url":     home_logo,
        "away_team_logo_url":     away_logo,
        "league_logo_url":        league_logo,
        "_hl_match_id":           match_id,  # temp: used for extras enrichment, not stored in DB
        "_hl_league_id":          league_id,  # temp: used for standings sync
    }


def _fetch_and_attach_odds(matches: list[dict], sport: str) -> None:
    """
    For matches without inline odds, attempt a separate /odds?matchId={id} call.
    Mutates the match dicts in-place by setting an 'odds' key.
    Only called for upcoming/live matches (not finished — odds irrelevant post-match).
    """
    for match in matches:
        # Skip if odds already embedded
        if match.get("odds"):
            continue
        status_desc = (match.get("state") or {}).get("description") or ""
        if _map_status(status_desc) == "finished":
            continue
        match_id = match.get("id")
        if not match_id:
            continue
        try:
            odds_data = get_odds(sport, match_id)
            # Attach under the "odds" key so extract_odds() picks it up
            if odds_data:
                match["odds"] = odds_data.get("data") or odds_data
            time.sleep(0.05)
        except Exception as exc:
            log.debug("[highlightly:odds] fetch failed for match %s (%s): %s", match_id, sport, exc)


# ── Extras enrichment (lineups, statistics, events) ───────────────────────────

def _enrich_live_rows(rows: list[dict], sport: str) -> None:
    """
    Fetch extras (lineups, statistics, events) ONLY for currently live matches.
    Called sparingly — not on every poll cycle.
    Each live match costs 3 API calls. With 10 live matches = 30 calls.
    """
    for row in rows:
        if row.get("status") != "live":
            continue
        hl_id = row.get("_hl_match_id")
        if not hl_id:
            continue
        try:
            extras = get_extras(sport, hl_id)
            if extras:
                row["extras_json"] = _json.dumps(extras)
            time.sleep(0.3)
        except Exception as exc:
            log.warning("[highlightly:enrich] %s match %s extras failed: %s", sport, hl_id, exc)


def _enrich_finished_highlights(rows: list[dict], sport: str, max_matches: int = 5) -> None:
    """
    Fetch highlights for recently finished matches only. Capped at max_matches per call
    to avoid burning quota. Called once per hour max.
    """
    count = 0
    for row in rows:
        if count >= max_matches:
            break
        if row.get("status") != "finished":
            continue
        hl_id = row.get("_hl_match_id")
        if not hl_id:
            continue
        try:
            clips = get_highlights(sport, hl_id)
            if clips:
                row["highlights_json"] = _json.dumps(clips)
            count += 1
            time.sleep(0.3)
        except Exception as exc:
            log.warning("[highlightly:enrich] %s match %s highlights failed: %s", sport, hl_id, exc)


# ── Main fetch ─────────────────────────────────────────────────────────────────

SPORTS = ["soccer", "basketball", "baseball", "hockey"]


def fetch_today(dry_run: bool = False) -> int:
    """
    Fetch today's scores only — used by the 10-minute live-score job.
    SCORES ONLY: no extras (lineups/stats/events), no odds, no highlights.
    Cost: 4 sports × 1 date = 4 API calls per run.
    """
    if not settings.HIGHLIGHTLY_API_KEY:
        return 0

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    all_rows: list[dict] = []

    for sport in SPORTS:
        try:
            matches = get_matches(sport, today)
            rows = [r for m in matches if (r := _transform(m, sport))]
            all_rows.extend(rows)
            time.sleep(0.3)
        except Exception as exc:
            log.warning("[highlightly:live] %s %s failed: %s", sport, today, exc)

    if not all_rows or dry_run:
        return len(all_rows)
    return ingest_from_dicts(all_rows)


def fetch_with_extras(dry_run: bool = False) -> int:
    """
    Fetch today + tomorrow with live extras (lineups, stats, events).
    Used by the 30-minute job. Only fetches extras for LIVE matches.
    Cost: 4 sports × 2 dates = 8 /matches calls
          + ~10 live matches × 3 endpoints = ~30 extras calls
          Total: ~38 API calls per run × 48 runs/day = ~1,800 calls/day.
    """
    if not settings.HIGHLIGHTLY_API_KEY:
        return 0

    now = datetime.now(timezone.utc)
    dates = [now.strftime("%Y-%m-%d"), (now + timedelta(days=1)).strftime("%Y-%m-%d")]
    all_rows: list[dict] = []

    for sport in SPORTS:
        sport_rows: list[dict] = []
        for date in dates:
            try:
                matches = get_matches(sport, date)
                rows = [r for m in matches if (r := _transform(m, sport))]
                sport_rows.extend(rows)
                time.sleep(0.3)
            except Exception as exc:
                log.warning("[highlightly:extras] %s %s failed: %s", sport, date, exc)
        # Only enrich live matches — not upcoming/recent
        _enrich_live_rows(sport_rows, sport)
        all_rows.extend(sport_rows)

    if not all_rows or dry_run:
        return len(all_rows)
    return ingest_from_dicts(all_rows)


def fetch_all(dry_run: bool = False, days_back: int = 14, days_ahead: int = 7) -> int:
    """
    Fixture sync — used by the hourly scheduler job.
    Fetches match listings for a date window. No extras (too expensive for bulk).
    Cost: 4 sports × (days_back + days_ahead) API calls per run.
    Default: 4 × 21 = 84 calls per run × 24 runs/day = 2,016 calls/day.
    """
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
                matches = get_matches(sport, date)
                rows = [r for m in matches if (r := _transform(m, sport))]
                all_rows.extend(rows)
                time.sleep(0.3)
            except Exception as exc:
                log.warning("[highlightly] %s %s failed: %s", sport, date, exc)

    log.info("[highlightly] fetch_all: %d rows across %d dates", len(all_rows), len(dates))
    if not all_rows:
        return 0
    if dry_run:
        return len(all_rows)
    return ingest_from_dicts(all_rows)


def fetch_historical(dry_run: bool = False, days_back: int = 730) -> int:
    """
    One-time historical backfill — fetches up to `days_back` days of past results.
    Skips odds (irrelevant for finished matches) and sleeps longer to avoid rate limits.
    On 429, backs off for 60 s before retrying once.

    730 days ≈ 2 years × 4 sports = ~2920 requests at ~0.5 s each ≈ 25 minutes.
    """
    if not settings.HIGHLIGHTLY_API_KEY:
        log.error("[highlightly] HIGHLIGHTLY_API_KEY not set — skipping.")
        return 0

    now = datetime.now(timezone.utc)
    # Only past dates — no need to refetch upcoming fixtures
    dates = [
        (now - timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(1, days_back + 1)
    ]

    all_rows: list[dict] = []
    total_requests = 0

    for sport in SPORTS:
        sport_rows = 0
        for date in dates:
            for attempt in range(2):
                try:
                    matches = get_matches(sport, date)
                    total_requests += 1
                    rows = [r for m in matches if (r := _transform(m, sport))]
                    all_rows.extend(rows)
                    sport_rows += len(rows)
                    time.sleep(0.5)
                    break
                except Exception as exc:
                    msg = str(exc)
                    if "429" in msg and attempt == 0:
                        log.warning("[highlightly:history] 429 on %s %s — backing off 60s", sport, date)
                        time.sleep(60)
                        continue
                    log.debug("[highlightly:history] %s %s failed: %s", sport, date, exc)
                    break

        log.info("[highlightly:history] %s: %d rows (%d dates)", sport, sport_rows, len(dates))

    log.info("[highlightly:history] Total rows: %d (from %d API calls)", len(all_rows), total_requests)
    if not all_rows:
        return 0
    if dry_run:
        log.info("[highlightly:history] DRY RUN — skipping ingest.")
        return len(all_rows)

    ingested = ingest_from_dicts(all_rows)
    log.info("[highlightly:history] Ingested %d rows.", ingested)
    return ingested


def fetch_standings(dry_run: bool = False) -> int:
    """
    Sync league standings for all active Highlightly leagues.
    Queries core_leagues for known HL leagues, fetches standings, upserts into core_standings.
    Called by the daily scheduler job. Returns total rows upserted.
    """
    if not settings.HIGHLIGHTLY_API_KEY:
        log.error("[highlightly:standings] HIGHLIGHTLY_API_KEY not set — skipping.")
        return 0

    from db.session import SessionLocal
    from db.models.mvp import CoreLeague, CoreTeam, CoreStanding

    db = SessionLocal()
    total = 0
    try:
        # Pull all Highlightly-sourced leagues (provider_id starts with "hl-league-")
        hl_leagues = (
            db.query(CoreLeague)
            .filter(CoreLeague.provider_id.like("hl-league-%"))
            .all()
        )
        log.info("[highlightly:standings] Found %d HL leagues to sync.", len(hl_leagues))

        for league in hl_leagues:
            # provider_id format: "hl-league-{sport}-{league_id}"
            parts = (league.provider_id or "").split("-")
            if len(parts) < 4:
                continue
            sport = parts[2]
            hl_league_id = parts[3]
            if sport not in SPORTS:
                continue

            season = str(datetime.now(timezone.utc).year)
            rows = get_standings(sport, hl_league_id, season)
            if not rows:
                time.sleep(0.2)
                continue

            log.info("[highlightly:standings] %s %s: %d rows", sport, league.name, len(rows))

            if dry_run:
                total += len(rows)
                time.sleep(0.2)
                continue

            for row in rows:
                if not isinstance(row, dict):
                    continue
                team_name = (
                    (row.get("team") or {}).get("name") or
                    row.get("teamName") or row.get("team_name") or ""
                )
                if not team_name:
                    continue

                team_obj = row.get("team") or {}
                team_logo = _logo(team_obj) or None
                hl_team_id = team_obj.get("id") or row.get("teamId")
                team_id: str | None = None
                if hl_team_id:
                    t = db.query(CoreTeam).filter_by(
                        provider_id=f"hl-{sport}-team-{hl_team_id}"
                    ).first()
                    if t:
                        team_id = t.id

                def _int(v: Any) -> int | None:
                    try:
                        return int(v) if v is not None else None
                    except (ValueError, TypeError):
                        return None

                existing = (
                    db.query(CoreStanding)
                    .filter_by(league_id=league.id, season=season, team_name=team_name)
                    .first()
                )
                if existing is None:
                    existing = CoreStanding(
                        league_id=league.id,
                        season=season,
                        sport=sport,
                        team_name=team_name,
                    )
                    db.add(existing)

                existing.team_id = team_id
                existing.team_logo = team_logo
                existing.position = _int(row.get("position") or row.get("rank") or row.get("pos"))
                existing.played = _int(row.get("played") or row.get("gamesPlayed") or row.get("mp"))
                existing.won = _int(row.get("won") or row.get("wins") or row.get("w"))
                existing.drawn = _int(row.get("drawn") or row.get("draws") or row.get("d"))
                existing.lost = _int(row.get("lost") or row.get("losses") or row.get("l"))
                existing.goals_for = _int(row.get("goalsFor") or row.get("goals_for") or row.get("gf"))
                existing.goals_against = _int(row.get("goalsAgainst") or row.get("goals_against") or row.get("ga"))
                existing.goal_diff = _int(
                    row.get("goalDifference") or row.get("goal_diff") or row.get("gd")
                )
                existing.points = _int(row.get("points") or row.get("pts"))
                existing.form = str(row.get("form") or row.get("recentForm") or "")[:20] or None
                existing.group_name = str(row.get("_group") or row.get("group") or "")[:100] or None
                total += 1

            db.commit()
            time.sleep(0.3)

    except Exception as exc:
        db.rollback()
        log.error("[highlightly:standings] Failed: %s", exc, exc_info=True)
    finally:
        db.close()

    log.info("[highlightly:standings] Synced %d standing rows.", total)
    return total


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Highlightly sports fixtures + scores")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--days-back", type=int, default=14,
                        help="Days of history for regular fetch (default 14). Use --historical for full backfill.")
    parser.add_argument("--historical", action="store_true",
                        help="Run full historical backfill (up to --days-back, default 730)")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    if args.historical:
        n = fetch_historical(dry_run=args.dry_run, days_back=args.days_back if args.days_back != 14 else 730)
    else:
        n = fetch_all(dry_run=args.dry_run, days_back=args.days_back)
    print(f"Done. {n} rows processed.")


if __name__ == "__main__":
    main()
