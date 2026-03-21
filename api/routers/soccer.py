"""
Soccer prediction API endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.deps import get_session, get_current_user
from api.schemas.predictions import PredictionResponse, RatingResponse, HeadToHeadResponse
from db.models import Match, TeamRating, HeadToHead

router = APIRouter(prefix="/soccer", tags=["Soccer"])


@router.get("/ratings/{team_id}", response_model=RatingResponse)
def get_team_rating(team_id: str, db: Session = Depends(get_session)):
    """Return current ELO rating for a soccer team."""
    rating = (
        db.query(TeamRating)
        .filter(TeamRating.team_id == team_id, TeamRating.sport_id == "soccer")
        .order_by(TeamRating.rated_at.desc())
        .first()
    )
    if not rating:
        raise HTTPException(status_code=404, detail="Team rating not found")
    return RatingResponse(
        entity_id=team_id,
        rating=rating.rating_after,
        context=rating.context,
    )


@router.get("/h2h/{team_a_id}/{team_b_id}", response_model=HeadToHeadResponse)
def get_head_to_head(team_a_id: str, team_b_id: str, db: Session = Depends(get_session)):
    """Return H2H record between two teams."""
    # Canonical ordering
    a, b = sorted([team_a_id, team_b_id])
    record = (
        db.query(HeadToHead)
        .filter(
            HeadToHead.sport_id == "soccer",
            HeadToHead.entity_a_id == a,
            HeadToHead.entity_b_id == b,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="H2H record not found")
    return HeadToHeadResponse(
        entity_a_id=record.entity_a_id,
        entity_b_id=record.entity_b_id,
        matches_played=record.matches_played,
        entity_a_wins=record.entity_a_wins,
        entity_b_wins=record.entity_b_wins,
        draws=record.draws,
    )


@router.get("/predictions/{match_id}", response_model=PredictionResponse)
def get_match_prediction(match_id: str, db: Session = Depends(get_session)):
    """Return the latest prediction for a soccer match."""
    from db.models import Prediction
    pred = (
        db.query(Prediction)
        .filter(Prediction.match_id == match_id, Prediction.sport_id == "soccer")
        .order_by(Prediction.created_at.desc())
        .first()
    )
    if not pred:
        raise HTTPException(status_code=404, detail="Prediction not found")
    return PredictionResponse(
        match_id=pred.match_id,
        sport="soccer",
        p_home=pred.p_home_cal or pred.p_home_raw,
        p_away=pred.p_away_cal or pred.p_away_raw,
        p_draw=pred.p_draw_cal or pred.p_draw_raw,
        confidence=0.0,
        model_id=pred.model_id,
    )
