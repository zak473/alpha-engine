"""
Esports match outcome model training.

Algorithm:   LogisticRegression + CalibratedClassifierCV (Platt, 5-fold)
Evaluation:  Walk-forward split (train on oldest 80%, evaluate on newest 20%)
Output:      artefacts/esports_lr_v{n}.joblib + model_registry row

Features are computed live from CoreMatch using the shared common
feature_engineering module (no sport-specific feat_esports_match table).

Binary classification: 0 = home team wins, 1 = away team wins. Draws skipped.

Usage:
    python -m pipelines.esports.train_esports_model
    python -m pipelines.esports.train_esports_model --version v2
"""

from __future__ import annotations

import argparse
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from db.models.mvp import CoreMatch, ModelRegistry
from db.session import SessionLocal
from evaluation.metrics import brier, logloss
from pipelines.esports.feature_engineering import (
    FEATURE_NAMES,
    OUTCOME_LABELS,
    LABEL_OUTCOMES,
    build_feature_vector,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

ARTEFACT_DIR = Path(__file__).resolve().parents[2] / "artefacts"
ARTEFACT_DIR.mkdir(exist_ok=True)

_SPORT = "esports"


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def _load_training_data(session) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """
    Load all finished esports CoreMatch rows where outcome is known.
    Computes feature vectors live via build_feature_vector().
    Draws and unrecognised outcomes are skipped (binary classification only).
    Returns X (n_samples, n_features), y (n_samples,), match_ids list.
    Missing features are imputed with column means.
    """
    rows = (
        session.query(CoreMatch)
        .filter(
            CoreMatch.sport == _SPORT,
            CoreMatch.status == "finished",
            CoreMatch.outcome.isnot(None),
        )
        .order_by(CoreMatch.kickoff_utc.asc())
        .all()
    )

    if len(rows) < 10:
        raise ValueError(f"Insufficient training data: only {len(rows)} labelled rows.")

    X_raw, y_raw, match_ids = [], [], []
    for match in rows:
        label = OUTCOME_LABELS.get(match.outcome)
        if label is None:
            log.warning(
                "Unknown or non-binary outcome %r for match %s — skipping",
                match.outcome,
                match.id,
            )
            continue
        try:
            vector, _ = build_feature_vector(session, match)
        except Exception as exc:
            log.warning("Feature error for match %s: %s — skipping", match.id[:8], exc)
            continue
        X_raw.append(vector)
        y_raw.append(label)
        match_ids.append(match.id)

    if len(y_raw) < 10:
        raise ValueError(f"Insufficient usable training samples: only {len(y_raw)}.")

    X = np.array(X_raw, dtype=float)
    y = np.array(y_raw, dtype=int)

    # Impute missing values (None → NaN → column mean)
    col_means = np.nanmean(X, axis=0)
    # Replace any all-NaN column means with 0
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
    Returns the model name (e.g. 'esports_lr_v1').
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

        # Build pipeline: scale → LR (binary) → Platt calibration
        # C=0.5: moderate regularisation — esports signal is noisy
        # class_weight="balanced": handles any win/loss imbalance
        base_lr = LogisticRegression(
            solver="lbfgs",
            max_iter=1000,
            C=0.5,
            class_weight="balanced",
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
            proba = calibrated.predict_proba(X_eval)   # shape (n, 2): [home_win, away_win]
            y_pred = calibrated.predict(X_eval)

            accuracy = float((y_pred == y_eval).mean())

            # Brier score: average over both classes
            brier_scores = []
            for cls_idx in range(2):
                y_true_bin = (y_eval == cls_idx).astype(float)
                brier_scores.append(brier(y_true_bin, proba[:, cls_idx]))
            brier_score = float(np.mean(brier_scores))

            # Log-loss (binary)
            logloss_val = logloss(y_eval.tolist(), proba.tolist())

            metrics = {
                "accuracy":       round(accuracy, 4),
                "brier_score":    round(brier_score, 4),
                "log_loss":       round(logloss_val, 4),
                "n_eval_samples": len(y_eval),
            }
        else:
            metrics = {}

        log.info("Eval metrics: %s", metrics)

        # Determine version string
        if version is None:
            existing_count = session.query(ModelRegistry).filter_by(sport=_SPORT).count()
            version = f"v{existing_count + 1}"
        model_name = f"esports_lr_{version}"

        # Save artefact
        artefact_path = ARTEFACT_DIR / f"{model_name}.joblib"
        payload = {
            "model":          calibrated,
            "feature_names":  FEATURE_NAMES,
            "outcome_labels": OUTCOME_LABELS,
            "label_outcomes": LABEL_OUTCOMES,
            "version":        version,
        }
        joblib.dump(payload, artefact_path)
        log.info("Artefact saved to %s", artefact_path)

        # Deactivate any existing live models for esports
        session.query(ModelRegistry).filter_by(sport=_SPORT, is_live=True).update({"is_live": False})

        # Register new model
        registry_entry = ModelRegistry(
            sport=_SPORT,
            model_name=model_name,
            version=version,
            algorithm="logistic_regression_calibrated",
            artifact_path=str(artefact_path),
            feature_names=FEATURE_NAMES,
            hyperparams={"C": 0.5, "solver": "lbfgs", "calibration": "sigmoid", "cv": 5, "class_weight": "balanced"},
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
    parser = argparse.ArgumentParser(description="Train esports prediction model")
    parser.add_argument("--version", help="Version string e.g. 'v2' (auto-increments if omitted)")
    args = parser.parse_args()
    model_name = train(version=args.version)
    log.info("Training complete. Live model: %s", model_name)


if __name__ == "__main__":
    main()
