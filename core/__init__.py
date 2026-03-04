"""
Core abstractions package.
Import ABCs from here — never from the submodules directly.
"""

from core.base_model import SportModel
from core.base_pipeline import FeaturePipeline
from core.base_rating import RatingEngine
from core.base_simulation import SimulationEngine
from core.types import (
    BacktestResult,
    MatchContext,
    MatchStatus,
    Outcome,
    PredictionResult,
    RatingUpdate,
    SimulationResult,
    Sport,
    Surface,
    Venue,
)

__all__ = [
    "SportModel",
    "FeaturePipeline",
    "RatingEngine",
    "SimulationEngine",
    "BacktestResult",
    "MatchContext",
    "MatchStatus",
    "Outcome",
    "PredictionResult",
    "RatingUpdate",
    "SimulationResult",
    "Sport",
    "Surface",
    "Venue",
]
