"""Basketball-specific API schemas — full Quant Terminal depth."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ─── Shared primitives ─────────────────────────────────────────────────────

class ParticipantOut(BaseModel):
    id: str
    name: str


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
    draws: Optional[int] = None
    recent_matches: list[dict]


class KeyDriverOut(BaseModel):
    feature: str
    importance: float
    value: Optional[float] = None
    direction: Optional[str] = None   # "home" | "away" | "neutral"


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
    ot: Optional[int] = None     # overtime
    ot2: Optional[int] = None    # 2OT


class BasketballMatchInfo(BaseModel):
    arena: Optional[str] = None
    city: Optional[str] = None
    attendance: Optional[int] = None
    tipoff_time_local: Optional[str] = None
    season_phase: Optional[str] = None   # regular | playoffs | preseason
    series_game: Optional[str] = None    # e.g. "Game 4 of 7"
    pace: Optional[float] = None         # possessions per 48 min
    home_quarters: Optional[QuarterScore] = None
    away_quarters: Optional[QuarterScore] = None
    home_record: Optional[str] = None    # "28-14"
    away_record: Optional[str] = None
    home_streak: Optional[str] = None    # "W3" | "L2"
    away_streak: Optional[str] = None
    home_home_record: Optional[str] = None
    away_away_record: Optional[str] = None
    referee_crew: Optional[list[str]] = None
    overtime_periods: Optional[int] = None


class BasketballEloPanelOut(BaseModel):
    team_id: str
    team_name: str
    rating: float
    rating_change: Optional[float] = None
    rating_pre: Optional[float] = None
    rating_post: Optional[float] = None
    k_used: Optional[float] = None
    home_advantage_applied: Optional[float] = None
    mov_modifier: Optional[float] = None
    rest_modifier: Optional[float] = None
    days_rest: Optional[int] = None
    back_to_back: Optional[bool] = None
    implied_win_prob: Optional[float] = None
    elo_win_prob: Optional[float] = None
    last_10_ratings: Optional[list[float]] = None


class BasketballTeamFormEntry(BaseModel):
    date: str
    opponent: str
    score: str
    home_away: str   # "H" | "A" | "N"
    result: str      # "W" | "L"
    net_rtg: Optional[float] = None
    days_rest: Optional[int] = None


class BasketballTeamFormOut(BaseModel):
    team_id: str
    team_name: str
    last_5: Optional[list[BasketballTeamFormEntry]] = None
    wins_last_5: Optional[int] = None
    losses_last_5: Optional[int] = None
    avg_pts_for: Optional[float] = None
    avg_pts_against: Optional[float] = None
    ortg_last_5: Optional[float] = None
    drtg_last_5: Optional[float] = None
    net_rtg_last_5: Optional[float] = None
    days_rest: Optional[int] = None
    back_to_back: Optional[bool] = None
    injury_count: Optional[int] = None


class BasketballInjuryOut(BaseModel):
    player_name: str
    position: Optional[str] = None
    status: str          # "Out" | "Doubtful" | "Questionable" | "Probable"
    reason: Optional[str] = None


class BasketballPlayerOut(BaseModel):
    player_id: Optional[str] = None
    name: str
    position: Optional[str] = None
    jersey: Optional[str] = None
    is_starter: bool = True
    minutes: Optional[float] = None
    # Box score
    points: Optional[int] = None
    rebounds: Optional[int] = None
    reb_off: Optional[int] = None
    reb_def: Optional[int] = None
    assists: Optional[int] = None
    steals: Optional[int] = None
    blocks: Optional[int] = None
    turnovers: Optional[int] = None
    fouls: Optional[int] = None
    plus_minus: Optional[int] = None
    # Shooting splits
    fg_made: Optional[int] = None
    fg_att: Optional[int] = None
    fg_pct: Optional[float] = None
    fg3_made: Optional[int] = None
    fg3_att: Optional[int] = None
    fg3_pct: Optional[float] = None
    ft_made: Optional[int] = None
    ft_att: Optional[int] = None
    ft_pct: Optional[float] = None
    # Advanced
    ts_pct: Optional[float] = None
    usage_pct: Optional[float] = None


class BasketballTeamBoxScore(BaseModel):
    team_id: str
    team_name: str
    is_home: bool
    players: list[BasketballPlayerOut] = []
    # Team totals
    total_points: Optional[int] = None
    total_rebounds: Optional[int] = None
    total_assists: Optional[int] = None
    total_steals: Optional[int] = None
    total_blocks: Optional[int] = None
    total_turnovers: Optional[int] = None
    total_fouls: Optional[int] = None
    fg_pct: Optional[float] = None
    fg3_pct: Optional[float] = None
    ft_pct: Optional[float] = None
    fg_made: Optional[int] = None
    fg_att: Optional[int] = None
    fg3_made: Optional[int] = None
    fg3_att: Optional[int] = None
    ft_made: Optional[int] = None
    ft_att: Optional[int] = None
    bench_points: Optional[int] = None
    fast_break_pts: Optional[int] = None
    pts_in_paint: Optional[int] = None
    second_chance_pts: Optional[int] = None
    points_off_turnovers: Optional[int] = None
    largest_lead: Optional[int] = None
    lead_changes: Optional[int] = None
    times_tied: Optional[int] = None
    timeouts_remaining: Optional[int] = None


class BasketballAdvancedStatsOut(BaseModel):
    team_id: str
    team_name: str
    is_home: bool
    # Ratings
    ortg: Optional[float] = None
    drtg: Optional[float] = None
    net_rtg: Optional[float] = None
    pace: Optional[float] = None
    # Advanced
    efg_pct: Optional[float] = None
    ts_pct: Optional[float] = None
    tov_pct: Optional[float] = None
    orb_pct: Optional[float] = None
    drb_pct: Optional[float] = None
    ftr: Optional[float] = None      # FTA/FGA
    three_par: Optional[float] = None  # 3PA rate
    second_half_ortg: Optional[float] = None
    second_half_drtg: Optional[float] = None
    clutch_net_rtg: Optional[float] = None
    transition_pct: Optional[float] = None
    half_court_ortg: Optional[float] = None
    avg_shot_distance: Optional[float] = None
    paint_pct: Optional[float] = None
    midrange_pct: Optional[float] = None


class ShotZoneOut(BaseModel):
    zone: str          # "Rim" | "Short Mid" | "Mid" | "Corner 3" | "Above Arc 3"
    attempts: int
    made: int
    pct: float
    attempts_pct: float  # share of total shots


# ─── New expanded schemas ────────────────────────────────────────────────────

class BasketballClutchStatsOut(BaseModel):
    """Stats in clutch situations: game within 5 pts, last 5 minutes."""
    team_id: str
    team_name: str
    clutch_minutes: Optional[float] = None
    clutch_points: Optional[int] = None
    clutch_fg_pct: Optional[float] = None
    clutch_fg3_pct: Optional[float] = None
    clutch_ft_pct: Optional[float] = None
    clutch_turnovers: Optional[int] = None
    clutch_net_rating: Optional[float] = None
    clutch_wins_season: Optional[int] = None
    clutch_losses_season: Optional[int] = None
    clutch_fg_made: Optional[int] = None
    clutch_fg_att: Optional[int] = None
    clutch_free_throws_won: Optional[int] = None


class BasketballLineupUnitOut(BaseModel):
    """Five-man lineup efficiency unit."""
    players: list[str]
    minutes: Optional[float] = None
    net_rating: Optional[float] = None
    ortg: Optional[float] = None
    drtg: Optional[float] = None
    plus_minus: Optional[int] = None
    fg_pct: Optional[float] = None
    pace: Optional[float] = None
    possessions: Optional[int] = None


class BasketballScoringRunOut(BaseModel):
    """Largest scoring run by a team in this game."""
    team: str   # "home" | "away"
    run_size: int
    period: str  # "Q1" | "Q2" | "Q3" | "Q4" | "OT"
    time_started: Optional[str] = None
    time_ended: Optional[str] = None


class BasketballRefereeOut(BaseModel):
    """Referee crew and tendencies."""
    names: list[str]
    avg_fouls_per_game: Optional[float] = None
    avg_fta_per_game: Optional[float] = None
    home_foul_rate: Optional[float] = None
    technicals_per_game: Optional[float] = None
    home_win_pct: Optional[float] = None
    avg_total_points: Optional[float] = None


class BasketballBettingOut(BaseModel):
    spread: Optional[float] = None
    total: Optional[float] = None
    home_ml: Optional[float] = None
    away_ml: Optional[float] = None
    spread_line_move: Optional[float] = None
    total_line_move: Optional[float] = None
    sharp_side_spread: Optional[str] = None
    implied_home_total: Optional[float] = None
    implied_away_total: Optional[float] = None


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
    home_back_to_back: Optional[bool] = None
    away_back_to_back: Optional[bool] = None
    odds_home: Optional[float] = None
    odds_away: Optional[float] = None
    game_type: str = "basketball"


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
    kickoff_utc: datetime
    status: str
    home: ParticipantOut
    away: ParticipantOut
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    outcome: Optional[str] = None
    live_clock: Optional[str] = None
    current_period: Optional[int] = None
    current_state: Optional[dict] = None
    # Model
    probabilities: Optional[ProbabilitiesOut] = None
    confidence: Optional[int] = None
    fair_odds: Optional[FairOddsOut] = None
    key_drivers: Optional[list[KeyDriverOut]] = None
    model: Optional[ModelMetaOut] = None
    # ELO panels
    elo_home: Optional[BasketballEloPanelOut] = None
    elo_away: Optional[BasketballEloPanelOut] = None
    # Match info
    match_info: Optional[BasketballMatchInfo] = None
    # Form
    form_home: Optional[BasketballTeamFormOut] = None
    form_away: Optional[BasketballTeamFormOut] = None
    # Box score
    box_home: Optional[BasketballTeamBoxScore] = None
    box_away: Optional[BasketballTeamBoxScore] = None
    # Advanced stats (season averages / last N games)
    adv_home: Optional[BasketballAdvancedStatsOut] = None
    adv_away: Optional[BasketballAdvancedStatsOut] = None
    # Injuries / lineups
    injuries_home: Optional[list[BasketballInjuryOut]] = None
    injuries_away: Optional[list[BasketballInjuryOut]] = None
    # Shot zones
    shots_home: Optional[list[ShotZoneOut]] = None
    shots_away: Optional[list[ShotZoneOut]] = None
    # H2H
    h2h: Optional[H2HRecordOut] = None
    # Context / venue
    context: Optional[dict] = None
    # Data completeness flags
    data_completeness: Optional[dict] = None
    # Clutch stats
    clutch_home: Optional[BasketballClutchStatsOut] = None
    clutch_away: Optional[BasketballClutchStatsOut] = None
    # Five-man lineup units
    top_lineups_home: Optional[list[BasketballLineupUnitOut]] = None
    top_lineups_away: Optional[list[BasketballLineupUnitOut]] = None
    # Scoring runs
    scoring_runs: Optional[list[BasketballScoringRunOut]] = None
    # Referee
    referee: Optional[BasketballRefereeOut] = None
    # Betting
    betting: Optional[BasketballBettingOut] = None
