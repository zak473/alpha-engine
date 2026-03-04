"""
Challenge entries service — submission, locking, and settlement.
"""

from __future__ import annotations

from datetime import datetime, timezone, date

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.schemas.challenges import EntryCreate
from api.services.membership import get_active_member
from api.services.scoring import compute_score
from db.models.challenges import Challenge, ChallengeEntry, ChallengeEntryResult


def _now() -> datetime:
    return datetime.now(timezone.utc)


def submit_entry(
    db: Session,
    challenge_id: str,
    user_id: str,
    data: EntryCreate,
) -> ChallengeEntry:
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")

    now = _now()
    end = challenge.end_at
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if now > end:
        raise HTTPException(status_code=400, detail="Challenge has ended")

    # Must be an active member
    member = get_active_member(db, challenge_id, user_id)
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this challenge")

    # event_start_at must be in the future (can't submit after lock)
    event_start = data.event_start_at
    if event_start.tzinfo is None:
        event_start = event_start.replace(tzinfo=timezone.utc)
    if now >= event_start:
        raise HTTPException(status_code=400, detail="Event has already started — entry locked")

    # Daily entry limit
    if challenge.entry_limit_per_day is not None:
        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
        today_count = (
            db.query(func.count(ChallengeEntry.id))
            .filter(
                ChallengeEntry.challenge_id == challenge_id,
                ChallengeEntry.user_id == user_id,
                ChallengeEntry.submitted_at >= today_start,
                ChallengeEntry.status != "void",
            )
            .scalar()
            or 0
        )
        if today_count >= challenge.entry_limit_per_day:
            raise HTTPException(
                status_code=429,
                detail=f"Daily entry limit of {challenge.entry_limit_per_day} reached",
            )

    entry = ChallengeEntry(
        challenge_id=challenge_id,
        user_id=user_id,
        event_id=data.event_id,
        sport=data.sport,
        event_start_at=event_start,
        pick_type=data.pick_type,
        pick_payload=data.pick_payload,
        prediction_payload=data.prediction_payload,
        model_version=data.model_version,
        status="open",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def lock_due_entries(db: Session) -> int:
    """
    Lock all open entries whose event_start_at has passed.
    Returns the count of locked entries.
    """
    now = _now()
    entries = (
        db.query(ChallengeEntry)
        .filter(
            ChallengeEntry.status == "open",
            ChallengeEntry.event_start_at <= now,
        )
        .all()
    )
    for entry in entries:
        entry.status = "locked"
        entry.locked_at = now
    db.commit()
    return len(entries)


def settle_entry(
    db: Session,
    entry_id: str,
    outcome_payload: dict,
) -> ChallengeEntryResult:
    entry = db.query(ChallengeEntry).filter(ChallengeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.status not in ("locked", "open"):
        raise HTTPException(status_code=400, detail=f"Entry status is {entry.status}, cannot settle")

    challenge = db.query(Challenge).filter(Challenge.id == entry.challenge_id).first()
    score = compute_score(
        scoring_type=challenge.scoring_type,
        pick_type=entry.pick_type,
        prediction_payload=entry.prediction_payload,
        outcome_payload=outcome_payload,
    )

    result = ChallengeEntryResult(
        entry_id=entry_id,
        outcome_payload=outcome_payload,
        score_value=score,
    )
    entry.status = "settled"
    db.add(result)
    db.commit()
    db.refresh(result)
    return result
