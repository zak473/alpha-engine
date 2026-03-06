"""Basketball sport routes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.deps import get_db
from api.sports.basketball.schemas import BasketballMatchDetail, BasketballMatchListResponse, EloHistoryPoint
from api.sports.basketball.service import BasketballMatchService

router = APIRouter(prefix="/sports/basketball", tags=["Basketball Matches"])
_service = BasketballMatchService()


@router.get("/matches", response_model=BasketballMatchListResponse)
def list_basketball_matches(
    status: Optional[str] = Query(None),
    league: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Paginated list of basketball matches."""
    return _service.get_match_list(db, status=status, league=league, date_from=date_from, date_to=date_to, limit=limit, offset=offset)


@router.get("/matches/{match_id}", response_model=BasketballMatchDetail)
def get_basketball_match(match_id: str, db: Session = Depends(get_db)):
    """Full basketball match detail with ELO, box score, and H2H."""
    return _service.get_match_detail(match_id, db)


@router.get("/teams/{team_id}/elo-history", response_model=list[EloHistoryPoint])
def get_team_elo_history(
    team_id: str,
    limit: int = Query(30, ge=5, le=100),
    db: Session = Depends(get_db),
):
    """ELO rating history for a basketball team."""
    return _service.get_elo_history(team_id, limit, db)
