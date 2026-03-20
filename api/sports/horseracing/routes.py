"""Horse racing API routes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.deps import get_db
from api.sports.horseracing.schemas import RaceDetail, RaceListResponse
from api.sports.horseracing.service import HorseRacingService

router = APIRouter(
    prefix="/sports/horseracing",
    tags=["Horse Racing"],
)

_service = HorseRacingService()


@router.get("/races", response_model=RaceListResponse)
def list_races(
    date: Optional[str] = Query(None, description="Filter by date (YYYY-MM-DD)"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    course: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Paginated list of horse races, ordered by scheduled time."""
    return _service.get_race_list(
        db,
        date=date,
        date_from=date_from,
        date_to=date_to,
        course=course,
        region=region,
        status=status,
        limit=limit,
        offset=offset,
    )


@router.get("/races/{race_id}", response_model=RaceDetail)
def get_race(race_id: str, db: Session = Depends(get_db)):
    """Full race detail including all runners and form scores."""
    return _service.get_race_detail(race_id, db)
