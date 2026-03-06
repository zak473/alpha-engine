"""HLTV scraped match stats — map scores, player stats, veto."""
from __future__ import annotations
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from db.base import Base


class HltvMatchStats(Base):
    __tablename__ = "hltv_match_stats"

    core_match_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("core_matches.id", ondelete="CASCADE"), primary_key=True
    )
    hltv_match_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True, unique=True)

    # e.g. [{"map_name":"Nuke","home_score":13,"away_score":5,"half_text":"(11:1;2:4)","winner":"home"}]
    maps: Mapped[list] = mapped_column(JSON, default=list)

    # e.g. [{"name":"misutaaa","kd_diff":"+7.20%","kills":46,"deaths":24,"adr":121.3,"kast_pct":0.805,"rating_2":1.91}]
    players_home: Mapped[list] = mapped_column(JSON, default=list)
    players_away: Mapped[list] = mapped_column(JSON, default=list)

    # Raw veto text from HLTV veto-box div
    veto_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    format: Mapped[str | None] = mapped_column(String(10), nullable=True)  # "bo1","bo3","bo5"
    is_lan: Mapped[bool] = mapped_column(Boolean, default=False)

    scraped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
