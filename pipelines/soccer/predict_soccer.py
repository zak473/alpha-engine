"""
Soccer prediction runner.

Loads the live model from model_registry, builds features for upcoming matches,
generates probabilities + fair odds + confidence score + Monte Carlo simulation,
then upserts into pred_match.

Usage:
    python -m pipelines.soccer.predict_soccer
    python -m pipelines.soccer.predict_soccer --match-id <uuid>
    python -m pipelines.soccer.predict_soccer --all   # re-run all (including past matches)
"""

from __future__ import annotations

import argparse
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import joblib
import numpy as np
from sqlalchemy.orm import Session

from core.types import MatchContext, PredictionResult, Sport
from db.models.mvp import CoreMatch, CoreTeam, FeatSoccerMatch, ModelRegistry, PredMatch
from db.session import SessionLocal
from pipelines.soccer.build_soccer_features import build_features_for_match
from simulation.monte_carlo import MonteCarloEngine

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

MC_N = 10_000


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def _load_live_model(session: Session) -> dict:
    """Load the live model payload from disk. Raises if none found."""
    registry = (
        session.query(ModelRegistry)
        .filter_by(sport="soccer", is_live=True)
        .order_by(ModelRegistry.trained_at.desc())
        .first()
    )
    if registry is None:
        raise RuntimeError("No live soccer model found. Run train_soccer_model.py first.")

    log.info("Loading model %s from %s", registry.model_name, registry.artifact_path)
    payload = joblib.load(registry.artifact_path)
    payload["registry"] = registry
    return payload


# ---------------------------------------------------------------------------
# Feature extraction
# ---------------------------------------------------------------------------

def _feature_vector(session: Session, match: CoreMatch, feature_names: list[str]) -> tuple[np.ndarray, dict]:
    """
    Return feature vector and raw feature dict for a match.
    Triggers feature recompute if row is missing.
    """
    feat = session.query(FeatSoccerMatch).filter_by(match_id=match.id).first()
    if feat is None:
        build_features_for_match(session, match)
        session.flush()
        feat = session.query(FeatSoccerMatch).filter_by(match_id=match.id).first()

    if feat is None:
        raise ValueError(f"Could not build features for match {match.id}")

    raw: dict = {}
    vector = []
    for name in feature_names:
        val = getattr(feat, name, None)
        raw[name] = val
        vector.append(float(val) if val is not None else float("nan"))

    X = np.array(vector, dtype=float).reshape(1, -1)

    # Impute NaN with 0 (simple fallback — training used column means, but at runtime use 0 for simplicity)
    X = np.nan_to_num(X, nan=0.0)
    return X, raw


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------

def _confidence_score(proba: np.ndarray) -> int:
    """
    Confidence: how far the max probability is above random (1/3).
    Maps to 0–100.
    """
    max_p = float(proba.max())
    random_p = 1.0 / 3.0
    raw = (max_p - random_p) / (1.0 - random_p)
    return int(round(max(0, min(100, raw * 100))))


def _key_drivers(feature_names: list[str], feature_values: dict, model_payload: dict) -> list[dict]:
    """
    Extract top feature importances from the calibrated LR model.
    Uses the absolute coefficients of the underlying LogisticRegression.
    """
    try:
        cal_model = model_payload["model"]
        # CalibratedClassifierCV wraps a list of calibrated classifiers; get the first
        calibrators = cal_model.calibrated_classifiers_
        lr = calibrators[0].estimator.named_steps["lr"]
        # Mean absolute coefficient across 3 classes, normalised
        coef_abs = np.abs(lr.coef_).mean(axis=0)
        coef_norm = coef_abs / coef_abs.sum() if coef_abs.sum() > 0 else coef_abs
        paired = list(zip(feature_names, coef_norm, [feature_values.get(f) for f in feature_names]))
        paired.sort(key=lambda x: x[1], reverse=True)
        return [
            {"feature": name, "importance": round(float(imp), 4), "value": val}
            for name, imp, val in paired[:5]
        ]
    except Exception:
        return []


def _simulation_summary(
    p_home: float,
    feat_raw: dict,
    match: CoreMatch,
    dist: dict,
) -> dict:
    """Build the simulation dict stored in pred_match.simulation."""
    # Top 10 scorelines
    top_scorelines = [
        {"score": k, "probability": round(v, 4)}
        for k, v in list(dist.items())[:10]
    ]
    return {
        "n_simulations": MC_N,
        "distribution": top_scorelines,
        "mean_home_goals": round(
            sum(int(s.split("-")[0]) * p for s, p in dist.items()), 3
        ),
        "mean_away_goals": round(
            sum(int(s.split("-")[1]) * p for s, p in dist.items()), 3
        ),
    }


# ---------------------------------------------------------------------------
# Main prediction loop
# ---------------------------------------------------------------------------

def run_predictions(session: Session, matches: list[CoreMatch], payload: dict) -> int:
    model = payload["model"]
    registry = payload["registry"]
    feature_names = payload["feature_names"]
    label_outcomes = payload["label_outcomes"]
    mc_engine = MonteCarloEngine(default_n=MC_N, random_seed=42)

    count = 0
    for match in matches:
        try:
            X, feat_raw = _feature_vector(session, match, feature_names)

            proba = model.predict_proba(X)[0]  # shape (3,) — home, draw, away
            p_home, p_draw, p_away = float(proba[0]), float(proba[1]), float(proba[2])

            # Normalise to sum to 1.0 (calibration can drift slightly)
            total = p_home + p_draw + p_away
            p_home, p_draw, p_away = p_home / total, p_draw / total, p_away / total

            fair_odds_home = round(1.0 / p_home, 3) if p_home > 0 else 999.0
            fair_odds_draw = round(1.0 / p_draw, 3) if p_draw > 0 else 999.0
            fair_odds_away = round(1.0 / p_away, 3) if p_away > 0 else 999.0

            confidence = _confidence_score(proba)
            drivers = _key_drivers(feature_names, feat_raw, payload)

            # Monte Carlo simulation
            pred_result = PredictionResult(
                match_id=match.id,
                sport=Sport.SOCCER,
                p_home=p_home,
                p_draw=p_draw,
                p_away=p_away,
            )
            kickoff = match.kickoff_utc
            if kickoff.tzinfo is None:
                kickoff = kickoff.replace(tzinfo=timezone.utc)

            context = MatchContext(
                match_id=match.id,
                sport=Sport.SOCCER,
                date=kickoff,
                home_entity_id=match.home_team_id,
                away_entity_id=match.away_team_id,
                extra={
                    "xg_home": feat_raw.get("home_xg_avg") or 1.35,
                    "xg_away": feat_raw.get("away_xg_avg") or 1.05,
                },
            )
            dist = mc_engine.scoreline_distribution(pred_result, context, "soccer", n=MC_N)
            simulation = _simulation_summary(p_home, feat_raw, match, dist)

            # Upsert into pred_match
            existing = (
                session.query(PredMatch)
                .filter_by(match_id=match.id, model_version=registry.model_name)
                .first()
            )
            data = dict(
                p_home=round(p_home, 4),
                p_draw=round(p_draw, 4),
                p_away=round(p_away, 4),
                fair_odds_home=fair_odds_home,
                fair_odds_draw=fair_odds_draw,
                fair_odds_away=fair_odds_away,
                confidence=confidence,
                key_drivers=drivers,
                simulation=simulation,
                features_snapshot=feat_raw,
            )
            if existing is None:
                pred = PredMatch(
                    id=str(uuid.uuid4()),
                    match_id=match.id,
                    model_version=registry.model_name,
                    **data,
                )
                session.add(pred)
                log.info("  [+] pred  %s  p_home=%.3f  p_draw=%.3f  p_away=%.3f  conf=%d%%",
                         match.provider_id, p_home, p_draw, p_away, confidence)
            else:
                for k, v in data.items():
                    setattr(existing, k, v)
                log.debug("  [~] pred  %s  updated", match.provider_id)

            count += 1

        except Exception as exc:
            log.warning("  SKIP  match %s: %s", match.id[:8], exc)

    return count


def run(match_id: Optional[str] = None, all_matches: bool = False) -> int:
    session: Session = SessionLocal()
    try:
        payload = _load_live_model(session)

        if match_id:
            matches = session.query(CoreMatch).filter(CoreMatch.id == match_id).all()
        elif all_matches:
            matches = session.query(CoreMatch).order_by(CoreMatch.kickoff_utc.asc()).all()
        else:
            # Default: only upcoming unresolved matches
            now = datetime.now(tz=timezone.utc)
            matches = (
                session.query(CoreMatch)
                .filter(CoreMatch.status == "scheduled")
                .order_by(CoreMatch.kickoff_utc.asc())
                .all()
            )

        log.info("Running predictions for %d matches...", len(matches))
        count = run_predictions(session, matches, payload)
        session.commit()
        log.info("Predictions complete. %d rows upserted.", count)
        return count

    except Exception:
        session.rollback()
        log.exception("Prediction run failed")
        raise
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run soccer match predictions")
    parser.add_argument("--match-id", help="Predict for a single match UUID")
    parser.add_argument("--all", dest="all_matches", action="store_true",
                        help="Run predictions for all matches (not just upcoming)")
    args = parser.parse_args()
    run(match_id=args.match_id, all_matches=args.all_matches)


if __name__ == "__main__":
    main()
