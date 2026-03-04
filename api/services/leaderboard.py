"""
Leaderboard service — aggregates scores per user in a challenge.

brier:  avg(score_value) — higher is better (we store 1-brier_raw)
        accuracy_score = fraction of entries with score_value > 0.5 (proxy for correct)
points: sum(score_value) — higher is better
"""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from api.schemas.challenges import LeaderboardOut, LeaderboardRow
from db.models.challenges import Challenge, ChallengeEntry, ChallengeEntryResult


def get_leaderboard(db: Session, challenge_id: str) -> LeaderboardOut:
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not challenge:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Challenge not found")

    # Join entries with results to get settled scores
    rows = (
        db.query(
            ChallengeEntry.user_id,
            func.count(ChallengeEntry.id).label("entry_count"),
            func.sum(ChallengeEntryResult.score_value).label("total_score"),
            func.avg(ChallengeEntryResult.score_value).label("avg_score"),
            func.max(ChallengeEntry.submitted_at).label("last_activity"),
        )
        .join(ChallengeEntryResult, ChallengeEntryResult.entry_id == ChallengeEntry.id)
        .filter(ChallengeEntry.challenge_id == challenge_id)
        .group_by(ChallengeEntry.user_id)
        .all()
    )

    scoring_type = challenge.scoring_type

    leaderboard_rows: list[LeaderboardRow] = []
    for row in rows:
        if scoring_type == "brier":
            score = round(row.avg_score or 0.0, 4)
            # accuracy: fraction of picks with score_value > 0.5 (correct in brier terms)
            correct_count = (
                db.query(func.count(ChallengeEntry.id))
                .join(ChallengeEntryResult, ChallengeEntryResult.entry_id == ChallengeEntry.id)
                .filter(
                    ChallengeEntry.challenge_id == challenge_id,
                    ChallengeEntry.user_id == row.user_id,
                    ChallengeEntryResult.score_value > 0.5,
                )
                .scalar()
                or 0
            )
            accuracy = round(correct_count / row.entry_count, 4) if row.entry_count else 0.0
        else:
            score = round(row.total_score or 0.0, 2)
            accuracy = None

        leaderboard_rows.append(
            LeaderboardRow(
                rank=0,  # filled below
                user_id=row.user_id,
                score=score,
                entry_count=row.entry_count,
                last_activity=row.last_activity,
                accuracy_score=accuracy,
            )
        )

    # Sort: brier = descending avg score, points = descending sum
    leaderboard_rows.sort(key=lambda r: r.score, reverse=True)
    for i, row in enumerate(leaderboard_rows):
        row.rank = i + 1

    return LeaderboardOut(
        challenge_id=challenge_id,
        scoring_type=scoring_type,
        rows=leaderboard_rows,
    )
