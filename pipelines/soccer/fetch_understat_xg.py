"""
pipelines/soccer/fetch_understat_xg.py
---------------------------------------
Fetches xG (expected goals) data from Understat.com and writes it to
CoreTeamMatchStats.xg / CoreTeamMatchStats.xga columns.

Understat serves match data via a JSON endpoint:
    GET /getLeagueData/{league}/{season}  (requires session cookie from page visit)

Data is organised per-team: each team's `history` list has one entry per match
with xG, xGA, scored, missed, date, and h_a (home/away) fields.

Usage:
    python -m pipelines.soccer.fetch_understat_xg
    python -m pipelines.soccer.fetch_understat_xg --season 2024
    python -m pipelines.soccer.fetch_understat_xg --dry-run
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone

import cloudscraper
from sqlalchemy.orm import Session

from db.models.mvp import CoreMatch, CoreTeam, CoreTeamMatchStats
from db.session import SessionLocal

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# (understat_league_slug, sport_key, country) — only 5 major European leagues
LEAGUES: list[tuple[str, str]] = [
    ("EPL",        "England"),
    ("La_liga",    "Spain"),
    ("Bundesliga", "Germany"),
    ("Serie_A",    "Italy"),
    ("Ligue_1",    "France"),
]

DEFAULT_SEASONS: list[int] = list(range(2015, 2025))  # 2015 through 2024

REQUEST_DELAY = 1.5  # seconds between requests (polite crawling)


# ---------------------------------------------------------------------------
# HTTP session
# ---------------------------------------------------------------------------

def _make_scraper() -> cloudscraper.CloudScraper:
    return cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False}
    )


def _fetch_league_season(scraper: cloudscraper.CloudScraper, league_slug: str, season: int) -> dict:
    """Fetch league data for one season.

    Must first visit the league page to establish session cookies, then call
    the JSON endpoint.  Returns the parsed JSON dict (keys: teams, players, dates)
    or an empty dict on failure.
    """
    page_url = f"https://understat.com/league/{league_slug}/{season}"
    api_url  = f"https://understat.com/getLeagueData/{league_slug}/{season}"
    try:
        # Establish session / solve CF challenge
        scraper.get(page_url, timeout=30)
        time.sleep(0.5)
        resp = scraper.get(
            api_url,
            headers={
                "X-Requested-With": "XMLHttpRequest",
                "Referer": page_url,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        log.warning("  Error fetching %s/%s: %s", league_slug, season, exc)
        return {}


# ---------------------------------------------------------------------------
# Name normalisation
# ---------------------------------------------------------------------------

def _norm(name: str) -> str:
    return name.lower().replace("-", " ").replace("'", "").replace(".", "").strip()


def _teams_match(db_name: str, understat_name: str) -> bool:
    n_db = _norm(db_name)
    n_us = _norm(understat_name)
    return n_db == n_us or n_us in n_db or n_db in n_us


# ---------------------------------------------------------------------------
# Match linking
# ---------------------------------------------------------------------------

def _find_core_match(
    db: Session,
    match_date_str: str,  # "YYYY-MM-DD"
    team_id: str,
    is_home: bool,
) -> CoreMatch | None:
    """Find the CoreMatch for a given team + date + home/away."""
    try:
        match_dt = datetime.strptime(match_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return None

    window_start = match_dt - timedelta(hours=12)
    window_end   = match_dt + timedelta(days=2)

    col = CoreMatch.home_team_id if is_home else CoreMatch.away_team_id
    return (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == "soccer",
            CoreMatch.status.in_(["finished", "scheduled", "live"]),
            CoreMatch.kickoff_utc >= window_start,
            CoreMatch.kickoff_utc <  window_end,
            col == team_id,
        )
        .first()
    )


# ---------------------------------------------------------------------------
# CoreTeam lookup (cached per session)
# ---------------------------------------------------------------------------

_team_cache: dict[str, str | None] = {}  # understat_title -> CoreTeam.id


def _resolve_team(db: Session, understat_title: str) -> str | None:
    if understat_title in _team_cache:
        return _team_cache[understat_title]
    all_teams = db.query(CoreTeam).all()
    for t in all_teams:
        if _teams_match(t.name, understat_title):
            _team_cache[understat_title] = t.id
            return t.id
    _team_cache[understat_title] = None
    return None


# ---------------------------------------------------------------------------
# xG upsert
# ---------------------------------------------------------------------------

def _upsert_xg(
    db: Session,
    match: CoreMatch,
    team_id: str,
    is_home: bool,
    xg_val: float,
    xga_val: float,
    goals_for: int | None,
    goals_against: int | None,
    ppda_val: float | None,
    deep_val: int | None,
    dry_run: bool,
) -> bool:
    existing: CoreTeamMatchStats | None = (
        db.query(CoreTeamMatchStats)
        .filter(
            CoreTeamMatchStats.match_id == match.id,
            CoreTeamMatchStats.team_id  == team_id,
        )
        .first()
    )
    if existing:
        if existing.xg == xg_val and existing.xga == xga_val:
            return False
        if not dry_run:
            existing.xg  = xg_val
            existing.xga = xga_val
            if ppda_val is not None:
                existing.ppda = ppda_val
            if deep_val is not None:
                existing.deep_completions = deep_val
    else:
        if not dry_run:
            db.add(CoreTeamMatchStats(
                match_id=match.id,
                team_id=team_id,
                is_home=is_home,
                xg=xg_val,
                xga=xga_val,
                goals=goals_for,
                goals_conceded=goals_against,
                ppda=ppda_val,
                deep_completions=deep_val,
            ))
    return True


# ---------------------------------------------------------------------------
# Per-league-season processing
# ---------------------------------------------------------------------------

def _process_league_data(db: Session, league_data: dict, dry_run: bool) -> int:
    """Process the JSON returned by getLeagueData and write xG rows.

    Each team's `history` list contains one entry per match with:
        date, h_a, xG, xGA, scored, missed
    We resolve the team to a CoreTeam, then find the CoreMatch by team+date+h_a.
    """
    written = 0
    teams: dict = league_data.get("teams", {})

    for team_entry in teams.values():
        understat_title: str = team_entry.get("title", "")
        history: list[dict]  = team_entry.get("history", [])

        team_id = _resolve_team(db, understat_title)
        if team_id is None:
            log.debug("  No CoreTeam found for %r", understat_title)
            continue

        for entry in history:
            try:
                xg_val  = float(entry["xG"])
                xga_val = float(entry["xGA"])
            except (KeyError, TypeError, ValueError):
                continue

            # Skip unplayed fixtures (xG=0 and no score yet)
            if xg_val == 0.0 and xga_val == 0.0 and entry.get("scored") is None:
                continue

            date_str = str(entry.get("date", ""))[:10]  # "YYYY-MM-DD"
            is_home  = entry.get("h_a") == "h"

            try:
                goals_for     = int(entry["scored"])  if entry.get("scored")  is not None else None
                goals_against = int(entry["missed"])  if entry.get("missed")  is not None else None
            except (TypeError, ValueError):
                goals_for = goals_against = None

            # PPDA: dict {"att": int, "def": int} — passes per defensive action
            ppda_raw = entry.get("ppda")
            try:
                if isinstance(ppda_raw, dict) and ppda_raw.get("def", 0) > 0:
                    ppda_val = round(ppda_raw["att"] / ppda_raw["def"], 2)
                else:
                    ppda_val = None
            except (TypeError, ValueError, ZeroDivisionError):
                ppda_val = None

            # Deep completions
            try:
                deep_val = int(entry["deep"]) if entry.get("deep") is not None else None
            except (TypeError, ValueError):
                deep_val = None

            match = _find_core_match(db, date_str, team_id, is_home)
            if match is None:
                continue

            did_write = _upsert_xg(
                db=db,
                match=match,
                team_id=team_id,
                is_home=is_home,
                xg_val=xg_val,
                xga_val=xga_val,
                goals_for=goals_for,
                goals_against=goals_against,
                ppda_val=ppda_val,
                deep_val=deep_val,
                dry_run=dry_run,
            )
            if did_write:
                written += 1

    return written


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def fetch_all(seasons: list[int] | None = None, dry_run: bool = False) -> int:
    """Fetch xG for all configured leagues/seasons.

    Returns count of CoreTeamMatchStats rows written.
    """
    if seasons is None:
        seasons = DEFAULT_SEASONS

    _team_cache.clear()
    total_written = 0
    db: Session = SessionLocal()
    scraper = _make_scraper()

    try:
        for league_slug, country in LEAGUES:
            for season in seasons:
                log.info("[fetch_understat_xg] %s / %d ...", league_slug, season)

                league_data = _fetch_league_season(scraper, league_slug, season)
                n_teams = len(league_data.get("teams", {}))
                log.info("[fetch_understat_xg]   %d teams in response", n_teams)

                n = _process_league_data(db, league_data, dry_run=dry_run)

                if not dry_run and n > 0:
                    try:
                        db.commit()
                    except Exception as exc:
                        db.rollback()
                        log.error("[fetch_understat_xg] DB commit failed: %s", exc)
                        n = 0

                total_written += n
                log.info("[fetch_understat_xg]   %d rows written%s", n, " (dry-run)" if dry_run else "")
                time.sleep(REQUEST_DELAY)

    finally:
        db.close()

    log.info("[fetch_understat_xg] Done. Total: %d rows%s", total_written, " (dry-run)" if dry_run else "")
    return total_written


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Fetch xG data from Understat.com.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--season", type=int, help="Single season e.g. 2024")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = fetch_all(seasons=[args.season] if args.season else None, dry_run=args.dry_run)
    print(f"Done. {n} rows updated.")
