"""
Abstract base class for all simulation engines.

The simulation layer sits between predictions and final output.
It converts model probabilities into full match outcome distributions
via Monte Carlo sampling.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from core.types import MatchContext, PredictionResult, SimulationResult


class SimulationEngine(ABC):
    """
    Interface for Monte Carlo match simulation.

    Design intent:
    - Receives model output (probabilities) as input.
    - Simulates individual match outcomes N times.
    - Returns full outcome distributions, not just point estimates.
    - Sport-specific logic (e.g. score distributions in soccer vs
      game/set structure in tennis) lives in subclasses.

    The generic Monte Carlo engine in simulation/monte_carlo.py implements
    the sampling core. Sport SimulationEngines use it internally.
    """

    @abstractmethod
    def simulate_match(
        self,
        prediction: PredictionResult,
        context: MatchContext,
        n_simulations: int = 10_000,
    ) -> SimulationResult:
        """
        Run N Monte Carlo simulations for a single match.

        Uses the prediction probabilities as distributional parameters,
        then samples outcomes according to sport-specific score models.

        Returns a SimulationResult with win/draw/loss probabilities,
        expected scores, and confidence intervals.
        """
        ...

    @abstractmethod
    def simulate_tournament(
        self,
        team_ids: list[str],
        bracket: dict[str, Any],
        prediction_fn: Any,
        n_simulations: int = 10_000,
    ) -> dict[str, float]:
        """
        Simulate a full tournament bracket.

        Args:
            team_ids: All participating entities.
            bracket: Tournament structure (rounds, seedings, format).
            prediction_fn: Callable(entity_a_id, entity_b_id) → PredictionResult.
            n_simulations: Number of full tournament simulations.

        Returns:
            Dict mapping entity_id → tournament win probability.
        """
        ...

    @abstractmethod
    def score_distribution(
        self,
        prediction: PredictionResult,
        context: MatchContext,
    ) -> dict[str, Any]:
        """
        Return the expected score distribution for a match.

        For soccer: scoreline probabilities (0-0, 1-0, etc.)
        For tennis: set probabilities, tiebreak likelihoods
        For esports: map score distributions

        Used downstream for Asian handicap and total markets.
        """
        ...
