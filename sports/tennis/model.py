"""
Tennis prediction model.

Binary outcome: player A wins (1) or player B wins (0).
No draw in tennis (ignoring retirements).

Model architecture mirrors soccer but uses binary output.
"""

from __future__ import annotations

import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss

from core.base_model import SportModel
from core.types import BacktestResult, PredictionResult, Sport
from sports.tennis.features import FEATURE_NAMES

try:
    from xgboost import XGBClassifier
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False


class TennisModel(SportModel):
    """
    Binary tennis outcome predictor (player A win / player B win).
    """

    _SPORT = Sport.TENNIS.value
    _VERSION = "v1.0.0"

    def __init__(self, use_xgboost: bool = True) -> None:
        self._use_xgboost = use_xgboost and XGBOOST_AVAILABLE
        self._model = None
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
                n_estimators=300,
                max_depth=4,
                learning_rate=0.05,
                subsample=0.8,
                colsample_bytree=0.8,
                objective="binary:logistic",
                eval_metric="logloss",
                use_label_encoder=False,
                random_state=42,
            )
        return LogisticRegression(solver="lbfgs", max_iter=1000, C=1.0, random_state=42)

    def train(self, features: pd.DataFrame, targets: pd.Series) -> None:
        """
        targets: 1.0 = player A wins, 0.0 = player B wins
        """
        X = features[FEATURE_NAMES].fillna(0)
        y = targets.astype(int)

        base = self._build_base_model()
        self._model = CalibratedClassifierCV(base, method="sigmoid", cv=5)
        self._model.fit(X, y)

        if self._use_xgboost and hasattr(self._model, "estimators_"):
            try:
                booster = self._model.estimators_[0]
                if hasattr(booster, "feature_importances_"):
                    self._feature_importances = dict(zip(FEATURE_NAMES, booster.feature_importances_))
            except Exception:
                pass

    def predict(self, features: pd.DataFrame) -> list[PredictionResult]:
        if self._model is None:
            raise RuntimeError("Model not trained.")

        X = features[FEATURE_NAMES].fillna(0)
        proba = self._model.predict_proba(X)[:, 1]  # P(player A wins)

        results = []
        for i, row in features.iterrows():
            p_a = float(proba[features.index.get_loc(i)])
            result = PredictionResult(
                match_id=row.get("match_id", str(i)),
                sport=Sport.TENNIS,
                p_home=p_a,          # home = player A
                p_away=1.0 - p_a,
                p_draw=0.0,
                confidence=abs(p_a - 0.5) * 2,  # certainty score
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
        return predictions  # CalibratedClassifierCV handles this at training time

    def evaluate(
        self,
        predictions: list[PredictionResult],
        actuals: list[float],
    ) -> BacktestResult:
        p_a = np.array([p.p_home for p in predictions])
        actual_arr = np.array(actuals)

        predicted = (p_a >= 0.5).astype(int)
        n_correct = int((predicted == actual_arr).sum())
        n = len(actuals)

        brier = float(brier_score_loss(actual_arr, p_a))
        ll = float(log_loss(actual_arr, p_a))

        # ROI
        pnl = 0.0
        for pred, actual in zip(predictions, actuals):
            bet_on_a = pred.p_home >= 0.5
            if bet_on_a and actual == 1.0:
                pnl += (1.0 / pred.p_home) - 1.0
            elif not bet_on_a and actual == 0.0:
                pnl += (1.0 / pred.p_away) - 1.0
            else:
                pnl -= 1.0

        roi = pnl / n

        return BacktestResult(
            strategy_id="tennis_flat_stake",
            n_predictions=n,
            n_correct=n_correct,
            accuracy=n_correct / n,
            roi=roi,
            sharpe_ratio=0.0,
            max_drawdown=0.0,
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
            pickle.dump({"model": self._model, "feature_importances": self._feature_importances, "version": self._VERSION}, f)

    def load(self, path: str) -> None:
        with open(path, "rb") as f:
            data = pickle.load(f)
        self._model = data["model"]
        self._feature_importances = data["feature_importances"]
