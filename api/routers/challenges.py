"""
Challenges API — /api/v1/challenges
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.deps import get_session, get_current_user
from api.schemas.challenges import (
    ChallengeCreate,
    ChallengeOut,
    ChallengeEntryOut,
    EntryCreate,
    EntryFeedPage,
    LeaderboardOut,
)
from api.services import membership as membership_svc
from api.services import entries as entries_svc
from api.services import leaderboard as leaderboard_svc
from db.models.challenges import Challenge, ChallengeMember, ChallengeEntry, ChallengeEntryResult

router = APIRouter(prefix="/challenges", tags=["Challenges"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _challenge_out(
    challenge: Challenge,
    db: Session,
    user_id: str,
) -> ChallengeOut:
    count = membership_svc.member_count(db, challenge.id)
    member = membership_svc.get_active_member(db, challenge.id, user_id)
    return ChallengeOut(
        id=challenge.id,
        name=challenge.name,
        description=challenge.description,
        visibility=challenge.visibility,
        sport_scope=challenge.sport_scope or [],
        start_at=challenge.start_at,
        end_at=challenge.end_at,
        max_members=challenge.max_members,
        entry_limit_per_day=challenge.entry_limit_per_day,
        scoring_type=challenge.scoring_type,
        created_by=challenge.created_by,
        created_at=challenge.created_at,
        member_count=count,
        is_member=member is not None,
        user_role=member.role if member else None,
    )


def _entry_out(entry: ChallengeEntry, db: Session) -> ChallengeEntryOut:
    result = (
        db.query(ChallengeEntryResult)
        .filter(ChallengeEntryResult.entry_id == entry.id)
        .first()
    )
    return ChallengeEntryOut(
        id=entry.id,
        challenge_id=entry.challenge_id,
        user_id=entry.user_id,
        event_id=entry.event_id,
        sport=entry.sport,
        event_start_at=entry.event_start_at,
        pick_type=entry.pick_type,
        pick_payload=entry.pick_payload or {},
        prediction_payload=entry.prediction_payload or {},
        model_version=entry.model_version,
        submitted_at=entry.submitted_at,
        locked_at=entry.locked_at,
        status=entry.status,
        score_value=result.score_value if result else None,
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("", response_model=ChallengeOut, status_code=201)
def create_challenge(
    body: ChallengeCreate,
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Create a new challenge. Creator is automatically joined as owner."""
    def _utc(dt: datetime) -> datetime:
        """Ensure datetime is timezone-aware UTC."""
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    now = datetime.now(timezone.utc)
    start_at = _utc(body.start_at) if body.start_at else now
    end_at = _utc(body.end_at) if body.end_at else (now + timedelta(days=30))
    if end_at <= start_at:
        raise HTTPException(status_code=400, detail="end_at must be after start_at")

    challenge = Challenge(
        id=str(uuid.uuid4()),
        name=body.name,
        description=body.description,
        visibility=body.visibility,
        sport_scope=body.sport_scope,
        start_at=start_at,
        end_at=end_at,
        max_members=body.max_members,
        entry_limit_per_day=body.entry_limit_per_day,
        scoring_type=body.scoring_type,
        created_by=user_id,
    )
    db.add(challenge)
    db.flush()  # get ID before adding member

    owner = ChallengeMember(
        challenge_id=challenge.id,
        user_id=user_id,
        role="owner",
        status="active",
    )
    db.add(owner)
    db.commit()
    db.refresh(challenge)
    return _challenge_out(challenge, db, user_id)


@router.get("", response_model=list[ChallengeOut])
def list_challenges(
    visibility: str | None = Query(None, pattern="^(public|private)$"),
    mine: bool = Query(False),
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """List challenges. Use mine=true to filter to only joined challenges."""
    q = db.query(Challenge)

    if mine:
        joined_ids = (
            db.query(ChallengeMember.challenge_id)
            .filter(
                ChallengeMember.user_id == user_id,
                ChallengeMember.status == "active",
            )
            .subquery()
        )
        q = q.filter(Challenge.id.in_(joined_ids))
    else:
        # Non-members can only see public challenges
        q = q.filter(Challenge.visibility == "public")

    if visibility:
        q = q.filter(Challenge.visibility == visibility)

    challenges = q.order_by(Challenge.created_at.desc()).limit(100).all()
    return [_challenge_out(c, db, user_id) for c in challenges]


@router.get("/{challenge_id}", response_model=ChallengeOut)
def get_challenge(
    challenge_id: str,
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if challenge.visibility == "private":
        member = membership_svc.get_active_member(db, challenge_id, user_id)
        if not member and challenge.created_by != user_id:
            raise HTTPException(status_code=403, detail="This challenge is private")
    return _challenge_out(challenge, db, user_id)


@router.post("/{challenge_id}/join", response_model=ChallengeOut)
def join_challenge(
    challenge_id: str,
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    membership_svc.join_challenge(db, challenge_id, user_id)
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    return _challenge_out(challenge, db, user_id)


@router.post("/{challenge_id}/leave", status_code=204)
def leave_challenge(
    challenge_id: str,
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    membership_svc.leave_challenge(db, challenge_id, user_id)


@router.post("/{challenge_id}/entries", response_model=ChallengeEntryOut, status_code=201)
def submit_entry(
    challenge_id: str,
    body: EntryCreate,
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    entry = entries_svc.submit_entry(db, challenge_id, user_id, body)
    return _entry_out(entry, db)


@router.get("/{challenge_id}/entries", response_model=EntryFeedPage)
def list_entries(
    challenge_id: str,
    scope: str = Query("feed", pattern="^(feed|mine)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")

    q = db.query(ChallengeEntry).filter(ChallengeEntry.challenge_id == challenge_id)
    if scope == "mine":
        q = q.filter(ChallengeEntry.user_id == user_id)

    total = q.count()
    items = (
        q.order_by(ChallengeEntry.submitted_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return EntryFeedPage(
        items=[_entry_out(e, db) for e in items],
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.get("/{challenge_id}/leaderboard", response_model=LeaderboardOut)
def get_leaderboard(
    challenge_id: str,
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    return leaderboard_svc.get_leaderboard(db, challenge_id)
