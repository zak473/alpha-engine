"""
TrackedPick model — user's tracked bet queue selections.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class TrackedPick(Base):
    """
    A pick the user has 'tracked' from their queue.
    Settlement is applied automatically when the match result is known.
    """
    __tablename__ = "tracked_picks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(100), nullable=False)

    # Match context
    match_id: Mapped[str] = mapped_column(String(36), nullable=False)
    match_label: Mapped[str] = mapped_column(String(300), nullable=False)
    sport: Mapped[str] = mapped_column(String(20), nullable=False)
    league: Mapped[str] = mapped_column(String(200), nullable=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Selection
    market_name: Mapped[str] = mapped_column(String(100), nullable=False)
    selection_label: Mapped[str] = mapped_column(String(200), nullable=False)
    odds: Mapped[float] = mapped_column(Float, nullable=False)
    edge: Mapped[float] = mapped_column(Float, nullable=True)  # model_prob - implied_prob

    # Kelly staking
    kelly_fraction: Mapped[float] = mapped_column(Float, nullable=True)   # full Kelly (0–1)
    stake_fraction: Mapped[float] = mapped_column(Float, nullable=True)   # fractional Kelly applied

    # Closing line value — populated at settlement time
    closing_odds: Mapped[float] = mapped_column(Float, nullable=True)     # final market odds
    clv: Mapped[float] = mapped_column(Float, nullable=True)              # (closing_odds - pick_odds) / pick_odds

    # Source
    auto_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Settlement — null = pending, "won" | "lost" | "void"
    outcome: Mapped[str] = mapped_column(String(20), nullable=True)
    settled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_tracked_picks_user", "user_id"),
        Index("ix_tracked_picks_match", "match_id"),
        Index("ix_tracked_picks_created", "created_at"),
    )
