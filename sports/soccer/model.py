"""
Soccer prediction model.

Uses XGBoost (or logistic regression as fallback) trained on the soccer
feature matrix. Outputs three-way probabilities: home win, draw, away win.

The model works in tandem with the SoccerEloEngine:
    - ELO provides the probabilistic baseline
    - The ML model learns residuals on top of ELO
    - Platt scaling calibrates the output probabilities
"""

from __future__ import annotations

import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss
from sklearn.preprocessing import LabelEncoder

from core.base_model import SportModel
from core.types import BacktestResult, PredictionResult, Sport
from sports.soccer.features import FEATURE_NAMES

try:
    from xgboost import XGBClassifier
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False


OUTCOME_CLASSES = ["away_win", "draw", "home_win"]


class SoccerModel(SportModel):
    """
    Three-way soccer outcome predictor (home win / draw / away win).

    Architecture:
        - Primary: XGBClassifier with softmax objective (3 classes)
        - Fallback: Multinomial LogisticRegression
        - Calibration: Platt scaling via CalibratedClassifierCV

    ELO baseline integration:
        The ELO-derived probability (home_win, draw, away_win) from
        SoccerEloEngine is included as features, allowing the ML model
        to learn when ELO over/underestimates match outcomes.
    """

    _SPORT = Sport.SOCCER.value
    _VERSION = "v1.0.0"

    def __init__(self, use_xgboost: bool = True) -> None:
        self._use_xgboost = use_xgboost and XGBOOST_AVAILABLE
        self._model = None
        self._calibrated = False
        self._label_encoder = LabelEncoder()
        self._label_encoder.fit(OUTCOME_CLASSES)
        self._feature_importances: dict[str, float] = {}

    @property
    def sport(self) -> str:
        return self._SPORT

    @property
    def version(self) -> str:
        return self._VERSION

    def _build_base_model(self):
        if self._use_xgboost:
            return XGBClassifier(
                n_estimators=400,
                max_depth=5,
                learning_rate=0.05,
                subsample=0.8,
                colsample_bytree=0.8,
                objective="multi:softprob",
                num_class=3,
                eval_metric="mlogloss",
                use_label_encoder=False,
                random_state=42,
            )
        return LogisticRegression(
            multi_class="multinomial",
            solver="lbfgs",
            max_iter=1000,
            C=1.0,
            random_state=42,
        )

    def train(self, features: pd.DataFrame, targets: pd.Series) -> None:
        """
        Train the model.

        targets: Series with string values "home_win", "draw", "away_win"
        """
        X = features[FEATURE_NAMES].fillna(0)
        y = self._label_encoder.transform(targets)

        base = self._build_base_model()
        # Wrap with Platt calibration (5-fold)
        self._model = CalibratedClassifierCV(base, method="sigmoid", cv=5)
        self._model.fit(X, y)
        self._calibrated = True

        # Feature importance (XGBoost only)
        if self._use_xgboost and hasattr(self._model, "estimators_"):
            booster = self._model.estimators_[0].named_steps.get(
                "classifier", self._model.estimators_[0]
            )
            if hasattr(booster, "feature_importances_"):
                self._feature_importances = dict(
                    zip(FEATURE_NAMES, booster.feature_importances_)
                )

    def predict(self, features: pd.DataFrame) -> list[PredictionResult]:
        """
        Generate raw (or calibrated if CalibratedClassifierCV was used) probabilities.
        """
        if self._model is None:
            raise RuntimeError("Model not trained. Call train() or load() first.")

        X = features[FEATURE_NAMES].fillna(0)
        proba = self._model.predict_proba(X)  # shape: (n, 3) [away_win, draw, home_win]

        results = []
        for i, row in features.iterrows():
            p_away, p_draw, p_home = proba[features.index.get_loc(i)]
            result = PredictionResult(
                match_id=row.get("match_id", str(i)),
                sport=Sport.SOCCER,
                p_home=float(p_home),
                p_away=float(p_away),
                p_draw=float(p_draw),
                confidence=float(max(p_home, p_draw, p_away)),
                features_used=FEATURE_NAMES,
            )
            result.validate()
            results.append(result)

        return results

    def calibrate(
        self,
        predictions: list[PredictionResult],
        actuals: list[float],
    ) -> list[PredictionResult]:
        """
        Post-hoc calibration is already handled by CalibratedClassifierCV during training.
        This method is available for additional isotonic calibration if needed.
        Returns predictions unchanged by default (calibration baked in via CV).
        """
        return predictions

    def evaluate(
        self,
        predictions: list[PredictionResult],
        actuals: list[float],
    ) -> BacktestResult:
        """
        Compute evaluation metrics.
        actuals: 1.0=home_win, 0.5=draw, 0.0=away_win
        """
        p_home = np.array([p.p_home for p in predictions])
        p_draw = np.array([p.p_draw for p in predictions])
        p_away = np.array([p.p_away for p in predictions])

        # Predicted class
        proba_matrix = np.column_stack([p_away, p_draw, p_home])
        predicted_idx = proba_matrix.argmax(axis=1)
        predicted_labels = self._label_encoder.inverse_transform(predicted_idx)

        # Actual labels
        actual_labels = []
        for a in actuals:
            if a == 1.0:
                actual_labels.append("home_win")
            elif a == 0.5:
                actual_labels.append("draw")
            else:
                actual_labels.append("away_win")

        n = len(actuals)
        n_correct = sum(p == a for p, a in zip(predicted_labels, actual_labels))
        accuracy = n_correct / n

        # Brier score (multi-class)
        actual_encoded = self._label_encoder.transform(actual_labels)
        actual_onehot = np.zeros((n, 3))
        actual_onehot[np.arange(n), actual_encoded] = 1.0
        brier = float(np.mean((proba_matrix - actual_onehot) ** 2))

        # Log-loss
        ll = float(log_loss(actual_labels, proba_matrix, labels=OUTCOME_CLASSES))

        # ROI (flat staking, always bet on highest prob outcome)
        pnl = 0.0
        stake = 1.0
        for pred, actual_label in zip(predictions, actual_labels):
            best_outcome = max(
                [("home_win", pred.p_home), ("draw", pred.p_draw), ("away_win", pred.p_away)],
                key=lambda x: x[1],
            )
            if best_outcome[0] == actual_label:
                odds = 1.0 / best_outcome[1]
                pnl += stake * (odds - 1)
            else:
                pnl -= stake

        roi = pnl / (n * stake)

        return BacktestResult(
            strategy_id="soccer_flat_stake",
            n_predictions=n,
            n_correct=n_correct,
            accuracy=accuracy,
            roi=roi,
            sharpe_ratio=0.0,   # requires time-series of returns
            max_drawdown=0.0,   # requires time-series of returns
            log_loss=ll,
            brier_score=brier,
            calibration_error=0.0,
            pnl_units=pnl,
        )

    def feature_importance(self) -> dict[str, float]:
        return dict(sorted(self._feature_importances.items(), key=lambda x: x[1], reverse=True))

    def save(self, path: str) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump({
                "model": self._model,
                "calibrated": self._calibrated,
                "feature_importances": self._feature_importances,
                "version": self._VERSION,
            }, f)

    def load(self, path: str) -> None:
        with open(path, "rb") as f:
            data = pickle.load(f)
        self._model = data["model"]
        self._calibrated = data["calibrated"]
        self._feature_importances = data["feature_importances"]
