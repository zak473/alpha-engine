"""Basketball sport routes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from api.sports.basketball.schemas import BasketballMatchDetail, BasketballMatchListResponse, EloHistoryPoint
from api.sports.basketball.service import BasketballMatchService

router = APIRouter(prefix="/sports/basketball", tags=["Basketball Matches"], dependencies=[Depends(get_current_user)])
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


@router.get("/matches/preview", response_model=BasketballMatchDetail)
def get_basketball_match_preview(
    home: str = Query(..., description="Home team name"),
    away: str = Query(..., description="Away team name"),
    db: Session = Depends(get_db),
):
    """ELO-based match preview when no DB record exists for upcoming/untracked games."""
    return _service.preview_match(home, away, db)


@router.get("/matches/{match_id}", response_model=BasketballMatchDetail)
def get_basketball_match(match_id: str, db: Session = Depends(get_db)):
    """Full basketball match detail with ELO, stats, H2H, and predictions."""
    return _service.get_match_detail(match_id, db)


@router.get("/teams/{team_id}/elo-history", response_model=list[EloHistoryPoint])
def get_team_elo_history(
    team_id: str,
    limit: int = Query(30, ge=5, le=100),
    db: Session = Depends(get_db),
):
    """ELO rating history for a basketball team."""
    return _service.get_elo_history(team_id, limit, db)
