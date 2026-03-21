"""Tipster community models: tips posted by users and follow relationships."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from typing import Optional

from sqlalchemy import DateTime, Float, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class TipsterTip(Base):
    """
    A tip posted by a user acting as a tipster.
    outcome: None = pending | "won" | "lost" | "void"
    """
    __tablename__ = "tipster_tips"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)           # FK → users.id
    sport: Mapped[str] = mapped_column(String(20), nullable=False)
    match_label: Mapped[str] = mapped_column(String(200), nullable=False)      # free text
    market_name: Mapped[str] = mapped_column(String(100), nullable=False)
    selection_label: Mapped[str] = mapped_column(String(200), nullable=False)
    odds: Mapped[float] = mapped_column(Float, nullable=False)
    outcome: Mapped[str] = mapped_column(String(20), nullable=True)            # won|lost|void|None
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    match_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True) # FK → core_matches.id (AI tips only)
    note: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    settled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_tipster_tips_user_id", "user_id"),
        Index("ix_tipster_tips_outcome", "outcome"),
        Index("ix_tipster_tips_user_outcome", "user_id", "outcome"),
        Index("ix_tipster_tips_match_id", "match_id"),
    )


class TipsterFollow(Base):
    """Follow relationship: follower_id follows tipster_id."""
    __tablename__ = "tipster_follows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    follower_id: Mapped[str] = mapped_column(String(36), nullable=False)       # FK → users.id
    tipster_id: Mapped[str] = mapped_column(String(36), nullable=False)        # FK → users.id
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("follower_id", "tipster_id", name="uq_tipster_follow"),
        Index("ix_tipster_follows_tipster_id", "tipster_id"),
        Index("ix_tipster_follows_follower_id", "follower_id"),
    )
