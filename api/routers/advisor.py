"""
AI Advisor API — /api/v1/advisor

Token-gated endpoint. Each message costs 1 token.
Free accounts start with 10 tokens; Pro subscribers receive 150 per billing cycle.
"""

from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.deps import get_session, get_current_user
from db.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/advisor", tags=["advisor"])

FREE_SIGNUP_TOKENS = 10
PRO_MONTHLY_TOKENS = 150


def _get_user(db: Session, user_id: str) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/tokens")
def get_token_balance(
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Return the current AI token balance for the authenticated user."""
    user = _get_user(db, user_id)
    return {"tokens": user.ai_tokens}


@router.post("/use-token")
def use_token(
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """
    Deduct 1 token from the user's balance.
    Returns 402 if the user has no tokens left.
    Called by the Next.js /api/chat route before streaming to Anthropic.
    """
    user = _get_user(db, user_id)

    if user.ai_tokens <= 0:
        raise HTTPException(
            status_code=402,
            detail="No AI tokens remaining. Upgrade to Pro or purchase more tokens.",
        )

    user.ai_tokens -= 1
    db.commit()
    logger.info("AI token used by user %s — %d remaining", user_id, user.ai_tokens)
    return {"tokens_remaining": user.ai_tokens}


@router.post("/add-tokens")
def add_tokens(
    amount: int,
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """
    Add tokens to a user's balance (called internally from billing webhook).
    Admin/internal use — no direct user exposure needed.
    """
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    user = _get_user(db, user_id)
    user.ai_tokens += amount
    db.commit()
    return {"tokens": user.ai_tokens}
