"""
Basketball API endpoints — H2H, rolling team stats, match box score.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from db.models.basketball import BasketballTeamMatchStats
from db.models.mvp import CoreMatch, CoreTeam

router = APIRouter(prefix="/basketball", tags=["Basketball"], dependencies=[Depends(get_current_user)])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _team_name(db: Session, team_id: str) -> str:
    t = db.get(CoreTeam, team_id)
    return t.name if t else team_id


# ─── Response schemas ─────────────────────────────────────────────────────────

class RecentMatch(BaseModel):
    date: str
    home_team: str
    away_team: str
    home_score: Optional[int]
    away_score: Optional[int]
    outcome: Optional[str]


class H2HResponse(BaseModel):
    team_a_id: str
    team_b_id: str
    team_a_name: str
    team_b_name: str
    matches_played: int
    team_a_wins: int
    team_b_wins: int
    draws: int
    win_rate_a: float
    win_rate_b: float
    recent: List[RecentMatch]


class BasketballTeamStatsResponse(BaseModel):
    team_id: str
    team_name: str
    games: int
    avg_points: Optional[float]
    avg_points_allowed: Optional[float]
    avg_fg_pct: Optional[float]
    avg_fg3_pct: Optional[float]
    avg_rebounds: Optional[float]
    avg_assists: Optional[float]
    avg_turnovers: Optional[float]
    avg_net_rating: Optional[float]


class BasketballTeamBoxScore(BaseModel):
    team_id: str
    team_name: str
    is_home: bool
    points: Optional[int]
    fg_made: Optional[int]
    fg_attempted: Optional[int]
    fg_pct: Optional[float]
    fg3_made: Optional[int]
    fg3_attempted: Optional[int]
    fg3_pct: Optional[float]
    ft_made: Optional[int]
    ft_attempted: Optional[int]
    ft_pct: Optional[float]
    rebounds_total: Optional[int]
    rebounds_offensive: Optional[int]
    rebounds_defensive: Optional[int]
    assists: Optional[int]
    steals: Optional[int]
    blocks: Optional[int]
    turnovers: Optional[int]
    fouls: Optional[int]
    pace: Optional[float]
    offensive_rating: Optional[float]
    defensive_rating: Optional[float]
    net_rating: Optional[float]


class BasketballBoxScoreResponse(BaseModel):
    match_id: str
    home: Optional[BasketballTeamBoxScore]
    away: Optional[BasketballTeamBoxScore]


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/h2h/{team_a_id}/{team_b_id}", response_model=H2HResponse)
def get_head_to_head(
    team_a_id: str,
    team_b_id: str,
    db: Session = Depends(get_db),
):
    """Head-to-head record between two basketball teams."""
    matches = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == "basketball",
            CoreMatch.status == "finished",
            (
                (
                    (CoreMatch.home_team_id == team_a_id)
                    & (CoreMatch.away_team_id == team_b_id)
                )
                | (
                    (CoreMatch.home_team_id == team_b_id)
                    & (CoreMatch.away_team_id == team_a_id)
                )
            ),
        )
        .order_by(CoreMatch.kickoff_utc.desc())
        .all()
    )

    team_a_name = _team_name(db, team_a_id)
    team_b_name = _team_name(db, team_b_id)

    team_a_wins = 0
    team_b_wins = 0
    draws = 0
    recent: List[RecentMatch] = []

    for m in matches:
        if m.outcome == "home_win":
            winner_id = m.home_team_id
        elif m.outcome == "away_win":
            winner_id = m.away_team_id
        else:
            winner_id = None

        if winner_id == team_a_id:
            team_a_wins += 1
        elif winner_id == team_b_id:
            team_b_wins += 1
        else:
            draws += 1

        if len(recent) < 5:
            recent.append(
                RecentMatch(
                    date=m.kickoff_utc.isoformat(),
                    home_team=_team_name(db, m.home_team_id),
                    away_team=_team_name(db, m.away_team_id),
                    home_score=m.home_score,
                    away_score=m.away_score,
                    outcome=m.outcome,
                )
            )

    matches_played = len(matches)
    win_rate_a = round(team_a_wins / matches_played, 3) if matches_played > 0 else 0.0
    win_rate_b = round(team_b_wins / matches_played, 3) if matches_played > 0 else 0.0

    return H2HResponse(
        team_a_id=team_a_id,
        team_b_id=team_b_id,
        team_a_name=team_a_name,
        team_b_name=team_b_name,
        matches_played=matches_played,
        team_a_wins=team_a_wins,
        team_b_wins=team_b_wins,
        draws=draws,
        win_rate_a=win_rate_a,
        win_rate_b=win_rate_b,
        recent=recent,
    )


@router.get("/teams/{team_id}/stats", response_model=BasketballTeamStatsResponse)
def get_team_stats(team_id: str, db: Session = Depends(get_db)):
    """Rolling stats for a basketball team based on their last 10 games."""
    team_name = _team_name(db, team_id)

    rows = (
        db.query(BasketballTeamMatchStats)
        .join(CoreMatch, CoreMatch.id == BasketballTeamMatchStats.match_id)
        .filter(BasketballTeamMatchStats.team_id == team_id)
        .order_by(CoreMatch.kickoff_utc.desc())
        .limit(10)
        .all()
    )

    if not rows:
        raise HTTPException(status_code=404, detail=f"No stats found for team {team_id}")

    def _avg(values: list) -> Optional[float]:
        valid = [v for v in values if v is not None]
        if not valid:
            return None
        return round(sum(valid) / len(valid), 3)

    # For points_allowed we need opponent's points from the same match
    points_list = [r.points for r in rows]

    # Build a parallel list of opponent points by querying the other team's row
    points_allowed_list: List[Optional[int]] = []
    for r in rows:
        opp = (
            db.query(BasketballTeamMatchStats)
            .filter(
                BasketballTeamMatchStats.match_id == r.match_id,
                BasketballTeamMatchStats.team_id != team_id,
            )
            .first()
        )
        points_allowed_list.append(opp.points if opp else None)

    return BasketballTeamStatsResponse(
        team_id=team_id,
        team_name=team_name,
        games=len(rows),
        avg_points=_avg(points_list),
        avg_points_allowed=_avg(points_allowed_list),
        avg_fg_pct=_avg([r.fg_pct for r in rows]),
        avg_fg3_pct=_avg([r.fg3_pct for r in rows]),
        avg_rebounds=_avg([r.rebounds_total for r in rows]),
        avg_assists=_avg([r.assists for r in rows]),
        avg_turnovers=_avg([r.turnovers for r in rows]),
        avg_net_rating=_avg([r.net_rating for r in rows]),
    )


@router.get("/matches/{match_id}/boxscore", response_model=BasketballBoxScoreResponse)
def get_match_boxscore(match_id: str, db: Session = Depends(get_db)):
    """Box score for a specific basketball match."""
    match = db.get(CoreMatch, match_id)
    if match is None or match.sport != "basketball":
        raise HTTPException(status_code=404, detail=f"Basketball match {match_id} not found")

    stat_rows = (
        db.query(BasketballTeamMatchStats)
        .filter(BasketballTeamMatchStats.match_id == match_id)
        .all()
    )

    if not stat_rows:
        raise HTTPException(
            status_code=404,
            detail=f"No box score data found for match {match_id}",
        )

    def _to_schema(row: BasketballTeamMatchStats) -> BasketballTeamBoxScore:
        return BasketballTeamBoxScore(
            team_id=row.team_id,
            team_name=_team_name(db, row.team_id),
            is_home=row.is_home,
            points=row.points,
            fg_made=row.fg_made,
            fg_attempted=row.fg_attempted,
            fg_pct=row.fg_pct,
            fg3_made=row.fg3_made,
            fg3_attempted=row.fg3_attempted,
            fg3_pct=row.fg3_pct,
            ft_made=row.ft_made,
            ft_attempted=row.ft_attempted,
            ft_pct=row.ft_pct,
            rebounds_total=row.rebounds_total,
            rebounds_offensive=row.rebounds_offensive,
            rebounds_defensive=row.rebounds_defensive,
            assists=row.assists,
            steals=row.steals,
            blocks=row.blocks,
            turnovers=row.turnovers,
            fouls=row.fouls,
            pace=row.pace,
            offensive_rating=row.offensive_rating,
            defensive_rating=row.defensive_rating,
            net_rating=row.net_rating,
        )

    home_row = next((r for r in stat_rows if r.is_home), None)
    away_row = next((r for r in stat_rows if not r.is_home), None)

    return BasketballBoxScoreResponse(
        match_id=match_id,
        home=_to_schema(home_row) if home_row else None,
        away=_to_schema(away_row) if away_row else None,
    )
