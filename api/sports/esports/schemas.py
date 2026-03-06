"""Esports-specific API schemas — CS2 + LoL aware."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ParticipantOut(BaseModel):
    id: str
    name: str


class ProbabilitiesOut(BaseModel):
    home_win: float
    away_win: float


class FairOddsOut(BaseModel):
    home_win: Optional[float] = None
    away_win: Optional[float] = None


class KeyDriverOut(BaseModel):
    feature: str
    value: Optional[float] = None
    importance: float


class ModelMetaOut(BaseModel):
    version: str
    algorithm: Optional[str] = None
    trained_at: Optional[datetime] = None
    accuracy: Optional[float] = None
    brier_score: Optional[float] = None
    n_train_samples: Optional[int] = None


class EloHistoryPoint(BaseModel):
    date: str
    rating: float
    match_id: Optional[str] = None


# ─── H2H ─────────────────────────────────────────────────────────────────────

class H2HRecordOut(BaseModel):
    total_matches: int
    team_a_wins: int
    team_b_wins: int
    recent_matches: list[dict]


# ─── ELO panel ───────────────────────────────────────────────────────────────

class EsportsEloPanel(BaseModel):
    team_id: str
    team_name: str
    overall_rating: float
    map_ratings: dict[str, float] = {}     # cs2: map_name → rating
    rating_change: Optional[float] = None


# ─── Match meta ───────────────────────────────────────────────────────────────

class EsportsMatchInfo(BaseModel):
    game_type: str                          # "cs2" | "lol" | "valorant" | "dota2"
    series_format: str                      # "bo1" | "bo3" | "bo5"
    is_lan: bool = False
    patch_version: Optional[str] = None
    stage: Optional[str] = None
    tournament_tier: Optional[str] = None


# ─── Team form ────────────────────────────────────────────────────────────────

class EsportsTeamFormOut(BaseModel):
    team_name: str
    series_played: int = 0
    series_won: int = 0
    series_win_pct: Optional[float] = None
    maps_played: int = 0
    maps_won: int = 0
    map_win_pct: Optional[float] = None
    avg_adr: Optional[float] = None
    avg_kast: Optional[float] = None
    avg_rating: Optional[float] = None
    ct_win_pct: Optional[float] = None
    t_win_pct: Optional[float] = None
    current_win_streak: int = 0
    current_loss_streak: int = 0
    lan_win_pct: Optional[float] = None
    online_win_pct: Optional[float] = None
    roster_stability_score: Optional[float] = None
    # CS2 extended
    pistol_round_win_pct: Optional[float] = None
    eco_win_pct: Optional[float] = None
    force_buy_win_pct: Optional[float] = None
    avg_clutch_rate: Optional[float] = None
    # LoL extended
    avg_game_duration_min: Optional[float] = None
    avg_first_blood_pct: Optional[float] = None
    avg_dragons_per_game: Optional[float] = None
    avg_towers_per_game: Optional[float] = None
    blue_side_win_pct: Optional[float] = None
    red_side_win_pct: Optional[float] = None


# ─── CS2-specific ─────────────────────────────────────────────────────────────

class EsportsVetoEntry(BaseModel):
    action: str                             # "ban" | "pick" | "left_over"
    team: str                               # "a" | "b" | "decider"
    map_name: str


class Cs2EconomyStatsOut(BaseModel):
    """Per-map / series economy breakdown for a CS2 team."""
    team: str                               # "a" | "b"
    pistol_rounds_played: int = 0
    pistol_rounds_won: int = 0
    pistol_win_pct: Optional[float] = None
    eco_rounds: int = 0
    eco_wins: int = 0
    eco_win_pct: Optional[float] = None
    anti_eco_rounds: int = 0
    anti_eco_wins: int = 0
    force_buy_rounds: int = 0
    force_buy_wins: int = 0
    force_buy_win_pct: Optional[float] = None
    full_buy_rounds: int = 0
    full_buy_wins: int = 0
    full_buy_win_pct: Optional[float] = None
    avg_starting_money: Optional[float] = None
    avg_equipment_value: Optional[float] = None
    conversion_after_pistol_win: Optional[float] = None   # % of rounds won after pistol win


class Cs2UtilityStatsOut(BaseModel):
    """Utility (grenade) usage stats per team."""
    team: str
    flashes_thrown: Optional[int] = None
    flash_assists: Optional[int] = None
    enemies_flashed_per_round: Optional[float] = None
    he_damage_per_round: Optional[float] = None
    smokes_thrown: Optional[int] = None
    molotovs_thrown: Optional[int] = None
    utility_damage_per_round: Optional[float] = None
    utility_per_round: Optional[float] = None


class Cs2OpeningDuelOut(BaseModel):
    """Opening duel (first-blood) statistics."""
    team: str
    opening_duels: int = 0
    opening_wins: int = 0
    opening_win_pct: Optional[float] = None
    opening_attempts_per_round: Optional[float] = None
    top_opener: Optional[str] = None          # player name with most opening attempts
    top_opener_win_pct: Optional[float] = None


class EsportsMapOut(BaseModel):
    map_number: int
    map_name: str
    team_a_score: Optional[int] = None
    team_b_score: Optional[int] = None
    team_a_ct_rounds: Optional[int] = None
    team_b_ct_rounds: Optional[int] = None
    team_a_t_rounds: Optional[int] = None
    team_b_t_rounds: Optional[int] = None
    overtime_rounds: int = 0
    winner: Optional[str] = None
    side_bias: Optional[float] = None
    # Economy breakdown per map
    economy_a: Optional[Cs2EconomyStatsOut] = None
    economy_b: Optional[Cs2EconomyStatsOut] = None


class EsportsPlayerStatsOut(BaseModel):
    player_name: str
    player_id: Optional[str] = None
    team: str
    # CS2
    kills: Optional[int] = None
    deaths: Optional[int] = None
    assists: Optional[int] = None
    kd_ratio: Optional[float] = None
    adr: Optional[float] = None
    kast_pct: Optional[float] = None
    rating_2: Optional[float] = None
    headshot_pct: Optional[float] = None
    first_kills: Optional[int] = None
    first_deaths: Optional[int] = None
    clutches_won: Optional[int] = None
    # CS2 extended
    flash_assists: Optional[int] = None
    utility_damage: Optional[float] = None
    opening_kill_rate: Optional[float] = None
    # LoL
    role: Optional[str] = None
    kda: Optional[float] = None
    kill_participation_pct: Optional[float] = None
    cs_per_min: Optional[float] = None
    gold_per_min: Optional[float] = None
    damage_pct: Optional[float] = None
    vision_score_per_min: Optional[float] = None
    # LoL extended
    damage_per_min: Optional[float] = None
    ward_score: Optional[float] = None
    penta_kills: Optional[int] = None
    solo_kills: Optional[int] = None
    champion: Optional[str] = None


# ─── LoL-specific ─────────────────────────────────────────────────────────────

class EsportsDraftPick(BaseModel):
    phase: str
    team: str
    champion: str
    role: Optional[str] = None


class EsportsObjectiveStats(BaseModel):
    team: str
    towers: Optional[int] = None
    dragons: Optional[int] = None
    barons: Optional[int] = None
    heralds: Optional[int] = None
    first_blood: Optional[bool] = None
    first_tower: Optional[bool] = None
    gold_total: Optional[int] = None
    kills: Optional[int] = None
    deaths: Optional[int] = None
    assists: Optional[int] = None
    dragon_soul: Optional[str] = None       # "Infernal" | "Mountain" | "Ocean" | "Cloud" | "Hextech" | "Chemtech"
    elder_dragon: Optional[bool] = None
    rifts_heralds: Optional[int] = None
    inhibitors_destroyed: Optional[int] = None
    ward_kills: Optional[int] = None
    wards_placed: Optional[int] = None
    cs_total: Optional[int] = None


class LolTeamCompOut(BaseModel):
    """Aggregate team composition tags and strategic profile for a LoL series."""
    team: str
    comp_tags: list[str] = []               # e.g. ["engage", "poke", "scaling", "split-push"]
    avg_game_duration_min: Optional[float] = None
    early_game_win_pct: Optional[float] = None   # games won < 30 min
    late_game_win_pct: Optional[float] = None    # games won > 35 min
    blue_side_picks: list[str] = []         # most common blue-side picks across series
    red_side_picks: list[str] = []
    banned_by_opponent: list[str] = []      # most targeted bans against this team
    first_pick_champions: list[str] = []


class LolObjectiveControlOut(BaseModel):
    """Aggregated objective control stats across all games in the series."""
    team: str
    total_dragons: int = 0
    total_barons: int = 0
    total_heralds: int = 0
    total_towers: int = 0
    total_inhibitors: int = 0
    first_blood_rate: Optional[float] = None
    first_tower_rate: Optional[float] = None
    dragon_soul_secured: int = 0
    elder_dragon_secured: int = 0
    avg_gold_diff_at_10: Optional[float] = None
    avg_gold_diff_at_15: Optional[float] = None
    avg_gold_diff_at_20: Optional[float] = None


class EsportsGameOut(BaseModel):
    game_number: int
    duration_min: Optional[float] = None
    winner: Optional[str] = None
    team_a_obj: Optional[EsportsObjectiveStats] = None
    team_b_obj: Optional[EsportsObjectiveStats] = None
    gold_diff_at_10: Optional[int] = None
    gold_diff_at_15: Optional[int] = None
    gold_diff_at_20: Optional[int] = None
    draft_a: list[EsportsDraftPick] = []
    draft_b: list[EsportsDraftPick] = []
    patch: Optional[str] = None
    blue_side: Optional[str] = None         # "a" | "b"


# ─── List + Detail ────────────────────────────────────────────────────────────

class EsportsMatchListItem(BaseModel):
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
    game_type: Optional[str] = None


class EsportsMatchListResponse(BaseModel):
    items: list[EsportsMatchListItem]
    total: int
    sport: str = "esports"


class EsportsMatchDetail(BaseModel):
    id: str
    sport: str = "esports"
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
    elo_home: Optional[EsportsEloPanel] = None
    elo_away: Optional[EsportsEloPanel] = None
    h2h: Optional[H2HRecordOut] = None
    match_info: Optional[EsportsMatchInfo] = None
    form_home: Optional[EsportsTeamFormOut] = None
    form_away: Optional[EsportsTeamFormOut] = None
    # CS2
    maps: list[EsportsMapOut] = []
    veto: list[EsportsVetoEntry] = []
    players_home: list[EsportsPlayerStatsOut] = []
    players_away: list[EsportsPlayerStatsOut] = []
    # CS2 advanced
    cs2_economy_home: list[Cs2EconomyStatsOut] = []     # one entry per map
    cs2_economy_away: list[Cs2EconomyStatsOut] = []
    cs2_utility_home: Optional[Cs2UtilityStatsOut] = None
    cs2_utility_away: Optional[Cs2UtilityStatsOut] = None
    cs2_opening_duels_home: Optional[Cs2OpeningDuelOut] = None
    cs2_opening_duels_away: Optional[Cs2OpeningDuelOut] = None
    # LoL
    games: list[EsportsGameOut] = []
    lol_comp_home: Optional[LolTeamCompOut] = None
    lol_comp_away: Optional[LolTeamCompOut] = None
    lol_objectives_home: Optional[LolObjectiveControlOut] = None
    lol_objectives_away: Optional[LolObjectiveControlOut] = None
    # Betting
    betting: Optional[dict] = None
