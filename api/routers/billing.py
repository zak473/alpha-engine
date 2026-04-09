"""
Billing API — /api/v1/billing

Handles Fanbasis webhook events and subscription status.
Fanbasis manages the checkout/portal UI on their end — we only need
to receive webhooks and keep our user subscription state in sync.
"""

from __future__ import annotations

import http.client
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import get_session, get_current_user
from api.routers.advisor import PRO_MONTHLY_TOKENS
from config.settings import settings
from db.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])

FANBASIS_HOST = "www.fanbasis.com"


# ─── Fanbasis API helpers ──────────────────────────────────────────────────────

def _fanbasis_request(method: str, path: str, body: dict | None = None) -> dict:
    conn = http.client.HTTPSConnection(FANBASIS_HOST)
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-api-key": settings.FANBASIS_API_KEY,
    }
    payload = json.dumps(body) if body else None
    conn.request(method, path, payload, headers)
    res = conn.getresponse()
    return json.loads(res.read().decode("utf-8"))


def register_webhook(webhook_url: str) -> dict:
    """Register our webhook endpoint with Fanbasis for all relevant event types."""
    return _fanbasis_request("POST", "/public-api/webhook-subscriptions", {
        "webhook_url": webhook_url,
        "event_types": [
            "payment.succeeded",
            "payment.failed",
            "payment.expired",
            "payment.canceled",
            "product.purchased",
            "subscription.created",
            "subscription.renewed",
            "subscription.completed",
            "subscription.canceled",
        ],
    })


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/status")
def get_billing_status(
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Return the current subscription status for the authenticated user."""
    from api.routers.admin import ADMIN_EMAILS
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Admin accounts always have full access
    if user.email.lower() in ADMIN_EMAILS:
        return {"status": "active", "current_period_end": None, "is_active": True}

    is_active = user.subscription_status in ("active", "trialing")
    period_end = (
        user.subscription_current_period_end.isoformat()
        if user.subscription_current_period_end
        else None
    )
    return {
        "status": user.subscription_status,
        "current_period_end": period_end,
        "is_active": is_active,
        "payment_link": settings.FANBASIS_PAYMENT_LINK if not is_active else None,
    }


@router.post("/webhook")
async def fanbasis_webhook(
    request: Request,
    db: Session = Depends(get_session),
):
    """
    Receive Fanbasis webhook events.
    Always returns 200 — Fanbasis retries on non-2xx so we log errors
    rather than propagating them.
    """
    try:
        payload = await request.json()
    except Exception as exc:
        logger.error("Fanbasis webhook: failed to parse payload: %s", exc)
        return JSONResponse(status_code=200, content={"error": "parse_error"})

    event_type: str = payload.get("event_type") or _infer_event_type(payload)

    logger.info("Fanbasis webhook received: %s", event_type)

    try:
        if event_type == "subscription.created":
            _handle_subscription_created(db, payload)

        elif event_type == "subscription.renewed":
            _handle_subscription_renewed(db, payload)

        elif event_type in ("subscription.completed", "subscription.canceled"):
            _handle_subscription_ended(db, payload, event_type)

        elif event_type == "payment.succeeded":
            _handle_payment_succeeded(db, payload)

        elif event_type == "payment.failed":
            logger.warning(
                "Fanbasis payment.failed: customer=%s reason=%s",
                payload.get("customer_id"),
                payload.get("failure_reason"),
            )

        elif event_type in ("payment.expired", "payment.canceled"):
            logger.info(
                "Fanbasis %s: customer=%s reason=%s",
                event_type,
                payload.get("customer_id"),
                payload.get("failure_reason"),
            )

        elif event_type == "product.purchased":
            _handle_product_purchased(db, payload)

        else:
            logger.debug("Fanbasis: unhandled event type: %s", event_type)

    except Exception as exc:
        logger.error("Error handling Fanbasis event %s: %s", event_type, exc, exc_info=True)

    return JSONResponse(status_code=200, content={"received": True})


# ─── Webhook handlers ──────────────────────────────────────────────────────────

def _infer_event_type(payload: dict) -> str:
    """Fanbasis may omit event_type on some events — infer from payload shape."""
    if "subscription" in payload:
        sub = payload["subscription"]
        if "cancelled_at" in sub:
            return "subscription.canceled"
        if "completed_at" in sub:
            return "subscription.completed"
        if "renewed_at" in sub:
            return "subscription.renewed"
        return "subscription.created"
    if "payment_id" in payload and "amount" in payload:
        return "payment.succeeded"
    if "checkout_session_id" in payload:
        return "payment.expired"
    return "unknown"


def _find_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def _handle_subscription_created(db: Session, payload: dict) -> None:
    buyer = payload.get("buyer", {})
    email = buyer.get("email", "")
    sub = payload.get("subscription", {})

    user = _find_user_by_email(db, email)
    if not user:
        logger.warning("Fanbasis subscription.created: no user for email %s", email)
        return

    prev_status = user.subscription_status
    user.subscription_id = str(sub.get("id", ""))
    user.subscription_status = sub.get("status", "active")

    end_date = sub.get("end_date")
    user.subscription_current_period_end = (
        datetime.fromisoformat(end_date) if end_date else None
    )

    # Top up AI tokens on new subscription
    if prev_status not in ("active", "trialing"):
        user.ai_tokens = (user.ai_tokens or 0) + PRO_MONTHLY_TOKENS
        logger.info("Fanbasis: added %d AI tokens to user %s (new sub)", PRO_MONTHLY_TOKENS, user.id)

    db.commit()
    logger.info("Fanbasis subscription.created: user=%s sub_id=%s", user.id, user.subscription_id)


def _handle_subscription_renewed(db: Session, payload: dict) -> None:
    buyer = payload.get("buyer", {})
    email = buyer.get("email", "")
    sub = payload.get("subscription", {})

    user = _find_user_by_email(db, email)
    if not user:
        logger.warning("Fanbasis subscription.renewed: no user for email %s", email)
        return

    user.subscription_status = sub.get("status", "active")
    end_date = sub.get("end_date")
    if end_date:
        user.subscription_current_period_end = datetime.fromisoformat(end_date)

    # Top up AI tokens on renewal
    user.ai_tokens = (user.ai_tokens or 0) + PRO_MONTHLY_TOKENS
    db.commit()
    logger.info(
        "Fanbasis subscription.renewed: user=%s renewal_count=%s",
        user.id,
        sub.get("auto_renew_count"),
    )


def _handle_subscription_ended(db: Session, payload: dict, event_type: str) -> None:
    buyer = payload.get("buyer", {})
    email = buyer.get("email", "")
    sub = payload.get("subscription", {})

    user = _find_user_by_email(db, email)
    if not user:
        logger.warning("Fanbasis %s: no user for email %s", event_type, email)
        return

    user.subscription_status = "canceled"
    user.subscription_current_period_end = None
    db.commit()
    logger.info("Fanbasis %s: user=%s reason=%s", event_type, user.id, sub.get("cancellation_reason") or sub.get("completion_reason"))


def _handle_payment_succeeded(db: Session, payload: dict) -> None:
    buyer = payload.get("buyer", {})
    email = buyer.get("email", "")
    logger.info(
        "Fanbasis payment.succeeded: email=%s payment_id=%s amount=%s %s",
        email,
        payload.get("payment_id"),
        payload.get("amount"),
        payload.get("currency"),
    )


def _handle_product_purchased(db: Session, payload: dict) -> None:
    buyer = payload.get("buyer", {})
    email = buyer.get("email", "")
    item = payload.get("item", {})
    logger.info(
        "Fanbasis product.purchased: email=%s item=%s type=%s price=%s",
        email,
        item.get("title"),
        item.get("type"),
        payload.get("product_price"),
    )
