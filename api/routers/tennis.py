"""
Tennis prediction API endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.deps import get_session, get_current_user
from api.schemas.predictions import PredictionResponse, RatingResponse, HeadToHeadResponse
from db.models import PlayerRating, HeadToHead, Prediction

router = APIRouter(prefix="/tennis", tags=["Tennis"], dependencies=[Depends(get_current_user)])


@router.get("/ratings/{player_id}", response_model=RatingResponse)
def get_player_rating(player_id: str, surface: str = "global", db: Session = Depends(get_session)):
    """Return current ELO rating for a tennis player, optionally surface-specific."""
    rating = (
        db.query(PlayerRating)
        .filter(
            PlayerRating.player_id == player_id,
            PlayerRating.sport_id == "tennis",
            PlayerRating.context == surface,
        )
        .order_by(PlayerRating.rated_at.desc())
        .first()
    )
    if not rating:
        raise HTTPException(status_code=404, detail="Player rating not found")
    return RatingResponse(entity_id=player_id, rating=rating.rating_after, context=surface)


@router.get("/h2h/{player_a_id}/{player_b_id}", response_model=HeadToHeadResponse)
def get_head_to_head(
    player_a_id: str,
    player_b_id: str,
    surface: str = "global",
    db: Session = Depends(get_session),
):
    a, b = sorted([player_a_id, player_b_id])
    record = (
        db.query(HeadToHead)
        .filter(
            HeadToHead.sport_id == "tennis",
            HeadToHead.entity_a_id == a,
            HeadToHead.entity_b_id == b,
            HeadToHead.context == surface,
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
        context=surface,
    )


@router.get("/predictions/{match_id}", response_model=PredictionResponse)
def get_match_prediction(match_id: str, db: Session = Depends(get_session)):
    pred = (
        db.query(Prediction)
        .filter(Prediction.match_id == match_id, Prediction.sport_id == "tennis")
        .order_by(Prediction.created_at.desc())
        .first()
    )
    if not pred:
        raise HTTPException(status_code=404, detail="Prediction not found")
    return PredictionResponse(
        match_id=pred.match_id,
        sport="tennis",
        p_home=pred.p_home_cal or pred.p_home_raw,
        p_away=pred.p_away_cal or pred.p_away_raw,
        p_draw=0.0,
        model_id=pred.model_id,
    )
