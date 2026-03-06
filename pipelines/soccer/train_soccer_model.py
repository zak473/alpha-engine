"""
Soccer match outcome model training.

Algorithm:   LogisticRegression + CalibratedClassifierCV (Platt, 5-fold)
Evaluation:  Walk-forward split (train on oldest 80%, evaluate on newest 20%)
Output:      artefacts/soccer_lr_v{n}.joblib + model_registry row

Usage:
    python -m pipelines.soccer.train_soccer_model
    python -m pipelines.soccer.train_soccer_model --version v2
"""

from __future__ import annotations

import argparse
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from db.models.mvp import FeatSoccerMatch, ModelRegistry
from db.session import SessionLocal
from evaluation.metrics import brier, ece, logloss

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

ARTEFACT_DIR = Path(__file__).resolve().parents[2] / "artefacts"
ARTEFACT_DIR.mkdir(exist_ok=True)

# Ordered feature list — MUST match feat_soccer_match columns exactly
FEATURE_NAMES = [
    "elo_home",
    "elo_away",
    "elo_diff",
    "home_form_pts",
    "away_form_pts",
    "home_form_w",
    "home_form_d",
    "home_form_l",
    "away_form_w",
    "away_form_d",
    "away_form_l",
    "home_gf_avg",
    "home_ga_avg",
    "away_gf_avg",
    "away_ga_avg",
    "home_xg_avg",
    "home_xga_avg",
    "away_xg_avg",
    "away_xga_avg",
    "home_days_rest",
    "away_days_rest",
    "rest_diff",
    "h2h_home_win_pct",
    "h2h_matches_played",
    "is_home_advantage",
]

# Outcome → integer label
OUTCOME_LABELS = {"home_win": 0, "draw": 1, "away_win": 2, "H": 0, "D": 1, "A": 2}
LABEL_OUTCOMES = {0: "home_win", 1: "draw", 2: "away_win"}


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def _load_training_data(session) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """
    Load feat_soccer_match rows where outcome is known.
    Returns X (n_samples, n_features), y (n_samples,), match_ids list.
    Missing features are imputed with column means.
    """
    rows = (
        session.query(FeatSoccerMatch)
        .filter(FeatSoccerMatch.outcome.isnot(None))
        .order_by(FeatSoccerMatch.computed_at.asc())
        .all()
    )

    if len(rows) < 10:
        raise ValueError(f"Insufficient training data: only {len(rows)} labelled rows.")

    X_raw, y_raw, match_ids = [], [], []
    for row in rows:
        features = [getattr(row, f) for f in FEATURE_NAMES]
        label = OUTCOME_LABELS.get(row.outcome)
        if label is None:
            log.warning("Unknown outcome %r for match %s — skipping", row.outcome, row.match_id)
            continue
        X_raw.append(features)
        y_raw.append(label)
        match_ids.append(row.match_id)

    X = np.array(X_raw, dtype=float)
    y = np.array(y_raw, dtype=int)

    # Impute missing values (None → NaN → column mean)
    col_means = np.nanmean(X, axis=0)
    # Replace any NaN col_means (all-NaN column) with 0
    col_means = np.where(np.isnan(col_means), 0.0, col_means)
    for j in range(X.shape[1]):
        mask = np.isnan(X[:, j])
        if mask.any():
            X[mask, j] = col_means[j]

    log.info("Loaded %d training samples, %d features.", len(y), X.shape[1])
    return X, y, match_ids


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train(version: Optional[str] = None) -> str:
    """
    Train, evaluate, save artefact, register model.
    Returns the model name (e.g. 'soccer_lr_v1').
    """
    session = SessionLocal()
    try:
        X, y, match_ids = _load_training_data(session)
        n_total = len(y)

        # Walk-forward split: oldest 80% for train, newest 20% for eval
        split_idx = int(n_total * 0.8)
        X_train, X_eval = X[:split_idx], X[split_idx:]
        y_train, y_eval = y[:split_idx], y[split_idx:]
        log.info("Train: %d  |  Eval: %d", len(y_train), len(y_eval))

        if len(y_train) < 5:
            raise ValueError("Not enough training samples after split.")

        # Build pipeline: scale → LR → Platt calibration
        base_lr = LogisticRegression(
            multi_class="multinomial",
            solver="lbfgs",
            max_iter=1000,
            C=1.0,
            random_state=42,
        )
        pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("lr", base_lr),
        ])
        calibrated = CalibratedClassifierCV(pipeline, method="sigmoid", cv=min(5, len(y_train)))
        calibrated.fit(X_train, y_train)
        log.info("Model trained and calibrated.")

        # Evaluate on held-out set
        if len(y_eval) > 0:
            proba = calibrated.predict_proba(X_eval)   # shape (n, 3): home, draw, away
            y_pred = calibrated.predict(X_eval)

            accuracy = float((y_pred == y_eval).mean())

            # Brier score (multiclass) — mean across classes
            brier_scores = []
            for cls_idx in range(3):
                y_true_bin = (y_eval == cls_idx).astype(float)
                brier_scores.append(brier(y_true_bin, proba[:, cls_idx]))
            brier_score = float(np.mean(brier_scores))

            # Log-loss
            logloss_val = logloss(y_eval.tolist(), proba.tolist())

            # ECE on home win probability
            ece_val = ece(proba[:, 0], (y_eval == 0).astype(float))

            metrics = {
                "accuracy": round(accuracy, 4),
                "brier_score": round(brier_score, 4),
                "log_loss": round(logloss_val, 4),
                "ece": round(ece_val, 4),
                "n_eval_samples": len(y_eval),
            }
        else:
            metrics = {}

        log.info("Eval metrics: %s", metrics)

        # Determine version string
        if version is None:
            existing_count = session.query(ModelRegistry).filter_by(sport="soccer").count()
            version = f"v{existing_count + 1}"
        model_name = f"soccer_lr_{version}"

        # Save artefact
        artefact_path = ARTEFACT_DIR / f"{model_name}.joblib"
        payload = {
            "model": calibrated,
            "feature_names": FEATURE_NAMES,
            "outcome_labels": OUTCOME_LABELS,
            "label_outcomes": LABEL_OUTCOMES,
            "version": version,
        }
        joblib.dump(payload, artefact_path)
        log.info("Artefact saved to %s", artefact_path)

        # Deactivate any existing live models for soccer
        session.query(ModelRegistry).filter_by(sport="soccer", is_live=True).update({"is_live": False})

        # Register new model
        registry_entry = ModelRegistry(
            sport="soccer",
            model_name=model_name,
            version=version,
            algorithm="logistic_regression_calibrated",
            artifact_path=str(artefact_path),
            feature_names=FEATURE_NAMES,
            hyperparams={"C": 1.0, "solver": "lbfgs", "calibration": "sigmoid", "cv": 5},
            n_train_samples=len(y_train),
            metrics=metrics,
            is_live=True,
            trained_at=datetime.now(tz=timezone.utc),
            notes=f"Walk-forward split. Train: {len(y_train)} | Eval: {len(y_eval)}",
        )
        session.add(registry_entry)
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
    parser.add_argument("--version", help="Version string e.g. 'v2' (auto-increments if omitted)")
    args = parser.parse_args()
    model_name = train(version=args.version)
    log.info("Training complete. Live model: %s", model_name)


if __name__ == "__main__":
    main()
