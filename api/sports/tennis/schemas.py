"""Tennis-specific API schemas."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


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
    draw: Optional[float] = None


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


class EloHistoryPoint(BaseModel):
    date: str
    rating: float
    match_id: Optional[str] = None


# ─── Tennis-Specific Schemas ─────────────────────────────────────────────────

class TennisSurfaceEloOut(BaseModel):
    """ELO snapshot for a player — overall + surface-specific."""
    player_id: str
    player_name: str
    overall_rating: float
    surface_rating: Optional[float] = None   # surface-adjusted effective rating
    surface_delta: Optional[float] = None    # delta from overall on this surface
    rating_change: Optional[float] = None    # change from previous match


class TennisServeStatsOut(BaseModel):
    """Per-match serve and return stats for one player."""
    player_id: str
    player_name: str
    # Serve
    aces: Optional[int] = None
    double_faults: Optional[int] = None
    first_serve_in_pct: Optional[float] = None
    first_serve_won_pct: Optional[float] = None
    second_serve_won_pct: Optional[float] = None
    service_games_played: Optional[int] = None
    service_games_held: Optional[int] = None
    service_hold_pct: Optional[float] = None
    # Return / Break points
    return_games_played: Optional[int] = None
    return_games_won: Optional[int] = None
    break_points_faced: Optional[int] = None
    break_points_saved: Optional[int] = None
    break_points_created: Optional[int] = None
    break_points_converted: Optional[int] = None
    bp_conversion_pct: Optional[float] = None
    # Points won on return
    first_serve_return_won_pct: Optional[float] = None
    second_serve_return_won_pct: Optional[float] = None
    total_points_won: Optional[int] = None
    # Serve speed
    first_serve_avg_mph: Optional[float] = None
    first_serve_max_mph: Optional[float] = None
    second_serve_avg_mph: Optional[float] = None
    # Groundstrokes
    winners: Optional[int] = None
    unforced_errors: Optional[int] = None
    forced_errors: Optional[int] = None
    winner_ue_ratio: Optional[float] = None
    # Net game
    net_approaches: Optional[int] = None
    net_points_won: Optional[int] = None
    net_win_pct: Optional[float] = None
    # Rally length distribution (% of points won at each length)
    rally_0_4_won_pct: Optional[float] = None
    rally_5_8_won_pct: Optional[float] = None
    rally_9plus_won_pct: Optional[float] = None
    # Points summary
    service_points_played: Optional[int] = None
    service_points_won: Optional[int] = None
    return_points_played: Optional[int] = None
    return_points_won: Optional[int] = None
    total_points_played: Optional[int] = None


class TennisPlayerFormOut(BaseModel):
    """Rolling form statistics for a player (optionally surface-scoped)."""
    player_name: str
    surface: str = "all"
    window_days: int = 365
    matches_played: int = 0
    wins: int = 0
    losses: int = 0
    win_pct: Optional[float] = None
    avg_first_serve_in_pct: Optional[float] = None
    avg_first_serve_won_pct: Optional[float] = None
    avg_service_hold_pct: Optional[float] = None
    avg_bp_conversion_pct: Optional[float] = None
    avg_return_won_pct: Optional[float] = None
    avg_aces_per_match: Optional[float] = None
    avg_df_per_match: Optional[float] = None
    matches_since_last_title: Optional[int] = None
    # Surface breakdown
    win_pct_hard: Optional[float] = None
    win_pct_clay: Optional[float] = None
    win_pct_grass: Optional[float] = None
    # Tiebreaks
    tiebreaks_played: Optional[int] = None
    tiebreaks_won: Optional[int] = None
    tiebreak_win_pct: Optional[float] = None
    # Physical / season
    titles_ytd: Optional[int] = None
    finals_ytd: Optional[int] = None
    ranking_trend: Optional[int] = None  # positions changed last 4 weeks (negative = improved)
    avg_match_duration_min: Optional[float] = None
    three_setters_pct: Optional[float] = None


class SetDetailOut(BaseModel):
    """Score for a single set."""
    set_num: int
    a: int
    b: int
    tb_a: Optional[int] = None   # tiebreak score for player A
    tb_b: Optional[int] = None


class TennisMatchInfoOut(BaseModel):
    """Tennis-specific match metadata: surface, round, fatigue, set-by-set."""
    surface: str
    is_indoor: bool = False
    tournament_level: Optional[str] = None
    round_name: Optional[str] = None
    best_of: int = 3
    player_a_days_rest: Optional[int] = None
    player_b_days_rest: Optional[int] = None
    player_a_matches_last_14d: Optional[int] = None
    player_b_matches_last_14d: Optional[int] = None
    match_duration_min: Optional[int] = None
    retired: bool = False
    sets_detail: list[SetDetailOut] = []
    tournament_prize_pool_usd: Optional[int] = None
    points_on_offer: Optional[int] = None  # ranking points for winner
    draw_size: Optional[int] = None
    balls_brand: Optional[str] = None  # "Wilson" | "Penn" | "Slazenger" | "Dunlop"
    court_speed_index: Optional[float] = None  # 0-100, higher = faster


class H2HRecordOut(BaseModel):
    total_matches: int
    player_a_wins: int
    player_b_wins: int
    recent_matches: list[dict]


class TennisPlayerProfileOut(BaseModel):
    """Rich player profile: ranking, biography, career stats."""
    player_id: str
    player_name: str
    nationality: Optional[str] = None
    age: Optional[int] = None
    ranking: Optional[int] = None
    ranking_points: Optional[int] = None
    ranking_change_week: Optional[int] = None  # positive = dropped, negative = rose
    prize_money_ytd_usd: Optional[int] = None
    career_prize_money_usd: Optional[int] = None
    plays: Optional[str] = None  # "Right-handed" | "Left-handed"
    backhand: Optional[str] = None  # "Two-handed" | "One-handed"
    turned_pro: Optional[int] = None
    height_cm: Optional[int] = None
    weight_kg: Optional[int] = None
    coach: Optional[str] = None
    career_titles: Optional[int] = None
    career_grand_slams: Optional[int] = None
    career_win_pct: Optional[float] = None
    season_wins: Optional[int] = None
    season_losses: Optional[int] = None
    highest_ranking: Optional[int] = None
    logo_url: Optional[str] = None


class TennisTiebreakOut(BaseModel):
    """Tiebreak summary for the match."""
    player_a_tiebreaks_won: int = 0
    player_b_tiebreaks_won: int = 0
    tiebreaks: list[dict] = []  # [{set_num, score_a, score_b, winner}]


# ─── List + Detail ────────────────────────────────────────────────────────────

class TennisMatchListItem(BaseModel):
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
    home_logo: Optional[str] = None
    away_logo: Optional[str] = None
    league_logo: Optional[str] = None


class TennisMatchListResponse(BaseModel):
    items: list[TennisMatchListItem]
    total: int
    sport: str = "tennis"


class TennisMatchDetail(BaseModel):
    id: str
    sport: str = "tennis"
    league: str
    season: Optional[str] = None
    kickoff_utc: datetime
    status: str
    home: ParticipantOut
    away: ParticipantOut
    home_score: Optional[int] = None       # sets won by player A
    away_score: Optional[int] = None       # sets won by player B
    outcome: Optional[str] = None
    live_clock: Optional[str] = None
    current_period: Optional[int] = None
    current_state: Optional[dict] = None      # sport-specific live blob
    # Prediction / model
    probabilities: Optional[ProbabilitiesOut] = None
    fair_odds: Optional[FairOddsOut] = None
    confidence: Optional[int] = None
    key_drivers: list[KeyDriverOut] = []
    model: Optional[ModelMetaOut] = None
    # ELO (surface-aware)
    elo_home: Optional[TennisSurfaceEloOut] = None
    elo_away: Optional[TennisSurfaceEloOut] = None
    # Tennis-specific context
    tennis_info: Optional[TennisMatchInfoOut] = None
    # Per-match stats (if finished)
    stats_home: Optional[TennisServeStatsOut] = None
    stats_away: Optional[TennisServeStatsOut] = None
    # Rolling form
    form_home: Optional[TennisPlayerFormOut] = None
    form_away: Optional[TennisPlayerFormOut] = None
    # H2H
    h2h: Optional[H2HRecordOut] = None
    # Rich player profiles
    profile_home: Optional[TennisPlayerProfileOut] = None
    profile_away: Optional[TennisPlayerProfileOut] = None
    # Tiebreaks
    tiebreaks: Optional[TennisTiebreakOut] = None
    # Betting market
    betting: Optional[dict] = None
