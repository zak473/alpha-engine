"""
Abstract base class for all feature engineering pipelines.

Each sport has its own FeaturePipeline that knows which raw fields
to pull, how to transform them, and what the output schema looks like.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import pandas as pd


class FeaturePipeline(ABC):
    """
    Interface for sport-specific feature engineering pipelines.

    Design intent:
    - extract() fetches raw data from a storage layer or dict.
    - transform() produces the feature matrix consumed by SportModel.
    - validate() asserts schema and range constraints before modelling.
    - get_feature_names() allows the model to log which features it used.

    Each sport's pipeline is responsible for ALL feature engineering
    for that sport — including form, head-to-head, weather impact,
    ELO differentials, etc.
    """

    @abstractmethod
    def extract(self, match_ids: list[str], db_session: Any) -> pd.DataFrame:
        """
        Pull raw data from storage for the given match IDs.

        Returns a raw DataFrame with one row per match.
        No transformations applied at this stage.
        """
        ...

    @abstractmethod
    def transform(self, raw: pd.DataFrame) -> pd.DataFrame:
        """
        Apply all feature engineering transformations.

        This is the heavy lifting: rolling averages, ELO diffs,
        encoded categoricals, interaction terms, etc.

        Returns a feature matrix ready for model consumption.
        """
        ...

    @abstractmethod
    def validate(self, features: pd.DataFrame) -> bool:
        """
        Assert that the feature matrix meets expected schema and ranges.

        Raises ValueError with a descriptive message on failure.
        Returns True if all checks pass.
        """
        ...

    @abstractmethod
    def get_feature_names(self) -> list[str]:
        """
        Return the ordered list of feature column names this pipeline produces.
        Used for model explainability and prediction metadata.
        """
        ...

    def run(self, match_ids: list[str], db_session: Any) -> pd.DataFrame:
        """
        Convenience method: extract → transform → validate.
        Raises on validation failure.
        """
        raw = self.extract(match_ids, db_session)
        features = self.transform(raw)
        self.validate(features)
        return features
