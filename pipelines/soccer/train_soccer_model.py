"""
Soccer match outcome model training.

Algorithm:   LogisticRegression (lbfgs, max_iter=2000) + StandardScaler
             + CalibratedClassifierCV (Platt sigmoid, 5-fold)
Evaluation:  Walk-forward split (train on oldest 80%, evaluate on newest 20%)
             Rows sorted by FeatSoccerMatch.computed_at to respect temporal order.
Output:      artefacts/soccer_lr_v{n}.joblib + model_registry row

Features:    25 pre-computed columns from feat_soccer_match table.

Usage:
    python -m pipelines.soccer.train_soccer_model
    python -m pipelines.soccer.train_soccer_model --version v7
"""

from __future__ import annotations

import argparse
import logging
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from db.models.mvp import FeatSoccerMatch, ModelRegistry
from db.session import SessionLocal
from evaluation.metrics import brier, logloss

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

ARTEFACT_DIR = Path(__file__).resolve().parents[2] / "artefacts"
ARTEFACT_DIR.mkdir(exist_ok=True)

_SPORT = "soccer"

OUTCOME_LABELS = {"home_win": 0, "H": 0, "draw": 1, "D": 1, "away_win": 2, "A": 2}
LABEL_OUTCOMES = {0: "home_win", 1: "draw", 2: "away_win"}

FEATURE_NAMES = [
    "elo_home", "elo_away", "elo_diff",
    "home_form_pts", "away_form_pts",
    "home_form_w", "home_form_d", "home_form_l",
    "away_form_w", "away_form_d", "away_form_l",
    "home_gf_avg", "home_ga_avg",
    "away_gf_avg", "away_ga_avg",
    "home_xg_avg", "home_xga_avg",
    "away_xg_avg", "away_xga_avg",
    "home_days_rest", "away_days_rest", "rest_diff",
    "h2h_home_win_pct", "h2h_matches_played",
    "is_home_advantage",
]


def _load_data(session) -> tuple[np.ndarray, np.ndarray]:
    from db.models.mvp import CoreMatch
    rows = (
        session.query(FeatSoccerMatch, CoreMatch)
        .join(CoreMatch, CoreMatch.id == FeatSoccerMatch.match_id)
        .filter(FeatSoccerMatch.outcome.isnot(None))
        .order_by(CoreMatch.kickoff_utc.asc())
        .all()
    )
    rows = [feat for feat, _ in rows]
    log.info("Loaded %d labelled FeatSoccerMatch rows.", len(rows))

    if len(rows) < 50:
        raise ValueError(f"Only {len(rows)} labelled rows — run build_soccer_features.py first.")

    X_raw, y_raw = [], []
    skipped = 0
    for feat in rows:
        label = OUTCOME_LABELS.get(feat.outcome)
        if label is None:
            skipped += 1
            continue
        vec = [float(getattr(feat, name) or 0.0) for name in FEATURE_NAMES]
        X_raw.append(vec)
        y_raw.append(label)

    log.info("Built %d feature vectors (%d skipped — unknown outcome).", len(X_raw), skipped)
    X = np.array(X_raw, dtype=float)
    y = np.array(y_raw, dtype=int)

    # Impute NaN with column means
    col_means = np.nanmean(X, axis=0)
    col_means = np.where(np.isnan(col_means), 0.0, col_means)
    for j in range(X.shape[1]):
        mask = np.isnan(X[:, j])
        if mask.any():
            X[mask, j] = col_means[j]

    return X, y


def train(version: str | None = None) -> str:
    session = SessionLocal()
    try:
        X, y = _load_data(session)
        n = len(y)

        split_idx = int(n * 0.8)
        X_tr, X_ev = X[:split_idx], X[split_idx:]
        y_tr, y_ev = y[:split_idx], y[split_idx:]
        log.info("Train: %d  |  Eval: %d  |  Features: %d", len(y_tr), len(y_ev), X.shape[1])

        for lbl, name in LABEL_OUTCOMES.items():
            log.info("  %s: %d (%.1f%%)", name, (y_tr == lbl).sum(), 100 * (y_tr == lbl).mean())

        pipe = Pipeline([
            ("scaler", StandardScaler()),
            ("lr", LogisticRegression(
                max_iter=2000,
                solver="lbfgs",
                C=1.0,
                random_state=42,
            )),
        ])
        calibrated = CalibratedClassifierCV(pipe, method="sigmoid", cv=5)
        calibrated.fit(X_tr, y_tr)
        log.info("Model trained and calibrated.")

        metrics = {}
        if len(y_ev) > 0:
            proba = calibrated.predict_proba(X_ev)
            y_pred = calibrated.predict(X_ev)
            accuracy = float((y_pred == y_ev).mean())
            brier_scores = [
                brier((y_ev == c).astype(float), proba[:, c]) for c in range(3)
            ]
            metrics = {
                "accuracy":       round(accuracy, 4),
                "brier_score":    round(float(np.mean(brier_scores)), 4),
                "log_loss":       round(logloss(y_ev.tolist(), proba.tolist()), 4),
                "n_eval_samples": len(y_ev),
            }
        log.info("Eval metrics: %s", metrics)

        if version is None:
            existing = session.query(ModelRegistry).filter_by(sport=_SPORT).count()
            version = f"v{existing + 1}"
        model_name = f"soccer_lr_{version}"

        path = ARTEFACT_DIR / f"{model_name}.joblib"
        joblib.dump({
            "model":          calibrated,
            "feature_names":  FEATURE_NAMES,
            "outcome_labels": OUTCOME_LABELS,
            "label_outcomes": LABEL_OUTCOMES,
            "version":        version,
        }, path)
        log.info("Artefact saved to %s", path)

        session.query(ModelRegistry).filter_by(sport=_SPORT, is_live=True).update({"is_live": False})
        session.add(ModelRegistry(
            sport=_SPORT,
            model_name=model_name,
            version=version,
            algorithm="logistic_regression_calibrated",
            artifact_path=str(path),
            feature_names=FEATURE_NAMES,
            hyperparams={"max_iter": 2000, "solver": "lbfgs", "C": 1.0, "calibration": "sigmoid", "cv": 5},
            n_train_samples=len(y_tr),
            metrics=metrics,
            is_live=True,
            trained_at=datetime.now(tz=timezone.utc),
            notes=f"LR + StandardScaler, walk-forward on computed_at. Train: {len(y_tr)} | Eval: {len(y_ev)}",
        ))
        session.commit()
        log.info("Model registered as '%s' (is_live=True)", model_name)
        return model_name

    except Exception:
        session.rollback()
        log.exception("Training failed")
        raise
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Train soccer prediction model")
    parser.add_argument("--version", help="Version string e.g. 'v7'")
    args = parser.parse_args()
    name = train(version=args.version)
    log.info("Done. Live model: %s", name)


if __name__ == "__main__":
    main()
