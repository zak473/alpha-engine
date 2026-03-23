"""Tennis sport routes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from api.sports.tennis.schemas import EloHistoryPoint, TennisMatchDetail, TennisMatchListResponse
from api.sports.tennis.service import TennisMatchService
from db.models.mvp import RatingEloTeam

router = APIRouter(prefix="/sports/tennis", tags=["Tennis Matches"])
_service = TennisMatchService()


@router.get("/matches", response_model=TennisMatchListResponse)
def list_tennis_matches(
    status: Optional[str] = Query(None),
    league: Optional[str] = Query(None, description="Tournament name filter"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Paginated list of tennis matches."""
    return _service.get_match_list(
        db, status=status, league=league, date_from=date_from, date_to=date_to, limit=limit, offset=offset
    )


@router.get("/matches/preview", response_model=TennisMatchDetail)
def get_tennis_match_preview(
    home: str = Query(..., description="Home player name"),
    away: str = Query(..., description="Away player name"),
    db: Session = Depends(get_db),
):
    """ELO-based match preview when no DB record exists for upcoming/untracked games."""
    return _service.preview_match(home, away, db)


@router.get("/matches/{match_id}", response_model=TennisMatchDetail)
def get_tennis_match(match_id: str, db: Session = Depends(get_db)):
    """Full tennis match detail with ELO, stats, form, and H2H."""
    return _service.get_match_detail(match_id, db)


@router.get("/players/{player_id}/elo-history", response_model=list[EloHistoryPoint])
def get_player_elo_history(
    player_id: str,
    surface: Optional[str] = Query(None, description="Surface context: global | hard | clay | grass"),
    limit: int = Query(30, ge=5, le=100),
    db: Session = Depends(get_db),
):
    """ELO rating history for a tennis player (chronological, most recent N matches)."""
    # When no surface specified, return all contexts (backfill uses surface contexts not 'global')
    context = surface.lower() if surface else None
    q = db.query(RatingEloTeam).filter(RatingEloTeam.team_id == player_id)
    if context:
        q = q.filter(RatingEloTeam.context == context)
    rows = q.order_by(RatingEloTeam.rated_at.desc()).limit(limit).all()
    return [
        EloHistoryPoint(
            date=r.rated_at.isoformat(),
            rating=round(r.rating_after, 1),
            match_id=r.match_id,
        )
        for r in reversed(rows)
    ]
