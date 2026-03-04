"""
Soccer-specific database models.

These tables extend the shared Match record with soccer-specific detail.
All soccer data joins back to matches.id — never stores duplicated identity.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import Base


class SoccerMatch(Base):
    """
    Soccer-specific match detail. One-to-one with matches.
    """
    __tablename__ = "soccer_matches"

    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id"), primary_key=True)

    # Surface / conditions
    pitch_type: Mapped[str] = mapped_column(String(50), nullable=True)   # "grass", "artificial"
    is_neutral_venue: Mapped[bool] = mapped_column(Boolean, default=False)

    # Weather snapshot at kickoff
    temperature_c: Mapped[float] = mapped_column(Float, nullable=True)
    humidity_pct: Mapped[float] = mapped_column(Float, nullable=True)
    wind_speed_kmh: Mapped[float] = mapped_column(Float, nullable=True)
    precipitation_mm: Mapped[float] = mapped_column(Float, nullable=True)

    # Schedule context
    home_days_rest: Mapped[int] = mapped_column(Integer, nullable=True)
    away_days_rest: Mapped[int] = mapped_column(Integer, nullable=True)
    home_travel_km: Mapped[float] = mapped_column(Float, nullable=True)
    away_travel_km: Mapped[float] = mapped_column(Float, nullable=True)
    round_number: Mapped[int] = mapped_column(Integer, nullable=True)
    matchweek: Mapped[int] = mapped_column(Integer, nullable=True)

    # Result detail
    home_ht_score: Mapped[int] = mapped_column(Integer, nullable=True)  # half-time
    away_ht_score: Mapped[int] = mapped_column(Integer, nullable=True)
    home_et_score: Mapped[int] = mapped_column(Integer, nullable=True)  # extra time
    away_et_score: Mapped[int] = mapped_column(Integer, nullable=True)
    went_to_penalties: Mapped[bool] = mapped_column(Boolean, default=False)

    team_stats: Mapped[list["SoccerTeamMatchStats"]] = relationship(back_populates="soccer_match")
    player_stats: Mapped[list["SoccerPlayerMatchStats"]] = relationship(back_populates="soccer_match")
    lineups: Mapped[list["SoccerLineup"]] = relationship(back_populates="soccer_match")
    injuries: Mapped[list["SoccerInjury"]] = relationship(back_populates="soccer_match")


class SoccerTeamMatchStats(Base):
    """
    Team-level statistics for one team in one soccer match.
    Two rows per match (home + away).
    """
    __tablename__ = "soccer_team_match_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(ForeignKey("soccer_matches.match_id"), nullable=False)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    is_home: Mapped[bool] = mapped_column(Boolean, nullable=False)

    # Shots
    shots_total: Mapped[int] = mapped_column(Integer, nullable=True)
    shots_on_target: Mapped[int] = mapped_column(Integer, nullable=True)
    shots_off_target: Mapped[int] = mapped_column(Integer, nullable=True)
    shots_blocked: Mapped[int] = mapped_column(Integer, nullable=True)

    # Expected goals
    xg: Mapped[float] = mapped_column(Float, nullable=True)
    xga: Mapped[float] = mapped_column(Float, nullable=True)
    xg_ot: Mapped[float] = mapped_column(Float, nullable=True)   # open play xG
    np_xg: Mapped[float] = mapped_column(Float, nullable=True)   # non-penalty xG

    # Possession & passing
    possession_pct: Mapped[float] = mapped_column(Float, nullable=True)
    passes_total: Mapped[int] = mapped_column(Integer, nullable=True)
    passes_completed: Mapped[int] = mapped_column(Integer, nullable=True)
    pass_accuracy_pct: Mapped[float] = mapped_column(Float, nullable=True)
    progressive_passes: Mapped[int] = mapped_column(Integer, nullable=True)
    key_passes: Mapped[int] = mapped_column(Integer, nullable=True)

    # Pressing
    ppda: Mapped[float] = mapped_column(Float, nullable=True)          # passes per defensive action
    high_press_pct: Mapped[float] = mapped_column(Float, nullable=True)
    defensive_actions: Mapped[int] = mapped_column(Integer, nullable=True)
    tackles_won: Mapped[int] = mapped_column(Integer, nullable=True)
    interceptions: Mapped[int] = mapped_column(Integer, nullable=True)

    # Set pieces
    corners: Mapped[int] = mapped_column(Integer, nullable=True)
    free_kicks: Mapped[int] = mapped_column(Integer, nullable=True)

    # Discipline
    fouls: Mapped[int] = mapped_column(Integer, nullable=True)
    yellow_cards: Mapped[int] = mapped_column(Integer, nullable=True)
    red_cards: Mapped[int] = mapped_column(Integer, nullable=True)

    # Advanced
    xpts: Mapped[float] = mapped_column(Float, nullable=True)          # expected points from xG
    deep_completions: Mapped[int] = mapped_column(Integer, nullable=True)
    obv: Mapped[float] = mapped_column(Float, nullable=True)           # on-ball value

    soccer_match: Mapped["SoccerMatch"] = relationship(back_populates="team_stats")

    __table_args__ = (
        UniqueConstraint("match_id", "team_id", name="uq_soccer_team_match_stats"),
    )


class SoccerPlayerMatchStats(Base):
    """
    Player-level statistics for a single player in a single soccer match.
    """
    __tablename__ = "soccer_player_match_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(ForeignKey("soccer_matches.match_id"), nullable=False)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), nullable=False)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    is_home: Mapped[bool] = mapped_column(Boolean, nullable=False)
    position: Mapped[str] = mapped_column(String(10), nullable=True)   # GK, CB, CM, ST, etc.

    minutes_played: Mapped[int] = mapped_column(Integer, nullable=True)
    goals: Mapped[int] = mapped_column(Integer, default=0)
    assists: Mapped[int] = mapped_column(Integer, default=0)
    xg: Mapped[float] = mapped_column(Float, nullable=True)
    xa: Mapped[float] = mapped_column(Float, nullable=True)
    shots: Mapped[int] = mapped_column(Integer, nullable=True)
    shots_on_target: Mapped[int] = mapped_column(Integer, nullable=True)
    key_passes: Mapped[int] = mapped_column(Integer, nullable=True)
    dribbles_completed: Mapped[int] = mapped_column(Integer, nullable=True)
    progressive_carries: Mapped[int] = mapped_column(Integer, nullable=True)
    tackles: Mapped[int] = mapped_column(Integer, nullable=True)
    interceptions: Mapped[int] = mapped_column(Integer, nullable=True)
    aerials_won: Mapped[int] = mapped_column(Integer, nullable=True)
    yellow_card: Mapped[bool] = mapped_column(Boolean, default=False)
    red_card: Mapped[bool] = mapped_column(Boolean, default=False)
    rating: Mapped[float] = mapped_column(Float, nullable=True)        # WhoScored/Sofascore-style

    soccer_match: Mapped["SoccerMatch"] = relationship(back_populates="player_stats")


class SoccerLineup(Base):
    """
    Declared lineup for a team in a match (pre-match or actual).
    Used for lineup strength differential feature engineering.
    """
    __tablename__ = "soccer_lineups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(ForeignKey("soccer_matches.match_id"), nullable=False)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    is_home: Mapped[bool] = mapped_column(Boolean, nullable=False)
    lineup_type: Mapped[str] = mapped_column(String(20), default="starting")  # "starting" | "confirmed"
    formation: Mapped[str] = mapped_column(String(20), nullable=True)          # "4-3-3", "4-2-3-1"
    players_json: Mapped[list] = mapped_column(JSON, default=list)             # [{player_id, position, squad_number}]
    lineup_elo_avg: Mapped[float] = mapped_column(Float, nullable=True)       # pre-computed lineup strength
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    soccer_match: Mapped["SoccerMatch"] = relationship(back_populates="lineups")


class SoccerInjury(Base):
    """
    Player injury/suspension record. Tied to a match for impact modelling.
    """
    __tablename__ = "soccer_injuries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), nullable=False)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    match_id: Mapped[str] = mapped_column(ForeignKey("soccer_matches.match_id"), nullable=True)  # match they're missing
    injury_type: Mapped[str] = mapped_column(String(100), nullable=True)  # "hamstring", "suspension", etc.
    expected_return_date: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    player_elo: Mapped[float] = mapped_column(Float, nullable=True)  # snapshot at time of injury
    impact_score: Mapped[float] = mapped_column(Float, nullable=True)  # computed contribution to team strength

    soccer_match: Mapped["SoccerMatch"] = relationship(back_populates="injuries")


class SoccerTeamForm(Base):
    """
    Rolling form features for a team. One row per team per as-of date.
    Pre-computed by the feature pipeline to avoid recalculation on each prediction.
    """
    __tablename__ = "soccer_team_form"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    as_of_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    window_days: Mapped[int] = mapped_column(Integer, default=60)   # rolling window used

    # Form stats
    matches_played: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    draws: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    goals_scored: Mapped[float] = mapped_column(Float, default=0.0)
    goals_conceded: Mapped[float] = mapped_column(Float, default=0.0)
    xg_avg: Mapped[float] = mapped_column(Float, nullable=True)
    xga_avg: Mapped[float] = mapped_column(Float, nullable=True)
    xpts_avg: Mapped[float] = mapped_column(Float, nullable=True)
    ppda_avg: Mapped[float] = mapped_column(Float, nullable=True)
    possession_avg: Mapped[float] = mapped_column(Float, nullable=True)
    clean_sheets: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        UniqueConstraint("team_id", "as_of_date", "window_days", name="uq_soccer_team_form"),
    )
