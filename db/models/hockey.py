"""SQLAlchemy models for hockey stats tables."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class HockeyTeamMatchStats(Base):
    __tablename__ = "hockey_team_match_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_matches.id"), nullable=False)
    team_id: Mapped[str] = mapped_column(String(36), nullable=False)
    is_home: Mapped[bool] = mapped_column(Boolean, nullable=False)

    # Scoring
    goals: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    goals_p1: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    goals_p2: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    goals_p3: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    goals_ot: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Shots
    shots: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    shots_on_goal: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    save_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Special teams
    power_play_goals: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    power_play_opportunities: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    power_play_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    penalty_kill_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    penalty_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Faceoffs
    faceoff_wins: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    faceoff_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    faceoff_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Other
    hits: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    blocked_shots: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    giveaways: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    takeaways: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
