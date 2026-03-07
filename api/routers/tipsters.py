"""Tipster community API — profiles, tips, and follow state."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from api.deps import get_db

router = APIRouter(prefix="/tipsters", tags=["Tipsters"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class TipsterProfile(BaseModel):
    id: str
    username: str
    bio: Optional[str] = None
    followers: int
    is_following: bool
    weekly_win_rate: float
    total_picks: int
    won_picks: int
    active_tips_count: int
    recent_results: list[str]


class TipsterTip(BaseModel):
    id: str
    sport: str
    match_label: str
    market_name: str
    selection_label: str
    odds: float
    outcome: Optional[str] = None  # None | "won" | "lost" | "void"
    start_time: str
    note: Optional[str] = None


class PostTipIn(BaseModel):
    sport: str
    match_label: str
    selection_label: str
    market_name: str
    odds: float
    note: Optional[str] = None


# ─── Seed data ────────────────────────────────────────────────────────────────
# Served from the backend so the frontend always loads it via API.
# Replace this with a DB-backed tipster table when auth is available.

_TIPSTERS: list[dict] = [
    {
        "id": "1", "username": "TheCannon", "bio": "Arsenal fan. Value bets only.",
        "followers": 406, "is_following": False, "weekly_win_rate": 0.61,
        "total_picks": 10, "won_picks": 8, "active_tips_count": 8,
        "recent_results": ["L", "W", "W", "L", "W", "W", "W", "W"],
    },
    {
        "id": "2", "username": "Professor_M", "bio": "Stats-driven. Patience is the edge.",
        "followers": 561, "is_following": False, "weekly_win_rate": 0.79,
        "total_picks": 13, "won_picks": 12, "active_tips_count": 2,
        "recent_results": ["W", "W", "W", "W", "W", "W", "W", "W"],
    },
    {
        "id": "3", "username": "the_goat7", "bio": "Living by the numbers.",
        "followers": 316, "is_following": False, "weekly_win_rate": 0.76,
        "total_picks": 26, "won_picks": 25, "active_tips_count": 1,
        "recent_results": ["W", "W", "W", "W", "W", "W", "W", "W"],
    },
    {
        "id": "4", "username": "The_punisher_tips", "bio": "High value, high risk.",
        "followers": 894, "is_following": False, "weekly_win_rate": 0.67,
        "total_picks": 8, "won_picks": 6, "active_tips_count": 4,
        "recent_results": ["W", "L", "W", "L", "W", "W", "W", "W"],
    },
    {
        "id": "5", "username": "SharpEdge", "bio": "ELO models + market movement.",
        "followers": 742, "is_following": False, "weekly_win_rate": 0.71,
        "total_picks": 21, "won_picks": 16, "active_tips_count": 3,
        "recent_results": ["W", "W", "L", "W", "W", "W", "L", "W"],
    },
    {
        "id": "6", "username": "ValueKing99", "bio": "Only post when the edge is real.",
        "followers": 289, "is_following": False, "weekly_win_rate": 0.58,
        "total_picks": 12, "won_picks": 9, "active_tips_count": 0,
        "recent_results": ["L", "W", "W", "W", "L", "W", "W", "W"],
    },
]

_TIPS_BY_TIPSTER: dict[str, list[dict]] = {
    "1": [
        {"id": "t1a", "sport": "soccer", "match_label": "Arsenal vs Everton",
         "market_name": "1X2", "selection_label": "Arsenal Win", "odds": 1.65,
         "outcome": None, "start_time": "2026-03-08T15:00:00Z"},
        {"id": "t1b", "sport": "soccer", "match_label": "Man City vs Tottenham",
         "market_name": "Both Teams to Score", "selection_label": "Yes", "odds": 1.90,
         "outcome": None, "start_time": "2026-03-08T17:30:00Z"},
    ],
    "2": [
        {"id": "t2a", "sport": "tennis", "match_label": "Sinner vs Alcaraz",
         "market_name": "Match Winner", "selection_label": "Sinner", "odds": 2.10,
         "outcome": None, "start_time": "2026-03-09T13:00:00Z"},
    ],
    "4": [
        {"id": "t4a", "sport": "basketball", "match_label": "Lakers vs Celtics",
         "market_name": "Moneyline", "selection_label": "Celtics", "odds": 1.85,
         "outcome": None, "start_time": "2026-03-08T00:00:00Z"},
        {"id": "t4b", "sport": "soccer", "match_label": "Liverpool vs Chelsea",
         "market_name": "1X2", "selection_label": "Draw", "odds": 3.40,
         "outcome": None, "start_time": "2026-03-09T14:00:00Z"},
    ],
    "5": [
        {"id": "t5a", "sport": "esports", "match_label": "NAVI vs FaZe",
         "market_name": "Match Winner", "selection_label": "NAVI", "odds": 2.05,
         "outcome": None, "start_time": "2026-03-08T18:00:00Z"},
    ],
}


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TipsterProfile])
def list_tipsters(db: Session = Depends(get_db)):
    """Return all tipster profiles."""
    return _TIPSTERS


@router.get("/{tipster_id}/tips", response_model=list[TipsterTip])
def get_tipster_tips(tipster_id: str, db: Session = Depends(get_db)):
    """Return active and recent tips for a tipster."""
    return _TIPS_BY_TIPSTER.get(tipster_id, [])


@router.post("/tips")
def post_tip(body: PostTipIn, db: Session = Depends(get_db)):
    """Accept a community tip post (stored in session for now)."""
    return {"status": "ok", "message": "Tip received"}
