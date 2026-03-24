"""
Seed AI tipster accounts — one per sport.

Run once (idempotent — uses fixed UUIDs):
    python -m pipelines.tipsters.seed_ai_tipsters

These accounts are what the auto-picks bot posts TipsterTip rows under.
They appear on the tipster leaderboard with real, live pick histories.
"""

from __future__ import annotations

import logging
from db.session import SessionLocal
from db.models.user import User

log = logging.getLogger(__name__)

# Fixed UUIDs — never change these or you'll orphan existing tips
AI_TIPSTERS: list[dict] = [
    {
        "id": "ai-tipster-soccer-0000-000000000001",
        "email": "ai.soccer@alpha-engine.internal",
        "display_name": "NeverInDoubt Soccer AI",
        "bio": "ML-driven soccer picks. Trained on 5+ years of match data across the top European leagues. Targets value bets with ≥3% model edge.",
        "sport": "soccer",
    },
    {
        "id": "ai-tipster-tennis-0000-000000000002",
        "email": "ai.tennis@alpha-engine.internal",
        "display_name": "NeverInDoubt Tennis AI",
        "bio": "Logistic regression model trained on ATP/WTA match data. Specialises in head-to-head edge and surface-adjusted win probabilities.",
        "sport": "tennis",
    },
    {
        "id": "ai-tipster-esports-000-000000000003",
        "email": "ai.esports@alpha-engine.internal",
        "display_name": "NeverInDoubt Esports AI",
        "bio": "Esports prediction model covering CS2, LoL, and Dota. Uses team form, map pool stats, and tournament context.",
        "sport": "esports",
    },
    {
        "id": "ai-tipster-bball-0000-000000000004",
        "email": "ai.basketball@alpha-engine.internal",
        "display_name": "NeverInDoubt Basketball AI",
        "bio": "LightGBM model with 68% historical accuracy on NBA and international basketball. Focuses on moneyline value.",
        "sport": "basketball",
    },
    {
        "id": "ai-tipster-baseball-000-000000000005",
        "email": "ai.baseball@alpha-engine.internal",
        "display_name": "NeverInDoubt Baseball AI",
        "bio": "Conservative MLB picks at high confidence thresholds only. Filters out chalk — only bets where the model finds genuine edge.",
        "sport": "baseball",
    },
    {
        "id": "ai-tipster-hockey-0000-000000000006",
        "email": "ai.hockey@alpha-engine.internal",
        "display_name": "NeverInDoubt Hockey AI",
        "bio": "ELO and rolling-form model for NHL and international hockey. 63%+ historical accuracy on binary match winner markets.",
        "sport": "hockey",
    },
]

# Map sport → AI tipster user ID (used by auto_picks.py)
AI_TIPSTER_IDS: dict[str, str] = {t["sport"]: t["id"] for t in AI_TIPSTERS}


def seed(dry_run: bool = False) -> None:
    db = SessionLocal()
    try:
        created = 0
        updated = 0
        for tipster in AI_TIPSTERS:
            existing = db.get(User, tipster["id"])
            if existing is None:
                user = User(
                    id=tipster["id"],
                    email=tipster["email"],
                    password_hash="!ai-account-no-login",  # can never log in directly
                    display_name=tipster["display_name"],
                    is_ai=True,
                    bio=tipster["bio"],
                )
                if not dry_run:
                    db.add(user)
                created += 1
                log.info("  [CREATE] %s (%s)", tipster["display_name"], tipster["id"])
            else:
                # Ensure bio/is_ai are up to date
                if existing.bio != tipster["bio"] or not existing.is_ai:
                    existing.bio = tipster["bio"]
                    existing.is_ai = True
                    updated += 1
                    log.info("  [UPDATE] %s", tipster["display_name"])

        if not dry_run:
            db.commit()
        action = "would create" if dry_run else "created"
        log.info("AI tipster seed: %s %d, updated %d.", action, created, updated)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    seed(dry_run=args.dry_run)
    print("Done.")
