"""
Cross-sport matches endpoints (live feed, etc.).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_db
from db.models.mvp import CoreMatch, CoreTeam, CoreLeague

router = APIRouter(prefix="/matches", tags=["matches"])

ALL_SPORTS = ["soccer", "tennis", "esports", "basketball", "baseball"]


class LiveMatchOut(BaseModel):
    id: str
    sport: str
    league: str
    home_id: str
    home_name: str
    away_id: str
    away_name: str
    home_score: Optional[int]
    away_score: Optional[int]
    kickoff_utc: str
    is_live: bool  # True = currently live; False = next upcoming for that sport


def _build_out(m: CoreMatch, teams: dict, leagues: dict, is_live: bool) -> LiveMatchOut:
    return LiveMatchOut(
        id=m.id,
        sport=m.sport,
        league=leagues.get(m.league_id, ""),
        home_id=m.home_team_id,
        home_name=teams.get(m.home_team_id, m.home_team_id),
        away_id=m.away_team_id,
        away_name=teams.get(m.away_team_id, m.away_team_id),
        home_score=m.home_score,
        away_score=m.away_score,
        kickoff_utc=m.kickoff_utc.isoformat() if m.kickoff_utc else "",
        is_live=is_live,
    )


@router.get("/live", response_model=list[LiveMatchOut])
def get_live_matches(db: Session = Depends(get_db)):
    """
    Return live matches for every sport.
    For sports with no live matches, fall back to their next 3 upcoming scheduled matches.
    """
    now = datetime.now(timezone.utc)

    # Fetch all live matches
    live_rows = (
        db.query(CoreMatch)
        .filter(CoreMatch.status == "live")
        .order_by(CoreMatch.sport.asc(), CoreMatch.kickoff_utc.asc())
        .all()
    )
    live_by_sport: dict[str, list[CoreMatch]] = {}
    for m in live_rows:
        live_by_sport.setdefault(m.sport, []).append(m)

    # For sports with no live matches, get next 3 upcoming
    upcoming_by_sport: dict[str, list[CoreMatch]] = {}
    for sport in ALL_SPORTS:
        if sport not in live_by_sport:
            rows = (
                db.query(CoreMatch)
                .filter(
                    CoreMatch.sport == sport,
                    CoreMatch.status == "scheduled",
                    CoreMatch.kickoff_utc > now,
                )
                .order_by(CoreMatch.kickoff_utc.asc())
                .limit(3)
                .all()
            )
            if rows:
                upcoming_by_sport[sport] = rows

    # Collect all matches to batch-load names
    all_matches = live_rows + [m for rows in upcoming_by_sport.values() for m in rows]
    team_ids = {m.home_team_id for m in all_matches} | {m.away_team_id for m in all_matches}
    league_ids = {m.league_id for m in all_matches if m.league_id}

    teams = {t.id: t.name for t in db.query(CoreTeam).filter(CoreTeam.id.in_(team_ids)).all()} if team_ids else {}
    leagues = {lg.id: lg.name for lg in db.query(CoreLeague).filter(CoreLeague.id.in_(league_ids)).all()} if league_ids else {}

    result: list[LiveMatchOut] = []

    # Live sports first, then upcoming fallbacks — ordered by ALL_SPORTS
    for sport in ALL_SPORTS:
        if sport in live_by_sport:
            for m in live_by_sport[sport]:
                result.append(_build_out(m, teams, leagues, is_live=True))
        elif sport in upcoming_by_sport:
            for m in upcoming_by_sport[sport]:
                result.append(_build_out(m, teams, leagues, is_live=False))

    return result
