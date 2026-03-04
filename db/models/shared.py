"""
Shared / cross-sport database models.

Schema zones:
    Zone 1 — Master reference data (sports, competitions, seasons, venues)
    Zone 2 — Entities (teams, players) with sport-agnostic identity
    Zone 3 — Matches (sport-agnostic shell, extended by sport-specific tables)
    Zone 4 — Predictions and tips
    Zone 5 — Ratings (ELO history, all sports)
    Zone 6 — Evaluation (backtests, calibration models)
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Zone 1 — Reference data
# ---------------------------------------------------------------------------

class Sport(Base):
    """
    Master sport registry.
    New sports are added here first, then get extension tables.
    """
    __tablename__ = "sports"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)   # "soccer", "tennis", "esports"
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    competitions: Mapped[list["Competition"]] = relationship(back_populates="sport")


class Competition(Base):
    """
    League, tournament, or series. One competition belongs to one sport.
    """
    __tablename__ = "competitions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    sport_id: Mapped[str] = mapped_column(ForeignKey("sports.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    short_name: Mapped[str] = mapped_column(String(50), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=True)
    tier: Mapped[int] = mapped_column(Integer, default=1)           # 1=top flight, 2=second tier
    importance_weight: Mapped[float] = mapped_column(Float, default=1.0)  # ELO K multiplier
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    sport: Mapped["Sport"] = relationship(back_populates="competitions")
    seasons: Mapped[list["Season"]] = relationship(back_populates="competition")
    matches: Mapped[list["Match"]] = relationship(back_populates="competition")


class Season(Base):
    """
    A competition season/split. Ties matches to a time period.
    """
    __tablename__ = "seasons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    competition_id: Mapped[str] = mapped_column(ForeignKey("competitions.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # "2024-25", "Split 1 2025"
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    competition: Mapped["Competition"] = relationship(back_populates="seasons")


class Venue(Base):
    """
    Physical or virtual venue. Used for weather modelling and home advantage.
    """
    __tablename__ = "venues"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=True)
    longitude: Mapped[float] = mapped_column(Float, nullable=True)
    altitude_m: Mapped[int] = mapped_column(Integer, nullable=True)
    capacity: Mapped[int] = mapped_column(Integer, nullable=True)
    surface: Mapped[str] = mapped_column(String(50), nullable=True)  # grass, clay, etc.
    is_indoor: Mapped[bool] = mapped_column(Boolean, default=False)


# ---------------------------------------------------------------------------
# Zone 2 — Entities
# ---------------------------------------------------------------------------

class Team(Base):
    """
    A team entity. Used by soccer and esports.
    """
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    sport_id: Mapped[str] = mapped_column(ForeignKey("sports.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    short_name: Mapped[str] = mapped_column(String(50), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=True)
    founded_year: Mapped[int] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    provider_ids: Mapped[dict] = mapped_column(JSON, default=dict)  # {"odds_api": "...", "fbref": "..."}

    players: Mapped[list["Player"]] = relationship(back_populates="team")
    ratings: Mapped[list["TeamRating"]] = relationship(back_populates="team")


class Player(Base):
    """
    An individual player. Used by tennis (solo) and soccer/esports (team member).
    """
    __tablename__ = "players"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    sport_id: Mapped[str] = mapped_column(ForeignKey("sports.id"), nullable=False)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=True)  # null for tennis
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=True)
    date_of_birth: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    provider_ids: Mapped[dict] = mapped_column(JSON, default=dict)
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)  # sport-specific (handedness, role, etc.)

    team: Mapped["Team"] = relationship(back_populates="players")
    ratings: Mapped[list["PlayerRating"]] = relationship(back_populates="player")


# ---------------------------------------------------------------------------
# Zone 3 — Matches (sport-agnostic shell)
# ---------------------------------------------------------------------------

class Match(Base):
    """
    Sport-agnostic match record.
    Every match across all sports lives here first.
    Sport-specific detail lives in extension tables (SoccerMatch, TennisMatch, etc.).
    """
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    sport_id: Mapped[str] = mapped_column(ForeignKey("sports.id"), nullable=False)
    competition_id: Mapped[str] = mapped_column(ForeignKey("competitions.id"), nullable=False)
    season_id: Mapped[str] = mapped_column(ForeignKey("seasons.id"), nullable=True)
    venue_id: Mapped[str] = mapped_column(ForeignKey("venues.id"), nullable=True)

    # Sport-agnostic participant IDs (team or player depending on sport)
    home_entity_id: Mapped[str] = mapped_column(String(36), nullable=False)   # team or player
    away_entity_id: Mapped[str] = mapped_column(String(36), nullable=False)

    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="scheduled")
    importance: Mapped[float] = mapped_column(Float, default=1.0)

    # Result
    home_score: Mapped[float] = mapped_column(Float, nullable=True)
    away_score: Mapped[float] = mapped_column(Float, nullable=True)
    outcome: Mapped[str] = mapped_column(String(20), nullable=True)  # "home_win", "away_win", "draw"

    provider_id: Mapped[str] = mapped_column(String(200), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    competition: Mapped["Competition"] = relationship(back_populates="matches")
    predictions: Mapped[list["Prediction"]] = relationship(back_populates="match")


# ---------------------------------------------------------------------------
# Zone 4 — Predictions
# ---------------------------------------------------------------------------

class Prediction(Base):
    """
    A model prediction for a single match.
    Stores both raw and calibrated probabilities.
    """
    __tablename__ = "predictions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id"), nullable=False)
    model_id: Mapped[str] = mapped_column(String(100), nullable=False)   # e.g. "soccer_v2.1"
    sport_id: Mapped[str] = mapped_column(ForeignKey("sports.id"), nullable=False)

    # Raw model output
    p_home_raw: Mapped[float] = mapped_column(Float, nullable=False)
    p_away_raw: Mapped[float] = mapped_column(Float, nullable=False)
    p_draw_raw: Mapped[float] = mapped_column(Float, default=0.0)

    # Calibrated probabilities (post Platt scaling / isotonic regression)
    p_home_cal: Mapped[float] = mapped_column(Float, nullable=True)
    p_away_cal: Mapped[float] = mapped_column(Float, nullable=True)
    p_draw_cal: Mapped[float] = mapped_column(Float, nullable=True)

    confidence: Mapped[float] = mapped_column(Float, nullable=True)
    features_json: Mapped[dict] = mapped_column(JSON, default=dict)  # feature values snapshot
    feature_importance_json: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    match: Mapped["Match"] = relationship(back_populates="predictions")

    __table_args__ = (
        UniqueConstraint("match_id", "model_id", name="uq_prediction_match_model"),
    )


# ---------------------------------------------------------------------------
# Zone 5 — Ratings (ELO history)
# ---------------------------------------------------------------------------

class TeamRating(Base):
    """
    Point-in-time ELO rating snapshot for a team.
    One row per match processed. Enables full rating history reconstruction.
    """
    __tablename__ = "team_ratings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id"), nullable=True)
    sport_id: Mapped[str] = mapped_column(ForeignKey("sports.id"), nullable=False)

    # Context key (e.g. "home", "away", "neutral" for soccer; map name for esports)
    context: Mapped[str] = mapped_column(String(100), default="global")

    rating_before: Mapped[float] = mapped_column(Float, nullable=False)
    rating_after: Mapped[float] = mapped_column(Float, nullable=False)
    expected_score: Mapped[float] = mapped_column(Float, nullable=False)
    actual_score: Mapped[float] = mapped_column(Float, nullable=False)
    k_factor: Mapped[float] = mapped_column(Float, nullable=False)
    rated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    team: Mapped["Team"] = relationship(back_populates="ratings")


class PlayerRating(Base):
    """
    Point-in-time ELO rating snapshot for a player.
    Context column carries surface (tennis) or role context.
    """
    __tablename__ = "player_ratings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), nullable=False)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id"), nullable=True)
    sport_id: Mapped[str] = mapped_column(ForeignKey("sports.id"), nullable=False)
    context: Mapped[str] = mapped_column(String(100), default="global")  # "clay", "hard", "grass", "global"

    rating_before: Mapped[float] = mapped_column(Float, nullable=False)
    rating_after: Mapped[float] = mapped_column(Float, nullable=False)
    expected_score: Mapped[float] = mapped_column(Float, nullable=False)
    actual_score: Mapped[float] = mapped_column(Float, nullable=False)
    k_factor: Mapped[float] = mapped_column(Float, nullable=False)
    rated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    player: Mapped["Player"] = relationship(back_populates="ratings")


class HeadToHead(Base):
    """
    Aggregated head-to-head record between two entities.
    entity_a_id is always lexicographically smaller than entity_b_id (canonical ordering).
    """
    __tablename__ = "head_to_head"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sport_id: Mapped[str] = mapped_column(ForeignKey("sports.id"), nullable=False)
    entity_a_id: Mapped[str] = mapped_column(String(36), nullable=False)
    entity_b_id: Mapped[str] = mapped_column(String(36), nullable=False)
    context: Mapped[str] = mapped_column(String(100), default="global")  # surface, map, venue_type

    matches_played: Mapped[int] = mapped_column(Integer, default=0)
    entity_a_wins: Mapped[int] = mapped_column(Integer, default=0)
    entity_b_wins: Mapped[int] = mapped_column(Integer, default=0)
    draws: Mapped[int] = mapped_column(Integer, default=0)
    entity_a_goals: Mapped[float] = mapped_column(Float, default=0.0)   # goals/rounds/sets
    entity_b_goals: Mapped[float] = mapped_column(Float, default=0.0)
    last_match_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("sport_id", "entity_a_id", "entity_b_id", "context", name="uq_h2h"),
    )


# ---------------------------------------------------------------------------
# Zone 6 — Evaluation
# ---------------------------------------------------------------------------

class ModelVersion(Base):
    """
    Registry of trained model versions. Each Prediction references a model_id string
    that maps to a row here for full artefact tracking.
    """
    __tablename__ = "model_versions"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)  # "soccer_v2.1"
    sport_id: Mapped[str] = mapped_column(ForeignKey("sports.id"), nullable=False)
    algorithm: Mapped[str] = mapped_column(String(100), nullable=False)   # "xgboost", "logistic"
    features_json: Mapped[list] = mapped_column(JSON, default=list)
    hyperparams_json: Mapped[dict] = mapped_column(JSON, default=dict)
    artefact_path: Mapped[str] = mapped_column(String(500), nullable=True)
    trained_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    is_live: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)


class CalibrationModel(Base):
    """
    Probability calibration artefact for a model version.
    """
    __tablename__ = "calibration_models"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    model_version_id: Mapped[str] = mapped_column(ForeignKey("model_versions.id"), nullable=False)
    method: Mapped[str] = mapped_column(String(50), nullable=False)   # "platt", "isotonic"
    artefact_path: Mapped[str] = mapped_column(String(500), nullable=True)
    ece: Mapped[float] = mapped_column(Float, nullable=True)          # Expected Calibration Error
    trained_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)


class BacktestRun(Base):
    """
    A single backtesting experiment run.
    """
    __tablename__ = "backtest_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    model_version_id: Mapped[str] = mapped_column(ForeignKey("model_versions.id"), nullable=False)
    sport_id: Mapped[str] = mapped_column(ForeignKey("sports.id"), nullable=False)
    strategy_id: Mapped[str] = mapped_column(String(100), nullable=True)
    date_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    date_to: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    params_json: Mapped[dict] = mapped_column(JSON, default=dict)   # min_edge, odds_range, etc.
    results_json: Mapped[dict] = mapped_column(JSON, default=dict)  # accuracy, roi, sharpe, etc.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
