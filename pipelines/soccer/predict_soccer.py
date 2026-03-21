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

    import os as _os
    artifact_path = registry.artifact_path
    if not _os.path.exists(artifact_path):
        # Normalize paths stored with local dev prefix to Railway's /app/artefacts/
        filename = _os.path.basename(artifact_path)
        railway_path = _os.path.join("/app/artefacts", filename)
        if _os.path.exists(railway_path):
            artifact_path = railway_path
            log.info("Remapped artifact path to %s", artifact_path)
    log.info("Loading model %s from %s", registry.model_name, artifact_path)
    payload = joblib.load(artifact_path)
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

    # Base column values from DB
    raw: dict = {}
    for col in vars(feat.__class__).keys():
        if not col.startswith("_"):
            v = getattr(feat, col, None)
            if v is not None:
                raw[col] = v

    # Derived features that may not be DB columns (computed from base features)
    def _f(k: str) -> float:
        v = raw.get(k)
        return float(v) if v is not None else 0.0

    # xG imputed from goals avg when unavailable (85% of matches lack Understat xG)
    xg_h = _f("home_xg_avg") or _f("home_gf_avg") or 1.3
    xg_a = _f("away_xg_avg") or _f("away_gf_avg") or 1.1
    xga_h = _f("home_xga_avg") or _f("home_ga_avg") or 1.1
    xga_a = _f("away_xga_avg") or _f("away_ga_avg") or 1.3

    raw.setdefault("xg_diff",          xg_h - xg_a)
    raw.setdefault("xga_diff",         xga_h - xga_a)
    raw.setdefault("gf_diff",          _f("home_gf_avg") - _f("away_gf_avg"))
    raw.setdefault("ga_diff",          _f("home_ga_avg") - _f("away_ga_avg"))
    raw.setdefault("form_pts_diff",    _f("home_form_pts") - _f("away_form_pts"))
    raw.setdefault("xg_overperf_home", _f("home_gf_avg") - xg_h)
    raw.setdefault("xg_overperf_away", _f("away_gf_avg") - xg_a)

    _home_games = max(1.0, _f("home_form_w") + _f("home_form_d") + _f("home_form_l"))
    _away_games = max(1.0, _f("away_form_w") + _f("away_form_d") + _f("away_form_l"))
    _dr_home = _f("home_form_d") / _home_games
    _dr_away = _f("away_form_d") / _away_games
    raw.setdefault("draw_rate_home",  _dr_home)
    raw.setdefault("draw_rate_away",  _dr_away)
    raw.setdefault("draw_rate_sum",   _dr_home + _dr_away)
    raw.setdefault("elo_closeness",   1.0 / (1.0 + abs(_f("elo_home") - _f("elo_away"))))

    # xG total and balance (draw indicators)
    raw.setdefault("xg_total",   xg_h + xg_a)
    raw.setdefault("xg_balance", min(xg_h, xg_a) / max(xg_h, xg_a) if max(xg_h, xg_a) > 0 else 0.5)

    # Poisson goal model probabilities
    import math
    from pipelines.soccer.train_soccer_lgb import _poisson_probs
    p_hwin, p_draw_p, p_awin = _poisson_probs(xg_h, xg_a)
    raw.setdefault("poisson_home_prob", p_hwin)
    raw.setdefault("poisson_draw_prob", p_draw_p)
    raw.setdefault("poisson_away_prob", p_awin)

    # League draw and home win rates
    from db.models.mvp import CoreMatch as _CM
    _league_id = match.league_id
    if _league_id:
        from sqlalchemy import func
        _total = session.query(func.count(_CM.id)).filter(
            _CM.league_id == _league_id, _CM.sport == "soccer", _CM.outcome.isnot(None)
        ).scalar() or 0
        if _total >= 20:
            _draws = session.query(func.count(_CM.id)).filter(
                _CM.league_id == _league_id, _CM.sport == "soccer", _CM.outcome.in_(["D", "draw"])
            ).scalar() or 0
            _hw = session.query(func.count(_CM.id)).filter(
                _CM.league_id == _league_id, _CM.sport == "soccer", _CM.outcome.in_(["H", "home_win"])
            ).scalar() or 0
            raw.setdefault("league_draw_rate",     _draws / _total)
            raw.setdefault("league_home_win_rate", _hw / _total)
        else:
            raw.setdefault("league_draw_rate",     0.243)
            raw.setdefault("league_home_win_rate", 0.443)
    else:
        raw.setdefault("league_draw_rate",     0.243)
        raw.setdefault("league_home_win_rate", 0.443)

    # Market odds (implied probabilities, normalised)
    if match.odds_home and match.odds_draw and match.odds_away:
        _rh = 1.0 / match.odds_home
        _rd = 1.0 / match.odds_draw
        _ra = 1.0 / match.odds_away
        _tot = _rh + _rd + _ra
        raw.setdefault("odds_implied_home", _rh / _tot)
        raw.setdefault("odds_implied_draw", _rd / _tot)
        raw.setdefault("odds_implied_away", _ra / _tot)
    else:
        raw.setdefault("odds_implied_home", float("nan"))
        raw.setdefault("odds_implied_draw", float("nan"))
        raw.setdefault("odds_implied_away", float("nan"))

    vector = []
    for name in feature_names:
        val = raw.get(name)
        vector.append(float(val) if val is not None else float("nan"))

    X = np.array(vector, dtype=float).reshape(1, -1)
    X = np.nan_to_num(X, nan=0.0)
    return X, {n: raw.get(n) for n in feature_names}


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
    Extract top feature importances. Supports LR (coefficients) and XGBoost (feature_importances_).
    """
    try:
        cal_model = model_payload["model"]
        importances = None

        # Try XGBoost first (direct model, not wrapped in CalibratedClassifierCV)
        if hasattr(cal_model, "feature_importances_"):
            importances = cal_model.feature_importances_
        elif hasattr(cal_model, "calibrated_classifiers_"):
            estimator = cal_model.calibrated_classifiers_[0].estimator
            # XGBoost wrapped in calibration
            if hasattr(estimator, "feature_importances_"):
                importances = estimator.feature_importances_
            # LR wrapped in Pipeline
            elif hasattr(estimator, "named_steps") and "lr" in estimator.named_steps:
                lr = estimator.named_steps["lr"]
                coef_abs = np.abs(lr.coef_).mean(axis=0)
                importances = coef_abs / coef_abs.sum() if coef_abs.sum() > 0 else coef_abs

        if importances is None:
            return []

        n = min(len(feature_names), len(importances))
        paired = list(zip(feature_names[:n], importances[:n], [feature_values.get(f) for f in feature_names[:n]]))
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
            # Replace NaN with None so the JSON snapshot is valid
            feat_snap = {k: (None if isinstance(v, float) and np.isnan(v) else v)
                         for k, v in feat_raw.items()}
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
                features_snapshot=feat_snap,
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
