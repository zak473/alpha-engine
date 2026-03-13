"""
Cross-sport matches endpoints (live feed, etc.).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from db.models.mvp import CoreMatch, CoreTeam, CoreLeague

router = APIRouter(prefix="/matches", tags=["matches"], dependencies=[Depends(get_current_user)])

ALL_SPORTS = ["soccer", "tennis", "esports", "basketball", "baseball", "hockey"]


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
    live_clock: Optional[str] = None
    current_period: Optional[int] = None
    home_logo: Optional[str] = None
    away_logo: Optional[str] = None
    league_logo: Optional[str] = None


def _build_out(m: CoreMatch, teams: dict, leagues: dict, team_logos: dict, league_logos: dict, is_live: bool) -> LiveMatchOut:
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
        live_clock=m.live_clock if is_live else None,
        current_period=m.current_period if is_live else None,
        home_logo=team_logos.get(m.home_team_id),
        away_logo=team_logos.get(m.away_team_id),
        league_logo=league_logos.get(m.league_id),
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

    team_objs = {t.id: t for t in db.query(CoreTeam).filter(CoreTeam.id.in_(team_ids)).all()} if team_ids else {}
    league_objs = {lg.id: lg for lg in db.query(CoreLeague).filter(CoreLeague.id.in_(league_ids)).all()} if league_ids else {}
    teams = {tid: t.name for tid, t in team_objs.items()}
    leagues = {lid: lg.name for lid, lg in league_objs.items()}
    team_logos = {tid: t.logo_url for tid, t in team_objs.items() if t.logo_url}
    league_logos = {lid: lg.logo_url for lid, lg in league_objs.items() if lg.logo_url}

    result: list[LiveMatchOut] = []

    # Live sports first, then upcoming fallbacks — ordered by ALL_SPORTS
    for sport in ALL_SPORTS:
        if sport in live_by_sport:
            for m in live_by_sport[sport]:
                result.append(_build_out(m, teams, leagues, team_logos, league_logos, is_live=True))
        elif sport in upcoming_by_sport:
            for m in upcoming_by_sport[sport]:
                result.append(_build_out(m, teams, leagues, team_logos, league_logos, is_live=False))

    return result


class SearchResult(BaseModel):
    id: str
    type: str          # "match" | "team"
    sport: str
    title: str
    subtitle: str
    href: str
    status: Optional[str] = None


@router.get("/search", response_model=list[SearchResult])
def search(
    q: str,
    limit: int = 10,
    db: Session = Depends(get_db),
):
    """Full-text search across matches and teams. Returns up to `limit` results."""
    if not q or len(q.strip()) < 2:
        return []

    term = q.strip().lower()
    results: list[SearchResult] = []

    # Search teams
    from sqlalchemy import or_
    teams = (
        db.query(CoreTeam)
        .filter(
            or_(
                CoreTeam.name.ilike(f"%{term}%"),
                CoreTeam.short_name.ilike(f"%{term}%"),
            )
        )
        .limit(5)
        .all()
    )
    for t in teams:
        results.append(SearchResult(
            id=t.id, type="team", sport="",
            title=t.name,
            subtitle=t.country or "",
            href=f"/sports/soccer/matches?team={t.id}",
        ))

    # Search matches by team names
    now = datetime.now(timezone.utc)
    matches = (
        db.query(CoreMatch)
        .join(CoreTeam, CoreTeam.id == CoreMatch.home_team_id)
        .filter(
            or_(
                CoreTeam.name.ilike(f"%{term}%"),
                CoreMatch.home_team_id.in_(
                    db.query(CoreTeam.id).filter(CoreTeam.name.ilike(f"%{term}%"))
                ),
                CoreMatch.away_team_id.in_(
                    db.query(CoreTeam.id).filter(CoreTeam.name.ilike(f"%{term}%"))
                ),
            )
        )
        .order_by(CoreMatch.kickoff_utc.desc())
        .limit(limit)
        .all()
    )

    if matches:
        team_ids = {m.home_team_id for m in matches} | {m.away_team_id for m in matches}
        team_map = {t.id: t.name for t in db.query(CoreTeam).filter(CoreTeam.id.in_(team_ids)).all()}
        for m in matches:
            home = team_map.get(m.home_team_id, "")
            away = team_map.get(m.away_team_id, "")
            sport_slug = m.sport
            results.append(SearchResult(
                id=m.id, type="match", sport=sport_slug,
                title=f"{home} vs {away}",
                subtitle=f"{m.sport.capitalize()} · {m.kickoff_utc.strftime('%d %b %Y') if m.kickoff_utc else ''}",
                href=f"/sports/{sport_slug}/matches/{m.id}",
                status=m.status,
            ))

    return results[:limit]
