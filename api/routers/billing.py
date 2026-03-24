"""
Billing API — /api/v1/billing

Handles Stripe Checkout, Customer Portal, subscription status, and webhooks.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import get_session, get_current_user
from config.settings import settings
from db.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])

# Configure the Stripe client using the secret key from settings.
# The key is set at import time; if STRIPE_SECRET_KEY is empty the SDK will
# raise when an actual API call is made, not at startup.
stripe.api_key = settings.STRIPE_SECRET_KEY


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_user(db: Session, user_id: str) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _apply_subscription(user: User, sub: stripe.Subscription) -> None:
    """Write Stripe subscription fields onto a User ORM object (does not commit)."""
    user.subscription_id = sub["id"]
    user.subscription_status = sub["status"]
    period_end = sub.get("current_period_end")
    if period_end is not None:
        user.subscription_current_period_end = datetime.fromtimestamp(
            int(period_end), tz=timezone.utc
        )
    else:
        user.subscription_current_period_end = None


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/checkout")
def create_checkout_session(
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """
    Create a Stripe Checkout Session for the Pro subscription.
    Returns the hosted checkout URL the frontend should redirect to.
    """
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")
    if not settings.STRIPE_PRICE_ID:
        raise HTTPException(status_code=503, detail="Stripe price ID not configured")

    user = _get_user(db, user_id)

    kwargs: dict = {
        "mode": "subscription",
        "line_items": [{"price": settings.STRIPE_PRICE_ID, "quantity": 1}],
        "customer_email": user.email,
        "success_url": f"{settings.FRONTEND_URL}/dashboard?checkout=success",
        "cancel_url": f"{settings.FRONTEND_URL}/pricing?checkout=cancelled",
        "metadata": {"user_id": user_id},
    }

    # If the user already has a Stripe customer record, reuse it so payment
    # methods and invoicing history are preserved.
    if user.stripe_customer_id:
        del kwargs["customer_email"]
        kwargs["customer"] = user.stripe_customer_id

    try:
        session = stripe.checkout.Session.create(**kwargs)
    except stripe.StripeError as exc:
        logger.error("Stripe checkout session creation failed: %s", exc)
        raise HTTPException(status_code=502, detail="Payment provider error") from exc

    return {"url": session.url}


@router.post("/portal")
def create_portal_session(
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """
    Create a Stripe Billing Portal session so the user can manage their
    subscription (cancel, update payment method, view invoices, etc.).
    Returns the portal URL the frontend should redirect to.
    """
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")

    user = _get_user(db, user_id)

    if not user.stripe_customer_id:
        raise HTTPException(
            status_code=400,
            detail="No active subscription found — please subscribe first",
        )

    try:
        session = stripe.billing_portal.Session.create(
            customer=user.stripe_customer_id,
            return_url=f"{settings.FRONTEND_URL}/dashboard",
        )
    except stripe.StripeError as exc:
        logger.error("Stripe portal session creation failed: %s", exc)
        raise HTTPException(status_code=502, detail="Payment provider error") from exc

    return {"url": session.url}


@router.get("/status")
def get_billing_status(
    db: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """
    Return the current subscription status for the authenticated user.
    is_active is True when the subscription is active or in a trial period.
    """
    user = _get_user(db, user_id)
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
    }


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(default=None, alias="stripe-signature"),
    db: Session = Depends(get_session),
):
    """
    Receive and verify Stripe webhook events.
    Always returns 200 — Stripe retries on non-2xx so we swallow handled errors
    and log unexpected ones rather than letting them trigger retry storms.
    """
    payload = await request.body()

    if not settings.STRIPE_WEBHOOK_SECRET:
        logger.warning("STRIPE_WEBHOOK_SECRET not set — skipping webhook signature verification")
        try:
            event = stripe.Event.construct_from(
                stripe.util.convert_to_stripe_object(
                    stripe.util.json.loads(payload)
                ),
                stripe.api_key,
            )
        except Exception as exc:
            logger.error("Webhook payload parse error: %s", exc)
            return JSONResponse(status_code=200, content={"error": "parse_error"})
    else:
        try:
            event = stripe.Webhook.construct_event(
                payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
            )
        except stripe.SignatureVerificationError as exc:
            logger.warning("Stripe webhook signature verification failed: %s", exc)
            return JSONResponse(status_code=200, content={"error": "invalid_signature"})
        except Exception as exc:
            logger.error("Webhook construct_event error: %s", exc)
            return JSONResponse(status_code=200, content={"error": "parse_error"})

    event_type: str = event["type"]
    data_object = event["data"]["object"]

    try:
        if event_type in ("customer.subscription.created", "customer.subscription.updated"):
            _handle_subscription_upsert(db, data_object)

        elif event_type == "customer.subscription.deleted":
            _handle_subscription_deleted(db, data_object)

        elif event_type == "checkout.session.completed":
            _handle_checkout_completed(db, data_object)

        else:
            logger.debug("Unhandled Stripe event type: %s", event_type)

    except Exception as exc:
        # Log but do not re-raise — we must return 200 to prevent Stripe retries
        # for already-processed events.
        logger.error("Error handling Stripe event %s: %s", event_type, exc, exc_info=True)

    return JSONResponse(status_code=200, content={"received": True})


# ─── Webhook handlers ──────────────────────────────────────────────────────────

def _handle_subscription_upsert(db: Session, sub: dict) -> None:
    """Apply subscription.created / subscription.updated to the matching user."""
    customer_id: str = sub.get("customer", "")
    if not customer_id:
        return

    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        logger.warning("Webhook: no user found for Stripe customer %s", customer_id)
        return

    _apply_subscription(user, sub)
    db.commit()
    logger.info(
        "Webhook: subscription %s → status=%s for user %s",
        sub.get("id"),
        sub.get("status"),
        user.id,
    )


def _handle_subscription_deleted(db: Session, sub: dict) -> None:
    """Mark subscription as canceled when Stripe reports deletion."""
    customer_id: str = sub.get("customer", "")
    if not customer_id:
        return

    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        logger.warning("Webhook: no user found for Stripe customer %s", customer_id)
        return

    user.subscription_id = sub.get("id")
    user.subscription_status = "canceled"
    user.subscription_current_period_end = None
    db.commit()
    logger.info("Webhook: subscription canceled for user %s", user.id)


def _handle_checkout_completed(db: Session, session: dict) -> None:
    """
    Link the Stripe customer to our user after a successful checkout.
    The customer_id is stored so the portal endpoint can retrieve it later.
    If the session includes a subscription, write those fields too.
    """
    user_id: str = (session.get("metadata") or {}).get("user_id", "")
    customer_id: str = session.get("customer", "")

    if not user_id or not customer_id:
        logger.warning(
            "Webhook: checkout.session.completed missing user_id or customer_id — skipping"
        )
        return

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        logger.warning("Webhook: no user found with id %s", user_id)
        return

    user.stripe_customer_id = customer_id

    subscription_id: str = session.get("subscription", "")
    if subscription_id:
        try:
            sub = stripe.Subscription.retrieve(subscription_id)
            _apply_subscription(user, sub)
        except stripe.StripeError as exc:
            logger.error("Webhook: failed to retrieve subscription %s: %s", subscription_id, exc)

    db.commit()
    logger.info(
        "Webhook: checkout completed — linked Stripe customer %s to user %s",
        customer_id,
        user_id,
    )
