"""Horse racing API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class RunnerOut(BaseModel):
    horse_id: str
    horse_name: str
    number: Optional[int] = None
    draw: Optional[int] = None
    jockey: Optional[str] = None
    trainer: Optional[str] = None
    age: Optional[int] = None
    sex: Optional[str] = None
    colour: Optional[str] = None
    sire: Optional[str] = None
    dam: Optional[str] = None
    lbs: Optional[int] = None
    ofr: Optional[str] = None
    form: Optional[str] = None
    last_run: Optional[str] = None
    headgear: Optional[str] = None
    is_non_runner: bool = False
    position: Optional[int] = None
    sp: Optional[float] = None
    beaten_lengths: Optional[float] = None
    form_score: Optional[float] = None  # computed from form string


class RaceDetail(BaseModel):
    id: str
    course: str
    region: Optional[str] = None
    race_name: str
    race_class: Optional[str] = None
    race_type: Optional[str] = None
    distance_f: Optional[float] = None
    going: Optional[str] = None
    surface: Optional[str] = None
    pattern: Optional[str] = None
    age_band: Optional[str] = None
    prize: Optional[str] = None
    field_size: Optional[int] = None
    off_time: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    status: str
    runners: list[RunnerOut] = []


class RaceListItem(BaseModel):
    id: str
    course: str
    region: Optional[str] = None
    race_name: str
    race_class: Optional[str] = None
    race_type: Optional[str] = None
    distance_f: Optional[float] = None
    going: Optional[str] = None
    pattern: Optional[str] = None
    off_time: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    status: str
    field_size: Optional[int] = None
    num_runners: int = 0


class RaceListResponse(BaseModel):
    items: list[RaceListItem]
    total: int
