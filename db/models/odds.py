"""
MarketOdds — timestamped odds snapshots from external bookmakers.
SpreadOdds — spread and over/under lines from SGO, one row per (match, market_type, side).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, Index, String, UniqueConstraint, func
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


class SpreadOdds(Base):
    """
    Spread (handicap) and over/under lines from SGO.
    One row per (match_id, market_type, side) — upserted each fetch cycle.

    market_type: "spread" | "total"
    side:        "home" | "away" (spread) | "over" | "under" (total)
    line:        spread line (e.g. -5.5 for home fav) or total line (e.g. 225.5)
    """
    __tablename__ = "spread_odds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)

    match_id: Mapped[str] = mapped_column(String(36), nullable=False)
    sport: Mapped[str] = mapped_column(String(20), nullable=False)

    market_type: Mapped[str] = mapped_column(String(10), nullable=False)   # "spread" | "total"
    side: Mapped[str] = mapped_column(String(10), nullable=False)           # "home"|"away"|"over"|"under"
    line: Mapped[float] = mapped_column(Float, nullable=False)              # handicap or total line

    book_odds_decimal: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fair_odds_decimal: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    book_available: Mapped[bool] = mapped_column(nullable=False, default=False)

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("match_id", "market_type", "side", name="uq_spread_odds"),
        Index("ix_spread_odds_match", "match_id"),
    )
