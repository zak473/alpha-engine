"""SQLAlchemy models for basketball stats tables."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class BasketballTeamMatchStats(Base):
    __tablename__ = "basketball_team_match_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_matches.id"), nullable=False)
    team_id: Mapped[str] = mapped_column(String(36), nullable=False)
    is_home: Mapped[bool] = mapped_column(Boolean, nullable=False)

    # Scoring
    points: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    points_q1: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    points_q2: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    points_q3: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    points_q4: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    points_ot: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Shooting
    fg_made: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fg_attempted: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fg_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fg3_made: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fg3_attempted: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fg3_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ft_made: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ft_attempted: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ft_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Rebounds
    rebounds_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rebounds_offensive: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rebounds_defensive: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Playmaking / Defence
    assists: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    turnovers: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    assists_to_turnover: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    steals: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    blocks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fouls: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Advanced
    plus_minus: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pace: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    offensive_rating: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    defensive_rating: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    net_rating: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("match_id", "team_id", name="uq_bball_team_match_stats"),
    )


class BasketballPlayerMatchStats(Base):
    __tablename__ = "basketball_player_match_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_matches.id"), nullable=False)
    team_id: Mapped[str] = mapped_column(String(36), nullable=False)
    is_home: Mapped[bool] = mapped_column(Boolean, nullable=False)
    player_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    player_name: Mapped[str] = mapped_column(String(200), nullable=False)
    position: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    jersey: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    is_starter: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    minutes: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    points: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rebounds_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rebounds_offensive: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rebounds_defensive: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    assists: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    steals: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    blocks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    turnovers: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fouls: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    plus_minus: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    fg_made: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fg_attempted: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fg_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fg3_made: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fg3_attempted: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fg3_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ft_made: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ft_attempted: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ft_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
