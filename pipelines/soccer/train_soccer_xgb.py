"""
Soccer match outcome model — XGBoost version.

Algorithm:   XGBClassifier (multi:softprob) + CalibratedClassifierCV (isotonic, 5-fold)
Features:    25 original + 7 derived differential/overperformance features = 32 total
Evaluation:  Walk-forward split (train on oldest 80%, evaluate on newest 20%)
Output:      artefacts/soccer_xgb_v{n}.joblib + model_registry row

Usage:
    python -m pipelines.soccer.train_soccer_xgb
    python -m pipelines.soccer.train_soccer_xgb --version v2
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
from xgboost import XGBClassifier

from db.models.mvp import FeatSoccerMatch, ModelRegistry
from db.session import SessionLocal
from evaluation.metrics import brier, ece, logloss

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

ARTEFACT_DIR = Path(__file__).resolve().parents[2] / "artefacts"
ARTEFACT_DIR.mkdir(exist_ok=True)

# ── Base features (from DB columns) ───────────────────────────────────────────
BASE_FEATURES = [
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

# ── Derived features (computed from base features) ────────────────────────────
# These capture differentials and over/under-performance vs xG expectations.
# XGBoost can discover these interactions itself but providing them explicitly
# gives the model cleaner signals and speeds up convergence.
DERIVED_FEATURES = [
    "xg_diff",              # home_xg_avg - away_xg_avg
    "xga_diff",             # home_xga_avg - away_xga_avg (defensive xG conceded)
    "gf_diff",              # home_gf_avg - away_gf_avg
    "ga_diff",              # home_ga_avg - away_ga_avg
    "form_pts_diff",        # home_form_pts - away_form_pts
    "xg_overperf_home",     # home_gf_avg - home_xg_avg  (scoring above/below xG)
    "xg_overperf_away",     # away_gf_avg - away_xg_avg
]

FEATURE_NAMES = BASE_FEATURES + DERIVED_FEATURES

# Outcome → integer label
OUTCOME_LABELS = {"home_win": 0, "draw": 1, "away_win": 2, "H": 0, "D": 1, "A": 2}
LABEL_OUTCOMES = {0: "home_win", 1: "draw", 2: "away_win"}


# ── Data loading ───────────────────────────────────────────────────────────────

def _load_training_data(session) -> tuple[np.ndarray, np.ndarray, list[str]]:
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
        label = OUTCOME_LABELS.get(row.outcome)
        if label is None:
            log.warning("Unknown outcome %r for %s — skipping", row.outcome, row.match_id)
            continue

        base = [getattr(row, f) for f in BASE_FEATURES]

        # Derived features — safe against None (treated as 0 diff)
        def _f(name: str) -> float:
            v = getattr(row, name, None)
            return float(v) if v is not None else float("nan")

        derived = [
            _f("home_xg_avg") - _f("away_xg_avg"),
            _f("home_xga_avg") - _f("away_xga_avg"),
            _f("home_gf_avg") - _f("away_gf_avg"),
            _f("home_ga_avg") - _f("away_ga_avg"),
            _f("home_form_pts") - _f("away_form_pts"),
            _f("home_gf_avg") - _f("home_xg_avg"),
            _f("away_gf_avg") - _f("away_xg_avg"),
        ]

        X_raw.append(base + derived)
        y_raw.append(label)
        match_ids.append(row.match_id)

    X = np.array(X_raw, dtype=float)
    y = np.array(y_raw, dtype=int)

    # Impute NaN with column means — XGBoost can handle NaN natively but
    # CalibratedClassifierCV wrapping requires clean data
    col_means = np.nanmean(X, axis=0)
    col_means = np.where(np.isnan(col_means), 0.0, col_means)
    for j in range(X.shape[1]):
        mask = np.isnan(X[:, j])
        if mask.any():
            X[mask, j] = col_means[j]

    log.info("Loaded %d samples, %d features.", len(y), X.shape[1])
    class_counts = {LABEL_OUTCOMES[i]: int((y == i).sum()) for i in range(3)}
    log.info("Class distribution: %s", class_counts)
    return X, y, match_ids


# ── Training ───────────────────────────────────────────────────────────────────

def train(version: Optional[str] = None) -> str:
    session = SessionLocal()
    try:
        X, y, match_ids = _load_training_data(session)
        n_total = len(y)

        # Walk-forward split: oldest 80% → train, newest 20% → eval
        split_idx = int(n_total * 0.8)
        X_train, X_eval = X[:split_idx], X[split_idx:]
        y_train, y_eval = y[:split_idx], y[split_idx:]
        log.info("Train: %d  |  Eval: %d", len(y_train), len(y_eval))

        if len(y_train) < 5:
            raise ValueError("Not enough training samples after split.")

        # XGBoost: no scaler needed, handles feature scale natively
        xgb = XGBClassifier(
            objective="multi:softprob",
            num_class=3,
            n_estimators=500,
            learning_rate=0.03,
            max_depth=4,
            min_child_weight=5,     # prevents overfitting on small leaf nodes
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.1,          # L1 regularisation
            reg_lambda=1.0,         # L2 regularisation
            random_state=42,
            eval_metric="mlogloss",
            verbosity=0,
            n_jobs=-1,
        )

        # Isotonic calibration is better than Platt (sigmoid) for tree models
        cv_folds = min(5, len(y_train) // 20) or 3
        calibrated = CalibratedClassifierCV(xgb, method="isotonic", cv=cv_folds)
        calibrated.fit(X_train, y_train)
        log.info("XGBoost trained and calibrated (isotonic, %d folds).", cv_folds)

        # Feature importances from the first calibrator fold
        try:
            inner_xgb = calibrated.calibrated_classifiers_[0].estimator
            importances = inner_xgb.feature_importances_
            top = sorted(zip(FEATURE_NAMES, importances), key=lambda x: -x[1])[:10]
            log.info("Top 10 feature importances:")
            for feat, imp in top:
                log.info("  %-30s %.4f", feat, imp)
        except Exception:
            pass

        # ── Evaluation ──────────────────────────────────────────────────────
        metrics: dict = {}
        if len(y_eval) > 0:
            proba = calibrated.predict_proba(X_eval)
            y_pred = calibrated.predict(X_eval)

            accuracy = float((y_pred == y_eval).mean())

            brier_scores = []
            for cls_idx in range(3):
                y_true_bin = (y_eval == cls_idx).astype(float)
                brier_scores.append(brier(y_true_bin, proba[:, cls_idx]))
            brier_score = float(np.mean(brier_scores))

            logloss_val = logloss(y_eval.tolist(), proba.tolist())
            ece_val = ece(proba[:, 0], (y_eval == 0).astype(float))

            # Per-class accuracy breakdown
            class_acc = {
                LABEL_OUTCOMES[i]: float((y_pred[y_eval == i] == i).mean())
                if (y_eval == i).sum() > 0 else None
                for i in range(3)
            }

            metrics = {
                "accuracy": round(accuracy, 4),
                "brier_score": round(brier_score, 4),
                "log_loss": round(logloss_val, 4),
                "ece": round(ece_val, 4),
                "n_eval_samples": len(y_eval),
                "class_accuracy": class_acc,
            }
            log.info("Eval accuracy: %.1f%%  |  Brier: %.4f  |  LogLoss: %.4f  |  ECE: %.4f",
                     accuracy * 100, brier_score, logloss_val, ece_val)
            log.info("Per-class accuracy: %s", class_acc)

        # ── Version & save ──────────────────────────────────────────────────
        if version is None:
            existing_count = session.query(ModelRegistry).filter_by(sport="soccer").count()
            version = f"v{existing_count + 1}"
        model_name = f"soccer_xgb_{version}"

        artefact_path = ARTEFACT_DIR / f"{model_name}.joblib"
        payload = {
            "model": calibrated,
            "feature_names": FEATURE_NAMES,
            "outcome_labels": OUTCOME_LABELS,
            "label_outcomes": LABEL_OUTCOMES,
            "version": version,
        }
        joblib.dump(payload, artefact_path)
        log.info("Artefact saved: %s", artefact_path)

        # Deactivate existing live soccer models
        session.query(ModelRegistry).filter_by(sport="soccer", is_live=True).update({"is_live": False})

        registry_entry = ModelRegistry(
            sport="soccer",
            model_name=model_name,
            version=version,
            algorithm="xgboost_calibrated",
            artifact_path=str(artefact_path),
            feature_names=FEATURE_NAMES,
            hyperparams={
                "n_estimators": 500, "learning_rate": 0.03, "max_depth": 4,
                "min_child_weight": 5, "subsample": 0.8, "colsample_bytree": 0.8,
                "reg_alpha": 0.1, "reg_lambda": 1.0,
                "calibration": "isotonic", "cv": cv_folds,
            },
            n_train_samples=len(y_train),
            metrics=metrics,
            is_live=True,
            trained_at=datetime.now(tz=timezone.utc),
            notes=f"XGBoost + isotonic calibration. 32 features (25 base + 7 derived). Walk-forward split. Train: {len(y_train)} | Eval: {len(y_eval)}",
        )
        session.add(registry_entry)
        session.commit()
        log.info("Registered '%s' as live model.", model_name)

        return model_name

    except Exception:
        session.rollback()
        log.exception("Training failed")
        raise
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Train soccer XGBoost model")
    parser.add_argument("--version", help="Version string e.g. 'v2' (auto-increments if omitted)")
    args = parser.parse_args()
    model_name = train(version=args.version)
    log.info("Done. Live model: %s", model_name)


if __name__ == "__main__":
    main()
