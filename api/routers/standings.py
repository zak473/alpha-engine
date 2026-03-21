"""
Standings endpoints — serve league tables for all Highlightly sports.

GET /api/v1/standings/{sport}               → all standings for a sport
GET /api/v1/standings/{sport}/{league_id}   → standings for a specific league
GET /api/v1/standings/match/{match_id}      → standings for the league a match belongs to
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from api.sports.soccer.schemas import StandingRowOut, StandingsResponse
from db.models.mvp import CoreLeague, CoreStanding

router = APIRouter(prefix="/api/v1/standings", tags=["Standings"])


def _build_response(
    league: CoreLeague,
    rows: list[CoreStanding],
    season: str,
) -> StandingsResponse:
    table = [
        StandingRowOut(
            position=r.position,
            team_id=r.team_id,
            team_name=r.team_name,
            team_logo=r.team_logo,
            played=r.played,
            won=r.won,
            drawn=r.drawn,
            lost=r.lost,
            goals_for=r.goals_for,
            goals_against=r.goals_against,
            goal_diff=r.goal_diff,
            points=r.points,
            form=r.form,
            group_name=r.group_name,
        )
        for r in rows
    ]
    # Sort by position if available, otherwise by points desc
    table.sort(key=lambda x: (x.position or 999, -(x.points or 0)))
    updated = rows[0].updated_at.isoformat() if rows and rows[0].updated_at else None
    return StandingsResponse(
        league_id=league.id,
        league_name=league.name,
        league_logo=league.logo_url,
        season=season,
        sport=league.sport or "unknown",
        table=table,
        updated_at=updated,
    )


@router.get("/{sport}", response_model=list[StandingsResponse])
def get_standings_by_sport(
    sport: str,
    season: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Return standings for all leagues of a sport."""
    if not season:
        season = str(datetime.now(timezone.utc).year)

    leagues = db.query(CoreLeague).filter(
        CoreLeague.sport == sport,
        CoreLeague.provider_id.like("hl-league-%"),
        CoreLeague.is_active == True,
    ).all()

    results = []
    for league in leagues:
        rows = (
            db.query(CoreStanding)
            .filter(CoreStanding.league_id == league.id, CoreStanding.season == season)
            .order_by(CoreStanding.position)
            .all()
        )
        if rows:
            results.append(_build_response(league, rows, season))

    return results


@router.get("/match/{match_id}", response_model=Optional[StandingsResponse])
def get_standings_for_match(
    match_id: str,
    db: Session = Depends(get_db),
):
    """Return the league standings table for the league a match belongs to."""
    from db.models.mvp import CoreMatch
    match = db.get(CoreMatch, match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    if not match.league_id:
        return None

    league = db.get(CoreLeague, match.league_id)
    if not league:
        return None

    season = match.season or str(datetime.now(timezone.utc).year)
    rows = (
        db.query(CoreStanding)
        .filter(CoreStanding.league_id == league.id, CoreStanding.season == season)
        .order_by(CoreStanding.position)
        .all()
    )
    if not rows:
        return None

    return _build_response(league, rows, season)


@router.get("/{sport}/{league_id}", response_model=Optional[StandingsResponse])
def get_standings_for_league(
    sport: str,
    league_id: str,
    season: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Return standings for a specific league (by internal UUID)."""
    league = db.get(CoreLeague, league_id)
    if not league:
        raise HTTPException(status_code=404, detail="League not found")

    if not season:
        season = str(datetime.now(timezone.utc).year)

    rows = (
        db.query(CoreStanding)
        .filter(CoreStanding.league_id == league_id, CoreStanding.season == season)
        .order_by(CoreStanding.position)
        .all()
    )
    if not rows:
        return None

    return _build_response(league, rows, season)
