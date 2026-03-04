"""
Challenges module DB models — Zone 7.

Tables:
    challenges           — challenge definitions
    challenge_members    — membership roster
    challenge_entries    — picks submitted by members
    challenge_entry_results — settled scores per entry
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime, Float, ForeignKey, Index, Integer,
    JSON, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# challenges
# ---------------------------------------------------------------------------

class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    visibility: Mapped[str] = mapped_column(String(20), default="public")     # public|private
    sport_scope: Mapped[list] = mapped_column(JSON, default=list)             # [] = all sports
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    max_members: Mapped[int] = mapped_column(Integer, nullable=True)          # None = unlimited
    entry_limit_per_day: Mapped[int] = mapped_column(Integer, nullable=True)  # None = unlimited
    scoring_type: Mapped[str] = mapped_column(String(20), default="points")   # brier|points
    created_by: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_challenges_visibility", "visibility"),
        Index("ix_challenges_created_by", "created_by"),
        Index("ix_challenges_start_at", "start_at"),
    )


# ---------------------------------------------------------------------------
# challenge_members
# ---------------------------------------------------------------------------

class ChallengeMember(Base):
    __tablename__ = "challenge_members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    challenge_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("challenges.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="member")   # owner|member
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[str] = mapped_column(String(20), default="active") # active|left|banned

    __table_args__ = (
        UniqueConstraint("challenge_id", "user_id", name="uq_challenge_members"),
        Index("ix_challenge_members_challenge", "challenge_id"),
        Index("ix_challenge_members_user", "user_id"),
    )


# ---------------------------------------------------------------------------
# challenge_entries
# ---------------------------------------------------------------------------

class ChallengeEntry(Base):
    __tablename__ = "challenge_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    challenge_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("challenges.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    event_id: Mapped[str] = mapped_column(String(36), nullable=False)
    sport: Mapped[str] = mapped_column(String(50), nullable=False)
    event_start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    pick_type: Mapped[str] = mapped_column(String(50), nullable=False)     # home_win|draw|away_win|etc
    pick_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    prediction_payload: Mapped[dict] = mapped_column(JSON, default=dict)   # model snapshot at submit time
    model_version: Mapped[str] = mapped_column(String(100), nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    locked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open")        # open|locked|settled|void

    __table_args__ = (
        Index("ix_challenge_entries_challenge", "challenge_id"),
        Index("ix_challenge_entries_user", "user_id"),
        Index("ix_challenge_entries_event", "event_id"),
        Index("ix_challenge_entries_status", "status"),
        Index("ix_challenge_entries_submitted", "submitted_at"),
    )


# ---------------------------------------------------------------------------
# challenge_entry_results
# ---------------------------------------------------------------------------

class ChallengeEntryResult(Base):
    __tablename__ = "challenge_entry_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    entry_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("challenge_entries.id", ondelete="CASCADE"),
        nullable=False, unique=True
    )
    outcome_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    settled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    score_value: Mapped[float] = mapped_column(Float, nullable=False)

    __table_args__ = (
        Index("ix_challenge_entry_results_entry", "entry_id"),
    )
