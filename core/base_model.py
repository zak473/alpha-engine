"""
Abstract base class for all sport prediction models.

Each sport (soccer, tennis, esports) implements this interface.
The model owns the prediction and calibration logic for its sport.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import pandas as pd

from core.types import PredictionResult, BacktestResult


class SportModel(ABC):
    """
    Interface for sport-specific prediction models.

    Design intent:
    - Models are stateless at prediction time (weights loaded from artefacts).
    - All sport-specific feature logic lives in the sport's FeaturePipeline.
    - Calibration is applied after raw prediction — not baked into the model.
    - Models must expose explainability via feature importance.

    Workflow:
        features = pipeline.run(match_ids, db)
        raw_probs = model.predict(features)
        calibrated = model.calibrate(raw_probs)
        evaluation = model.evaluate(calibrated, actuals)
    """

    @abstractmethod
    def train(self, features: pd.DataFrame, targets: pd.Series) -> None:
        """
        Fit the model on a historical feature matrix and outcome targets.

        targets: encoded outcome (0 = away win, 0.5 = draw, 1 = home win)
        """
        ...

    @abstractmethod
    def predict(self, features: pd.DataFrame) -> list[PredictionResult]:
        """
        Generate raw probability predictions for each row in features.

        Returns one PredictionResult per row. Probabilities are uncalibrated.
        """
        ...

    @abstractmethod
    def calibrate(
        self,
        predictions: list[PredictionResult],
        actuals: list[float],
    ) -> list[PredictionResult]:
        """
        Apply probability calibration (e.g. Platt scaling, isotonic regression).

        Takes raw predictions and actual outcomes and returns calibrated versions.
        Must be called with training data before use on live predictions.
        """
        ...

    @abstractmethod
    def evaluate(
        self,
        predictions: list[PredictionResult],
        actuals: list[float],
    ) -> BacktestResult:
        """
        Compute evaluation metrics: accuracy, ROI, Brier score, log-loss,
        calibration error, Sharpe ratio, max drawdown.
        """
        ...

    @abstractmethod
    def feature_importance(self) -> dict[str, float]:
        """
        Return a dict mapping feature name → importance score.
        Sorted descending by importance.
        """
        ...

    @abstractmethod
    def save(self, path: str) -> None:
        """Serialise model weights/artefacts to disk."""
        ...

    @abstractmethod
    def load(self, path: str) -> None:
        """Load model weights/artefacts from disk."""
        ...

    @property
    @abstractmethod
    def sport(self) -> str:
        """Return the sport identifier this model handles."""
        ...

    @property
    @abstractmethod
    def version(self) -> str:
        """Return the model version string (e.g. 'v1.2.0')."""
        ...
