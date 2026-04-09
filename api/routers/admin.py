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


@router.get("/ai-tipsters/status")
def ai_tipsters_status(
    db: Session = Depends(get_db),
    _: str = Depends(_require_admin),
):
    """
    Returns the DB state of all AI tipster accounts — useful for diagnosing
    'No tipsters yet' issues. Re-seeds them (idempotent) before returning.
    """
    from pipelines.tipsters.seed_ai_tipsters import AI_TIPSTERS, seed
    from db.models.tipsters import TipsterTip

    # Re-seed to ensure is_ai=True for all AI tipsters
    seed()

    results = []
    for tipster in AI_TIPSTERS:
        user = db.get(User, tipster["id"])
        tip_count = db.query(func.count(TipsterTip.id)).filter(
            TipsterTip.user_id == tipster["id"]
        ).scalar() or 0
        pending = db.query(func.count(TipsterTip.id)).filter(
            TipsterTip.user_id == tipster["id"],
            TipsterTip.outcome.is_(None),
        ).scalar() or 0
        results.append({
            "id": tipster["id"],
            "sport": tipster["sport"],
            "display_name": tipster["display_name"],
            "exists_in_db": user is not None,
            "is_ai": user.is_ai if user else None,
            "total_tips": tip_count,
            "pending_tips": pending,
        })

    return {"tipsters": results}


@router.get("/backfill-debug")
def backfill_debug(
    days: int = 9,
    db: Session = Depends(get_db),
    _: str = Depends(_require_admin),
):
    """Debug: show what the backfill query actually finds."""
    from db.models.mvp import CoreMatch
    from datetime import timedelta
    cutoff_aware = datetime.now(timezone.utc) - timedelta(days=days)
    cutoff_naive = datetime.utcnow() - timedelta(days=days)

    total = db.query(CoreMatch).count()
    finished = db.query(CoreMatch).filter(CoreMatch.status == "finished").count()
    with_outcome = db.query(CoreMatch).filter(
        CoreMatch.status == "finished",
        CoreMatch.outcome.isnot(None),
    ).count()
    aware_window = db.query(CoreMatch).filter(
        CoreMatch.status == "finished",
        CoreMatch.outcome.isnot(None),
        CoreMatch.kickoff_utc >= cutoff_aware,
    ).count()
    naive_window = db.query(CoreMatch).filter(
        CoreMatch.status == "finished",
        CoreMatch.outcome.isnot(None),
        CoreMatch.kickoff_utc >= cutoff_naive,
    ).count()

    # Sample a few finished matches
    sample = db.query(CoreMatch).filter(
        CoreMatch.status == "finished",
        CoreMatch.outcome.isnot(None),
    ).order_by(CoreMatch.kickoff_utc.desc()).limit(5).all()

    from db.models.mvp import PredMatch, RatingEloTeam
    pred_count = db.query(PredMatch).filter(PredMatch.match_id.in_([m.id for m in sample])).count()
    elo_total = db.query(RatingEloTeam).count()

    # Check one match end-to-end
    test_match = sample[0] if sample else None
    test_detail = {}
    if test_match:
        pred = db.query(PredMatch).filter(PredMatch.match_id == test_match.id).first()
        elo_home = db.query(RatingEloTeam).filter(
            RatingEloTeam.team_id == test_match.home_team_id,
            RatingEloTeam.rated_at < test_match.kickoff_utc,
        ).order_by(RatingEloTeam.rated_at.desc()).first()
        elo_away = db.query(RatingEloTeam).filter(
            RatingEloTeam.team_id == test_match.away_team_id,
            RatingEloTeam.rated_at < test_match.kickoff_utc,
        ).order_by(RatingEloTeam.rated_at.desc()).first()
        test_detail = {
            "match_id": test_match.id,
            "sport": test_match.sport,
            "home_team_id": test_match.home_team_id,
            "away_team_id": test_match.away_team_id,
            "odds_home": test_match.odds_home,
            "odds_away": test_match.odds_away,
            "has_pred": pred is not None,
            "pred_p_home": pred.p_home if pred else None,
            "has_elo_home": elo_home is not None,
            "has_elo_away": elo_away is not None,
        }

    return {
        "total_matches": total,
        "finished": finished,
        "finished_with_outcome": with_outcome,
        "in_window_aware": aware_window,
        "in_window_naive": naive_window,
        "cutoff_aware": cutoff_aware.isoformat(),
        "cutoff_naive": cutoff_naive.isoformat(),
        "elo_total_rows": elo_total,
        "pred_count_in_sample": pred_count,
        "test_match": test_detail,
        "sample_recent": [
            {"id": m.id, "sport": m.sport, "kickoff": m.kickoff_utc.isoformat() if m.kickoff_utc else None, "outcome": m.outcome}
            for m in sample
        ],
    }


@router.post("/backfill-picks")
def backfill_picks(
    days: int = 9,
    dry_run: bool = False,
    _: str = Depends(_require_admin),
):
    """
    Backfill TrackedPick + TipsterTip rows for finished matches in the last N days.
    Uses real market odds where available, falls back to fair odds from PredMatch.
    Outcomes are settled immediately from match results.
    """
    import threading
    from pipelines.picks.backfill_picks import run as run_backfill

    if dry_run:
        n = run_backfill(days=days, dry_run=True)
        return {"dry_run": True, "would_create": n}

    # Run in background so the request doesn't time out for large windows
    result: dict = {}

    def _run():
        try:
            n = run_backfill(days=days)
            result["created"] = n
            logger.info("[admin] backfill-picks: created %d picks (last %d days)", n, days)
        except Exception as exc:
            logger.error("[admin] backfill-picks failed: %s", exc, exc_info=True)
            result["error"] = str(exc)

    t = threading.Thread(target=_run, daemon=True, name="backfill-picks")
    t.start()

    return {"status": "running", "days": days, "message": f"Backfilling last {days} days in background — check Railway logs for progress."}


@router.post("/backfill-april")
def backfill_april(
    days: int = 9,
    _: str = Depends(_require_admin),
):
    """
    Run ML predictions for ALL historical matches (not just upcoming),
    then immediately backfill picks for the last N days.
    Use this to recover tips for periods when the system was down.
    """
    import threading

    def _run():
        try:
            logger.info("[admin] backfill-april: running predictions for all historical matches ...")

            from pipelines.soccer.predict_soccer import run as predict_soccer
            n = predict_soccer(all_matches=True)
            logger.info("[admin] backfill-april: soccer predictions: %d", n)
        except Exception as exc:
            logger.error("[admin] backfill-april: soccer predict failed: %s", exc)

        try:
            from pipelines.basketball.predict_basketball import run as predict_basketball
            n = predict_basketball(all_matches=True)
            logger.info("[admin] backfill-april: basketball predictions: %d", n)
        except Exception as exc:
            logger.error("[admin] backfill-april: basketball predict failed: %s", exc)

        try:
            from pipelines.tennis.predict_tennis import run as predict_tennis
            n = predict_tennis(all_matches=True)
            logger.info("[admin] backfill-april: tennis predictions: %d", n)
        except Exception as exc:
            logger.error("[admin] backfill-april: tennis predict failed: %s", exc)

        try:
            from pipelines.hockey.predict_hockey import run as predict_hockey
            n = predict_hockey(all_matches=True)
            logger.info("[admin] backfill-april: hockey predictions: %d", n)
        except Exception as exc:
            logger.error("[admin] backfill-april: hockey predict failed: %s", exc)

        try:
            from pipelines.baseball.predict_baseball import run as predict_baseball
            n = predict_baseball(all_matches=True)
            logger.info("[admin] backfill-april: baseball predictions: %d", n)
        except Exception as exc:
            logger.error("[admin] backfill-april: baseball predict failed: %s", exc)

        try:
            from pipelines.picks.backfill_picks import run as run_backfill
            n = run_backfill(days=days)
            logger.info("[admin] backfill-april: created %d picks for last %d days", n, days)
        except Exception as exc:
            logger.error("[admin] backfill-april: backfill picks failed: %s", exc)

    t = threading.Thread(target=_run, daemon=True, name="backfill-april")
    t.start()

    return {
        "status": "running",
        "message": f"Running ML predictions for all matches then backfilling last {days} days. Check Railway logs for progress.",
    }
