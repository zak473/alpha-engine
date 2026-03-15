"""Basketball-specific API schemas."""

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


# ─── Basketball-specific ────────────────────────────────────────────────────

class QuarterScore(BaseModel):
    q1: Optional[int] = None
    q2: Optional[int] = None
    q3: Optional[int] = None
    q4: Optional[int] = None
    ot: Optional[int] = None


class EloPanelOut(BaseModel):
    team_id: str
    team_name: str
    rating: float
    rating_change: Optional[float] = None
    implied_win_prob: Optional[float] = None
    elo_win_prob: Optional[float] = None


class BasketballTeamStatsOut(BaseModel):
    team_name: str
    points: Optional[int] = None
    fg_made: Optional[int] = None
    fg_attempted: Optional[int] = None
    fg_pct: Optional[float] = None
    fg3_made: Optional[int] = None
    fg3_attempted: Optional[int] = None
    fg3_pct: Optional[float] = None
    ft_made: Optional[int] = None
    ft_attempted: Optional[int] = None
    ft_pct: Optional[float] = None
    rebounds_total: Optional[int] = None
    rebounds_offensive: Optional[int] = None
    rebounds_defensive: Optional[int] = None
    assists: Optional[int] = None
    turnovers: Optional[int] = None
    steals: Optional[int] = None
    blocks: Optional[int] = None
    fouls: Optional[int] = None
    plus_minus: Optional[int] = None
    assists_to_turnover: Optional[float] = None
    pace: Optional[float] = None
    offensive_rating: Optional[float] = None
    defensive_rating: Optional[float] = None
    net_rating: Optional[float] = None


class BasketballTeamFormOut(BaseModel):
    team_name: str
    wins: int = 0
    draws: int = 0
    losses: int = 0
    form_pts: Optional[float] = None
    points_scored_avg: Optional[float] = None
    points_conceded_avg: Optional[float] = None


# ─── List / response schemas ────────────────────────────────────────────────

class BasketballMatchListItem(BaseModel):
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
    game_type: str = "basketball"
    home_logo: Optional[str] = None
    away_logo: Optional[str] = None
    league_logo: Optional[str] = None


class BasketballMatchListResponse(BaseModel):
    items: list[BasketballMatchListItem]
    total: int
    sport: str = "basketball"


# ─── Full detail schema ─────────────────────────────────────────────────────

class BasketballMatchDetail(BaseModel):
    id: str
    sport: str = "basketball"
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
    home_quarters: Optional[QuarterScore] = None
    away_quarters: Optional[QuarterScore] = None
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
    form_home: Optional[BasketballTeamFormOut] = None
    form_away: Optional[BasketballTeamFormOut] = None
    # Box score stats
    stats_home: Optional[BasketballTeamStatsOut] = None
    stats_away: Optional[BasketballTeamStatsOut] = None
    # H2H
    h2h: Optional[H2HRecordOut] = None
    # Odds
    odds_home: Optional[float] = None
    odds_away: Optional[float] = None
    # Context
    context: Optional[dict] = None
    data_completeness: Optional[dict] = None
