"""
Baseball API endpoints — H2H, rolling team stats, match box score.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from db.models.baseball import BaseballTeamMatchStats
from db.models.mvp import CoreMatch, CoreTeam

router = APIRouter(prefix="/baseball", tags=["Baseball"], dependencies=[Depends(get_current_user)])


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


class BaseballTeamStatsResponse(BaseModel):
    team_id: str
    team_name: str
    games: int
    avg_runs: Optional[float]
    avg_runs_allowed: Optional[float]
    avg_hits: Optional[float]
    avg_era: Optional[float]
    avg_whip: Optional[float]
    avg_ops: Optional[float]
    avg_batting_avg: Optional[float]


class BaseballTeamBoxScore(BaseModel):
    team_id: str
    team_name: str
    is_home: bool
    runs: Optional[int]
    hits: Optional[int]
    doubles: Optional[int]
    triples: Optional[int]
    home_runs: Optional[int]
    rbi: Optional[int]
    walks: Optional[int]
    strikeouts_batting: Optional[int]
    batting_avg: Optional[float]
    obp: Optional[float]
    slg: Optional[float]
    ops: Optional[float]
    left_on_base: Optional[int]
    era: Optional[float]
    innings_pitched: Optional[float]
    hits_allowed: Optional[int]
    earned_runs: Optional[int]
    walks_allowed: Optional[int]
    strikeouts_pitching: Optional[int]
    whip: Optional[float]
    pitcher_name: Optional[str]
    errors: Optional[int]
    double_plays: Optional[int]


class BaseballBoxScoreResponse(BaseModel):
    match_id: str
    home: Optional[BaseballTeamBoxScore]
    away: Optional[BaseballTeamBoxScore]


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/h2h/{team_a_id}/{team_b_id}", response_model=H2HResponse)
def get_head_to_head(
    team_a_id: str,
    team_b_id: str,
    db: Session = Depends(get_db),
):
    """Head-to-head record between two baseball teams."""
    matches = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == "baseball",
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


@router.get("/teams/{team_id}/stats", response_model=BaseballTeamStatsResponse)
def get_team_stats(team_id: str, db: Session = Depends(get_db)):
    """Rolling stats for a baseball team based on their last 10 games."""
    team_name = _team_name(db, team_id)

    rows = (
        db.query(BaseballTeamMatchStats)
        .join(CoreMatch, CoreMatch.id == BaseballTeamMatchStats.match_id)
        .filter(BaseballTeamMatchStats.team_id == team_id)
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

    # Runs allowed = opponent's runs in the same match
    runs_allowed_list: List[Optional[int]] = []
    for r in rows:
        opp = (
            db.query(BaseballTeamMatchStats)
            .filter(
                BaseballTeamMatchStats.match_id == r.match_id,
                BaseballTeamMatchStats.team_id != team_id,
            )
            .first()
        )
        runs_allowed_list.append(opp.runs if opp else None)

    return BaseballTeamStatsResponse(
        team_id=team_id,
        team_name=team_name,
        games=len(rows),
        avg_runs=_avg([r.runs for r in rows]),
        avg_runs_allowed=_avg(runs_allowed_list),
        avg_hits=_avg([r.hits for r in rows]),
        avg_era=_avg([r.era for r in rows]),
        avg_whip=_avg([r.whip for r in rows]),
        avg_ops=_avg([r.ops for r in rows]),
        avg_batting_avg=_avg([r.batting_avg for r in rows]),
    )


@router.get("/matches/{match_id}/boxscore", response_model=BaseballBoxScoreResponse)
def get_match_boxscore(match_id: str, db: Session = Depends(get_db)):
    """Box score for a specific baseball match."""
    match = db.get(CoreMatch, match_id)
    if match is None or match.sport != "baseball":
        raise HTTPException(status_code=404, detail=f"Baseball match {match_id} not found")

    stat_rows = (
        db.query(BaseballTeamMatchStats)
        .filter(BaseballTeamMatchStats.match_id == match_id)
        .all()
    )

    if not stat_rows:
        raise HTTPException(
            status_code=404,
            detail=f"No box score data found for match {match_id}",
        )

    def _to_schema(row: BaseballTeamMatchStats) -> BaseballTeamBoxScore:
        return BaseballTeamBoxScore(
            team_id=row.team_id,
            team_name=_team_name(db, row.team_id),
            is_home=row.is_home,
            runs=row.runs,
            hits=row.hits,
            doubles=row.doubles,
            triples=row.triples,
            home_runs=row.home_runs,
            rbi=row.rbi,
            walks=row.walks,
            strikeouts_batting=row.strikeouts_batting,
            batting_avg=row.batting_avg,
            obp=row.obp,
            slg=row.slg,
            ops=row.ops,
            left_on_base=row.left_on_base,
            era=row.era,
            innings_pitched=row.innings_pitched,
            hits_allowed=row.hits_allowed,
            earned_runs=row.earned_runs,
            walks_allowed=row.walks_allowed,
            strikeouts_pitching=row.strikeouts_pitching,
            whip=row.whip,
            pitcher_name=row.pitcher_name,
            errors=row.errors,
            double_plays=row.double_plays,
        )

    home_row = next((r for r in stat_rows if r.is_home), None)
    away_row = next((r for r in stat_rows if not r.is_home), None)

    return BaseballBoxScoreResponse(
        match_id=match_id,
        home=_to_schema(home_row) if home_row else None,
        away=_to_schema(away_row) if away_row else None,
    )
