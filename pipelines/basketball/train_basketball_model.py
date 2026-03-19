"""
Basketball match outcome model training.

Algorithm:   LogisticRegression + CalibratedClassifierCV (Platt, prefit)
Evaluation:  Walk-forward split (train on oldest 80%, evaluate on newest 20%)
Output:      artefacts/basketball_lr_v{n}.joblib + model_registry row

Usage:
    python -m pipelines.basketball.train_basketball_model
    python -m pipelines.basketball.train_basketball_model --version v2
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

from db.models.mvp import CoreMatch, ModelRegistry
from db.session import SessionLocal
from evaluation.metrics import brier, logloss
from pipelines.basketball.feature_engineering import (
    FEATURE_NAMES,
    OUTCOME_LABELS,
    LABEL_OUTCOMES,
    build_feature_vector,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

ARTEFACT_DIR = Path(__file__).resolve().parents[2] / "artefacts"
ARTEFACT_DIR.mkdir(exist_ok=True)

_SPORT = "basketball"


def _label(outcome: Optional[str]) -> Optional[int]:
    if outcome in ("H", "home_win"):
        return 0
    if outcome in ("A", "away_win"):
        return 1
    return None


def _load_training_data(session) -> tuple[np.ndarray, np.ndarray]:
    rows = (
        session.query(CoreMatch)
        .filter(
            CoreMatch.sport == _SPORT,
            CoreMatch.status == "finished",
            CoreMatch.outcome.isnot(None),
            CoreMatch.outcome != "D",
            CoreMatch.outcome != "draw",
        )
        .order_by(CoreMatch.kickoff_utc.asc())
        .all()
    )

    if len(rows) < 10:
        raise ValueError(f"Insufficient training data: only {len(rows)} labelled rows.")

    log.info("Building feature vectors for %d matches …", len(rows))
    X_raw, y_raw = [], []
    skipped = 0

    for i, match in enumerate(rows):
        label = _label(match.outcome)
        if label is None:
            skipped += 1
            continue
        try:
            vector, _ = build_feature_vector(session, match)
        except Exception as exc:
            log.warning("Feature error for match %s: %s — skipping", match.id[:8], exc)
            session.rollback()  # clear any broken transaction before continuing
            skipped += 1
            continue
        X_raw.append(vector)
        y_raw.append(label)
        if (i + 1) % 1000 == 0:
            log.info("  … %d / %d done", i + 1, len(rows))

    log.info("Built %d feature vectors (%d skipped).", len(y_raw), skipped)
    if len(y_raw) < 10:
        raise ValueError(f"Insufficient usable training samples: only {len(y_raw)}.")

    X = np.array(X_raw, dtype=float)
    y = np.array(y_raw, dtype=int)

    # Impute NaN → column mean
    col_means = np.nanmean(X, axis=0)
    col_means = np.where(np.isnan(col_means), 0.0, col_means)
    for j in range(X.shape[1]):
        mask = np.isnan(X[:, j])
        if mask.any():
            X[mask, j] = col_means[j]

    log.info("Loaded %d training samples, %d features.", len(y), X.shape[1])
    return X, y


def train(version: Optional[str] = None) -> str:
    session = SessionLocal()
    try:
        X, y = _load_training_data(session)
        n_total = len(y)

        unique, counts = np.unique(y, return_counts=True)
        log.info("Label distribution: %s", dict(zip(unique.tolist(), counts.tolist())))
        if len(unique) < 2:
            raise ValueError(f"Only one class present: {unique}. Cannot train.")

        split_idx = int(n_total * 0.8)
        X_train, X_eval = X[:split_idx], X[split_idx:]
        y_train, y_eval = y[:split_idx], y[split_idx:]
        log.info("Train: %d  |  Eval: %d", len(y_train), len(y_eval))

        base_lr = LogisticRegression(solver="lbfgs", max_iter=1000, C=1.0, random_state=42)
        pipeline = Pipeline([("scaler", StandardScaler()), ("lr", base_lr)])

        cal_split = int(len(y_train) * 0.9)
        log.info("Fitting base model on %d samples …", cal_split)
        pipeline.fit(X_train[:cal_split], y_train[:cal_split])
        log.info("Calibrating on %d samples …", len(y_train) - cal_split)
        calibrated = CalibratedClassifierCV(pipeline, method="sigmoid", cv="prefit")
        calibrated.fit(X_train[cal_split:], y_train[cal_split:])

        metrics = {}
        if len(y_eval) > 0:
            proba = calibrated.predict_proba(X_eval)
            y_pred = calibrated.predict(X_eval)
            accuracy = float((y_pred == y_eval).mean())
            brier_scores = []
            for cls_idx in range(2):
                y_true_bin = (y_eval == cls_idx).astype(float)
                brier_scores.append(brier(y_true_bin, proba[:, cls_idx]))
            metrics = {
                "accuracy":       round(accuracy, 4),
                "brier_score":    round(float(np.mean(brier_scores)), 4),
                "log_loss":       round(logloss(y_eval.tolist(), proba.tolist()), 4),
                "n_eval_samples": len(y_eval),
            }

        log.info("Eval metrics: %s", metrics)

        if version is None:
            existing_count = session.query(ModelRegistry).filter_by(sport=_SPORT).count()
            version = f"v{existing_count + 1}"
        model_name = f"basketball_lr_{version}"

        artefact_path = ARTEFACT_DIR / f"{model_name}.joblib"
        joblib.dump({
            "model":          calibrated,
            "feature_names":  FEATURE_NAMES,
            "outcome_labels": OUTCOME_LABELS,
            "label_outcomes": LABEL_OUTCOMES,
            "version":        version,
        }, artefact_path)
        log.info("Artefact saved to %s", artefact_path)

        session.query(ModelRegistry).filter_by(sport=_SPORT, is_live=True).update({"is_live": False})
        session.add(ModelRegistry(
            sport=_SPORT,
            model_name=model_name,
            version=version,
            algorithm="logistic_regression",
            artifact_path=str(artefact_path),
            feature_names=FEATURE_NAMES,
            hyperparams={"C": 1.0, "solver": "lbfgs", "calibration": "sigmoid", "cv": "prefit"},
            n_train_samples=len(y_train),
            metrics=metrics,
            is_live=True,
            trained_at=datetime.now(tz=timezone.utc),
            notes=f"Walk-forward split. Train: {len(y_train)} | Eval: {len(y_eval)}",
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
    parser = argparse.ArgumentParser(description="Train basketball prediction model")
    parser.add_argument("--version", help="Version string e.g. 'v2'")
    args = parser.parse_args()
    model_name = train(version=args.version)
    log.info("Training complete. Live model: %s", model_name)


if __name__ == "__main__":
    main()
