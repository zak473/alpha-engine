"""Baseball-specific API schemas — full Quant Terminal depth."""

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


# ─── Baseball-specific ──────────────────────────────────────────────────────

class InningScore(BaseModel):
    """Runs scored in a single inning."""
    inning: int
    home: Optional[int] = None
    away: Optional[int] = None


class BaseballWeatherOut(BaseModel):
    temperature_f: Optional[float] = None
    temperature_c: Optional[float] = None
    wind_speed_mph: Optional[float] = None
    wind_direction: Optional[str] = None   # e.g. "out to LF", "in from CF"
    conditions: Optional[str] = None      # "Clear", "Partly Cloudy", "Overcast"
    humidity_pct: Optional[float] = None


class BaseballMatchInfo(BaseModel):
    ballpark: Optional[str] = None
    city: Optional[str] = None
    attendance: Optional[int] = None
    game_time_local: Optional[str] = None
    series_info: Optional[str] = None     # "Game 3 of 4"
    umpire_home_plate: Optional[str] = None
    innings_played: Optional[int] = None
    home_record: Optional[str] = None
    away_record: Optional[str] = None
    home_streak: Optional[str] = None
    away_streak: Optional[str] = None
    home_bullpen_era: Optional[float] = None
    away_bullpen_era: Optional[float] = None
    # Line score
    inning_scores: Optional[list[InningScore]] = None
    home_hits: Optional[int] = None
    home_errors: Optional[int] = None
    away_hits: Optional[int] = None
    away_errors: Optional[int] = None
    # Weather
    weather: Optional[BaseballWeatherOut] = None
    # Park factor (ELO)
    park_factor: Optional[float] = None  # 0 = neutral; +30 = hitter-friendly


class PitchTypeOut(BaseModel):
    """A single pitch type in a pitcher's arsenal."""
    pitch_name: str
    usage_pct: float
    velocity_avg: Optional[float] = None
    velocity_max: Optional[float] = None
    spin_rate: Optional[int] = None
    horizontal_break: Optional[float] = None
    vertical_break: Optional[float] = None
    whiff_pct: Optional[float] = None
    put_away_pct: Optional[float] = None
    ba_against: Optional[float] = None


class BattedBallStatsOut(BaseModel):
    """Statcast-style batted ball data."""
    team_id: Optional[str] = None
    team_name: Optional[str] = None
    avg_exit_velocity: Optional[float] = None
    max_exit_velocity: Optional[float] = None
    avg_launch_angle: Optional[float] = None
    barrel_pct: Optional[float] = None
    hard_hit_pct: Optional[float] = None
    sweet_spot_pct: Optional[float] = None
    gb_pct: Optional[float] = None
    fb_pct: Optional[float] = None
    ld_pct: Optional[float] = None
    pu_pct: Optional[float] = None
    pull_pct: Optional[float] = None
    center_pct: Optional[float] = None
    oppo_pct: Optional[float] = None
    xba: Optional[float] = None
    xslg: Optional[float] = None
    xwoba: Optional[float] = None


class SituationalBattingOut(BaseModel):
    """Situational batting stats for a team."""
    team_id: str
    team_name: str
    risp_avg: Optional[float] = None
    risp_obp: Optional[float] = None
    risp_ops: Optional[float] = None
    two_out_risp_avg: Optional[float] = None
    leadoff_avg: Optional[float] = None
    leadoff_obp: Optional[float] = None
    bases_loaded_avg: Optional[float] = None
    late_close_avg: Optional[float] = None
    vs_lhp_ops: Optional[float] = None
    vs_rhp_ops: Optional[float] = None
    clutch_score: Optional[float] = None


class UmpireOut(BaseModel):
    """Home plate umpire profile."""
    name: str
    games_called: Optional[int] = None
    k_zone_size: Optional[float] = None
    strikeouts_per_game: Optional[float] = None
    walks_per_game: Optional[float] = None
    first_pitch_strike_pct: Optional[float] = None
    home_win_pct: Optional[float] = None
    run_scoring_impact: Optional[float] = None
    over_record: Optional[str] = None


class StarterPitcherOut(BaseModel):
    """Starting pitcher profile for a team."""
    player_id: Optional[str] = None
    name: str
    hand: Optional[str] = None       # "R" | "L" | "S"
    # Season stats
    era: Optional[float] = None
    fip: Optional[float] = None
    whip: Optional[float] = None
    k_per_9: Optional[float] = None
    bb_per_9: Optional[float] = None
    hr_per_9: Optional[float] = None
    # Season volume
    games_started: Optional[int] = None
    wins: Optional[int] = None
    losses: Optional[int] = None
    innings_pitched_season: Optional[float] = None
    # Rate stats (per PA)
    k_pct: Optional[float] = None
    bb_pct: Optional[float] = None
    k_bb_ratio: Optional[float] = None
    # Batted ball
    gb_pct: Optional[float] = None
    fb_pct: Optional[float] = None
    ld_pct: Optional[float] = None
    hr_fb_pct: Optional[float] = None
    # Regression metrics
    babip: Optional[float] = None
    lob_pct: Optional[float] = None
    xfip: Optional[float] = None
    siera: Optional[float] = None
    xera: Optional[float] = None
    # Pitch arsenal
    pitch_arsenal: Optional[list[PitchTypeOut]] = None
    # This game line
    ip: Optional[float] = None       # innings pitched
    hits_allowed: Optional[int] = None
    earned_runs: Optional[int] = None
    strikeouts: Optional[int] = None
    walks: Optional[int] = None
    hr_allowed: Optional[int] = None
    pitches_thrown: Optional[int] = None
    strikes_pct: Optional[float] = None
    # Recent form (last 3 starts)
    last_3_era: Optional[float] = None
    # Elo / rating component
    elo_adj: Optional[float] = None   # pitcher quality adjustment to team ELO


class BullpenPitcherOut(BaseModel):
    """Reliever line for a team."""
    name: str
    hand: Optional[str] = None
    ip: Optional[float] = None
    earned_runs: Optional[int] = None
    strikeouts: Optional[int] = None
    walks: Optional[int] = None
    pitches_thrown: Optional[int] = None
    # Fatigue
    days_since_last: Optional[int] = None    # 0 = pitched yesterday
    pitches_last_3d: Optional[int] = None


class BullpenSummaryOut(BaseModel):
    team_id: str
    team_name: str
    pitchers: list[BullpenPitcherOut] = []
    total_ip: Optional[float] = None
    total_pitches_last_3d: Optional[int] = None
    fatigue_score: Optional[float] = None    # 0–10, higher = more tired


class BatterOut(BaseModel):
    player_id: Optional[str] = None
    name: str
    position: Optional[str] = None
    batting_order: Optional[int] = None
    hand: Optional[str] = None       # "R" | "L" | "S"
    # Season averages
    batting_avg: Optional[float] = None
    obp: Optional[float] = None
    slg: Optional[float] = None
    ops: Optional[float] = None
    woba: Optional[float] = None
    # Advanced
    iso: Optional[float] = None
    babip: Optional[float] = None
    k_pct: Optional[float] = None
    bb_pct: Optional[float] = None
    hard_hit_pct: Optional[float] = None
    barrel_pct: Optional[float] = None
    sprint_speed: Optional[float] = None
    xba: Optional[float] = None
    xslg: Optional[float] = None
    xwoba: Optional[float] = None
    # Game line
    at_bats: Optional[int] = None
    runs: Optional[int] = None
    hits: Optional[int] = None
    rbi: Optional[int] = None
    walks: Optional[int] = None
    strikeouts: Optional[int] = None
    home_runs: Optional[int] = None
    doubles: Optional[int] = None
    triples: Optional[int] = None
    stolen_bases: Optional[int] = None


class BaseballTeamBattingOut(BaseModel):
    team_id: str
    team_name: str
    is_home: bool
    batters: list[BatterOut] = []
    # Team totals
    total_runs: Optional[int] = None
    total_hits: Optional[int] = None
    total_hr: Optional[int] = None
    total_rbi: Optional[int] = None
    total_bb: Optional[int] = None
    total_so: Optional[int] = None
    total_lob: Optional[int] = None    # left on base
    # Team averages
    team_avg: Optional[float] = None
    team_obp: Optional[float] = None
    team_slg: Optional[float] = None
    team_ops: Optional[float] = None


class BaseballEloPanelOut(BaseModel):
    team_id: str
    team_name: str
    rating: float
    rating_change: Optional[float] = None
    rating_pre: Optional[float] = None
    rating_post: Optional[float] = None
    k_used: Optional[float] = None
    home_advantage_applied: Optional[float] = None
    pitcher_adj: Optional[float] = None    # starting pitcher quality delta
    park_factor_applied: Optional[float] = None
    bullpen_fatigue_adj: Optional[float] = None
    implied_win_prob: Optional[float] = None
    elo_win_prob: Optional[float] = None
    last_10_ratings: Optional[list[float]] = None


class BaseballTeamFormEntry(BaseModel):
    date: str
    opponent: str
    score: str          # "3-1" (team-opponent)
    home_away: str      # "H" | "A"
    result: str         # "W" | "L"
    starter: Optional[str] = None
    starter_era: Optional[float] = None
    park: Optional[str] = None


class BaseballTeamFormOut(BaseModel):
    team_id: str
    team_name: str
    last_5: Optional[list[BaseballTeamFormEntry]] = None
    wins_last_5: Optional[int] = None
    losses_last_5: Optional[int] = None
    avg_runs_for: Optional[float] = None
    avg_runs_against: Optional[float] = None
    team_era_last_5: Optional[float] = None
    bullpen_era_last_5: Optional[float] = None
    starter: Optional[StarterPitcherOut] = None   # upcoming or game starter


class InningEvent(BaseModel):
    inning: int
    half: str            # "top" | "bottom"
    description: str     # "HR - Judge (solo) | 0-1"
    event_type: Optional[str] = None   # "HR" | "RBI" | "E" | "PC"  (pitching change)
    team: Optional[str] = None         # "home" | "away"


# ─── List / response schemas ────────────────────────────────────────────────

class BaseballMatchListItem(BaseModel):
    id: str
    league: str
    season: Optional[str] = None
    kickoff_utc: datetime
    status: str
    home_id: str
    home_name: str
    away_id: str
    away_name: str
    home_score: Optional[int] = None   # runs
    away_score: Optional[int] = None
    outcome: Optional[str] = None
    live_clock: Optional[str] = None
    current_period: Optional[int] = None
    elo_home: Optional[float] = None
    elo_away: Optional[float] = None
    p_home: Optional[float] = None
    p_away: Optional[float] = None
    confidence: Optional[int] = None
    home_starter: Optional[str] = None
    away_starter: Optional[str] = None
    odds_home: Optional[float] = None
    odds_away: Optional[float] = None
    game_type: str = "baseball"


class BaseballMatchListResponse(BaseModel):
    items: list[BaseballMatchListItem]
    total: int
    sport: str = "baseball"


# ─── Full detail schema ─────────────────────────────────────────────────────

class BaseballMatchDetail(BaseModel):
    id: str
    sport: str = "baseball"
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
    elo_home: Optional[BaseballEloPanelOut] = None
    elo_away: Optional[BaseballEloPanelOut] = None
    # Match info
    match_info: Optional[BaseballMatchInfo] = None
    # Starting pitchers
    starter_home: Optional[StarterPitcherOut] = None
    starter_away: Optional[StarterPitcherOut] = None
    # Bullpen
    bullpen_home: Optional[BullpenSummaryOut] = None
    bullpen_away: Optional[BullpenSummaryOut] = None
    # Batting
    batting_home: Optional[BaseballTeamBattingOut] = None
    batting_away: Optional[BaseballTeamBattingOut] = None
    # Form
    form_home: Optional[BaseballTeamFormOut] = None
    form_away: Optional[BaseballTeamFormOut] = None
    # Inning events
    inning_events: Optional[list[InningEvent]] = None
    # H2H
    h2h: Optional[H2HRecordOut] = None
    # Context / venue
    context: Optional[dict] = None
    # Data completeness
    data_completeness: Optional[dict] = None
    # Batted ball data
    batted_ball_home: Optional[BattedBallStatsOut] = None
    batted_ball_away: Optional[BattedBallStatsOut] = None
    # Situational batting
    situational_home: Optional[SituationalBattingOut] = None
    situational_away: Optional[SituationalBattingOut] = None
    # Umpire
    umpire: Optional[UmpireOut] = None
    # Betting
    betting: Optional[dict] = None
