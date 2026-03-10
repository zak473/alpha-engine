"""
Tennis prediction pipeline — ML model with ELO fallback.

Usage:
    python -m pipelines.tennis.predict_tennis
    python -m pipelines.tennis.predict_tennis --match-id <uuid>
    python -m pipelines.tennis.predict_tennis --all
"""

from __future__ import annotations

import argparse
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import numpy as np
from sqlalchemy.orm import Session

from core.types import MatchContext, Sport
from db.models.mvp import CoreMatch, ModelRegistry, PredMatch, RatingEloTeam
from db.session import SessionLocal
from ratings.tennis_elo import TennisEloEngine
from pipelines.tennis.feature_engineering import build_feature_vector

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

_SPORT = "tennis"

_SURFACE_MAP: dict[str, str] = {
    "aus_open": "hard", "us_open": "hard",
    "wimbledon": "grass", "french_open": "clay",
    "clay": "clay", "grass": "grass",
}


def _infer_surface(text: str) -> str:
    lower = (text or "").lower()
    for kw, surface in _SURFACE_MAP.items():
        if kw in lower:
            return surface
    return "hard"


def _try_load_model(session: Session) -> Optional[dict]:
    try:
        import joblib
        reg = (
            session.query(ModelRegistry)
            .filter_by(sport=_SPORT, is_live=True)
            .order_by(ModelRegistry.trained_at.desc())
            .first()
        )
        if reg is None:
            return None
        payload = joblib.load(reg.artifact_path)
        payload["registry"] = reg
        payload["model_name"] = reg.model_name
        log.info("Loaded ML model %s", reg.model_name)
        return payload
    except Exception as exc:
        log.warning("ML model unavailable, using ELO: %s", exc)
        return None


def _load_elo_engine(session: Session) -> TennisEloEngine:
    engine = TennisEloEngine()
    sport_match_ids = session.query(CoreMatch.id).filter(CoreMatch.sport == _SPORT).subquery()
    rows = (
        session.query(RatingEloTeam)
        .filter(RatingEloTeam.match_id.in_(sport_match_ids))
        .order_by(RatingEloTeam.rated_at.asc())
        .all()
    )
    for r in rows:
        engine.set_rating(r.team_id, r.rating_after)
    log.info("Loaded ELO ratings for %d tennis player entries.", len(rows))
    return engine


def _predict_ml(match: CoreMatch, payload: dict, session: Session) -> dict:
    model = payload["model"]
    vector, raw = build_feature_vector(session, match)
    X = np.nan_to_num(np.array(vector, dtype=float).reshape(1, -1), nan=0.0)
    proba = model.predict_proba(X)[0]
    p_home, p_away = float(proba[0]), float(proba[1])
    total = p_home + p_away
    p_home, p_away = p_home / total, p_away / total
    confidence = int(round(max(0, min(100, abs(p_home - 0.5) * 200))))
    return dict(
        p_home=round(p_home, 4), p_draw=0.0, p_away=round(p_away, 4),
        fair_odds_home=round(1.0 / p_home, 3) if p_home > 0 else 999.0,
        fair_odds_draw=999.0,
        fair_odds_away=round(1.0 / p_away, 3) if p_away > 0 else 999.0,
        confidence=confidence,
        key_drivers=[{"feature": f, "importance": 0.0, "value": v} for f, v in list(raw.items())[:5]],
        simulation={"n_simulations": 0, "distribution": []},
        features_snapshot=raw,
    )


def _predict_elo(match: CoreMatch, engine: TennisEloEngine) -> dict:
    r_home = engine.get_rating(match.home_team_id)
    r_away = engine.get_rating(match.away_team_id)
    kickoff = match.kickoff_utc
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)

    # Try to infer surface from league_id or any available text
    surface_hint = getattr(match, "league_name", None) or getattr(match, "venue", None) or ""
    surface = _infer_surface(surface_hint)

    context = MatchContext(
        match_id=match.id, sport=Sport.TENNIS, date=kickoff,
        home_entity_id=match.home_team_id, away_entity_id=match.away_team_id,
        importance=1.0, extra={"surface": surface},
    )
    p_home = round(engine.expected_score(r_home, r_away, context), 4)
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
            {"feature": "surface",  "importance": 0.15, "value": surface},
            {"feature": "elo_diff", "importance": 0.05, "value": elo_diff},
        ],
        simulation={"n_simulations": 0, "distribution": []},
        features_snapshot={"elo_home": r_home, "elo_away": r_away, "elo_diff": elo_diff, "surface": surface},
    )


def run_predictions(session, matches, payload, engine) -> int:
    model_version = payload["model_name"] if payload else "elo-v1"
    count = 0
    for match in matches:
        try:
            data = _predict_ml(match, payload, session) if payload else _predict_elo(match, engine)
            existing = session.query(PredMatch).filter_by(match_id=match.id, model_version=model_version).first()
            if existing is None:
                session.add(PredMatch(id=str(uuid.uuid4()), match_id=match.id, model_version=model_version, **data))
                log.info("  [+] %s  p_home=%.3f  p_away=%.3f  conf=%d%%",
                         match.provider_id, data["p_home"], data["p_away"], data["confidence"])
            else:
                for k, v in data.items():
                    setattr(existing, k, v)
            count += 1
        except Exception as exc:
            log.warning("  SKIP %s: %s", match.id[:8], exc)
    return count


def run(match_id: Optional[str] = None, all_matches: bool = False) -> int:
    session: Session = SessionLocal()
    try:
        payload = _try_load_model(session)
        engine = _load_elo_engine(session) if not payload else None

        if match_id:
            matches = session.query(CoreMatch).filter(
                CoreMatch.id == match_id, CoreMatch.sport == _SPORT).all()
        elif all_matches:
            matches = session.query(CoreMatch).filter(
                CoreMatch.sport == _SPORT).order_by(CoreMatch.kickoff_utc.asc()).all()
        else:
            matches = (session.query(CoreMatch)
                       .filter(CoreMatch.sport == _SPORT, CoreMatch.status == "scheduled")
                       .order_by(CoreMatch.kickoff_utc.asc()).all())

        log.info("Running tennis predictions for %d matches (model=%s)...",
                 len(matches), payload["model_name"] if payload else "elo-v1")
        count = run_predictions(session, matches, payload, engine)
        session.commit()
        log.info("Tennis predictions complete. %d rows upserted.", count)
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
