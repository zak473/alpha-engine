"""Hockey-specific API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ─── Shared primitives ─────────────────────────────────────────────────────

class ParticipantOut(BaseModel):
    id: str
    name: str
    logo_url: Optional[str] = None


class ProbabilitiesOut(BaseModel):
    home_win: float
    away_win: float
    draw: Optional[float] = None


class FairOddsOut(BaseModel):
    home_win: Optional[float] = None
    away_win: Optional[float] = None


class EloHistoryPoint(BaseModel):
    date: str
    rating: float
    match_id: Optional[str] = None


class H2HRecordOut(BaseModel):
    total_matches: int
    home_wins: int
    away_wins: int
    recent_matches: list[dict]


class KeyDriverOut(BaseModel):
    feature: str
    importance: float
    value: Optional[float] = None
    direction: Optional[str] = None


class ModelMetaOut(BaseModel):
    version: str
    algorithm: Optional[str] = None
    trained_at: Optional[str] = None
    n_train_samples: Optional[int] = None
    accuracy: Optional[float] = None
    brier_score: Optional[float] = None


# ─── Hockey-specific ────────────────────────────────────────────────────────

class HockeyEventOut(BaseModel):
    period: Optional[int] = None
    time: Optional[str] = None       # e.g. "12:34"
    type: Optional[str] = None       # "goal" | "penalty" | "penalty_shot" | "fight"
    team: Optional[str] = None       # "home" | "away"
    player_name: Optional[str] = None
    assist1: Optional[str] = None
    assist2: Optional[str] = None
    description: Optional[str] = None
    score_home: Optional[int] = None
    score_away: Optional[int] = None


class HockeyLineupPlayer(BaseModel):
    name: str
    number: Optional[str] = None
    position: Optional[str] = None
    is_starter: bool = True
    is_goalie: bool = False


class HockeyLineupOut(BaseModel):
    team_id: str
    team_name: str
    formation: Optional[str] = None
    players: list[HockeyLineupPlayer] = []
    goalie: Optional[str] = None


class PeriodScore(BaseModel):
    p1: Optional[int] = None
    p2: Optional[int] = None
    p3: Optional[int] = None
    ot: Optional[int] = None
    so: Optional[int] = None   # shootout


class EloPanelOut(BaseModel):
    team_id: str
    team_name: str
    rating: float
    rating_change: Optional[float] = None
    implied_win_prob: Optional[float] = None
    elo_win_prob: Optional[float] = None


# ─── List / response schemas ────────────────────────────────────────────────

class HockeyMatchListItem(BaseModel):
    id: str
    league: str
    season: Optional[str] = None
    kickoff_utc: datetime
    status: str
    home_id: str
    home_name: str
    away_id: str
    away_name: str
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    outcome: Optional[str] = None
    live_clock: Optional[str] = None
    current_period: Optional[int] = None
    elo_home: Optional[float] = None
    elo_away: Optional[float] = None
    p_home: Optional[float] = None
    p_away: Optional[float] = None
    confidence: Optional[int] = None
    odds_home: Optional[float] = None
    odds_away: Optional[float] = None
    game_type: str = "hockey"
    home_logo: Optional[str] = None
    away_logo: Optional[str] = None
    league_logo: Optional[str] = None


class HockeyMatchListResponse(BaseModel):
    items: list[HockeyMatchListItem]
    total: int
    sport: str = "hockey"


class HockeyTeamFormOut(BaseModel):
    team_name: str
    wins: int = 0
    draws: int = 0
    losses: int = 0
    form_pts: Optional[float] = None
    goals_scored_avg: Optional[float] = None
    goals_conceded_avg: Optional[float] = None


class HockeyTeamStatsOut(BaseModel):
    team_name: str
    shots: Optional[int] = None
    shots_on_goal: Optional[int] = None
    hits: Optional[int] = None
    blocked_shots: Optional[int] = None
    faceoff_wins: Optional[int] = None
    faceoff_pct: Optional[float] = None
    power_plays: Optional[int] = None
    power_play_goals: Optional[int] = None
    penalty_minutes: Optional[int] = None


# ─── Full detail schema ─────────────────────────────────────────────────────

class HockeyMatchDetail(BaseModel):
    id: str
    sport: str = "hockey"
    league: str
    season: Optional[str] = None
    kickoff_utc: Optional[datetime] = None
    status: str
    home: ParticipantOut
    away: ParticipantOut
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    outcome: Optional[str] = None
    live_clock: Optional[str] = None
    current_period: Optional[int] = None
    home_periods: Optional[PeriodScore] = None
    away_periods: Optional[PeriodScore] = None
    # Model
    probabilities: Optional[ProbabilitiesOut] = None
    confidence: Optional[int] = None
    fair_odds: Optional[FairOddsOut] = None
    key_drivers: Optional[list[KeyDriverOut]] = None
    model: Optional[ModelMetaOut] = None
    # ELO
    elo_home: Optional[EloPanelOut] = None
    elo_away: Optional[EloPanelOut] = None
    # Form
    form_home: Optional[HockeyTeamFormOut] = None
    form_away: Optional[HockeyTeamFormOut] = None
    # Team stats (from Highlightly live/post-match)
    stats_home: Optional[HockeyTeamStatsOut] = None
    stats_away: Optional[HockeyTeamStatsOut] = None
    # Lineups
    lineup_home: Optional[HockeyLineupOut] = None
    lineup_away: Optional[HockeyLineupOut] = None
    # Events (goals, penalties)
    events: list[HockeyEventOut] = []
    # H2H
    h2h: Optional[H2HRecordOut] = None
    # Odds
    odds_home: Optional[float] = None
    odds_away: Optional[float] = None
    odds_draw: Optional[float] = None
    # Context
    context: Optional[dict] = None
    data_completeness: Optional[dict] = None
