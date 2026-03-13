"""Esports sport routes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from api.sports.esports.schemas import EloHistoryPoint, EsportsMatchDetail, EsportsMatchListResponse
from api.sports.esports.service import EsportsMatchService
from db.models.mvp import RatingEloTeam

router = APIRouter(prefix="/sports/esports", tags=["Esports Matches"], dependencies=[Depends(get_current_user)])
_service = EsportsMatchService()


@router.get("/matches", response_model=EsportsMatchListResponse)
def list_esports_matches(
    status: Optional[str] = Query(None),
    league: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Paginated list of esports matches."""
    return _service.get_match_list(
        db, status=status, league=league, date_from=date_from, date_to=date_to, limit=limit, offset=offset
    )


@router.get("/matches/{match_id}", response_model=EsportsMatchDetail)
def get_esports_match(match_id: str, db: Session = Depends(get_db)):
    """Full esports match detail — CS2 or LoL aware."""
    return _service.get_match_detail(match_id, db)


@router.get("/teams/{team_id}/elo-history", response_model=list[EloHistoryPoint])
def get_team_elo_history(
    team_id: str,
    map_name: Optional[str] = Query(None, description="CS2 map context (e.g. mirage). Omit for global."),
    limit: int = Query(30, ge=5, le=100),
    db: Session = Depends(get_db),
):
    """ELO rating history for an esports team (global or map-specific context)."""
    context = map_name.lower() if map_name else "global"
    rows = (
        db.query(RatingEloTeam)
        .filter(RatingEloTeam.team_id == team_id, RatingEloTeam.context == context)
        .order_by(RatingEloTeam.rated_at.desc())
        .limit(limit)
        .all()
    )
    return [
        EloHistoryPoint(date=r.rated_at.isoformat(), rating=round(r.rating_after, 1), match_id=None)
        for r in reversed(rows)
    ]
