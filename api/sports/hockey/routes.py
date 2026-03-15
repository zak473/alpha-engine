"""
Hockey sport routes.

GET /api/v1/sports/hockey/matches          — paginated match list
GET /api/v1/sports/hockey/matches/{id}     — full match detail
GET /api/v1/sports/hockey/teams/{id}/elo-history
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from api.sports.hockey.schemas import EloHistoryPoint, HockeyMatchDetail, HockeyMatchListResponse
from api.sports.hockey.service import HockeyMatchService

router = APIRouter(prefix="/sports/hockey", tags=["Hockey Matches"], dependencies=[Depends(get_current_user)])
_service = HockeyMatchService()


@router.get("/matches", response_model=HockeyMatchListResponse)
def list_hockey_matches(
    status: Optional[str] = Query(None),
    league: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Paginated list of hockey matches."""
    return _service.get_match_list(db, status=status, league=league, date_from=date_from, date_to=date_to, limit=limit, offset=offset)


@router.get("/matches/preview", response_model=HockeyMatchDetail)
def get_hockey_match_preview(
    home: str = Query(..., description="Home team name"),
    away: str = Query(..., description="Away team name"),
    db: Session = Depends(get_db),
):
    """ELO-based match preview when no DB record exists for upcoming/untracked games."""
    return _service.preview_match(home, away, db)


@router.get("/matches/{match_id}", response_model=HockeyMatchDetail)
def get_hockey_match(match_id: str, db: Session = Depends(get_db)):
    """Full hockey match detail with ELO, H2H, and predictions."""
    return _service.get_match_detail(match_id, db)


@router.get("/teams/{team_id}/elo-history", response_model=list[EloHistoryPoint])
def get_team_elo_history(
    team_id: str,
    limit: int = Query(30, ge=5, le=100),
    db: Session = Depends(get_db),
):
    """ELO rating history for a hockey team."""
    return _service.get_elo_history(team_id, limit, db)
