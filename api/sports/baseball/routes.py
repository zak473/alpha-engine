"""Baseball sport routes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from api.sports.baseball.schemas import BaseballMatchDetail, BaseballMatchListResponse, EloHistoryPoint
from api.sports.baseball.service import BaseballMatchService

router = APIRouter(prefix="/sports/baseball", tags=["Baseball Matches"])
_service = BaseballMatchService()


@router.get("/matches", response_model=BaseballMatchListResponse)
def list_baseball_matches(
    status: Optional[str] = Query(None),
    league: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Paginated list of baseball matches."""
    return _service.get_match_list(db, status=status, league=league, date_from=date_from, date_to=date_to, limit=limit, offset=offset)


@router.get("/matches/preview", response_model=BaseballMatchDetail)
def get_baseball_match_preview(
    home: str = Query(..., description="Home team name"),
    away: str = Query(..., description="Away team name"),
    db: Session = Depends(get_db),
):
    """ELO-based match preview when no DB record exists for upcoming/untracked games."""
    return _service.preview_match(home, away, db)


@router.get("/matches/{match_id}", response_model=BaseballMatchDetail)
def get_baseball_match(match_id: str, db: Session = Depends(get_db)):
    """Full baseball match detail with ELO, pitching, batting, and H2H."""
    return _service.get_match_detail(match_id, db)


@router.get("/teams/{team_id}/elo-history", response_model=list[EloHistoryPoint])
def get_team_elo_history(
    team_id: str,
    limit: int = Query(30, ge=5, le=100),
    db: Session = Depends(get_db),
):
    """ELO rating history for a baseball team."""
    return _service.get_elo_history(team_id, limit, db)
