"""
Fetch NBA betting odds from BallDontLie and update CoreMatch.odds_home/away.

Uses sharp sportsbooks (DraftKings, FanDuel, Caesars) for moneyline odds.
Runs as part of the _job_fetch_odds scheduler cycle.

Usage:
    python -m pipelines.odds.fetch_odds_bdl
    python -m pipelines.odds.fetch_odds_bdl --dry-run
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from config.settings import settings
from db.models.mvp import CoreMatch, CoreTeam
from db.session import SessionLocal

log = logging.getLogger(__name__)

BDL_BASE = "https://api.balldontlie.io/v1"

# Preferred books in priority order (sharpest first)
PREFERRED_BOOKS = ["draftkings", "fanduel", "caesars", "betmgm", "betrivers"]


def _american_to_decimal(american: int | None) -> Optional[float]:
    if american is None or american == 0:
        return None
    if american > 0:
        return round(american / 100 + 1, 4)
    return round(100 / abs(american) + 1, 4)


def _normalize(name: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]", " ", name.lower())).strip()


def _teams_match(a: str, b: str) -> bool:
    na, nb = _normalize(a), _normalize(b)
    if na == nb:
        return True
    # Check if either name is contained in the other (handles "LA Clippers" / "Clippers")
    wa = [w for w in na.split() if len(w) > 3]
    wb = set(nb.split())
    return bool(wa) and any(w in wb for w in wa)


def _pick_odds(odds_rows: list[dict]) -> tuple[Optional[float], Optional[float]]:
    """
    From a list of odds rows for one game, pick the best book's moneyline.
    Returns (home_decimal, away_decimal) or (None, None).
    """
    by_vendor: dict[str, dict] = {}
    for row in odds_rows:
        vendor = (row.get("vendor") or "").lower()
        by_vendor[vendor] = row

    for book in PREFERRED_BOOKS:
        row = by_vendor.get(book)
        if row:
            h = _american_to_decimal(row.get("moneyline_home_odds"))
            a = _american_to_decimal(row.get("moneyline_away_odds"))
            if h and a:
                return h, a

    # Fallback: any book with both moneylines
    for row in odds_rows:
        h = _american_to_decimal(row.get("moneyline_home_odds"))
        a = _american_to_decimal(row.get("moneyline_away_odds"))
        if h and a:
            return h, a

    return None, None


def fetch_all(dry_run: bool = False) -> int:
    """
    Fetch BallDontLie NBA odds for upcoming games and update CoreMatch.odds_home/away.
    Returns number of matches updated.
    """
    bdl_key = getattr(settings, "BALLDONTLIE_API_KEY", None)
    if not bdl_key:
        log.info("[bdl_odds] BALLDONTLIE_API_KEY not set — skipping.")
        return 0

    db = SessionLocal()
    updated = 0
    now = datetime.now(timezone.utc)

    try:
        # Fetch NBA games for today + next 2 days
        dates = [(now + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(3)]

        headers = {"Authorization": bdl_key}
        all_games: list[dict] = []
        all_odds: dict[int, list[dict]] = {}  # game_id → list of odds rows

        with httpx.Client(timeout=15) as client:
            # Fetch games
            for date_str in dates:
                resp = client.get(
                    f"{BDL_BASE}/games",
                    headers=headers,
                    params={"dates[]": date_str, "per_page": 100},
                )
                if resp.status_code != 200:
                    log.warning("[bdl_odds] games fetch failed for %s: HTTP %s", date_str, resp.status_code)
                    continue
                games = resp.json().get("data") or []
                all_games.extend(games)
                time.sleep(0.3)

            if not all_games:
                log.info("[bdl_odds] No NBA games found for upcoming dates.")
                return 0

            # Fetch odds for each date
            for date_str in dates:
                resp = client.get(
                    f"{BDL_BASE}/nba/odds",
                    headers=headers,
                    params={"dates[]": date_str, "per_page": 100},
                )
                if resp.status_code != 200:
                    log.warning("[bdl_odds] odds fetch failed for %s: HTTP %s", date_str, resp.status_code)
                    continue
                for row in resp.json().get("data") or []:
                    gid = row.get("game_id")
                    if gid:
                        all_odds.setdefault(gid, []).append(row)
                time.sleep(0.3)

        if not all_odds:
            log.info("[bdl_odds] No NBA odds returned.")
            return 0

        # Pre-load upcoming CoreMatch rows for basketball
        upcoming = (
            db.query(CoreMatch)
            .filter(
                CoreMatch.sport == "basketball",
                CoreMatch.status.in_(["scheduled", "live"]),
                CoreMatch.kickoff_utc >= now - timedelta(hours=2),
                CoreMatch.kickoff_utc <= now + timedelta(days=3),
            )
            .all()
        )
        team_ids = set()
        for m in upcoming:
            team_ids.add(m.home_team_id)
            team_ids.add(m.away_team_id)
        teams = {t.id: t.name for t in db.query(CoreTeam).filter(CoreTeam.id.in_(team_ids)).all()}

        # Match BDL games to CoreMatch rows
        for game in all_games:
            game_id = game["id"]
            odds_rows = all_odds.get(game_id)
            if not odds_rows:
                continue

            home_dec, away_dec = _pick_odds(odds_rows)
            if not home_dec or not away_dec:
                continue

            bdl_home = game.get("home_team", {}).get("full_name", "")
            bdl_away = game.get("visitor_team", {}).get("full_name", "")
            bdl_dt_str = game.get("datetime") or game.get("status") or ""
            try:
                bdl_kickoff = datetime.fromisoformat(bdl_dt_str.replace("Z", "+00:00"))
            except Exception:
                continue

            # Find matching CoreMatch
            for m in upcoming:
                home_name = teams.get(m.home_team_id, "")
                away_name = teams.get(m.away_team_id, "")
                if not _teams_match(bdl_home, home_name):
                    continue
                if not _teams_match(bdl_away, away_name):
                    continue
                diff = abs((m.kickoff_utc.replace(tzinfo=timezone.utc) - bdl_kickoff).total_seconds())
                if diff > 43200:  # 12h window
                    continue

                changed = m.odds_home != home_dec or m.odds_away != away_dec
                if changed:
                    log.info(
                        "[bdl_odds] %s vs %s — home=%.3f away=%.3f",
                        home_name, away_name, home_dec, away_dec,
                    )
                    if not dry_run:
                        m.odds_home = home_dec
                        m.odds_away = away_dec
                    updated += 1
                break

        if not dry_run and updated:
            db.commit()

        log.info("[bdl_odds] Done. %d NBA matches %s.", updated, "would be updated" if dry_run else "updated")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    return updated


if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    n = fetch_all(dry_run=args.dry_run)
    print(f"Done. {n} matches {'would be ' if args.dry_run else ''}updated.")
