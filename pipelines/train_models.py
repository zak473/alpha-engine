"""
Train XGBoost (XGBClassifier) models for basketball, baseball, tennis, and esports.

For each sport:
  1. Load all finished matches with known outcome from core_matches
  2. Compute feature vectors using pipelines.common.feature_engineering
  3. Train XGBClassifier with StandardScaler (walk-forward 80/20 split)
  4. Evaluate (accuracy, brier, logloss)
  5. Save to artefacts/{sport}_xgb_v1.joblib
  6. Register in model_registry with is_live=True

Soccer is already trained via pipelines/soccer/train_soccer_model.py.
This script handles the other four sports.

Usage:
    python -m pipelines.train_models
    python -m pipelines.train_models --sport basketball
    python -m pipelines.train_models --version v2
"""

from __future__ import annotations

import argparse
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from db.models.mvp import CoreMatch, ModelRegistry
from db.session import SessionLocal
from pipelines.common.feature_engineering import (
    FEATURE_NAMES,
    LABEL_OUTCOMES,
    build_feature_vector,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

ARTEFACT_DIR = Path(__file__).resolve().parent.parent / "artefacts"
ARTEFACT_DIR.mkdir(exist_ok=True)

SPORTS = ["basketball", "baseball", "tennis", "esports"]

# Outcome labels — handles both long-form and short-form outcome strings
OUTCOME_LABELS = {
    "home_win": 0, "away_win": 1,
    "H": 0, "A": 1,   # short form used by some pipelines
}


def _brier(y_true: np.ndarray, proba: np.ndarray) -> float:
    return float(np.mean((proba - y_true) ** 2))


def train_sport(sport: str, version: str = "v1") -> None:
    session = SessionLocal()
    try:
        log.info("=== Training %s model (%s) ===", sport, version)

        # Load finished matches with known outcome
        from sqlalchemy import not_
        matches = (
            session.query(CoreMatch)
            .filter(
                CoreMatch.sport == sport,
                CoreMatch.status == "finished",
                CoreMatch.outcome.isnot(None),
                not_(CoreMatch.outcome.in_(["draw", "D"])),  # binary classifier
            )
            .order_by(CoreMatch.kickoff_utc.asc())
            .all()
        )
        log.info("Found %d finished %s matches", len(matches), sport)

        if len(matches) < 20:
            log.warning("Too few matches to train a meaningful model (%d). Skipping.", len(matches))
            return

        # Build feature matrix
        X_rows, y_vals, match_ids = [], [], []
        for match in matches:
            try:
                vector, _ = build_feature_vector(session, match)
                label = OUTCOME_LABELS.get(match.outcome)
                if label is None:
                    continue
                X_rows.append(vector)
                y_vals.append(label)
                match_ids.append(match.id)
            except Exception as exc:
                log.debug("SKIP match %s: %s", match.id[:8], exc)

        X = np.array(X_rows, dtype=float)
        y = np.array(y_vals, dtype=int)
        X = np.nan_to_num(X, nan=0.0)

        log.info("Feature matrix: %s", X.shape)
        if X.shape[0] < 20:
            log.warning("Not enough valid samples (%d). Skipping.", X.shape[0])
            return

        # Walk-forward split: train on oldest 80%, evaluate on newest 20%
        split = int(len(X) * 0.8)
        X_train, X_test = X[:split], X[split:]
        y_train, y_test = y[:split], y[split:]

        # Train
        model = Pipeline([
            ("scaler", StandardScaler()),
            ("xgb", XGBClassifier(
                n_estimators=300,
                max_depth=4,
                learning_rate=0.05,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                eval_metric="logloss",
                use_label_encoder=False,
            )),
        ])
        model.fit(X_train, y_train)

        # Evaluate
        if len(X_test) > 0:
            proba_test = model.predict_proba(X_test)[:, 1]  # P(home_win)
            acc = float((model.predict(X_test) == y_test).mean())
            brier = _brier(y_test.astype(float), proba_test)
            from sklearn.metrics import log_loss
            ll = log_loss(y_test, model.predict_proba(X_test))
            log.info("  accuracy=%.3f  brier=%.4f  logloss=%.4f  (n_test=%d)", acc, brier, ll, len(X_test))
            metrics = {"accuracy": round(acc, 4), "brier": round(brier, 4), "logloss": round(ll, 4)}
        else:
            log.info("  No test set (too few samples).")
            metrics = {}

        # Save artefact
        model_name = f"{sport}_xgb_{version}"
        artifact_path = str(ARTEFACT_DIR / f"{model_name}.joblib")
        payload = {
            "model":          model,
            "feature_names":  FEATURE_NAMES,
            "label_outcomes": LABEL_OUTCOMES,
            "sport":          sport,
            "model_name":     model_name,
            "trained_at":     datetime.now(tz=timezone.utc).isoformat(),
        }
        joblib.dump(payload, artifact_path)
        log.info("  Saved artefact → %s", artifact_path)

        # Register in DB — deactivate old live model first
        session.query(ModelRegistry).filter_by(sport=sport, is_live=True).update({"is_live": False})

        reg = ModelRegistry(
            id=str(uuid.uuid4()),
            sport=sport,
            model_name=model_name,
            version=version,
            algorithm="xgboost",
            artifact_path=artifact_path,
            feature_names=FEATURE_NAMES,
            hyperparams={"n_estimators": 300, "max_depth": 4, "learning_rate": 0.05, "subsample": 0.8, "colsample_bytree": 0.8},
            n_train_samples=len(X_train),
            train_data_from=matches[0].kickoff_utc if matches else None,
            train_data_to=matches[split - 1].kickoff_utc if split > 0 else None,
            metrics=metrics,
            is_live=True,
            notes=f"XGBoost model trained via pipelines/train_models.py. Features: {FEATURE_NAMES}",
        )
        session.add(reg)
        session.commit()
        log.info("  Registered as live model for %s.", sport)

    except Exception:
        session.rollback()
        log.exception("Training failed for %s", sport)
        raise
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Train ML models for all sports")
    parser.add_argument("--sport", choices=SPORTS + ["all"], default="all",
                        help="Which sport to train (default: all)")
    parser.add_argument("--version", default="v1", help="Model version tag (default: v1)")
    args = parser.parse_args()

    sports = SPORTS if args.sport == "all" else [args.sport]
    for sport in sports:
        train_sport(sport, version=args.version)

    log.info("Training complete.")


if __name__ == "__main__":
    main()
