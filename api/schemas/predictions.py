"""
Pydantic schemas for the prediction API responses.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class PredictionResponse(BaseModel):
    match_id: str
    sport: str
    p_home: float = Field(..., ge=0, le=1)
    p_away: float = Field(..., ge=0, le=1)
    p_draw: float = Field(0.0, ge=0, le=1)
    confidence: float = Field(0.0, ge=0, le=1)
    edge: float | None = None
    model_id: str | None = None


class SimulationResponse(BaseModel):
    match_id: str
    n_simulations: int
    p_home_win: float
    p_away_win: float
    p_draw: float
    expected_home_score: float
    expected_away_score: float
    confidence_interval: tuple[float, float]


class BacktestResponse(BaseModel):
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
    metadata: dict = {}


class RatingResponse(BaseModel):
    entity_id: str
    rating: float
    context: str = "global"


class HeadToHeadResponse(BaseModel):
    entity_a_id: str
    entity_b_id: str
    matches_played: int
    entity_a_wins: int
    entity_b_wins: int
    draws: int
    context: str = "global"
