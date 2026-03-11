"""
Shared type definitions used across the entire system.
All modules import types from here — never define them inline.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class Sport(str, Enum):
    SOCCER = "soccer"
    TENNIS = "tennis"
    ESPORTS = "esports"
    BASKETBALL = "basketball"
    BASEBALL = "baseball"
    HOCKEY = "hockey"


class Outcome(str, Enum):
    HOME_WIN = "home_win"
    AWAY_WIN = "away_win"
    DRAW = "draw"
    PLAYER_A_WIN = "player_a_win"
    PLAYER_B_WIN = "player_b_win"


class Surface(str, Enum):
    """Tennis court surfaces."""
    HARD = "hard"
    CLAY = "clay"
    GRASS = "grass"
    CARPET = "carpet"
    INDOOR_HARD = "indoor_hard"


class Venue(str, Enum):
    """Tennis venue type."""
    INDOOR = "indoor"
    OUTDOOR = "outdoor"


class MatchStatus(str, Enum):
    SCHEDULED = "scheduled"
    LIVE = "live"
    FINISHED = "finished"
    CANCELLED = "cancelled"
    POSTPONED = "postponed"


# ---------------------------------------------------------------------------
# Core data containers
# ---------------------------------------------------------------------------

@dataclass
class MatchContext:
    """
    Sport-agnostic context passed into rating engines and feature pipelines.
    Sport-specific fields live in the extra dict.
    """
    match_id: str
    sport: Sport
    date: datetime
    home_entity_id: str | None = None   # team_id or player_id
    away_entity_id: str | None = None
    importance: float = 1.0             # tournament weight multiplier
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class RatingUpdate:
    """Result of a single rating calculation."""
    entity_id: str
    rating_before: float
    rating_after: float
    expected_score: float
    actual_score: float
    k_factor: float
    timestamp: datetime


@dataclass
class PredictionResult:
    """
    Output from a SportModel.predict() call.
    All probabilities must sum to 1.0.
    """
    match_id: str
    sport: Sport
    p_home: float
    p_away: float
    p_draw: float = 0.0         # Zero for sports with no draw
    confidence: float = 0.0     # Model confidence score [0, 1]
    features_used: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def validate(self) -> None:
        total = round(self.p_home + self.p_away + self.p_draw, 6)
        if abs(total - 1.0) > 1e-4:
            raise ValueError(f"Probabilities must sum to 1.0, got {total}")


@dataclass
class SimulationResult:
    """Output from a SimulationEngine.simulate_match() call."""
    match_id: str
    n_simulations: int
    p_home_win: float
    p_away_win: float
    p_draw: float
    expected_home_score: float
    expected_away_score: float
    confidence_interval: tuple[float, float] = (0.0, 1.0)
    raw_outcomes: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class BacktestResult:
    """Output from the backtesting engine."""
    strategy_id: str
    n_predictions: int
    n_correct: int
    accuracy: float
    roi: float
    sharpe_ratio: float
    max_drawdown: float
    log_loss: float
    brier_score: float
    calibration_error: float
    pnl_units: float
    metadata: dict[str, Any] = field(default_factory=dict)
