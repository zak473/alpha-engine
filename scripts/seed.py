"""
Dev seed script — creates 2 demo challenges with members and entries.

Usage (inside API container):
    python scripts/seed.py

Uses existing core_matches as event references. Safe to run multiple times
(idempotent on challenge names via upsert-style check).
"""

from __future__ import annotations

import sys
import os
import uuid
from datetime import datetime, timezone, timedelta

# Ensure repo root is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.session import SessionLocal
from db.models.challenges import Challenge, ChallengeMember, ChallengeEntry, ChallengeEntryResult
from db.models.mvp import CoreMatch

DEMO_USERS = ["user-alice", "user-bob", "user-carol", "user-demo"]


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


def seed():
    db = SessionLocal()
    try:
        # Pull a few upcoming/recent matches to use as event refs
        matches = db.query(CoreMatch).order_by(CoreMatch.kickoff_utc.desc()).limit(10).all()
        if not matches:
            print("No core_matches found — run the ingestion pipeline first, or seeding continues without event refs.")

        now = _now()

        # ── Challenge 1: Public points challenge ──────────────────────────────
        c1_name = "⚽ Premier League Tipsters Season Cup"
        c1 = db.query(Challenge).filter(Challenge.name == c1_name).first()
        if not c1:
            c1 = Challenge(
                id=_uuid(),
                name=c1_name,
                description=(
                    "Pick match outcomes across the Premier League season. "
                    "1 point per correct result. Most points at season end wins."
                ),
                visibility="public",
                sport_scope=["soccer"],
                start_at=now - timedelta(days=7),
                end_at=now + timedelta(days=60),
                max_members=50,
                entry_limit_per_day=5,
                scoring_type="points",
                created_by="user-alice",
            )
            db.add(c1)
            db.flush()
            print(f"Created challenge: {c1.name} ({c1.id})")
        else:
            print(f"Challenge already exists: {c1.name}")

        # ── Challenge 2: Private brier challenge ──────────────────────────────
        c2_name = "🎯 Calibration Masters (Brier)"
        c2 = db.query(Challenge).filter(Challenge.name == c2_name).first()
        if not c2:
            c2 = Challenge(
                id=_uuid(),
                name=c2_name,
                description=(
                    "A calibration-focused challenge across all sports. "
                    "Scored by Brier score — accuracy of probabilities matters, not just correct picks."
                ),
                visibility="private",
                sport_scope=[],  # all sports
                start_at=now - timedelta(days=3),
                end_at=now + timedelta(days=30),
                max_members=10,
                entry_limit_per_day=3,
                scoring_type="brier",
                created_by="user-bob",
            )
            db.add(c2)
            db.flush()
            print(f"Created challenge: {c2.name} ({c2.id})")
        else:
            print(f"Challenge already exists: {c2.name}")

        # ── Members ───────────────────────────────────────────────────────────
        def ensure_member(challenge: Challenge, user_id: str, role: str = "member"):
            existing = db.query(ChallengeMember).filter(
                ChallengeMember.challenge_id == challenge.id,
                ChallengeMember.user_id == user_id,
            ).first()
            if not existing:
                db.add(ChallengeMember(
                    challenge_id=challenge.id,
                    user_id=user_id,
                    role=role,
                    status="active",
                ))
                print(f"  + member {user_id} ({role}) → {challenge.name}")

        ensure_member(c1, "user-alice", "owner")
        for u in ["user-bob", "user-carol", "user-demo"]:
            ensure_member(c1, u)

        ensure_member(c2, "user-bob", "owner")
        for u in ["user-alice", "user-demo"]:
            ensure_member(c2, u)

        db.flush()

        # ── Entries ───────────────────────────────────────────────────────────
        # Build fake entries from match data, or synthetic if no matches
        pick_types = ["home_win", "draw", "away_win"]
        OUTCOMES = [
            {"outcome": "home_win", "correct": True},
            {"outcome": "away_win", "correct": False},
            {"outcome": "home_win", "correct": True},
        ]
        PRED_PAYLOADS = [
            {"p_home": 0.62, "p_draw": 0.22, "p_away": 0.16},
            {"p_home": 0.40, "p_draw": 0.30, "p_away": 0.30},
            {"p_home": 0.55, "p_draw": 0.25, "p_away": 0.20},
        ]

        def ensure_entry_with_result(challenge: Challenge, user_id: str, idx: int):
            event_id = matches[idx % len(matches)].id if matches else f"evt-{idx:03d}"
            sport = "soccer"
            event_start = now - timedelta(hours=2 + idx)  # already started = settled

            existing = db.query(ChallengeEntry).filter(
                ChallengeEntry.challenge_id == challenge.id,
                ChallengeEntry.user_id == user_id,
                ChallengeEntry.event_id == event_id,
            ).first()
            if existing:
                return

            pick = pick_types[idx % 3]
            pred = PRED_PAYLOADS[idx % 3]
            entry = ChallengeEntry(
                challenge_id=challenge.id,
                user_id=user_id,
                event_id=event_id,
                sport=sport,
                event_start_at=event_start,
                pick_type=pick,
                pick_payload={"pick": pick},
                prediction_payload=pred,
                model_version="soccer_lr_v1",
                status="settled",
                locked_at=event_start,
            )
            db.add(entry)
            db.flush()

            # Score it
            outcome = OUTCOMES[idx % 3]
            from api.services.scoring import compute_score
            score = compute_score(challenge.scoring_type, pick, pred, outcome)
            db.add(ChallengeEntryResult(
                entry_id=entry.id,
                outcome_payload=outcome,
                score_value=score,
            ))
            print(f"  + entry {user_id} → {challenge.name[:30]}... pick={pick} score={score:.3f}")

        for i, user_id in enumerate(["user-alice", "user-bob", "user-carol"]):
            for j in range(3):
                ensure_entry_with_result(c1, user_id, i * 3 + j)

        for i, user_id in enumerate(["user-bob", "user-alice"]):
            for j in range(2):
                ensure_entry_with_result(c2, user_id, i * 2 + j)

        db.commit()
        print("\n✓ Seed complete.")

    except Exception as exc:
        db.rollback()
        print(f"✗ Seed failed: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
