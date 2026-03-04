"""
Abstract base class for all rating engines.

Every sport's rating engine must implement this interface.
The engine is stateless with respect to match data — it receives
entity IDs and context, computes deltas, and returns updated ratings.
Persistence is handled by the caller (services layer).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime

from core.types import MatchContext, RatingUpdate


class RatingEngine(ABC):
    """
    Interface for all rating/Elo-style systems.

    Design intent:
    - Engines do not own storage. They compute, callers persist.
    - All configurable behaviour is injected via a config object at init.
    - Engines must be deterministic given the same inputs.
    """

    @abstractmethod
    def get_rating(self, entity_id: str) -> float:
        """
        Return current rating for a given entity.
        Returns the engine's base/default rating if entity is unseen.
        """
        ...

    @abstractmethod
    def expected_score(
        self,
        rating_a: float,
        rating_b: float,
        context: MatchContext,
    ) -> float:
        """
        Compute the expected score for entity A against entity B.
        Returns a value in [0, 1].

        Context may carry surface modifiers, home advantage flags,
        map weights, etc. Subclasses must handle their own context fields.
        """
        ...

    @abstractmethod
    def update_ratings(
        self,
        entity_a_id: str,
        entity_b_id: str,
        score_a: float,
        score_b: float,
        context: MatchContext,
    ) -> tuple[RatingUpdate, RatingUpdate]:
        """
        Process a match result and return updated rating records.

        Args:
            entity_a_id: Home team / Player A identifier.
            entity_b_id: Away team / Player B identifier.
            score_a: Goals/sets/rounds won by A (used for MoV multiplier).
            score_b: Goals/sets/rounds won by B.
            context: Match metadata (date, importance, surface, etc.).

        Returns:
            Tuple of (rating_update_a, rating_update_b).
        """
        ...

    @abstractmethod
    def decay_ratings(self, as_of_date: datetime) -> dict[str, float]:
        """
        Apply time-decay to all stored ratings as of a given date.
        Returns a dict of {entity_id: decayed_rating}.
        Used before generating predictions to penalise inactive entities.
        """
        ...

    @abstractmethod
    def get_rating_history(self, entity_id: str) -> list[RatingUpdate]:
        """Return the full rating history for an entity."""
        ...

    @abstractmethod
    def reset(self) -> None:
        """Clear all stored ratings. Used for backfill reruns."""
        ...
