"""
Notifications API — /api/v1/notifications
"""
from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from api.deps import get_session, get_current_user
from db.models.notifications import UserNotification

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    message: Optional[str]
    is_read: bool
    created_at: datetime
    data: dict

    class Config:
        from_attributes = True


def _ensure_table(db: Session) -> None:
    """Create table if it doesn't exist yet (safe for cold-start on Railway)."""
    from db.session import engine
    from db.models.notifications import UserNotification as UN
    UN.__table__.create(engine, checkfirst=True)


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    limit: int = 50,
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    _ensure_table(db)
    return (
        db.query(UserNotification)
        .filter(UserNotification.user_id == user_id)
        .order_by(UserNotification.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    _ensure_table(db)
    count = (
        db.query(UserNotification)
        .filter(UserNotification.user_id == user_id, UserNotification.is_read == False)
        .count()
    )
    return {"count": count}


@router.post("/{notification_id}/read")
def mark_read(
    notification_id: str,
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    n = db.query(UserNotification).filter(
        UserNotification.id == notification_id,
        UserNotification.user_id == user_id,
    ).first()
    if n:
        n.is_read = True
        db.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    db.query(UserNotification).filter(
        UserNotification.user_id == user_id,
        UserNotification.is_read == False,
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"ok": True}


def create_notification(db: Session, user_id: str, type: str, title: str, message: str | None = None, data: dict | None = None) -> None:
    """Create a notification for a user. Safe to call from the scheduler."""
    try:
        UserNotification.__table__.create(db.get_bind(), checkfirst=True)
    except Exception:
        pass
    n = UserNotification(user_id=user_id, type=type, title=title, message=message, data=data or {})
    db.add(n)
    # Don't commit here — caller handles transaction
