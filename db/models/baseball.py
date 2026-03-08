"""SQLAlchemy models for baseball stats tables (migration 0004)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class BaseballTeamMatchStats(Base):
    __tablename__ = "baseball_team_match_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_matches.id"), nullable=False)
    team_id: Mapped[str] = mapped_column(String(36), nullable=False)
    is_home: Mapped[bool] = mapped_column(Boolean, nullable=False)

    # Batting
    runs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    hits: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    doubles: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    triples: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    home_runs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rbi: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    walks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    strikeouts_batting: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    batting_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    obp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    slg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ops: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    left_on_base: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Pitching
    era: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    innings_pitched: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    hits_allowed: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    earned_runs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    walks_allowed: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    strikeouts_pitching: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    whip: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pitcher_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    pitcher_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Fielding
    errors: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    double_plays: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class BaseballPlayerMatchStats(Base):
    __tablename__ = "baseball_player_match_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_matches.id"), nullable=False)
    team_id: Mapped[str] = mapped_column(String(36), nullable=False)
    is_home: Mapped[bool] = mapped_column(Boolean, nullable=False)
    player_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    player_name: Mapped[str] = mapped_column(String(200), nullable=False)
    position: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    batting_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_starter: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    hand: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)

    # Game stats
    at_bats: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    runs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    hits: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    doubles: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    triples: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    home_runs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rbi: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    walks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    strikeouts: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    stolen_bases: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    left_on_base: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Season stats (for context)
    batting_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    obp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    slg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ops: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class EventContext(Base):
    __tablename__ = "event_context"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_matches.id"), nullable=False, unique=True)
    venue_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    venue_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    venue_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    attendance: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    neutral_site: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    weather_desc: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    temperature_c: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    wind_speed_kmh: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    precipitation_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    inning_scores_json: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)  # JSON list of {inning, home, away}

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
