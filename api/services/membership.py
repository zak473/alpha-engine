"""
Challenge membership service — join / leave logic with business rule enforcement.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models.challenges import Challenge, ChallengeMember


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_active_member(db: Session, challenge_id: str, user_id: str) -> ChallengeMember | None:
    return (
        db.query(ChallengeMember)
        .filter(
            ChallengeMember.challenge_id == challenge_id,
            ChallengeMember.user_id == user_id,
            ChallengeMember.status == "active",
        )
        .first()
    )


def join_challenge(db: Session, challenge_id: str, user_id: str) -> ChallengeMember:
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")

    now = _now()

    # Time-window check
    start = challenge.start_at
    end = challenge.end_at
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    if now > end:
        raise HTTPException(status_code=400, detail="Challenge has already ended")
    if now < start:
        raise HTTPException(status_code=400, detail="Challenge has not started yet")

    # Already active member?
    existing = (
        db.query(ChallengeMember)
        .filter(
            ChallengeMember.challenge_id == challenge_id,
            ChallengeMember.user_id == user_id,
        )
        .first()
    )
    if existing:
        if existing.status == "active":
            raise HTTPException(status_code=409, detail="Already a member of this challenge")
        if existing.status == "banned":
            raise HTTPException(status_code=403, detail="You are banned from this challenge")
        # Re-join after leaving
        existing.status = "active"
        existing.joined_at = now
        db.commit()
        db.refresh(existing)
        return existing

    # Max members check
    if challenge.max_members is not None:
        current_count = (
            db.query(func.count(ChallengeMember.id))
            .filter(
                ChallengeMember.challenge_id == challenge_id,
                ChallengeMember.status == "active",
            )
            .scalar()
        )
        if current_count >= challenge.max_members:
            raise HTTPException(status_code=400, detail="Challenge is full")

    member = ChallengeMember(
        challenge_id=challenge_id,
        user_id=user_id,
        role="member",
        status="active",
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def leave_challenge(db: Session, challenge_id: str, user_id: str) -> None:
    member = get_active_member(db, challenge_id, user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Not a member of this challenge")
    if member.role == "owner":
        raise HTTPException(status_code=400, detail="Owner cannot leave their own challenge")
    member.status = "left"
    db.commit()


def member_count(db: Session, challenge_id: str) -> int:
    return (
        db.query(func.count(ChallengeMember.id))
        .filter(
            ChallengeMember.challenge_id == challenge_id,
            ChallengeMember.status == "active",
        )
        .scalar()
        or 0
    )
