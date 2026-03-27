"""
Admin API — /api/v1/admin
Protected endpoints for platform management: users, subscriptions, revenue.
Only accessible to emails listed in ADMIN_EMAILS env var.
"""
from __future__ import annotations

import os
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from datetime import timedelta
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from db.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_EMAILS = {
    "zakkalemwilding@hotmail.com",
    *(
        e.strip().lower()
        for e in os.environ.get("ADMIN_EMAILS", "").split(",")
        if e.strip()
    ),
}


def _require_admin(user_id: str = Depends(get_current_user), db: Session = Depends(get_db)) -> str:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if ADMIN_EMAILS and user.email.lower() not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user_id


class UserRow(BaseModel):
    id: str
    email: str
    display_name: Optional[str]
    created_at: str
    subscription_status: Optional[str]
    subscription_current_period_end: Optional[str]
    stripe_customer_id: Optional[str]
    ai_tokens: int


class AdminStats(BaseModel):
    total_users: int
    active_subscribers: int
    trialing: int
    canceled: int
    no_subscription: int
    mrr_gbp: float
    new_users_30d: int


@router.get("/stats", response_model=AdminStats)
def get_admin_stats(
    db: Session = Depends(get_db),
    _: str = Depends(_require_admin),
):
    total = db.query(func.count(User.id)).scalar() or 0
    active = db.query(func.count(User.id)).filter(User.subscription_status == "active").scalar() or 0
    trialing = db.query(func.count(User.id)).filter(User.subscription_status == "trialing").scalar() or 0
    canceled = db.query(func.count(User.id)).filter(User.subscription_status == "canceled").scalar() or 0
    no_sub = db.query(func.count(User.id)).filter(User.subscription_status.is_(None)).scalar() or 0

    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    new_30d = db.query(func.count(User.id)).filter(User.created_at >= cutoff).scalar() or 0

    mrr = round((active + trialing) * 24.99, 2)

    return AdminStats(
        total_users=total,
        active_subscribers=active,
        trialing=trialing,
        canceled=canceled,
        no_subscription=no_sub,
        mrr_gbp=mrr,
        new_users_30d=new_30d,
    )


@router.get("/users", response_model=list[UserRow])
def get_admin_users(
    db: Session = Depends(get_db),
    _: str = Depends(_require_admin),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [
        UserRow(
            id=u.id,
            email=u.email,
            display_name=u.display_name,
            created_at=u.created_at.isoformat(),
            subscription_status=u.subscription_status,
            subscription_current_period_end=(
                u.subscription_current_period_end.isoformat()
                if u.subscription_current_period_end
                else None
            ),
            stripe_customer_id=u.stripe_customer_id,
            ai_tokens=u.ai_tokens,
        )
        for u in users
    ]


@router.delete("/ai-tips/purge-bad-batch")
def purge_bad_ai_tips(
    hours: int = 6,
    db: Session = Depends(get_db),
    _: str = Depends(_require_admin),
):
    """
    Delete pending AI tipster tips created in the last N hours (default 6).
    Pass hours=0 to delete ALL pending AI tips regardless of age.
    """
    from db.models.tipsters import TipsterTip
    from pipelines.tipsters.seed_ai_tipsters import AI_TIPSTER_IDS

    ai_ids = list(AI_TIPSTER_IDS.values())
    q = db.query(TipsterTip).filter(
        TipsterTip.user_id.in_(ai_ids),
        TipsterTip.outcome.is_(None),
    )
    if hours > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        q = q.filter(TipsterTip.created_at >= cutoff)

    deleted = q.delete(synchronize_session=False)
    db.commit()
    logger.info("[admin] purge_bad_ai_tips: deleted %d tips (hours=%d)", deleted, hours)
    return {"deleted": deleted}


_PURGE_SECRET = os.environ.get("ADMIN_PURGE_SECRET", "")


@router.delete("/ai-tips/emergency-purge")
def emergency_purge_ai_tips(
    secret: str,
    db: Session = Depends(get_db),
):
    """
    No-auth emergency purge — requires ADMIN_PURGE_SECRET env var to match.
    Deletes ALL pending AI tipster tips. One-time use for DB cleanup when auth unavailable.
    """
    if not _PURGE_SECRET or secret != _PURGE_SECRET:
        raise HTTPException(status_code=403, detail="Invalid secret")

    from db.models.tipsters import TipsterTip
    from pipelines.tipsters.seed_ai_tipsters import AI_TIPSTER_IDS

    ai_ids = list(AI_TIPSTER_IDS.values())
    deleted = (
        db.query(TipsterTip)
        .filter(
            TipsterTip.user_id.in_(ai_ids),
            TipsterTip.outcome.is_(None),
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    logger.info("[admin] emergency_purge_ai_tips: deleted %d tips", deleted)
    return {"deleted": deleted}
