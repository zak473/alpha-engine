"""
Esports prediction model.

Binary outcome: team A wins the map/series (1) or team B (0).
Designed for CS2 map-level prediction primarily.
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
from sports.esports.features import FEATURE_NAMES

try:
    from xgboost import XGBClassifier
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False


class EsportsModel(SportModel):
    """
    Binary esports map/series outcome predictor.
    """

    _SPORT = Sport.ESPORTS.value
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
                max_depth=5,
                learning_rate=0.04,
                subsample=0.8,
                colsample_bytree=0.7,
                objective="binary:logistic",
                eval_metric="logloss",
                use_label_encoder=False,
                random_state=42,
            )
        return LogisticRegression(solver="lbfgs", max_iter=1000, C=0.8, random_state=42)

    def train(self, features: pd.DataFrame, targets: pd.Series) -> None:
        X = features[FEATURE_NAMES].fillna(0)
        y = targets.astype(int)
        base = self._build_base_model()
        self._model = CalibratedClassifierCV(base, method="sigmoid", cv=5)
        self._model.fit(X, y)

    def predict(self, features: pd.DataFrame) -> list[PredictionResult]:
        if self._model is None:
            raise RuntimeError("Model not trained.")

        X = features[FEATURE_NAMES].fillna(0)
        proba = self._model.predict_proba(X)[:, 1]

        results = []
        for i, row in features.iterrows():
            p_a = float(proba[features.index.get_loc(i)])
            result = PredictionResult(
                match_id=row.get("match_id", str(i)),
                sport=Sport.ESPORTS,
                p_home=p_a,
                p_away=1.0 - p_a,
                p_draw=0.0,
                confidence=abs(p_a - 0.5) * 2,
                features_used=FEATURE_NAMES,
            )
            result.validate()
            results.append(result)

        return results

    def calibrate(self, predictions, actuals):
        return predictions

    def evaluate(self, predictions: list[PredictionResult], actuals: list[float]) -> BacktestResult:
        p_a = np.array([p.p_home for p in predictions])
        actual_arr = np.array(actuals)
        predicted = (p_a >= 0.5).astype(int)
        n = len(actuals)
        n_correct = int((predicted == actual_arr).sum())
        brier = float(brier_score_loss(actual_arr, p_a))
        ll = float(log_loss(actual_arr, p_a))

        pnl = sum(
            (1.0 / p.p_home - 1.0 if p.p_home >= 0.5 else 1.0 / p.p_away - 1.0)
            if (p.p_home >= 0.5 and a == 1.0) or (p.p_home < 0.5 and a == 0.0)
            else -1.0
            for p, a in zip(predictions, actuals)
        )

        return BacktestResult(
            strategy_id="esports_flat_stake",
            n_predictions=n,
            n_correct=n_correct,
            accuracy=n_correct / n,
            roi=pnl / n,
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
