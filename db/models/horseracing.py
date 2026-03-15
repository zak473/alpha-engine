"""SQLAlchemy models for horse racing tables."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Index, Integer,
    String, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class HorseRace(Base):
    __tablename__ = "horse_races"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)  # race_id from API
    course: Mapped[str] = mapped_column(String(200), nullable=False)
    region: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    race_name: Mapped[str] = mapped_column(String(500), nullable=False)
    race_class: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    race_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # Flat/Hurdle/Chase
    distance_f: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # furlongs
    going: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    surface: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    pattern: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    age_band: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    rating_band: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sex_restriction: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    prize: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    field_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    off_time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # "14:30"
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="scheduled")  # scheduled/live/finished
    season: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    extras_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("ix_horse_races_scheduled_at", "scheduled_at"),
        Index("ix_horse_races_status", "status"),
        Index("ix_horse_races_course", "course"),
    )


class HorseRunner(Base):
    __tablename__ = "horse_runners"

    id: Mapped[str] = mapped_column(String(200), primary_key=True)  # f"{race_id}_{horse_id}"
    race_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("horse_races.id", ondelete="CASCADE"), nullable=False
    )
    horse_name: Mapped[str] = mapped_column(String(200), nullable=False)
    horse_id: Mapped[str] = mapped_column(String(100), nullable=False)
    number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    draw: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    jockey: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    jockey_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    trainer: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    trainer_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sex: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    colour: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    sire: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    dam: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    lbs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ofr: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # official rating string
    form: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # e.g. "3151-"
    last_run: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    headgear: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_non_runner: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # starting price decimal
    beaten_lengths: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    extras_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    __table_args__ = (
        Index("ix_horse_runners_race_id", "race_id"),
        Index("ix_horse_runners_horse_id", "horse_id"),
    )
