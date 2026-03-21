"""Tipster community API — profiles, tips, and follow state.

All data is DB-backed. No hardcoded seed data.

Tipster profiles are derived from the users table — any user who has posted
at least one tip is surfaced as a tipster. Stats (win rate, follower count,
active tips) are computed live from tipster_tips and tipster_follows.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from db.models.tipsters import TipsterFollow, TipsterTip
from db.models.user import User

router = APIRouter(prefix="/tipsters", tags=["Tipsters"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class TipsterProfile(BaseModel):
    id: str
    username: str
    bio: Optional[str] = None
    is_ai: bool = False
    followers: int
    is_following: bool
    weekly_win_rate: float
    total_picks: int
    won_picks: int
    active_tips_count: int
    recent_results: list[str]


class TipsterTipSchema(BaseModel):
    id: str
    sport: str
    match_label: str
    market_name: str
    selection_label: str
    odds: float
    outcome: Optional[str] = None
    start_time: str
    note: Optional[str] = None


class PostTipIn(BaseModel):
    sport: str
    match_label: str
    selection_label: str
    market_name: str
    odds: float
    start_time: Optional[str] = None
    note: Optional[str] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _build_profile(
    db: Session,
    user: User,
    current_user_id: Optional[str],
) -> TipsterProfile:
    """Compute stats for one tipster from DB."""
    # Follower count
    followers = db.query(func.count(TipsterFollow.id)).filter(
        TipsterFollow.tipster_id == user.id
    ).scalar() or 0

    # Is the requesting user following this tipster?
    is_following = False
    if current_user_id:
        is_following = db.query(TipsterFollow).filter_by(
            follower_id=current_user_id,
            tipster_id=user.id,
        ).first() is not None

    # All-time pick counts
    total_picks = db.query(func.count(TipsterTip.id)).filter(
        TipsterTip.user_id == user.id
    ).scalar() or 0

    won_picks = db.query(func.count(TipsterTip.id)).filter(
        TipsterTip.user_id == user.id,
        TipsterTip.outcome == "won",
    ).scalar() or 0

    # Active (unsettled) tips
    active_tips_count = db.query(func.count(TipsterTip.id)).filter(
        TipsterTip.user_id == user.id,
        TipsterTip.outcome.is_(None),
    ).scalar() or 0

    # Weekly win rate: settled picks in last 7 days
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    weekly_settled = db.query(func.count(TipsterTip.id)).filter(
        TipsterTip.user_id == user.id,
        TipsterTip.settled_at >= cutoff,
        TipsterTip.outcome.in_(["won", "lost"]),
    ).scalar() or 0

    weekly_won = db.query(func.count(TipsterTip.id)).filter(
        TipsterTip.user_id == user.id,
        TipsterTip.settled_at >= cutoff,
        TipsterTip.outcome == "won",
    ).scalar() or 0

    weekly_win_rate = (weekly_won / weekly_settled) if weekly_settled > 0 else 0.0

    # Recent results: last 8 settled picks newest-first
    recent_tips = (
        db.query(TipsterTip)
        .filter(
            TipsterTip.user_id == user.id,
            TipsterTip.outcome.in_(["won", "lost"]),
        )
        .order_by(TipsterTip.settled_at.desc())
        .limit(8)
        .all()
    )
    recent_results = ["W" if t.outcome == "won" else "L" for t in recent_tips]

    return TipsterProfile(
        id=user.id,
        username=user.display_name or user.email.split("@")[0],
        bio=user.bio,
        is_ai=user.is_ai,
        followers=followers,
        is_following=is_following,
        weekly_win_rate=round(weekly_win_rate, 4),
        total_picks=total_picks,
        won_picks=won_picks,
        active_tips_count=active_tips_count,
        recent_results=recent_results,
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TipsterProfile])
def list_tipsters(
    db: Session = Depends(get_db),
    current_user_id: Optional[str] = Query(None, alias="viewer_id"),
):
    """
    Return all users who have posted at least one tip, with computed stats.
    Pass ?viewer_id=<user_id> (or rely on auth middleware) to populate is_following.
    """
    # Users who have posted tips OR are AI tipster accounts
    tipster_ids_q = db.query(TipsterTip.user_id).distinct().subquery()
    users = (
        db.query(User)
        .filter(
            (User.id.in_(tipster_ids_q)) | (User.is_ai == True)  # noqa: E712
        )
        .all()
    )

    return [_build_profile(db, u, current_user_id) for u in users]


@router.get("/{tipster_id}", response_model=TipsterProfile)
def get_tipster(
    tipster_id: str,
    db: Session = Depends(get_db),
    current_user_id: Optional[str] = Query(None, alias="viewer_id"),
):
    """Return a single tipster's profile."""
    user = db.get(User, tipster_id)
    if user is None:
        raise HTTPException(status_code=404, detail=f"Tipster {tipster_id} not found")
    return _build_profile(db, user, current_user_id)


@router.get("/{tipster_id}/tips", response_model=list[TipsterTipSchema])
def get_tipster_tips(
    tipster_id: str,
    include_settled: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Return tips for a tipster. Pending tips only by default."""
    query = db.query(TipsterTip).filter(TipsterTip.user_id == tipster_id)
    if not include_settled:
        query = query.filter(TipsterTip.outcome.is_(None))
    tips = query.order_by(TipsterTip.start_time.asc()).all()

    return [
        TipsterTipSchema(
            id=t.id,
            sport=t.sport,
            match_label=t.match_label,
            market_name=t.market_name,
            selection_label=t.selection_label,
            odds=t.odds,
            outcome=t.outcome,
            start_time=t.start_time.isoformat() if t.start_time else "",
            note=t.note,
        )
        for t in tips
    ]


@router.post("/tips", status_code=201)
def post_tip(
    body: PostTipIn,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user),
):
    """Post a new tip as the authenticated user."""
    # Verify the user exists
    user = db.get(User, current_user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    start_time = (
        datetime.fromisoformat(body.start_time.replace("Z", "+00:00"))
        if body.start_time
        else datetime.now(timezone.utc)
    )

    tip = TipsterTip(
        user_id=current_user_id,
        sport=body.sport,
        match_label=body.match_label,
        market_name=body.market_name,
        selection_label=body.selection_label,
        odds=body.odds,
        start_time=start_time,
        note=body.note,
    )
    db.add(tip)
    db.commit()
    db.refresh(tip)
    return {"status": "ok", "id": tip.id}


@router.post("/{tipster_id}/follow", status_code=200)
def follow_tipster(
    tipster_id: str,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user),
):
    """Follow a tipster. Idempotent."""
    if current_user_id == tipster_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")

    tipster = db.get(User, tipster_id)
    if tipster is None:
        raise HTTPException(status_code=404, detail=f"Tipster {tipster_id} not found")

    existing = db.query(TipsterFollow).filter_by(
        follower_id=current_user_id,
        tipster_id=tipster_id,
    ).first()

    if not existing:
        db.add(TipsterFollow(follower_id=current_user_id, tipster_id=tipster_id))
        db.commit()

    return {"status": "ok", "following": True}


@router.delete("/{tipster_id}/follow", status_code=200)
def unfollow_tipster(
    tipster_id: str,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user),
):
    """Unfollow a tipster. Idempotent."""
    existing = db.query(TipsterFollow).filter_by(
        follower_id=current_user_id,
        tipster_id=tipster_id,
    ).first()

    if existing:
        db.delete(existing)
        db.commit()

    return {"status": "ok", "following": False}
