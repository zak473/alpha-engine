"""
Soccer-specific API schemas.

These extend the generic match representation with soccer-specific
statistics, ELO snapshots, and H2H data.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ── Shared sub-schemas ─────────────────────────────────────────────────────

class ParticipantOut(BaseModel):
    id: str
    name: str


class ProbabilitiesOut(BaseModel):
    home_win: float
    draw: float
    away_win: float


class FairOddsOut(BaseModel):
    home_win: float
    draw: float
    away_win: float


class ModelMetaOut(BaseModel):
    version: str
    algorithm: Optional[str] = None
    trained_at: Optional[datetime] = None
    accuracy: Optional[float] = None
    brier_score: Optional[float] = None
    n_train_samples: Optional[int] = None


class KeyDriverOut(BaseModel):
    feature: str
    value: Optional[float] = None
    importance: float


# ── Soccer-specific ────────────────────────────────────────────────────────

class SoccerTeamStatsOut(BaseModel):
    team_id: str
    team_name: str
    is_home: bool
    shots_total: Optional[int] = None
    shots_on_target: Optional[int] = None
    xg: Optional[float] = None
    xga: Optional[float] = None
    possession_pct: Optional[float] = None
    passes_completed: Optional[int] = None
    pass_accuracy_pct: Optional[float] = None
    fouls: Optional[int] = None
    yellow_cards: Optional[int] = None
    red_cards: Optional[int] = None
    corners: Optional[int] = None
    offsides: Optional[int] = None
    big_chances_created: Optional[int] = None
    big_chances_missed: Optional[int] = None
    aerial_duels_won: Optional[int] = None
    aerial_duels_lost: Optional[int] = None
    crosses: Optional[int] = None
    long_balls_accurate: Optional[int] = None
    through_balls: Optional[int] = None
    tackles_won: Optional[int] = None
    interceptions: Optional[int] = None
    clearances: Optional[int] = None
    blocks: Optional[int] = None
    shots_inside_box: Optional[int] = None
    shots_outside_box: Optional[int] = None
    dribbles_completed: Optional[int] = None


class EloSnapshotOut(BaseModel):
    team_id: str
    team_name: str
    rating: float
    rating_change: Optional[float] = None   # delta from previous match (None if no history)


class H2HRecordOut(BaseModel):
    total_matches: int
    home_wins: int
    draws: int
    away_wins: int
    recent_matches: list[dict]   # last 5 meetings: [{date, home, away, score, outcome}]


class ScorelineOut(BaseModel):
    score: str
    probability: float


class SimulationOut(BaseModel):
    n_simulations: int
    distribution: list[ScorelineOut]
    mean_home_goals: Optional[float] = None
    mean_away_goals: Optional[float] = None


class EloHistoryPoint(BaseModel):
    date: str
    rating: float
    match_id: Optional[str] = None


class FormStatsOut(BaseModel):
    """Rolling form averages (last 5 matches before kickoff) from the feature pipeline."""
    team_name: str
    form_pts: Optional[float] = None          # 0–15
    wins: Optional[int] = None
    draws: Optional[int] = None
    losses: Optional[int] = None
    goals_scored_avg: Optional[float] = None
    goals_conceded_avg: Optional[float] = None
    xg_avg: Optional[float] = None
    xga_avg: Optional[float] = None
    days_rest: Optional[float] = None
    clean_sheets: Optional[int] = None
    btts: Optional[int] = None  # both teams scored count
    form_last_5: Optional[list[str]] = None  # ["W","D","L","W","W"]
    ppda_avg: Optional[float] = None  # pressing intensity (lower = more pressing)
    shots_avg: Optional[float] = None
    shots_on_target_avg: Optional[float] = None
    corners_avg: Optional[float] = None


class EventContextOut(BaseModel):
    venue_name: Optional[str] = None
    venue_city: Optional[str] = None
    attendance: Optional[int] = None
    neutral_site: bool = False
    weather_desc: Optional[str] = None
    temperature_c: Optional[float] = None
    stadium_capacity: Optional[int] = None
    surface: Optional[str] = None  # "grass" | "artificial"
    referee: Optional[str] = None  # quick ref name in context


# ── New rich schemas ────────────────────────────────────────────────────────

class SoccerPlayerOut(BaseModel):
    player_id: Optional[str] = None
    name: str
    position: Optional[str] = None  # "GK"|"CB"|"LB"|"RB"|"CDM"|"CM"|"CAM"|"LW"|"RW"|"ST"
    jersey: Optional[int] = None
    is_starter: bool = True
    minutes: Optional[int] = None
    # Attacking
    goals: Optional[int] = None
    assists: Optional[int] = None
    xg: Optional[float] = None
    shots: Optional[int] = None
    shots_on_target: Optional[int] = None
    key_passes: Optional[int] = None
    dribbles_completed: Optional[int] = None
    # Defensive
    tackles: Optional[int] = None
    interceptions: Optional[int] = None
    clearances: Optional[int] = None
    aerial_duels_won: Optional[int] = None
    # Passing
    passes: Optional[int] = None
    passes_completed: Optional[int] = None
    pass_accuracy: Optional[float] = None
    long_balls: Optional[int] = None
    crosses: Optional[int] = None
    # Goalkeeper
    saves: Optional[int] = None
    goals_conceded: Optional[int] = None
    # Discipline
    yellow_cards: Optional[int] = None
    red_cards: Optional[int] = None
    # Match rating
    rating: Optional[float] = None  # 1.0-10.0


class SoccerLineupOut(BaseModel):
    team_id: str
    team_name: str
    formation: Optional[str] = None  # e.g. "4-3-3"
    players: list[SoccerPlayerOut] = []


class SoccerInjuryOut(BaseModel):
    player_name: str
    position: Optional[str] = None
    status: str  # "Out" | "Doubtful" | "Questionable"
    reason: Optional[str] = None
    expected_return: Optional[str] = None  # "2 weeks" | "Unknown"
    impact: Optional[str] = None  # "High" | "Medium" | "Low"


class SoccerRefereeOut(BaseModel):
    name: str
    nationality: Optional[str] = None
    yellow_cards_per_game: Optional[float] = None
    red_cards_per_game: Optional[float] = None
    fouls_per_game: Optional[float] = None
    penalties_per_game: Optional[float] = None
    home_win_pct: Optional[float] = None


class SoccerLeagueContextOut(BaseModel):
    home_position: Optional[int] = None
    away_position: Optional[int] = None
    home_points: Optional[int] = None
    away_points: Optional[int] = None
    home_games_played: Optional[int] = None
    away_games_played: Optional[int] = None
    points_gap: Optional[int] = None  # home_points minus away_points
    top_4_gap_home: Optional[int] = None  # home distance from 4th place
    relegation_gap_away: Optional[int] = None  # away distance from drop zone
    home_form_rank: Optional[int] = None
    away_form_rank: Optional[int] = None


class SoccerAdvancedTeamStatsOut(BaseModel):
    team_id: str
    team_name: str
    ppda: Optional[float] = None  # passes allowed per def action (lower = more pressing)
    high_press_success_rate: Optional[float] = None
    big_chances_created: Optional[int] = None
    big_chances_missed: Optional[int] = None
    big_chance_conversion_pct: Optional[float] = None
    set_piece_goals: Optional[int] = None
    corners_won: Optional[int] = None
    corner_conversion_pct: Optional[float] = None
    offsides_caught: Optional[int] = None
    errors_leading_to_goal: Optional[int] = None
    aerial_duel_win_pct: Optional[float] = None
    crosses_completed: Optional[int] = None
    cross_accuracy_pct: Optional[float] = None
    xpts: Optional[float] = None  # expected points from xG
    progressive_passes: Optional[int] = None
    progressive_carries: Optional[int] = None
    final_third_entries: Optional[int] = None
    penalty_box_touches: Optional[int] = None


# ── List item ──────────────────────────────────────────────────────────────

class SoccerMatchListItem(BaseModel):
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
    live_clock: Optional[str] = None          # "34'", "HT", "Q3"
    current_period: Optional[int] = None
    elo_home: Optional[float] = None
    elo_away: Optional[float] = None
    elo_diff: Optional[float] = None
    confidence: Optional[int] = None
    p_home: Optional[float] = None
    p_draw: Optional[float] = None
    p_away: Optional[float] = None


class SoccerMatchListResponse(BaseModel):
    items: list[SoccerMatchListItem]
    total: int
    sport: str = "soccer"


# ── Full detail ────────────────────────────────────────────────────────────

class SoccerMatchDetail(BaseModel):
    id: str
    sport: str = "soccer"
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
    current_state: Optional[dict] = None      # sport-specific live blob

    probabilities: Optional[ProbabilitiesOut] = None
    fair_odds: Optional[FairOddsOut] = None
    confidence: Optional[int] = None
    key_drivers: list[KeyDriverOut] = []
    model: Optional[ModelMetaOut] = None

    elo_home: Optional[EloSnapshotOut] = None
    elo_away: Optional[EloSnapshotOut] = None

    stats_home: Optional[SoccerTeamStatsOut] = None
    stats_away: Optional[SoccerTeamStatsOut] = None
    form_home: Optional[FormStatsOut] = None
    form_away: Optional[FormStatsOut] = None

    h2h: Optional[H2HRecordOut] = None
    context: Optional[EventContextOut] = None
    simulation: Optional[SimulationOut] = None

    # Lineups
    lineup_home: Optional[SoccerLineupOut] = None
    lineup_away: Optional[SoccerLineupOut] = None
    # Injuries
    injuries_home: Optional[list[SoccerInjuryOut]] = None
    injuries_away: Optional[list[SoccerInjuryOut]] = None
    # Referee
    referee: Optional[SoccerRefereeOut] = None
    # League context
    league_context: Optional[SoccerLeagueContextOut] = None
    # Advanced team stats
    adv_home: Optional[SoccerAdvancedTeamStatsOut] = None
    adv_away: Optional[SoccerAdvancedTeamStatsOut] = None
    # Betting market
    betting: Optional[dict] = None  # {spread, total, home_ml, away_ml, draw_ml}
