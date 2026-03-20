"""
Esports per-map ELO backfill pipeline.

Builds map-level ELO ratings using EsportsGameResult rows.
One RatingEloTeam row per (team, match, map) with context="map:{map_name}".

This supplements the global match ELO with map-specific ratings, enabling
features like "team A's CS2 de_dust2 rating" for prediction models.

Idempotent: deletes existing map-context rows before rebuilding.

Usage:
    python -m pipelines.esports.backfill_map_elo
    python -m pipelines.esports.backfill_map_elo --incremental
"""

from __future__ import annotations

import argparse
import logging
from collections import defaultdict
from datetime import timezone

from sqlalchemy.orm import Session

from db.models.mvp import CoreMatch, EsportsGameResult, RatingEloTeam
from db.session import SessionLocal
from ratings.esports_elo import EsportsEloEngine

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)


def run_backfill(incremental: bool = False) -> int:
    session: Session = SessionLocal()
    rows_written = 0

    try:
        # Load all esports game results ordered by match kickoff time
        game_results = (
            session.query(EsportsGameResult, CoreMatch)
            .join(CoreMatch, CoreMatch.id == EsportsGameResult.match_id)
            .filter(CoreMatch.status == "finished", CoreMatch.sport == "esports")
            .order_by(CoreMatch.kickoff_utc.asc(), EsportsGameResult.game_number.asc())
            .all()
        )
        log.info("Found %d esports game results to process.", len(game_results))

        if not game_results:
            log.info("No game results found — run fetch_live.py first.")
            return 0

        # Group by map_name — one EloEngine per map
        if not incremental:
            # Collect all match IDs and delete existing map-context rows
            match_ids = list({gm.match_id for gm, _ in game_results})
            deleted = (
                session.query(RatingEloTeam)
                .filter(
                    RatingEloTeam.match_id.in_(match_ids),
                    RatingEloTeam.context.like("map:%"),
                )
                .delete(synchronize_session="fetch")
            )
            log.info("Cleared %d existing map-context rating_elo_team rows.", deleted)
            session.flush()

        # Build per-map engines
        engines: dict[str, EsportsEloEngine] = {}  # map_name → engine
        already_rated: set[tuple[str, str, str]] = set()  # (team_id, match_id, context)

        if incremental:
            match_ids = list({gm.match_id for gm, _ in game_results})
            existing = (
                session.query(RatingEloTeam)
                .filter(
                    RatingEloTeam.match_id.in_(match_ids),
                    RatingEloTeam.context.like("map:%"),
                )
                .order_by(RatingEloTeam.rated_at.asc())
                .all()
            )
            for row in existing:
                map_name = row.context[4:]  # strip "map:" prefix
                eng = engines.setdefault(map_name, EsportsEloEngine())
                eng.set_rating(row.team_id, row.rating_after)
                already_rated.add((row.team_id, row.match_id, row.context))
            log.info("Loaded %d existing map ELO rows for incremental run.", len(existing))

        for game_result, match in game_results:
            if not game_result.map_name:
                continue  # skip games with no map info — "unknown" isn't useful for map ELO
            map_name = game_result.map_name
            context_key = f"map:{map_name}"

            if incremental:
                home_rated = (game_result.home_team_id, match.id, context_key) in already_rated
                away_rated = (game_result.away_team_id, match.id, context_key) in already_rated
                if home_rated and away_rated:
                    continue

            if game_result.winner_team_id is None:
                continue  # skip games with no result

            # Determine home/away scores from winner
            if game_result.winner_team_id == game_result.home_team_id:
                home_score, away_score = 1.0, 0.0
            else:
                home_score, away_score = 0.0, 1.0

            engine = engines.setdefault(map_name, EsportsEloEngine())

            kickoff = match.kickoff_utc
            if kickoff.tzinfo is None:
                kickoff = kickoff.replace(tzinfo=timezone.utc)

            from core.types import MatchContext, Sport
            context = MatchContext(
                match_id=match.id,
                sport=Sport.ESPORTS,
                date=kickoff,
                home_entity_id=game_result.home_team_id,
                away_entity_id=game_result.away_team_id,
                importance=1.0,
                extra={},
            )

            update_home, update_away = engine.update_ratings(
                game_result.home_team_id,
                game_result.away_team_id,
                home_score,
                away_score,
                context,
            )

            for update, team_id in [
                (update_home, game_result.home_team_id),
                (update_away, game_result.away_team_id),
            ]:
                rated_at = update.timestamp
                if rated_at.tzinfo is None:
                    rated_at = rated_at.replace(tzinfo=timezone.utc)

                row = RatingEloTeam(
                    team_id=team_id,
                    match_id=match.id,
                    context=context_key,
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
        log.info("Esports map ELO backfill complete. %d rating rows written.", rows_written)

        # Log top teams per map
        for map_name, engine in sorted(engines.items()):
            lb = engine.leaderboard(top_n=3)
            log.info("Top 3 on %s: %s", map_name, ", ".join(f"{tid.split('-')[-1]}={r:.0f}" for tid, r in lb))

    except Exception:
        session.rollback()
        log.exception("Map ELO backfill failed — rolled back")
        raise
    finally:
        session.close()

    return rows_written


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill esports per-map ELO ratings")
    parser.add_argument("--incremental", action="store_true",
                        help="Skip games that already have rating rows")
    args = parser.parse_args()
    run_backfill(incremental=args.incremental)


if __name__ == "__main__":
    main()
