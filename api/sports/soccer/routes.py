"""
Soccer sport routes.

GET /api/v1/sports/soccer/matches          — paginated match list
GET /api/v1/sports/soccer/matches/{id}     — full match detail
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from api.sports.soccer.schemas import EloHistoryPoint, SoccerMatchDetail, SoccerMatchListResponse
from api.sports.soccer.service import SoccerMatchService
from db.models.mvp import RatingEloTeam

router = APIRouter(prefix="/sports/soccer", tags=["Soccer Matches"], dependencies=[Depends(get_current_user)])

_service = SoccerMatchService()


@router.get("/matches", response_model=SoccerMatchListResponse)
def list_soccer_matches(
    status: Optional[str] = Query(None, description="scheduled | finished | live | cancelled"),
    league: Optional[str] = Query(None, description="Partial league name filter"),
    date_from: Optional[str] = Query(None, description="ISO date string, e.g. 2026-01-01"),
    date_to: Optional[str] = Query(None, description="ISO date string"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Paginated list of soccer matches with optional ELO and prediction data."""
    return _service.get_match_list(
        db,
        status=status,
        league=league,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.get("/matches/{match_id}", response_model=SoccerMatchDetail)
def get_soccer_match(
    match_id: str,
    db: Session = Depends(get_db),
):
    """Full soccer match detail: probabilities, ELO, stats, H2H, key drivers."""
    return _service.get_match_detail(match_id, db)


@router.get("/teams/{team_id}/elo-history", response_model=list[EloHistoryPoint])
def get_team_elo_history(
    team_id: str,
    limit: int = Query(30, ge=5, le=100),
    db: Session = Depends(get_db),
):
    """ELO rating history for a team (global context, most recent N matches)."""
    rows = (
        db.query(RatingEloTeam)
        .filter(RatingEloTeam.team_id == team_id, RatingEloTeam.context == "global")
        .order_by(RatingEloTeam.rated_at.desc())
        .limit(limit)
        .all()
    )
    return [
        EloHistoryPoint(
            date=r.rated_at.isoformat(),
            rating=round(r.rating_after, 1),
            match_id=r.match_id,
        )
        for r in reversed(rows)
    ]
