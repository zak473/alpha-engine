"""
Hockey prediction pipeline — ELO-based win probability.

Usage:
    python -m pipelines.hockey.predict_hockey
    python -m pipelines.hockey.predict_hockey --match-id <uuid>
    python -m pipelines.hockey.predict_hockey --all
"""

from __future__ import annotations

import argparse
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from core.types import MatchContext, Sport
from db.models.mvp import CoreMatch, PredMatch, RatingEloTeam
from db.session import SessionLocal
from ratings.hockey_elo import HockeyEloEngine

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

_SPORT = "hockey"
_MODEL_VERSION = "hockey-elo-v1"


def _load_elo_engine(session: Session) -> HockeyEloEngine:
    engine = HockeyEloEngine()
    sport_match_ids = session.query(CoreMatch.id).filter(CoreMatch.sport == _SPORT).subquery()
    rows = (
        session.query(RatingEloTeam)
        .filter(RatingEloTeam.match_id.in_(sport_match_ids))
        .order_by(RatingEloTeam.rated_at.asc())
        .all()
    )
    for r in rows:
        engine.set_rating(r.team_id, r.rating_after)
    log.info("Loaded ELO ratings for %d team entries.", len(rows))
    return engine


def _predict_elo(match: CoreMatch, engine: HockeyEloEngine) -> dict:
    r_home = engine.get_rating(match.home_team_id)
    r_away = engine.get_rating(match.away_team_id)
    kickoff = match.kickoff_utc
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)
    context = MatchContext(
        match_id=match.id, sport=Sport.HOCKEY, date=kickoff,
        home_entity_id=match.home_team_id, away_entity_id=match.away_team_id,
        importance=1.0, extra={},
    )
    p_home, p_away = engine.win_probability(match.home_team_id, match.away_team_id, context)
    p_home = round(p_home, 4)
    p_away = round(1.0 - p_home, 4)
    elo_diff = round(r_home - r_away, 1)
    return dict(
        p_home=p_home, p_draw=0.0, p_away=p_away,
        fair_odds_home=round(1.0 / p_home, 3) if p_home > 0 else 999.0,
        fair_odds_draw=999.0,
        fair_odds_away=round(1.0 / p_away, 3) if p_away > 0 else 999.0,
        confidence=int(round(max(0, min(100, (max(p_home, p_away) - 0.5) * 200)))),
        key_drivers=[
            {"feature": "elo_home", "importance": 0.40, "value": round(r_home, 1)},
            {"feature": "elo_away", "importance": 0.40, "value": round(r_away, 1)},
            {"feature": "elo_diff", "importance": 0.20, "value": elo_diff},
        ],
        simulation={"n_simulations": 0, "distribution": []},
        features_snapshot={"elo_home": r_home, "elo_away": r_away, "elo_diff": elo_diff},
    )


def run(match_id: Optional[str] = None, all_matches: bool = False) -> int:
    session: Session = SessionLocal()
    try:
        engine = _load_elo_engine(session)

        if match_id:
            matches = session.query(CoreMatch).filter(
                CoreMatch.id == match_id, CoreMatch.sport == _SPORT).all()
        elif all_matches:
            matches = session.query(CoreMatch).filter(
                CoreMatch.sport == _SPORT).order_by(CoreMatch.kickoff_utc.asc()).all()
        else:
            matches = (
                session.query(CoreMatch)
                .filter(CoreMatch.sport == _SPORT, CoreMatch.status == "scheduled")
                .order_by(CoreMatch.kickoff_utc.asc())
                .all()
            )

        log.info("Running hockey predictions for %d matches (model=%s)...", len(matches), _MODEL_VERSION)
        count = 0
        for match in matches:
            try:
                data = _predict_elo(match, engine)
                existing = session.query(PredMatch).filter_by(
                    match_id=match.id, model_version=_MODEL_VERSION
                ).first()
                if existing is None:
                    session.add(PredMatch(
                        id=str(uuid.uuid4()),
                        match_id=match.id,
                        model_version=_MODEL_VERSION,
                        **data,
                    ))
                    log.info("  [+] %s  p_home=%.3f  p_away=%.3f  conf=%d%%",
                             match.provider_id, data["p_home"], data["p_away"], data["confidence"])
                else:
                    for k, v in data.items():
                        setattr(existing, k, v)
                count += 1
            except Exception as exc:
                log.warning("  SKIP %s: %s", match.id[:8], exc)

        session.commit()
        log.info("Hockey predictions complete. %d rows upserted.", count)
        return count

    except Exception:
        session.rollback()
        log.exception("Prediction run failed")
        raise
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--match-id")
    parser.add_argument("--all", dest="all_matches", action="store_true")
    args = parser.parse_args()
    run(match_id=args.match_id, all_matches=args.all_matches)


if __name__ == "__main__":
    main()
