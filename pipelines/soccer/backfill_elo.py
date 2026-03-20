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

from collections import defaultdict

from core.types import MatchContext, Sport
from db.models.mvp import CoreMatch, CoreTeamMatchStats, RatingEloTeam
from db.session import SessionLocal
from ratings.soccer_elo import SoccerEloEngine, COMPETITION_IMPORTANCE
from pipelines.common.league_importance import build_league_importance_map

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
            .filter(CoreMatch.status == "finished", CoreMatch.sport == "soccer")
            .order_by(CoreMatch.kickoff_utc.asc())
            .all()
        )
        log.info("Found %d finished soccer matches to process.", len(matches))

        league_importance = build_league_importance_map(session, "soccer", COMPETITION_IMPORTANCE)
        log.info("Loaded importance multipliers for %d leagues.", len(league_importance))

        sport_match_ids = [m.id for m in matches]

        # Bulk-load xG data: match_id → {is_home: xg}
        xg_rows = (
            session.query(CoreTeamMatchStats)
            .filter(CoreTeamMatchStats.match_id.in_(sport_match_ids))
            .all()
        )
        xg_by_match: dict[str, dict[bool, float]] = defaultdict(dict)
        for row in xg_rows:
            if row.xg is not None:
                xg_by_match[row.match_id][row.is_home] = float(row.xg)
        log.info("Loaded xG data for %d match-sides.", len(xg_rows))

        if not incremental:
            # Full rebuild: clear existing ELO rows for soccer matches only
            if sport_match_ids:
                deleted = (
                    session.query(RatingEloTeam)
                    .filter(RatingEloTeam.match_id.in_(sport_match_ids))
                    .delete(synchronize_session="fetch")
                )
                log.info("Cleared %d existing soccer rating_elo_team rows.", deleted)
                session.flush()
        else:
            # Load existing ratings into engine so we continue from where we left off
            existing = (
                session.query(RatingEloTeam)
                .filter(RatingEloTeam.match_id.in_(sport_match_ids))
                .order_by(RatingEloTeam.rated_at.asc())
                .all()
            )
            already_rated: set[tuple[str, str]] = set()
            for row in existing:
                engine.set_rating(row.team_id, row.rating_after)
                if row.home_advantage_after is not None:
                    engine.set_home_advantage(row.team_id, row.home_advantage_after)
                already_rated.add((row.team_id, row.match_id))
            log.info("Loaded %d existing ELO rows for incremental run.", len(existing))

        # Track per-league season to avoid spurious reversions from interleaved seasons
        season_by_league: dict[str, str] = {}
        reverted_seasons: set[tuple[str, str]] = set()  # (league_id, new_season) already reverted
        for match in matches:
            if incremental:
                # Skip if both teams already have a rating row for this match
                if (
                    (match.home_team_id, match.id) in already_rated
                    and (match.away_team_id, match.id) in already_rated
                ):
                    continue

            # Season reversion: per-league, applied once per (league, new_season) boundary
            if match.season and match.league_id:
                prev_season = season_by_league.get(match.league_id)
                if prev_season and prev_season != match.season:
                    key = (match.league_id, match.season)
                    if key not in reverted_seasons:
                        engine.season_revert(revert_fraction=0.20)
                        reverted_seasons.add(key)
                        log.info("Season reversion applied (league %s: %s → %s)",
                                 match.league_id[:8], prev_season, match.season)
                season_by_league[match.league_id] = match.season

            home_score = match.home_score if match.home_score is not None else 0
            away_score = match.away_score if match.away_score is not None else 0

            kickoff = match.kickoff_utc
            if kickoff.tzinfo is None:
                kickoff = kickoff.replace(tzinfo=timezone.utc)

            # Use xG as MoV signal when available, fall back to goals
            match_xg = xg_by_match.get(match.id, {})
            extra: dict = {}
            if True in match_xg and False in match_xg:
                extra["xg_home"] = match_xg[True]
                extra["xg_away"] = match_xg[False]

            context = MatchContext(
                match_id=match.id,
                sport=Sport.SOCCER,
                date=kickoff,
                home_entity_id=match.home_team_id,
                away_entity_id=match.away_team_id,
                importance=league_importance.get(match.league_id, 1.0),
                extra=extra,
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
                    home_advantage_after=engine.get_home_advantage(team_id) if team_id == match.home_team_id else None,
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
