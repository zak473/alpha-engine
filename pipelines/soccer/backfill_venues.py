"""
Backfill venue (stadium name) for soccer matches using football-data.org team endpoint.

Each team has a home venue. We fetch it once per team and store it on core_matches
where that team is the home team.

Rate limit: 10 req/min (free tier) → 6s sleep between requests.

Usage:
    python -m pipelines.soccer.backfill_venues
    python -m pipelines.soccer.backfill_venues --dry-run
"""

from __future__ import annotations

import argparse
import logging
import time

import httpx
from sqlalchemy.orm import Session

from config.settings import settings
from db.models.mvp import CoreMatch, CoreTeam
from db.session import SessionLocal

log = logging.getLogger(__name__)

BASE = "https://api.football-data.org/v4"


def _get_team_venue(team_fd_id: str) -> str | None:
    url = f"{BASE}/teams/{team_fd_id}"
    try:
        resp = httpx.get(
            url,
            headers={"X-Auth-Token": settings.FOOTBALL_DATA_API_KEY},
            timeout=10,
        )
        if resp.status_code == 429:
            log.warning("Rate limited — sleeping 60s")
            time.sleep(60)
            return _get_team_venue(team_fd_id)
        if resp.status_code != 200:
            log.warning("HTTP %s for team %s", resp.status_code, team_fd_id)
            return None
        data = resp.json()
        return data.get("venue") or None
    except Exception as exc:
        log.warning("Error fetching team %s: %s", team_fd_id, exc)
        return None


def run(dry_run: bool = False) -> int:
    db: Session = SessionLocal()
    updated = 0
    try:
        # Only process soccer teams with fd-team-* provider IDs
        teams = (
            db.query(CoreTeam)
            .filter(CoreTeam.provider_id.like("fd-team-%"))
            .all()
        )
        log.info("Found %d soccer teams to process", len(teams))

        for i, team in enumerate(teams):
            fd_id = team.provider_id.replace("fd-team-", "")

            venue = _get_team_venue(fd_id)
            if venue:
                log.info(
                    "[%d/%d] %s → %s",
                    i + 1, len(teams), team.name, venue,
                )
                if not dry_run:
                    # Update all home matches for this team that have no venue set
                    (
                        db.query(CoreMatch)
                        .filter(
                            CoreMatch.home_team_id == team.id,
                            CoreMatch.venue.is_(None),
                        )
                        .update({"venue": venue}, synchronize_session=False)
                    )
                    db.flush()
                updated += 1
            else:
                log.info("[%d/%d] %s → no venue", i + 1, len(teams), team.name)

            # 6s between requests to stay within 10 req/min
            time.sleep(6.2)

            # Commit every 10 teams
            if not dry_run and (i + 1) % 10 == 0:
                db.commit()
                log.info("Committed batch.")

        if not dry_run:
            db.commit()
        log.info("Venue backfill complete. %d teams had venues.", updated)
    except Exception:
        db.rollback()
        log.exception("Venue backfill failed")
        raise
    finally:
        db.close()
    return updated


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill team venue from football-data.org")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = run(dry_run=args.dry_run)
    print(f"Done. {n} teams had venue data.")


if __name__ == "__main__":
    main()
