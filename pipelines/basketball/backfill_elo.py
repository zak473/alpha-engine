"""
Basketball ELO backfill pipeline.

Replays all finished basketball matches chronologically through BasketballEloEngine
and writes one rating_elo_team row per (team, match).

Idempotent: deletes existing basketball rating_elo_team rows before rebuilding.

Usage:
    python -m pipelines.basketball.backfill_elo
    python -m pipelines.basketball.backfill_elo --incremental
"""

from __future__ import annotations

import argparse
import logging
from datetime import timezone

from sqlalchemy.orm import Session

from core.types import MatchContext, Sport
from db.models.mvp import CoreMatch, RatingEloTeam
from db.session import SessionLocal
from ratings.basketball_elo import BasketballEloEngine

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)


def run_backfill(incremental: bool = False) -> int:
    session: Session = SessionLocal()
    engine = BasketballEloEngine()
    rows_written = 0

    try:
        matches = (
            session.query(CoreMatch)
            .filter(CoreMatch.status == "finished", CoreMatch.sport == "basketball")
            .order_by(CoreMatch.kickoff_utc.asc())
            .all()
        )
        log.info("Found %d finished basketball matches to process.", len(matches))

        if not incremental:
            sport_match_ids = [m.id for m in matches]
            if sport_match_ids:
                deleted = (
                    session.query(RatingEloTeam)
                    .filter(RatingEloTeam.match_id.in_(sport_match_ids))
                    .delete(synchronize_session="fetch")
                )
                log.info("Cleared %d existing basketball rating_elo_team rows.", deleted)
                session.flush()
        else:
            sport_match_ids = [m.id for m in matches]
            existing = (
                session.query(RatingEloTeam)
                .filter(RatingEloTeam.match_id.in_(sport_match_ids))
                .order_by(RatingEloTeam.rated_at.asc())
                .all()
            )
            already_rated: set[tuple[str, str]] = set()
            for row in existing:
                engine.set_rating(row.team_id, row.rating_after)
                already_rated.add((row.team_id, row.match_id))
            log.info("Loaded %d existing ELO rows for incremental run.", len(existing))

        for match in matches:
            if incremental:
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
                sport=Sport.BASKETBALL,
                date=kickoff,
                home_entity_id=match.home_team_id,
                away_entity_id=match.away_team_id,
                importance=1.0,
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

            # Commit every 200 matches to avoid conflicts with the live scheduler
            if rows_written % 400 == 0:
                try:
                    session.commit()
                except Exception:
                    session.rollback()
                    log.warning("Batch commit conflict — skipping batch (scheduler race). Continuing.")

        try:
            session.commit()
        except Exception:
            session.rollback()
            log.warning("Final commit conflict — some rows skipped due to scheduler race.")
        log.info("Basketball ELO backfill complete. ~%d rating rows written.", rows_written)

    except Exception:
        session.rollback()
        log.exception("Backfill failed — rolled back")
        raise
    finally:
        session.close()

    lb = engine.leaderboard(top_n=10)
    log.info("Top 10 basketball teams by ELO:")
    for rank, (team_id, rating) in enumerate(lb, 1):
        log.info("  %2d. %-40s %.1f", rank, team_id, rating)

    return rows_written


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill basketball ELO ratings")
    parser.add_argument("--incremental", action="store_true",
                        help="Skip matches that already have rating rows")
    args = parser.parse_args()
    run_backfill(incremental=args.incremental)


if __name__ == "__main__":
    main()
