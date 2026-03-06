"""
Bankroll model — tracks user's betting bankroll over time.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class BankrollSnapshot(Base):
    """
    Daily bankroll snapshot. One row per (user_id, date).
    Created automatically by the auto-pick settlement process and manually
    when the user deposits/withdraws.
    """
    __tablename__ = "bankroll_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(100), nullable=False)

    # Balance after this event
    balance: Mapped[float] = mapped_column(Float, nullable=False)

    # What caused this snapshot: "deposit" | "withdrawal" | "pick_settled" | "daily"
    event_type: Mapped[str] = mapped_column(String(30), nullable=False, default="daily")

    # Optional reference to the pick that caused this (for pick_settled events)
    pick_id: Mapped[str] = mapped_column(String(36), nullable=True)

    # P&L for this event (positive = profit, negative = loss)
    pnl: Mapped[float] = mapped_column(Float, nullable=True)

    notes: Mapped[str] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_bankroll_user", "user_id"),
        Index("ix_bankroll_created", "created_at"),
    )
