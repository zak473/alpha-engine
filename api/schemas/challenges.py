"""
Pydantic schemas for the Challenges API.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from pydantic import BaseModel, Field


# ─── Request schemas ──────────────────────────────────────────────────────────

class ChallengeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    visibility: str = Field("public", pattern="^(public|private)$")
    sport_scope: list[str] = Field(default_factory=list)
    start_at: Optional[datetime] = None  # defaults to now
    end_at: Optional[datetime] = None    # defaults to 30 days from now
    max_members: Optional[int] = Field(None, ge=1)
    entry_limit_per_day: Optional[int] = Field(None, ge=1)
    scoring_type: str = Field("points", pattern="^(brier|points)$")


class EntryCreate(BaseModel):
    event_id: str
    sport: str
    event_start_at: datetime
    pick_type: str
    pick_payload: dict[str, Any] = Field(default_factory=dict)
    prediction_payload: dict[str, Any] = Field(default_factory=dict)
    model_version: Optional[str] = None


# ─── Response schemas ─────────────────────────────────────────────────────────

class ChallengeOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    visibility: str
    sport_scope: list[str]
    start_at: datetime
    end_at: datetime
    max_members: Optional[int]
    entry_limit_per_day: Optional[int]
    scoring_type: str
    created_by: str
    created_at: datetime
    member_count: int = 0
    is_member: bool = False
    user_role: Optional[str] = None

    class Config:
        from_attributes = True


class ChallengeMemberOut(BaseModel):
    id: str
    challenge_id: str
    user_id: str
    role: str
    joined_at: datetime
    status: str

    class Config:
        from_attributes = True


class ChallengeEntryOut(BaseModel):
    id: str
    challenge_id: str
    user_id: str
    event_id: str
    sport: str
    event_start_at: datetime
    pick_type: str
    pick_payload: dict[str, Any]
    prediction_payload: dict[str, Any]
    model_version: Optional[str]
    submitted_at: datetime
    locked_at: Optional[datetime]
    status: str
    score_value: Optional[float] = None

    class Config:
        from_attributes = True


class EntryFeedPage(BaseModel):
    items: list[ChallengeEntryOut]
    total: int
    page: int
    page_size: int
    has_next: bool


class LeaderboardRow(BaseModel):
    rank: int
    user_id: str
    score: float
    entry_count: int
    last_activity: Optional[datetime]
    accuracy_score: Optional[float] = None   # brier mode only: correct/(total)


class LeaderboardOut(BaseModel):
    challenge_id: str
    scoring_type: str
    rows: list[LeaderboardRow]
