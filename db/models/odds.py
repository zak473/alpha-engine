"""
MarketOdds — timestamped odds snapshots from external bookmakers.
One row per (match, bookmaker, market, recorded_at).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class MarketOdds(Base):
    """
    Odds snapshot from a bookmaker at a point in time.
    Enables closing line value (CLV) tracking and real edge calculation.
    """
    __tablename__ = "market_odds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)

    # Match reference
    match_id: Mapped[str] = mapped_column(String(36), nullable=False)
    sport: Mapped[str] = mapped_column(String(20), nullable=False)

    # Source
    bookmaker: Mapped[str] = mapped_column(String(100), nullable=False)  # "pinnacle", "bet365", etc.
    market: Mapped[str] = mapped_column(String(50), nullable=False)       # "h2h", "spreads", "totals"

    # Odds (decimal) — null when not available for that market
    home_odds: Mapped[float] = mapped_column(Float, nullable=True)
    draw_odds: Mapped[float] = mapped_column(Float, nullable=True)
    away_odds: Mapped[float] = mapped_column(Float, nullable=True)

    # When this snapshot was taken
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Whether this is the closing line (set True on last snapshot before kickoff)
    is_closing: Mapped[bool] = mapped_column(nullable=False, default=False)

    __table_args__ = (
        Index("ix_market_odds_match", "match_id"),
        Index("ix_market_odds_recorded", "recorded_at"),
        Index("ix_market_odds_closing", "match_id", "is_closing"),
    )
