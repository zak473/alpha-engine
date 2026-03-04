"""
ELO backfill pipeline.

Replays all finished core_matches chronologically through SoccerEloEngine
and writes one rating_elo_team row per (team, match).

Idempotent: deletes existing rating_elo_team rows before rebuilding (full
rebuild is fast enough for MVP; incremental update can be added later).

Usage:
    python -m pipelines.soccer.backfill_elo
    python -m pipelines.soccer.backfill_elo --incremental   # skip already-rated matches
"""

from __future__ import annotations

import argparse
import logging
from datetime import timezone

from sqlalchemy.orm import Session

from core.types import MatchContext, Sport
from db.models.mvp import CoreMatch, RatingEloTeam
from db.session import SessionLocal
from ratings.soccer_elo import SoccerEloEngine

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)


def run_backfill(incremental: bool = False) -> int:
    """
    Replay all finished matches through the ELO engine.
    Returns number of rating rows written.
    """
    session: Session = SessionLocal()
    engine = SoccerEloEngine()
    rows_written = 0

    try:
        # Fetch finished matches ordered chronologically
        matches = (
            session.query(CoreMatch)
            .filter(CoreMatch.status == "finished")
            .order_by(CoreMatch.kickoff_utc.asc())
            .all()
        )
        log.info("Found %d finished matches to process.", len(matches))

        if not incremental:
            # Full rebuild: clear existing ELO rows and replay from scratch
            deleted = session.query(RatingEloTeam).delete()
            log.info("Cleared %d existing rating_elo_team rows.", deleted)
            session.flush()
        else:
            # Load existing ratings into engine so we continue from where we left off
            existing = session.query(RatingEloTeam).order_by(RatingEloTeam.rated_at.asc()).all()
            already_rated: set[tuple[str, str]] = set()
            for row in existing:
                engine.set_rating(row.team_id, row.rating_after)
                already_rated.add((row.team_id, row.match_id))
            log.info("Loaded %d existing ELO rows for incremental run.", len(existing))

        for match in matches:
            if incremental:
                # Skip if both teams already have a rating row for this match
                if (
                    (match.home_team_id, match.id) in already_rated
                    and (match.away_team_id, match.id) in already_rated
                ):
                    continue

            home_score = match.home_score if match.home_score is not None else 0
            away_score = match.away_score if match.away_score is not None else 0

            kickoff = match.kickoff_utc
            if kickoff.tzinfo is None:
                kickoff = kickoff.replace(tzinfo=timezone.utc)

            context = MatchContext(
                match_id=match.id,
                sport=Sport.SOCCER,
                date=kickoff,
                home_entity_id=match.home_team_id,
                away_entity_id=match.away_team_id,
                importance=1.2,  # Premier League default
                extra={},
            )

            update_home, update_away = engine.update_ratings(
                match.home_team_id,
                match.away_team_id,
                float(home_score),
                float(away_score),
                context,
            )

            for update, team_id in [(update_home, match.home_team_id), (update_away, match.away_team_id)]:
                rated_at = update.timestamp
                if rated_at.tzinfo is None:
                    rated_at = rated_at.replace(tzinfo=timezone.utc)

                row = RatingEloTeam(
                    team_id=team_id,
                    match_id=match.id,
                    context="global",
                    rating_before=update.rating_before,
                    rating_after=update.rating_after,
                    expected_score=update.expected_score,
                    actual_score=update.actual_score,
                    k_factor=update.k_factor,
                    rated_at=rated_at,
                )
                session.add(row)
                rows_written += 1

        session.commit()
        log.info("ELO backfill complete. %d rating rows written.", rows_written)

    except Exception:
        session.rollback()
        log.exception("Backfill failed — rolled back")
        raise
    finally:
        session.close()

    # Log leaderboard
    lb = engine.leaderboard(top_n=10)
    log.info("Top 10 teams by ELO:")
    for rank, (team_id, rating) in enumerate(lb, 1):
        log.info("  %2d. %-30s %.1f", rank, team_id, rating)

    return rows_written


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill ELO ratings from core_matches")
    parser.add_argument(
        "--incremental",
        action="store_true",
        help="Skip matches that already have rating rows (default: full rebuild)",
    )
    args = parser.parse_args()
    run_backfill(incremental=args.incremental)


if __name__ == "__main__":
    main()
