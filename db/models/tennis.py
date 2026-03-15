"""
Tennis-specific database models.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import Base


class TennisMatch(Base):
    """
    Tennis-specific match detail. One-to-one with matches.
    Players are stored in matches.home_entity_id (player_a) and away_entity_id (player_b).
    """
    __tablename__ = "tennis_matches"

    match_id: Mapped[str] = mapped_column(ForeignKey("core_matches.id"), primary_key=True)

    surface: Mapped[str] = mapped_column(String(50), nullable=False)  # hard, clay, grass, carpet
    is_indoor: Mapped[bool] = mapped_column(Boolean, default=False)
    tournament_level: Mapped[str] = mapped_column(String(50), nullable=True)  # "grand_slam", "masters", "atp500"
    tournament_importance: Mapped[float] = mapped_column(Float, default=1.0)  # ELO K multiplier
    round_name: Mapped[str] = mapped_column(String(50), nullable=True)   # "R128", "QF", "SF", "F"
    best_of: Mapped[int] = mapped_column(Integer, default=3)             # 3 or 5

    # Player fatigue
    player_a_days_rest: Mapped[int] = mapped_column(Integer, nullable=True)
    player_b_days_rest: Mapped[int] = mapped_column(Integer, nullable=True)
    player_a_matches_last_14d: Mapped[int] = mapped_column(Integer, nullable=True)
    player_b_matches_last_14d: Mapped[int] = mapped_column(Integer, nullable=True)

    # Score (sets won)
    player_a_sets: Mapped[int] = mapped_column(Integer, nullable=True)
    player_b_sets: Mapped[int] = mapped_column(Integer, nullable=True)
    sets_json: Mapped[list] = mapped_column(  # [{a: 6, b: 3, tb_a: null, tb_b: null}, ...]
        String(500), nullable=True
    )
    match_duration_min: Mapped[int] = mapped_column(Integer, nullable=True)
    retired: Mapped[bool] = mapped_column(Boolean, default=False)         # opponent retired

    match_stats: Mapped[list["TennisMatchStats"]] = relationship(back_populates="tennis_match")


class TennisMatchStats(Base):
    """
    Serve and return statistics for one player in one tennis match.
    Two rows per match (player_a and player_b).
    """
    __tablename__ = "tennis_match_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(ForeignKey("tennis_matches.match_id"), nullable=False)
    player_id: Mapped[str] = mapped_column(ForeignKey("core_teams.id"), nullable=False)

    # Serve
    aces: Mapped[int] = mapped_column(Integer, nullable=True)
    double_faults: Mapped[int] = mapped_column(Integer, nullable=True)
    first_serve_in_pct: Mapped[float] = mapped_column(Float, nullable=True)
    first_serve_won_pct: Mapped[float] = mapped_column(Float, nullable=True)
    second_serve_won_pct: Mapped[float] = mapped_column(Float, nullable=True)
    service_games_played: Mapped[int] = mapped_column(Integer, nullable=True)
    service_games_held: Mapped[int] = mapped_column(Integer, nullable=True)
    service_hold_pct: Mapped[float] = mapped_column(Float, nullable=True)

    # Return
    return_games_played: Mapped[int] = mapped_column(Integer, nullable=True)
    return_games_won: Mapped[int] = mapped_column(Integer, nullable=True)
    break_points_faced: Mapped[int] = mapped_column(Integer, nullable=True)
    break_points_saved: Mapped[int] = mapped_column(Integer, nullable=True)
    break_points_created: Mapped[int] = mapped_column(Integer, nullable=True)
    break_points_converted: Mapped[int] = mapped_column(Integer, nullable=True)
    bp_conversion_pct: Mapped[float] = mapped_column(Float, nullable=True)

    # Points
    total_points_won: Mapped[int] = mapped_column(Integer, nullable=True)
    first_serve_return_won_pct: Mapped[float] = mapped_column(Float, nullable=True)
    second_serve_return_won_pct: Mapped[float] = mapped_column(Float, nullable=True)

    # Extended stats (from api-tennis get_match_statistics)
    first_serve_avg_mph: Mapped[float] = mapped_column(Float, nullable=True)
    first_serve_max_mph: Mapped[float] = mapped_column(Float, nullable=True)
    second_serve_avg_mph: Mapped[float] = mapped_column(Float, nullable=True)
    winners: Mapped[int] = mapped_column(Integer, nullable=True)
    unforced_errors: Mapped[int] = mapped_column(Integer, nullable=True)
    forced_errors: Mapped[int] = mapped_column(Integer, nullable=True)
    net_approaches: Mapped[int] = mapped_column(Integer, nullable=True)
    net_points_won: Mapped[int] = mapped_column(Integer, nullable=True)
    service_points_played: Mapped[int] = mapped_column(Integer, nullable=True)
    service_points_won: Mapped[int] = mapped_column(Integer, nullable=True)
    return_points_played: Mapped[int] = mapped_column(Integer, nullable=True)
    return_points_won: Mapped[int] = mapped_column(Integer, nullable=True)

    tennis_match: Mapped["TennisMatch"] = relationship(back_populates="match_stats")

    __table_args__ = (
        UniqueConstraint("match_id", "player_id", name="uq_tennis_match_stats"),
    )


class TennisPlayerForm(Base):
    """
    Rolling form features for a tennis player.
    Optionally scoped to a surface.
    """
    __tablename__ = "tennis_player_form"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    player_id: Mapped[str] = mapped_column(ForeignKey("core_teams.id"), nullable=False)
    as_of_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    surface: Mapped[str] = mapped_column(String(50), default="all")   # "all", "hard", "clay", "grass"
    window_days: Mapped[int] = mapped_column(Integer, default=365)

    matches_played: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    win_pct: Mapped[float] = mapped_column(Float, nullable=True)
    avg_first_serve_in_pct: Mapped[float] = mapped_column(Float, nullable=True)
    avg_first_serve_won_pct: Mapped[float] = mapped_column(Float, nullable=True)
    avg_bp_conversion_pct: Mapped[float] = mapped_column(Float, nullable=True)
    avg_service_hold_pct: Mapped[float] = mapped_column(Float, nullable=True)
    avg_return_won_pct: Mapped[float] = mapped_column(Float, nullable=True)
    avg_aces_per_match: Mapped[float] = mapped_column(Float, nullable=True)
    avg_df_per_match: Mapped[float] = mapped_column(Float, nullable=True)
    matches_since_last_title: Mapped[int] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint("player_id", "as_of_date", "surface", "window_days", name="uq_tennis_form"),
    )


class TennisPlayerProfile(Base):
    """
    Static player profile data sourced from Jeff Sackmann's tennis_atp/wta datasets.
    One row per player, linked to CoreTeam by player_id.
    """
    __tablename__ = "tennis_player_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    player_id: Mapped[str] = mapped_column(ForeignKey("core_teams.id"), nullable=True, unique=True)
    # Jeff Sackmann dataset ID (ATP or WTA numeric ID)
    atp_id: Mapped[str] = mapped_column(String(20), nullable=True)
    # Name fields for fuzzy matching
    name_first: Mapped[str] = mapped_column(String(100), nullable=True)
    name_last: Mapped[str] = mapped_column(String(100), nullable=True)
    name_normalized: Mapped[str] = mapped_column(String(200), nullable=True, index=True)
    # Profile data
    nationality: Mapped[str] = mapped_column(String(10), nullable=True)   # ISO country code e.g. "SRB"
    hand: Mapped[str] = mapped_column(String(20), nullable=True)           # "Right-handed" | "Left-handed"
    dob: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    height_cm: Mapped[int] = mapped_column(Integer, nullable=True)
    turned_pro: Mapped[int] = mapped_column(Integer, nullable=True)
    # Career stats (computed from our CoreMatch history + Sackmann data)
    career_titles: Mapped[int] = mapped_column(Integer, nullable=True)
    career_grand_slams: Mapped[int] = mapped_column(Integer, nullable=True)
    career_wins: Mapped[int] = mapped_column(Integer, nullable=True)
    career_losses: Mapped[int] = mapped_column(Integer, nullable=True)
    career_win_pct: Mapped[float] = mapped_column(Float, nullable=True)
    # Live ranking (synced from api-tennis.com get_players)
    ranking: Mapped[int] = mapped_column(Integer, nullable=True)
    ranking_points: Mapped[int] = mapped_column(Integer, nullable=True)
    logo_url: Mapped[str] = mapped_column(String(500), nullable=True)
    # Current season
    season_wins: Mapped[int] = mapped_column(Integer, nullable=True)
    season_losses: Mapped[int] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("name_normalized", name="uq_tennis_player_profile_name"),
    )
