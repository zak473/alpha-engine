"""
Contract schemas for the MVP prediction API.

These are the types that the frontend and external consumers depend on.
All endpoints return these shapes — never expose internal DB models directly.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ParticipantSchema(BaseModel):
    id: str
    name: str


class ParticipantsSchema(BaseModel):
    home: ParticipantSchema
    away: ParticipantSchema


class ProbabilitiesSchema(BaseModel):
    home_win: float = Field(..., ge=0.0, le=1.0)
    draw: float = Field(..., ge=0.0, le=1.0)
    away_win: float = Field(..., ge=0.0, le=1.0)


class FairOddsSchema(BaseModel):
    home_win: float
    draw: float
    away_win: float


class KeyDriverSchema(BaseModel):
    feature: str
    value: Optional[float]
    importance: float


class ModelMetaSchema(BaseModel):
    version: str
    trained_at: Optional[datetime]


class ScorelineSchema(BaseModel):
    score: str
    probability: float


class SimulationSchema(BaseModel):
    n_simulations: int
    mean_home_goals: float
    mean_away_goals: float
    distribution: list[ScorelineSchema]


class PredictionSchema(BaseModel):
    """
    Contract schema — one entry for a match prediction.
    Used in list and detail endpoints.
    """
    event_id: str
    sport: str
    league: str
    season: Optional[str]
    start_time: datetime
    status: str
    outcome: Optional[str] = None        # "home_win" | "draw" | "away_win" | None
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    participants: ParticipantsSchema
    probabilities: ProbabilitiesSchema
    fair_odds: FairOddsSchema
    market_odds: Optional[FairOddsSchema] = None  # sharpest available bookmaker odds
    confidence: float = Field(..., ge=0, le=1)
    key_drivers: list[KeyDriverSchema]
    model: Optional[ModelMetaSchema]
    simulation: Optional[SimulationSchema]
    created_at: datetime

    class Config:
        from_attributes = True


class PredictionListResponse(BaseModel):
    items: list[PredictionSchema]
    total: int
    sport: Optional[str]
    date_from: Optional[datetime]
    date_to: Optional[datetime]


class ModelMetricsSchema(BaseModel):
    model_name: str
    version: str
    algorithm: str
    sport: str
    is_live: bool
    n_train_samples: Optional[int]
    n_predictions: Optional[int] = None   # live count of predictions in DB
    accuracy: Optional[float]
    brier_score: Optional[float]
    log_loss: Optional[float]
    ece: Optional[float]
    trained_at: Optional[datetime]
    train_data_from: Optional[datetime]
    train_data_to: Optional[datetime]
    notes: Optional[str]


class PerformanceResponse(BaseModel):
    models: list[ModelMetricsSchema]
    sport: Optional[str]
