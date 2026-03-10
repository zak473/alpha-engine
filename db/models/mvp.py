"""
MVP-layer database models.

Naming convention:
    core_*   — normalized source-of-truth data
    rating_* — time-series rating snapshots
    feat_*   — precomputed feature rows (one per match, as-of kickoff)
    pred_*   — model prediction outputs
    model_*  — model registry / artefact tracking

These tables are the production data contract.
All pipeline scripts read/write here.
All API endpoints serve from here.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Float, Index, Integer,
    JSON, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# core_leagues
# ---------------------------------------------------------------------------

class CoreLeague(Base):
    __tablename__ = "core_leagues"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sport: Mapped[str] = mapped_column(String(20), nullable=True, default="soccer")
    country: Mapped[str] = mapped_column(String(100), nullable=True)
    tier: Mapped[int] = mapped_column(Integer, default=1)
    provider_id: Mapped[str] = mapped_column(String(200), nullable=True, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    logo_url: Mapped[str] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_core_leagues_name", "name"),
    )


# ---------------------------------------------------------------------------
# core_teams
# ---------------------------------------------------------------------------

class CoreTeam(Base):
    __tablename__ = "core_teams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    league_id: Mapped[str] = mapped_column(String(36), nullable=True)   # FK handled app-side
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    short_name: Mapped[str] = mapped_column(String(50), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=True)
    provider_id: Mapped[str] = mapped_column(String(200), nullable=True, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    logo_url: Mapped[str] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_core_teams_name", "name"),
    )


# ---------------------------------------------------------------------------
# core_matches
# ---------------------------------------------------------------------------

class CoreMatch(Base):
    """
    Canonical match record. provider_id is the upsert key — ingestion is idempotent.
    """
    __tablename__ = "core_matches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    league_id: Mapped[str] = mapped_column(String(36), nullable=False)
    season: Mapped[str] = mapped_column(String(20), nullable=True)          # "2023-24"
    home_team_id: Mapped[str] = mapped_column(String(36), nullable=False)
    away_team_id: Mapped[str] = mapped_column(String(36), nullable=False)
    kickoff_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="scheduled")    # scheduled|finished|cancelled
    home_score: Mapped[int] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int] = mapped_column(Integer, nullable=True)
    outcome: Mapped[str] = mapped_column(String(20), nullable=True)         # home_win|draw|away_win
    sport: Mapped[str] = mapped_column(String(20), nullable=True, default="soccer")
    venue: Mapped[str] = mapped_column(String(200), nullable=True)
    is_neutral: Mapped[bool] = mapped_column(Boolean, default=False)
    odds_home: Mapped[float] = mapped_column(Float, nullable=True)
    odds_away: Mapped[float] = mapped_column(Float, nullable=True)
    odds_draw: Mapped[float] = mapped_column(Float, nullable=True)
    provider_id: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)  # upsert key
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    live_clock: Mapped[str] = mapped_column(String(20), nullable=True)           # "34'", "HT", "Q3", "Top 5th", "Map 2 R17"
    current_period: Mapped[int] = mapped_column(Integer, nullable=True)           # 1-based: half/quarter/inning/set/map
    current_state_json: Mapped[dict] = mapped_column(JSON, nullable=True)         # sport-specific live state blob
    extras_json: Mapped[dict] = mapped_column(JSON, nullable=True)                # Highlightly enrichment: lineups, statistics, events
    highlights_json: Mapped[dict] = mapped_column(JSON, nullable=True)            # Highlightly highlight clips

    __table_args__ = (
        Index("ix_core_matches_kickoff", "kickoff_utc"),
        Index("ix_core_matches_status", "status"),
        Index("ix_core_matches_league_season", "league_id", "season"),
    )


# ---------------------------------------------------------------------------
# core_team_match_stats
# ---------------------------------------------------------------------------

class CoreTeamMatchStats(Base):
    """
    Team-level statistics for one side in one match.
    Two rows per match (home + away).
    Upsert key: (match_id, team_id).
    """
    __tablename__ = "core_team_match_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(String(36), nullable=False)
    team_id: Mapped[str] = mapped_column(String(36), nullable=False)
    is_home: Mapped[bool] = mapped_column(Boolean, nullable=False)

    # Goals
    goals: Mapped[int] = mapped_column(Integer, nullable=True)
    goals_conceded: Mapped[int] = mapped_column(Integer, nullable=True)

    # Shots
    shots: Mapped[int] = mapped_column(Integer, nullable=True)
    shots_on_target: Mapped[int] = mapped_column(Integer, nullable=True)

    # Expected goals
    xg: Mapped[float] = mapped_column(Float, nullable=True)
    xga: Mapped[float] = mapped_column(Float, nullable=True)
    np_xg: Mapped[float] = mapped_column(Float, nullable=True)     # non-penalty xG

    # Possession & passing
    possession_pct: Mapped[float] = mapped_column(Float, nullable=True)
    passes_completed: Mapped[int] = mapped_column(Integer, nullable=True)
    pass_accuracy_pct: Mapped[float] = mapped_column(Float, nullable=True)

    # Pressing
    ppda: Mapped[float] = mapped_column(Float, nullable=True)       # passes per defensive action

    # Discipline
    fouls: Mapped[int] = mapped_column(Integer, nullable=True)
    yellow_cards: Mapped[int] = mapped_column(Integer, nullable=True)
    red_cards: Mapped[int] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("match_id", "team_id", name="uq_core_team_match_stats"),
        Index("ix_core_tms_match", "match_id"),
        Index("ix_core_tms_team", "team_id"),
    )


# ---------------------------------------------------------------------------
# rating_elo_team
# ---------------------------------------------------------------------------

class RatingEloTeam(Base):
    """
    Point-in-time ELO snapshot for a team after each processed match.
    One row per (team, match). Enables full rating history reconstruction.
    context: "global" | "home" | "away"
    """
    __tablename__ = "rating_elo_team"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[str] = mapped_column(String(36), nullable=False)
    match_id: Mapped[str] = mapped_column(String(36), nullable=False)
    context: Mapped[str] = mapped_column(String(20), default="global")
    rating_before: Mapped[float] = mapped_column(Float, nullable=False)
    rating_after: Mapped[float] = mapped_column(Float, nullable=False)
    expected_score: Mapped[float] = mapped_column(Float, nullable=False)
    actual_score: Mapped[float] = mapped_column(Float, nullable=False)
    k_factor: Mapped[float] = mapped_column(Float, nullable=False)
    rated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("team_id", "match_id", "context", name="uq_rating_elo_team"),
        Index("ix_rating_elo_team_id", "team_id"),
        Index("ix_rating_elo_rated_at", "rated_at"),
    )


# ---------------------------------------------------------------------------
# feat_soccer_match
# ---------------------------------------------------------------------------

class FeatSoccerMatch(Base):
    """
    Precomputed feature vector for one match (as of kickoff).
    One row per match. Recomputed each time the pipeline runs.

    All values are computed using only data available BEFORE kickoff (no leakage).
    """
    __tablename__ = "feat_soccer_match"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # ELO features
    elo_home: Mapped[float] = mapped_column(Float, nullable=True)
    elo_away: Mapped[float] = mapped_column(Float, nullable=True)
    elo_diff: Mapped[float] = mapped_column(Float, nullable=True)       # home - away

    # Form features (last 5 matches before this fixture)
    home_form_pts: Mapped[float] = mapped_column(Float, nullable=True)  # 0–15 (3 pts per win)
    away_form_pts: Mapped[float] = mapped_column(Float, nullable=True)
    home_form_w: Mapped[int] = mapped_column(Integer, nullable=True)
    home_form_d: Mapped[int] = mapped_column(Integer, nullable=True)
    home_form_l: Mapped[int] = mapped_column(Integer, nullable=True)
    away_form_w: Mapped[int] = mapped_column(Integer, nullable=True)
    away_form_d: Mapped[int] = mapped_column(Integer, nullable=True)
    away_form_l: Mapped[int] = mapped_column(Integer, nullable=True)

    # Goals (rolling average, last 5)
    home_gf_avg: Mapped[float] = mapped_column(Float, nullable=True)
    home_ga_avg: Mapped[float] = mapped_column(Float, nullable=True)
    away_gf_avg: Mapped[float] = mapped_column(Float, nullable=True)
    away_ga_avg: Mapped[float] = mapped_column(Float, nullable=True)

    # xG (rolling average, last 5 — null if data not available)
    home_xg_avg: Mapped[float] = mapped_column(Float, nullable=True)
    home_xga_avg: Mapped[float] = mapped_column(Float, nullable=True)
    away_xg_avg: Mapped[float] = mapped_column(Float, nullable=True)
    away_xga_avg: Mapped[float] = mapped_column(Float, nullable=True)

    # Schedule
    home_days_rest: Mapped[float] = mapped_column(Float, nullable=True)
    away_days_rest: Mapped[float] = mapped_column(Float, nullable=True)
    rest_diff: Mapped[float] = mapped_column(Float, nullable=True)      # home - away

    # Head-to-head (all prior meetings)
    h2h_home_win_pct: Mapped[float] = mapped_column(Float, nullable=True)
    h2h_matches_played: Mapped[int] = mapped_column(Integer, default=0)

    # Context
    is_home_advantage: Mapped[int] = mapped_column(Integer, default=1)  # always 1 (canonical)

    # Target (filled after match finishes — used for training only)
    outcome: Mapped[str] = mapped_column(String(20), nullable=True)     # home_win|draw|away_win
    target: Mapped[float] = mapped_column(Float, nullable=True)          # 1.0|0.5|0.0

    __table_args__ = (
        Index("ix_feat_soccer_match_id", "match_id"),
    )


# ---------------------------------------------------------------------------
# pred_match
# ---------------------------------------------------------------------------

class PredMatch(Base):
    """
    Model prediction output for one match.
    This is the contract table — the API reads from here.
    Upsert key: (match_id, model_version).
    """
    __tablename__ = "pred_match"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    match_id: Mapped[str] = mapped_column(String(36), nullable=False)
    model_version: Mapped[str] = mapped_column(String(100), nullable=False)  # "soccer_lr_v1"

    # Probabilities
    p_home: Mapped[float] = mapped_column(Float, nullable=False)
    p_draw: Mapped[float] = mapped_column(Float, nullable=False)
    p_away: Mapped[float] = mapped_column(Float, nullable=False)

    # Fair odds (1 / p)
    fair_odds_home: Mapped[float] = mapped_column(Float, nullable=False)
    fair_odds_draw: Mapped[float] = mapped_column(Float, nullable=False)
    fair_odds_away: Mapped[float] = mapped_column(Float, nullable=False)

    # Confidence score 0–100
    confidence: Mapped[int] = mapped_column(Integer, nullable=False)

    # Top 5 feature drivers [{feature, value, importance}]
    key_drivers: Mapped[list] = mapped_column(JSON, default=list)

    # Monte Carlo simulation summary
    simulation: Mapped[dict] = mapped_column(JSON, default=dict)

    # Feature snapshot (values used at prediction time)
    features_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("match_id", "model_version", name="uq_pred_match"),
        Index("ix_pred_match_match_id", "match_id"),
        Index("ix_pred_match_created", "created_at"),
    )


# ---------------------------------------------------------------------------
# model_registry
# ---------------------------------------------------------------------------

class ModelRegistry(Base):
    """
    Trained model artefact registry.
    is_live=True marks the model currently used for predictions.
    Only one model per sport should have is_live=True at a time.
    """
    __tablename__ = "model_registry"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    sport: Mapped[str] = mapped_column(String(20), nullable=False)           # "soccer"
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)     # "soccer_lr_v1"
    version: Mapped[str] = mapped_column(String(20), nullable=False)         # "v1"
    algorithm: Mapped[str] = mapped_column(String(50), nullable=False)       # "logistic_regression"
    artifact_path: Mapped[str] = mapped_column(String(500), nullable=False)  # absolute path to .joblib
    feature_names: Mapped[list] = mapped_column(JSON, default=list)
    hyperparams: Mapped[dict] = mapped_column(JSON, default=dict)
    train_data_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    train_data_to: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    n_train_samples: Mapped[int] = mapped_column(Integer, nullable=True)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)   # brier, logloss, accuracy, etc.
    is_live: Mapped[bool] = mapped_column(Boolean, default=False)
    trained_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_model_registry_sport_live", "sport", "is_live"),
    )


# ---------------------------------------------------------------------------
# core_standings
# ---------------------------------------------------------------------------

class CoreStanding(Base):
    """
    League table row — one row per team per league per season.
    Upsert key: (league_id, season, team_name).
    Updated by the Highlightly standings sync job.
    """
    __tablename__ = "core_standings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    league_id: Mapped[str] = mapped_column(String(36), nullable=False)
    season: Mapped[str] = mapped_column(String(20), nullable=False)
    sport: Mapped[str] = mapped_column(String(20), nullable=False)
    team_id: Mapped[str] = mapped_column(String(36), nullable=True)       # may be null before team upsert
    team_name: Mapped[str] = mapped_column(String(200), nullable=False)
    team_logo: Mapped[str] = mapped_column(String(500), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=True)
    played: Mapped[int] = mapped_column(Integer, nullable=True)
    won: Mapped[int] = mapped_column(Integer, nullable=True)
    drawn: Mapped[int] = mapped_column(Integer, nullable=True)
    lost: Mapped[int] = mapped_column(Integer, nullable=True)
    goals_for: Mapped[int] = mapped_column(Integer, nullable=True)
    goals_against: Mapped[int] = mapped_column(Integer, nullable=True)
    goal_diff: Mapped[int] = mapped_column(Integer, nullable=True)
    points: Mapped[int] = mapped_column(Integer, nullable=True)
    form: Mapped[str] = mapped_column(String(20), nullable=True)          # "WWDLW"
    group_name: Mapped[str] = mapped_column(String(100), nullable=True)   # group stage label
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("league_id", "season", "team_name", name="uq_standings_league_season_team"),
        Index("ix_standings_league_season", "league_id", "season"),
        Index("ix_standings_sport", "sport"),
    )
