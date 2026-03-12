// ─── Core types matching FastAPI backend schemas ───────────────────────────

export type Sport = "soccer" | "tennis" | "esports" | "basketball" | "baseball";

export interface PredictionResponse {
  match_id: string;
  sport: Sport;
  p_home: number;
  p_away: number;
  p_draw: number;
  confidence: number;
  edge?: number;
  model_id?: string;
}

export interface SimulationResponse {
  match_id: string;
  n_simulations: number;
  p_home_win: number;
  p_away_win: number;
  p_draw: number;
  expected_home_score: number;
  expected_away_score: number;
  confidence_interval: [number, number];
}

export interface RatingResponse {
  entity_id: string;
  rating: number;
  context: string;
}

export interface HeadToHeadResponse {
  entity_a_id: string;
  entity_b_id: string;
  matches_played: number;
  entity_a_wins: number;
  entity_b_wins: number;
  draws: number;
  context: string;
}

export interface BacktestResponse {
  strategy_id: string;
  n_predictions: number;
  n_correct: number;
  accuracy: number;
  roi: number;
  sharpe_ratio: number;
  max_drawdown: number;
  log_loss: number;
  brier_score: number;
  calibration_error: number;
  pnl_units: number;
  metadata: Record<string, unknown>;
}

// ─── MVP contract types (matching api/schemas/mvp.py) ──────────────────────

export interface MvpParticipant {
  id: string;
  name: string;
}

export interface MvpProbabilities {
  home_win: number;
  draw: number;
  away_win: number;
}

export interface MvpFairOdds {
  home_win: number;
  draw: number;
  away_win: number;
}

export interface MvpKeyDriver {
  feature: string;
  value: number | null;
  importance: number;
}

export interface MvpModelMeta {
  version: string;
  trained_at: string | null;
}

export interface MvpScoreline {
  score: string;
  probability: number;
}

export interface MvpSimulation {
  n_simulations: number;
  mean_home_goals: number;
  mean_away_goals: number;
  distribution: MvpScoreline[];
}

export interface MvpPrediction {
  event_id: string;
  sport: string;
  league: string;
  season: string | null;
  start_time: string;
  status: string;
  outcome: string | null;       // "home_win" | "draw" | "away_win" | null
  home_score: number | null;
  away_score: number | null;
  participants: {
    home: MvpParticipant;
    away: MvpParticipant;
  };
  probabilities: MvpProbabilities;
  fair_odds: MvpFairOdds;
  market_odds: MvpFairOdds | null;
  confidence: number;
  key_drivers: MvpKeyDriver[];
  model: MvpModelMeta | null;
  simulation: MvpSimulation | null;
  created_at: string;
}

export interface MvpPredictionList {
  items: MvpPrediction[];
  total: number;
  sport: string | null;
  date_from: string | null;
  date_to: string | null;
}

export interface MvpModelMetrics {
  model_name: string;
  version: string;
  algorithm: string;
  sport: string;
  is_live: boolean;
  n_train_samples: number | null;
  n_predictions: number | null;
  accuracy: number | null;
  brier_score: number | null;
  log_loss: number | null;
  ece: number | null;
  trained_at: string | null;
  train_data_from: string | null;
  train_data_to: string | null;
  notes: string | null;
}

export interface MvpPerformance {
  models: MvpModelMetrics[];
  sport: string | null;
}

// ─── App-level types (assembled from multiple API calls) ───────────────────

export interface Match {
  id: string;
  sport: Sport;
  competition: string;
  home_name: string;
  away_name: string;
  home_id: string;
  away_id: string;
  scheduled_at: string;
  status: "scheduled" | "live" | "finished" | "cancelled";
  home_score?: number;
  away_score?: number;
  outcome?: string;
  // Optional prediction fields (present when served from pred_match)
  p_home?: number;
  p_draw?: number;
  p_away?: number;
  confidence?: number;
}

export interface MatchDetail extends Match {
  prediction?: PredictionResponse;
  simulation?: SimulationResponse;
  home_rating?: RatingResponse;
  away_rating?: RatingResponse;
  h2h?: HeadToHeadResponse;
}

export interface KpiMetric {
  label: string;
  value: string | number;
  delta?: number;      // positive = good
  format?: "pct" | "number" | "currency" | "decimal";
}

export interface RatingEntry {
  entity_id: string;
  name: string;
  sport: Sport;
  rating: number;
  context: string;
  change?: number;     // delta from last match
}

// ─── Challenges ────────────────────────────────────────────────────────────

export interface Challenge {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  sport_scope: string[];
  start_at: string;
  end_at: string;
  max_members: number | null;
  entry_limit_per_day: number | null;
  scoring_type: "brier" | "points";
  created_by: string;
  created_at: string;
  member_count: number;
  is_member: boolean;
  user_role: "owner" | "member" | null;
}

export interface ChallengeEntry {
  id: string;
  challenge_id: string;
  user_id: string;
  event_id: string;
  sport: string;
  event_start_at: string;
  pick_type: string;
  pick_payload: Record<string, unknown>;
  prediction_payload: Record<string, unknown>;
  model_version: string | null;
  submitted_at: string;
  locked_at: string | null;
  status: "open" | "locked" | "settled" | "void";
  score_value: number | null;
}

export interface EntryFeedPage {
  items: ChallengeEntry[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
}

export interface LeaderboardRow {
  rank: number;
  user_id: string;
  score: number;
  entry_count: number;
  last_activity: string | null;
  accuracy_score: number | null;
}

export interface LeaderboardOut {
  challenge_id: string;
  scoring_type: "brier" | "points";
  rows: LeaderboardRow[];
}

export interface ChallengeCreate {
  name: string;
  description?: string;
  visibility: "public" | "private";
  sport_scope: string[];
  start_at: string;
  end_at: string;
  max_members?: number;
  entry_limit_per_day?: number;
  scoring_type: "brier" | "points";
}

// ─── Sport match list / detail (from /api/v1/sports/<sport>/matches) ───────

export interface EloSnapshotOut {
  team_id: string;
  team_name: string;
  rating: number;
  rating_change: number | null;
}

export interface H2HRecordOut {
  total_matches: number;
  home_wins?: number;
  away_wins?: number;
  draws?: number;
  player_a_wins?: number;
  player_b_wins?: number;
  team_a_wins?: number;
  team_b_wins?: number;
  recent_matches: Array<{
    date: string;
    home_score?: number | null;
    away_score?: number | null;
    outcome?: string;
    winner?: string;
  }>;
}

export interface SportMatchListItem {
  id: string;
  league: string;
  league_logo?: string | null;
  season: string | null;
  kickoff_utc: string;
  status: string;
  home_id: string;
  home_name: string;
  home_logo?: string | null;
  away_id: string;
  away_name: string;
  away_logo?: string | null;
  home_score: number | null;
  away_score: number | null;
  outcome: string | null;
  elo_home: number | null;
  elo_away: number | null;
  elo_diff?: number | null;
  p_home: number | null;
  p_draw?: number | null;
  p_away: number | null;
  confidence: number | null;
  live_clock?: string | null;
  current_period?: number | null;
  odds_home?: number | null;
  odds_away?: number | null;
  odds_draw?: number | null;
}

export interface HighlightClip {
  title?: string | null;
  url: string;
  thumbnail?: string | null;
  duration?: number | null;
  source?: string | null;
  event_type?: string | null;
  minute?: number | null;
}

export interface StandingRow {
  position?: number | null;
  team_id?: string | null;
  team_name: string;
  team_logo?: string | null;
  played?: number | null;
  won?: number | null;
  drawn?: number | null;
  lost?: number | null;
  goals_for?: number | null;
  goals_against?: number | null;
  goal_diff?: number | null;
  points?: number | null;
  form?: string | null;
  group_name?: string | null;
}

export interface StandingsResponse {
  league_id: string;
  league_name: string;
  league_logo?: string | null;
  season: string;
  sport: string;
  table: StandingRow[];
  updated_at?: string | null;
}

export interface SportMatchDetail {
  id: string;
  sport: string;
  league: string;
  league_logo?: string | null;
  season?: string | null;
  kickoff_utc: string;
  status: string;
  home: { id: string; name: string; logo_url?: string | null };
  away: { id: string; name: string; logo_url?: string | null };
  home_score?: number | null;
  away_score?: number | null;
  outcome?: string | null;
  live_clock?: string | null;
  current_period?: number | null;
  current_state?: Record<string, unknown> | null;
  probabilities?: { home_win: number; draw?: number | null; away_win: number } | null;
  fair_odds?: { home_win?: number | null; draw?: number | null; away_win?: number | null } | null;
  confidence?: number | null;
  key_drivers?: Array<{ feature: string; value?: number | null; importance: number; direction?: string | null }> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elo_home?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elo_away?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  h2h?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats_home?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats_away?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form_home?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form_away?: any;
  context?: {
    venue_name?: string | null;
    venue_city?: string | null;
    attendance?: number | null;
    neutral_site?: boolean;
    weather_desc?: string | null;
    temperature_c?: number | null;
  } | null;
  simulation?: {
    n_simulations: number;
    distribution: Array<{ score: string; probability: number }>;
    mean_home_goals?: number | null;
    mean_away_goals?: number | null;
  } | null;
  betting?: Record<string, number | null> | null;
  highlights?: HighlightClip[];
  events?: Array<{
    minute?: number | null;
    minute_extra?: number | null;
    type: string;
    team: string;
    player_name?: string | null;
    player_out?: string | null;
    description?: string | null;
    is_penalty?: boolean;
    is_own_goal?: boolean;
    score_home?: number | null;
    score_away?: number | null;
  }>;
  stats_home_live?: Record<string, unknown> | null;
  stats_away_live?: Record<string, unknown> | null;
}

// Soccer-specific ELO history point
export interface EloHistoryPoint {
  date: string;
  rating: number;
  match_id?: string | null;
}

// ─── Tennis match detail types ─────────────────────────────────────────────

export interface TennisSurfaceEloOut {
  player_id: string;
  player_name: string;
  overall_rating: number;
  surface_rating: number | null;
  surface_delta: number | null;
  rating_change: number | null;
}

export interface TennisPlayerProfileOut {
  player_id?: string | null;
  player_name: string;
  nationality?: string | null;
  age?: number | null;
  ranking?: number | null;
  ranking_points?: number | null;
  ranking_change_week?: number | null;
  prize_money_ytd_usd?: number | null;
  career_prize_money_usd?: number | null;
  plays?: string | null;   // "Right-handed" | "Left-handed"
  backhand?: string | null;  // "One-handed" | "Two-handed"
  turned_pro?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  coach?: string | null;
  career_titles?: number | null;
  grand_slams?: number | null;
  win_pct?: number | null;
  season_wins?: number | null;
  season_losses?: number | null;
  highest_ranking?: number | null;
}

export interface TennisTiebreakOut {
  player_a_tiebreaks_won: number;
  player_b_tiebreaks_won: number;
  tiebreaks: Array<{ set_num: number; score_a: number; score_b: number; winner: "a" | "b" }>;
}

export interface TennisServeStatsOut {
  player_id: string;
  player_name: string;
  aces: number | null;
  double_faults: number | null;
  first_serve_in_pct: number | null;
  first_serve_won_pct: number | null;
  second_serve_won_pct: number | null;
  service_games_played: number | null;
  service_games_held: number | null;
  service_hold_pct: number | null;
  return_games_played: number | null;
  return_games_won: number | null;
  break_points_faced: number | null;
  break_points_saved: number | null;
  break_points_created: number | null;
  break_points_converted: number | null;
  bp_conversion_pct: number | null;
  first_serve_return_won_pct: number | null;
  second_serve_return_won_pct: number | null;
  total_points_won: number | null;
  // Extended
  first_serve_avg_mph?: number | null;
  first_serve_max_mph?: number | null;
  second_serve_avg_mph?: number | null;
  winners?: number | null;
  unforced_errors?: number | null;
  forced_errors?: number | null;
  winner_ue_ratio?: number | null;
  net_approaches?: number | null;
  net_points_won?: number | null;
  net_win_pct?: number | null;
  rally_0_4_won_pct?: number | null;
  rally_5_8_won_pct?: number | null;
  rally_9plus_won_pct?: number | null;
  service_points_played?: number | null;
  service_points_won?: number | null;
  return_points_played?: number | null;
  return_points_won?: number | null;
  total_points_played?: number | null;
}

export interface TennisPlayerFormOut {
  player_name: string;
  surface: string;
  window_days: number;
  matches_played: number;
  wins: number;
  losses: number;
  win_pct: number | null;
  avg_first_serve_in_pct: number | null;
  avg_first_serve_won_pct: number | null;
  avg_service_hold_pct: number | null;
  avg_bp_conversion_pct: number | null;
  avg_return_won_pct: number | null;
  avg_aces_per_match: number | null;
  avg_df_per_match: number | null;
  matches_since_last_title: number | null;
  // Extended
  win_pct_hard?: number | null;
  win_pct_clay?: number | null;
  win_pct_grass?: number | null;
  tiebreaks_played?: number | null;
  tiebreaks_won?: number | null;
  tiebreak_win_pct?: number | null;
  titles_ytd?: number | null;
  finals_ytd?: number | null;
  ranking_trend?: number | null;
  avg_match_duration_min?: number | null;
  three_setters_pct?: number | null;
}

export interface TennisSetDetail {
  set_num: number;
  a: number;
  b: number;
  tb_a: number | null;
  tb_b: number | null;
}

export interface TennisMatchInfoOut {
  surface: string;
  is_indoor: boolean;
  tournament_level: string | null;
  round_name: string | null;
  best_of: number;
  player_a_days_rest: number | null;
  player_b_days_rest: number | null;
  player_a_matches_last_14d: number | null;
  player_b_matches_last_14d: number | null;
  match_duration_min: number | null;
  retired: boolean;
  sets_detail: TennisSetDetail[];
  // Extended
  tournament_prize_pool_usd?: number | null;
  points_on_offer?: number | null;
  draw_size?: number | null;
  balls_brand?: string | null;
  court_speed_index?: number | null;
}

export interface TennisH2HRecord {
  total_matches: number;
  player_a_wins: number;
  player_b_wins: number;
  recent_matches: Array<{
    date: string | null;
    player_a_sets: number | null;
    player_b_sets: number | null;
    winner: "a" | "b";
    player_a_name?: string;
    player_b_name?: string;
    surface?: string | null;
    round?: string | null;
  }>;
}

export interface TennisMatchDetail {
  id: string;
  sport: "tennis";
  league: string;
  season: string | null;
  kickoff_utc: string;
  status: string;
  home: { id: string; name: string };
  away: { id: string; name: string };
  home_score: number | null;   // sets won
  away_score: number | null;
  outcome: string | null;
  live_clock?: string | null;
  current_period?: number | null;
  current_state?: Record<string, unknown> | null;
  probabilities: { home_win: number; away_win: number; draw?: number | null } | null;
  fair_odds: { home_win: number | null; away_win: number | null } | null;
  confidence: number | null;
  key_drivers: Array<{ feature: string; value: number | null; importance: number }>;
  model: { version: string; algorithm?: string | null; trained_at: string | null; accuracy?: number | null; brier_score?: number | null; n_train_samples?: number | null } | null;
  elo_home: TennisSurfaceEloOut | null;
  elo_away: TennisSurfaceEloOut | null;
  tennis_info: TennisMatchInfoOut | null;
  stats_home: TennisServeStatsOut | null;
  stats_away: TennisServeStatsOut | null;
  form_home: TennisPlayerFormOut | null;
  form_away: TennisPlayerFormOut | null;
  h2h: TennisH2HRecord | null;
  profile_home?: TennisPlayerProfileOut | null;
  profile_away?: TennisPlayerProfileOut | null;
  tiebreaks?: TennisTiebreakOut | null;
  betting?: Record<string, unknown> | null;
}

// ─── Esports match detail types ────────────────────────────────────────────

export interface EsportsEloPanel {
  team_id: string;
  team_name: string;
  overall_rating: number;
  map_ratings: Record<string, number>;
  rating_change: number | null;
}

export interface EsportsMatchInfo {
  game_type: string;          // "cs2" | "lol" | "valorant" | "dota2"
  series_format: string;      // "bo1" | "bo3" | "bo5"
  is_lan: boolean;
  patch_version: string | null;
  stage: string | null;
  tournament_tier: string | null;
}

export interface EsportsTeamFormOut {
  team_name: string;
  series_played: number;
  series_won: number;
  series_win_pct: number | null;
  maps_played: number;
  maps_won: number;
  map_win_pct: number | null;
  avg_adr: number | null;
  avg_kast: number | null;
  avg_rating: number | null;
  ct_win_pct: number | null;
  t_win_pct: number | null;
  current_win_streak: number;
  current_loss_streak: number;
  lan_win_pct: number | null;
  online_win_pct: number | null;
  roster_stability_score: number | null;
  // CS2 extended
  pistol_round_win_pct?: number | null;
  eco_win_pct?: number | null;
  force_buy_win_pct?: number | null;
  avg_clutch_rate?: number | null;
  // LoL extended
  avg_game_duration_min?: number | null;
  avg_first_blood_pct?: number | null;
  avg_dragons_per_game?: number | null;
  avg_towers_per_game?: number | null;
  blue_side_win_pct?: number | null;
  red_side_win_pct?: number | null;
}

export interface Cs2EconomyStatsOut {
  team: string;
  pistol_rounds_played: number;
  pistol_rounds_won: number;
  pistol_win_pct: number | null;
  eco_rounds: number;
  eco_wins: number;
  eco_win_pct: number | null;
  anti_eco_rounds: number;
  anti_eco_wins: number;
  force_buy_rounds: number;
  force_buy_wins: number;
  force_buy_win_pct: number | null;
  full_buy_rounds: number;
  full_buy_wins: number;
  full_buy_win_pct: number | null;
  avg_starting_money: number | null;
  avg_equipment_value: number | null;
  conversion_after_pistol_win: number | null;
}

export interface Cs2UtilityStatsOut {
  team: string;
  flashes_thrown: number | null;
  flash_assists: number | null;
  enemies_flashed_per_round: number | null;
  he_damage_per_round: number | null;
  smokes_thrown: number | null;
  molotovs_thrown: number | null;
  utility_damage_per_round: number | null;
  utility_per_round: number | null;
}

export interface Cs2OpeningDuelOut {
  team: string;
  opening_duels: number;
  opening_wins: number;
  opening_win_pct: number | null;
  opening_attempts_per_round: number | null;
  top_opener: string | null;
  top_opener_win_pct: number | null;
}

export interface LolTeamCompOut {
  team: string;
  comp_tags: string[];
  avg_game_duration_min: number | null;
  early_game_win_pct: number | null;
  late_game_win_pct: number | null;
  blue_side_picks: string[];
  red_side_picks: string[];
  banned_by_opponent: string[];
  first_pick_champions: string[];
}

export interface LolObjectiveControlOut {
  team: string;
  total_dragons: number;
  total_barons: number;
  total_heralds: number;
  total_towers: number;
  total_inhibitors: number;
  first_blood_rate: number | null;
  first_tower_rate: number | null;
  dragon_soul_secured: number;
  elder_dragon_secured: number;
  avg_gold_diff_at_10: number | null;
  avg_gold_diff_at_15: number | null;
  avg_gold_diff_at_20: number | null;
}

export interface EsportsVetoEntry {
  action: string;   // "ban" | "pick" | "left_over"
  team: string;     // "a" | "b" | "decider"
  map_name: string;
}

export interface EsportsMapOut {
  map_number: number;
  map_name: string;
  team_a_score: number | null;
  team_b_score: number | null;
  team_a_ct_rounds: number | null;
  team_b_ct_rounds: number | null;
  team_a_t_rounds: number | null;
  team_b_t_rounds: number | null;
  overtime_rounds: number;
  winner: "a" | "b" | null;
  side_bias: number | null;
  economy_a?: Cs2EconomyStatsOut | null;
  economy_b?: Cs2EconomyStatsOut | null;
}

export interface EsportsPlayerStatsOut {
  player_name: string;
  player_id: string | null;
  team: "a" | "b";
  // CS2
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  kd_ratio: number | null;
  adr: number | null;
  kast_pct: number | null;
  rating_2: number | null;
  headshot_pct: number | null;
  first_kills: number | null;
  first_deaths: number | null;
  clutches_won: number | null;
  // CS2 extended
  flash_assists?: number | null;
  utility_damage?: number | null;
  opening_kill_rate?: number | null;
  // LoL
  role: string | null;
  kda: number | null;
  kill_participation_pct: number | null;
  cs_per_min: number | null;
  gold_per_min: number | null;
  damage_pct: number | null;
  vision_score_per_min: number | null;
  // LoL extended
  champion?: string | null;
  damage_per_min?: number | null;
  ward_score?: number | null;
  penta_kills?: number | null;
  solo_kills?: number | null;
}

export interface EsportsDraftPick {
  phase: string;
  team: "a" | "b";
  champion: string;
  role: string | null;
}

export interface EsportsObjectiveStats {
  team: "a" | "b";
  towers: number | null;
  dragons: number | null;
  barons: number | null;
  heralds: number | null;
  first_blood: boolean | null;
  first_tower: boolean | null;
  gold_total: number | null;
  kills: number | null;
  deaths?: number | null;
  assists?: number | null;
  dragon_soul?: string | null;
  elder_dragon?: boolean | null;
  rifts_heralds?: number | null;
  inhibitors_destroyed?: number | null;
  ward_kills?: number | null;
  wards_placed?: number | null;
  cs_total?: number | null;
}

export interface EsportsGameOut {
  game_number: number;
  duration_min: number | null;
  winner: "a" | "b" | null;
  team_a_obj: EsportsObjectiveStats | null;
  team_b_obj: EsportsObjectiveStats | null;
  gold_diff_at_10?: number | null;
  gold_diff_at_15: number | null;
  gold_diff_at_20?: number | null;
  draft_a: EsportsDraftPick[];
  draft_b: EsportsDraftPick[];
  patch?: string | null;
  blue_side?: "a" | "b" | null;
}

export interface EsportsH2HRecord {
  total_matches: number;
  team_a_wins: number;
  team_b_wins: number;
  recent_matches: Array<{
    date: string | null;
    team_a_score: number | null;
    team_b_score: number | null;
    winner: "a" | "b";
    team_a_name?: string;
    team_b_name?: string;
  }>;
}

export interface EsportsMatchDetail {
  id: string;
  sport: "esports";
  league: string;
  season: string | null;
  kickoff_utc: string;
  status: string;
  home: { id: string; name: string };
  away: { id: string; name: string };
  home_score: number | null;
  away_score: number | null;
  outcome: string | null;
  live_clock?: string | null;
  current_period?: number | null;
  current_state?: Record<string, unknown> | null;
  probabilities: { home_win: number; away_win: number } | null;
  fair_odds: { home_win: number | null; away_win: number | null } | null;
  confidence: number | null;
  key_drivers: Array<{ feature: string; value: number | null; importance: number }>;
  model: { version: string; algorithm?: string | null; trained_at: string | null; accuracy?: number | null; brier_score?: number | null; n_train_samples?: number | null } | null;
  elo_home: EsportsEloPanel | null;
  elo_away: EsportsEloPanel | null;
  h2h: EsportsH2HRecord | null;
  match_info: EsportsMatchInfo | null;
  form_home: EsportsTeamFormOut | null;
  form_away: EsportsTeamFormOut | null;
  // CS2
  maps: EsportsMapOut[];
  veto: EsportsVetoEntry[];
  players_home: EsportsPlayerStatsOut[];
  players_away: EsportsPlayerStatsOut[];
  // CS2 advanced
  cs2_economy_home?: Cs2EconomyStatsOut[];
  cs2_economy_away?: Cs2EconomyStatsOut[];
  cs2_utility_home?: Cs2UtilityStatsOut | null;
  cs2_utility_away?: Cs2UtilityStatsOut | null;
  cs2_opening_duels_home?: Cs2OpeningDuelOut | null;
  cs2_opening_duels_away?: Cs2OpeningDuelOut | null;
  // LoL
  games: EsportsGameOut[];
  lol_comp_home?: LolTeamCompOut | null;
  lol_comp_away?: LolTeamCompOut | null;
  lol_objectives_home?: LolObjectiveControlOut | null;
  lol_objectives_away?: LolObjectiveControlOut | null;
  // Betting
  betting?: Record<string, unknown> | null;
}

// ─── Basketball types ───────────────────────────────────────────────────────

export interface BasketballQuarterScore {
  q1?: number | null;
  q2?: number | null;
  q3?: number | null;
  q4?: number | null;
  ot?: number | null;
  ot2?: number | null;
}

export interface BasketballMatchInfo {
  arena?: string | null;
  city?: string | null;
  attendance?: number | null;
  tipoff_time_local?: string | null;
  season_phase?: string | null;
  series_game?: string | null;
  pace?: number | null;
  home_quarters?: BasketballQuarterScore | null;
  away_quarters?: BasketballQuarterScore | null;
  home_record?: string | null;
  away_record?: string | null;
  home_streak?: string | null;
  away_streak?: string | null;
  home_home_record?: string | null;
  away_away_record?: string | null;
  referee_crew?: string[] | null;
  overtime_periods?: number | null;
}

export interface BasketballClutchStatsOut {
  team_id: string;
  team_name: string;
  clutch_minutes?: number | null;
  clutch_points?: number | null;
  clutch_fg_pct?: number | null;
  clutch_fg3_pct?: number | null;
  clutch_ft_pct?: number | null;
  clutch_turnovers?: number | null;
  clutch_net_rating?: number | null;
  clutch_wins_season?: number | null;
  clutch_losses_season?: number | null;
  clutch_fg_made?: number | null;
  clutch_fg_att?: number | null;
  clutch_free_throws_won?: number | null;
}

export interface BasketballLineupUnitOut {
  players: string[];
  minutes?: number | null;
  net_rating?: number | null;
  ortg?: number | null;
  drtg?: number | null;
  plus_minus?: number | null;
  fg_pct?: number | null;
  pace?: number | null;
  possessions?: number | null;
}

export interface BasketballScoringRunOut {
  team: "home" | "away";
  run_size: number;
  period: string;
  time_started?: string | null;
  time_ended?: string | null;
}

export interface BasketballRefereeOut {
  names: string[];
  avg_fouls_per_game?: number | null;
  avg_fta_per_game?: number | null;
  home_foul_rate?: number | null;
  technicals_per_game?: number | null;
  home_win_pct?: number | null;
  avg_total_points?: number | null;
}

export interface BasketballBettingOut {
  spread?: number | null;
  total?: number | null;
  home_ml?: number | null;
  away_ml?: number | null;
  spread_line_move?: number | null;
  total_line_move?: number | null;
  sharp_side_spread?: string | null;
  implied_home_total?: number | null;
  implied_away_total?: number | null;
}

export interface BasketballEloPanelOut {
  team_id: string;
  team_name: string;
  rating: number;
  rating_change?: number | null;
  rating_pre?: number | null;
  rating_post?: number | null;
  k_used?: number | null;
  home_advantage_applied?: number | null;
  mov_modifier?: number | null;
  rest_modifier?: number | null;
  days_rest?: number | null;
  back_to_back?: boolean | null;
  implied_win_prob?: number | null;
  elo_win_prob?: number | null;
  last_10_ratings?: number[] | null;
}

export interface BasketballFormEntry {
  date: string;
  opponent: string;
  score: string;
  home_away: string;
  result: "W" | "L";
  net_rtg?: number | null;
  days_rest?: number | null;
}

export interface BasketballTeamFormOut {
  team_id: string;
  team_name: string;
  last_5?: BasketballFormEntry[] | null;
  wins_last_5?: number | null;
  losses_last_5?: number | null;
  avg_pts_for?: number | null;
  avg_pts_against?: number | null;
  ortg_last_5?: number | null;
  drtg_last_5?: number | null;
  net_rtg_last_5?: number | null;
  days_rest?: number | null;
  back_to_back?: boolean | null;
  injury_count?: number | null;
}

export interface BasketballInjury {
  player_name: string;
  position?: string | null;
  status: string;
  reason?: string | null;
}

export interface BasketballPlayerOut {
  player_id?: string | null;
  name: string;
  position?: string | null;
  jersey?: string | null;
  is_starter: boolean;
  minutes?: number | null;
  points?: number | null;
  rebounds?: number | null;
  reb_off?: number | null;
  reb_def?: number | null;
  assists?: number | null;
  steals?: number | null;
  blocks?: number | null;
  turnovers?: number | null;
  fouls?: number | null;
  plus_minus?: number | null;
  fg_made?: number | null;
  fg_att?: number | null;
  fg_pct?: number | null;
  fg3_made?: number | null;
  fg3_att?: number | null;
  fg3_pct?: number | null;
  ft_made?: number | null;
  ft_att?: number | null;
  ft_pct?: number | null;
  ts_pct?: number | null;
  usage_pct?: number | null;
}

export interface BasketballTeamBoxScore {
  team_id: string;
  team_name: string;
  is_home: boolean;
  players: BasketballPlayerOut[];
  total_points?: number | null;
  total_rebounds?: number | null;
  total_assists?: number | null;
  total_steals?: number | null;
  total_blocks?: number | null;
  total_turnovers?: number | null;
  total_fouls?: number | null;
  fg_pct?: number | null;
  fg3_pct?: number | null;
  ft_pct?: number | null;
  fg_made?: number | null;
  fg_att?: number | null;
  fg3_made?: number | null;
  fg3_att?: number | null;
  ft_made?: number | null;
  ft_att?: number | null;
  bench_points?: number | null;
  fast_break_pts?: number | null;
  pts_in_paint?: number | null;
  second_chance_pts?: number | null;
  points_off_turnovers?: number | null;
  largest_lead?: number | null;
  lead_changes?: number | null;
  times_tied?: number | null;
  timeouts_remaining?: number | null;
}

export interface BasketballAdvancedStats {
  team_id: string;
  team_name: string;
  is_home: boolean;
  ortg?: number | null;
  drtg?: number | null;
  net_rtg?: number | null;
  pace?: number | null;
  efg_pct?: number | null;
  ts_pct?: number | null;
  tov_pct?: number | null;
  orb_pct?: number | null;
  drb_pct?: number | null;
  ftr?: number | null;
  three_par?: number | null;
  second_half_ortg?: number | null;
  second_half_drtg?: number | null;
  clutch_net_rtg?: number | null;
  transition_pct?: number | null;
  half_court_ortg?: number | null;
  avg_shot_distance?: number | null;
  paint_pct?: number | null;
  midrange_pct?: number | null;
}

export interface BasketballShotZone {
  zone: string;
  attempts: number;
  made: number;
  pct: number;
  attempts_pct: number;
}

export interface BasketballMatchDetail {
  id: string;
  sport: "basketball";
  league: string;
  season?: string | null;
  kickoff_utc: string;
  status: string;
  home: { id: string; name: string };
  away: { id: string; name: string };
  home_score?: number | null;
  away_score?: number | null;
  outcome?: string | null;
  live_clock?: string | null;
  current_period?: number | null;
  current_state?: Record<string, unknown> | null;
  probabilities?: { home_win: number; away_win: number; draw?: number | null } | null;
  confidence?: number | null;
  fair_odds?: { home_win?: number | null; away_win?: number | null } | null;
  key_drivers?: Array<{ feature: string; importance: number; value?: number | null; direction?: string | null }> | null;
  model?: { version: string; algorithm?: string | null; trained_at?: string | null; n_train_samples?: number | null; accuracy?: number | null; brier_score?: number | null } | null;
  elo_home?: BasketballEloPanelOut | null;
  elo_away?: BasketballEloPanelOut | null;
  match_info?: BasketballMatchInfo | null;
  form_home?: BasketballTeamFormOut | null;
  form_away?: BasketballTeamFormOut | null;
  box_home?: BasketballTeamBoxScore | null;
  box_away?: BasketballTeamBoxScore | null;
  adv_home?: BasketballAdvancedStats | null;
  adv_away?: BasketballAdvancedStats | null;
  injuries_home?: BasketballInjury[] | null;
  injuries_away?: BasketballInjury[] | null;
  shots_home?: BasketballShotZone[] | null;
  shots_away?: BasketballShotZone[] | null;
  h2h?: { total_matches: number; home_wins: number; away_wins: number; draws?: number | null; recent_matches: any[] } | null;
  context?: Record<string, any> | null;
  data_completeness?: Record<string, boolean> | null;
  clutch_home?: BasketballClutchStatsOut | null;
  clutch_away?: BasketballClutchStatsOut | null;
  top_lineups_home?: BasketballLineupUnitOut[] | null;
  top_lineups_away?: BasketballLineupUnitOut[] | null;
  scoring_runs?: BasketballScoringRunOut[] | null;
  referee?: BasketballRefereeOut | null;
  betting?: BasketballBettingOut | null;
}

// ─── Baseball types ─────────────────────────────────────────────────────────

export interface BaseballInningScore {
  inning: number;
  home?: number | null;
  away?: number | null;
}

export interface BaseballWeather {
  temperature_f?: number | null;
  temperature_c?: number | null;
  wind_speed_mph?: number | null;
  wind_direction?: string | null;
  conditions?: string | null;
  humidity_pct?: number | null;
}

export interface BaseballMatchInfo {
  ballpark?: string | null;
  city?: string | null;
  attendance?: number | null;
  game_time_local?: string | null;
  series_info?: string | null;
  umpire_home_plate?: string | null;
  innings_played?: number | null;
  home_record?: string | null;
  away_record?: string | null;
  home_streak?: string | null;
  away_streak?: string | null;
  home_bullpen_era?: number | null;
  away_bullpen_era?: number | null;
  inning_scores?: BaseballInningScore[] | null;
  home_hits?: number | null;
  home_errors?: number | null;
  away_hits?: number | null;
  away_errors?: number | null;
  weather?: BaseballWeather | null;
  park_factor?: number | null;
}

export interface PitchTypeOut {
  pitch_name: string;
  usage_pct: number;
  velocity_avg?: number | null;
  velocity_max?: number | null;
  spin_rate?: number | null;
  horizontal_break?: number | null;
  vertical_break?: number | null;
  whiff_pct?: number | null;
  put_away_pct?: number | null;
  ba_against?: number | null;
}

export interface BattedBallStatsOut {
  team_id?: string | null;
  team_name?: string | null;
  avg_exit_velocity?: number | null;
  max_exit_velocity?: number | null;
  avg_launch_angle?: number | null;
  barrel_pct?: number | null;
  hard_hit_pct?: number | null;
  sweet_spot_pct?: number | null;
  gb_pct?: number | null;
  fb_pct?: number | null;
  ld_pct?: number | null;
  pu_pct?: number | null;
  pull_pct?: number | null;
  center_pct?: number | null;
  oppo_pct?: number | null;
  xba?: number | null;
  xslg?: number | null;
  xwoba?: number | null;
}

export interface SituationalBattingOut {
  team_id: string;
  team_name: string;
  risp_avg?: number | null;
  risp_obp?: number | null;
  risp_ops?: number | null;
  two_out_risp_avg?: number | null;
  leadoff_avg?: number | null;
  leadoff_obp?: number | null;
  bases_loaded_avg?: number | null;
  late_close_avg?: number | null;
  vs_lhp_ops?: number | null;
  vs_rhp_ops?: number | null;
  clutch_score?: number | null;
}

export interface UmpireOut {
  name: string;
  games_called?: number | null;
  k_zone_size?: number | null;
  strikeouts_per_game?: number | null;
  walks_per_game?: number | null;
  first_pitch_strike_pct?: number | null;
  home_win_pct?: number | null;
  run_scoring_impact?: number | null;
  over_record?: string | null;
}

export interface StarterPitcherOut {
  player_id?: string | null;
  name: string;
  hand?: string | null;
  era?: number | null;
  fip?: number | null;
  whip?: number | null;
  k_per_9?: number | null;
  bb_per_9?: number | null;
  hr_per_9?: number | null;
  // Season volume
  games_started?: number | null;
  wins?: number | null;
  losses?: number | null;
  innings_pitched_season?: number | null;
  // Rate stats
  k_pct?: number | null;
  bb_pct?: number | null;
  k_bb_ratio?: number | null;
  // Batted ball
  gb_pct?: number | null;
  fb_pct?: number | null;
  ld_pct?: number | null;
  hr_fb_pct?: number | null;
  // Regression
  babip?: number | null;
  lob_pct?: number | null;
  xfip?: number | null;
  siera?: number | null;
  xera?: number | null;
  // Pitch arsenal
  pitch_arsenal?: PitchTypeOut[] | null;
  // This game line
  ip?: number | null;
  hits_allowed?: number | null;
  earned_runs?: number | null;
  strikeouts?: number | null;
  walks?: number | null;
  hr_allowed?: number | null;
  pitches_thrown?: number | null;
  strikes_pct?: number | null;
  last_3_era?: number | null;
  elo_adj?: number | null;
}

export interface BullpenPitcherOut {
  name: string;
  hand?: string | null;
  ip?: number | null;
  earned_runs?: number | null;
  strikeouts?: number | null;
  walks?: number | null;
  pitches_thrown?: number | null;
  days_since_last?: number | null;
  pitches_last_3d?: number | null;
}

export interface BullpenSummaryOut {
  team_id: string;
  team_name: string;
  pitchers: BullpenPitcherOut[];
  total_ip?: number | null;
  total_pitches_last_3d?: number | null;
  fatigue_score?: number | null;
}

export interface BatterOut {
  player_id?: string | null;
  name: string;
  position?: string | null;
  batting_order?: number | null;
  hand?: string | null;
  batting_avg?: number | null;
  obp?: number | null;
  slg?: number | null;
  ops?: number | null;
  woba?: number | null;
  // Advanced
  iso?: number | null;
  babip?: number | null;
  k_pct?: number | null;
  bb_pct?: number | null;
  hard_hit_pct?: number | null;
  barrel_pct?: number | null;
  sprint_speed?: number | null;
  xba?: number | null;
  xslg?: number | null;
  xwoba?: number | null;
  // Game line
  at_bats?: number | null;
  runs?: number | null;
  hits?: number | null;
  rbi?: number | null;
  walks?: number | null;
  strikeouts?: number | null;
  home_runs?: number | null;
  doubles?: number | null;
  triples?: number | null;
  stolen_bases?: number | null;
}

export interface BaseballTeamBattingOut {
  team_id: string;
  team_name: string;
  is_home: boolean;
  batters: BatterOut[];
  total_runs?: number | null;
  total_hits?: number | null;
  total_hr?: number | null;
  total_rbi?: number | null;
  total_bb?: number | null;
  total_so?: number | null;
  total_lob?: number | null;
  team_avg?: number | null;
  team_obp?: number | null;
  team_slg?: number | null;
  team_ops?: number | null;
}

export interface BaseballEloPanelOut {
  team_id: string;
  team_name: string;
  rating: number;
  rating_change?: number | null;
  rating_pre?: number | null;
  rating_post?: number | null;
  k_used?: number | null;
  home_advantage_applied?: number | null;
  pitcher_adj?: number | null;
  park_factor_applied?: number | null;
  bullpen_fatigue_adj?: number | null;
  implied_win_prob?: number | null;
  elo_win_prob?: number | null;
  last_10_ratings?: number[] | null;
}

export interface BaseballFormEntry {
  date: string;
  opponent: string;
  score: string;
  home_away: string;
  result: "W" | "L";
  starter?: string | null;
  starter_era?: number | null;
  park?: string | null;
}

export interface BaseballTeamFormOut {
  team_id: string;
  team_name: string;
  last_5?: BaseballFormEntry[] | null;
  wins_last_5?: number | null;
  losses_last_5?: number | null;
  avg_runs_for?: number | null;
  avg_runs_against?: number | null;
  team_era_last_5?: number | null;
  bullpen_era_last_5?: number | null;
  starter?: StarterPitcherOut | null;
}

export interface BaseballInningEvent {
  inning: number;
  half: "top" | "bottom";
  description: string;
  event_type?: string | null;
  team?: "home" | "away" | null;
}

export interface BaseballMatchDetail {
  id: string;
  sport: "baseball";
  league: string;
  season?: string | null;
  kickoff_utc: string;
  status: string;
  home: { id: string; name: string };
  away: { id: string; name: string };
  home_score?: number | null;
  away_score?: number | null;
  outcome?: string | null;
  live_clock?: string | null;
  current_period?: number | null;
  current_state?: Record<string, unknown> | null;
  probabilities?: { home_win: number; away_win: number; draw?: number | null } | null;
  confidence?: number | null;
  fair_odds?: { home_win?: number | null; away_win?: number | null } | null;
  key_drivers?: Array<{ feature: string; importance: number; value?: number | null; direction?: string | null }> | null;
  model?: { version: string; algorithm?: string | null; trained_at?: string | null; n_train_samples?: number | null; accuracy?: number | null; brier_score?: number | null } | null;
  elo_home?: BaseballEloPanelOut | null;
  elo_away?: BaseballEloPanelOut | null;
  match_info?: BaseballMatchInfo | null;
  starter_home?: StarterPitcherOut | null;
  starter_away?: StarterPitcherOut | null;
  bullpen_home?: BullpenSummaryOut | null;
  bullpen_away?: BullpenSummaryOut | null;
  batting_home?: BaseballTeamBattingOut | null;
  batting_away?: BaseballTeamBattingOut | null;
  form_home?: BaseballTeamFormOut | null;
  form_away?: BaseballTeamFormOut | null;
  inning_events?: BaseballInningEvent[] | null;
  h2h?: { total_matches: number; home_wins: number; away_wins: number; recent_matches: any[] } | null;
  context?: Record<string, any> | null;
  data_completeness?: Record<string, boolean> | null;
  batted_ball_home?: BattedBallStatsOut | null;
  batted_ball_away?: BattedBallStatsOut | null;
  situational_home?: SituationalBattingOut | null;
  situational_away?: SituationalBattingOut | null;
  umpire?: UmpireOut | null;
  betting?: Record<string, unknown> | null;
}

// ─── Hockey ────────────────────────────────────────────────────────────────

export interface HockeyEloPanelOut {
  team_id: string;
  team_name: string;
  rating: number;
  rating_change?: number | null;
  implied_win_prob?: number | null;
  elo_win_prob?: number | null;
}

export interface HockeyTeamFormOut {
  team_name: string;
  wins: number;
  draws: number;
  losses: number;
  form_pts?: number | null;
  goals_scored_avg?: number | null;
  goals_conceded_avg?: number | null;
}

export interface HockeyTeamStatsOut {
  team_name: string;
  shots?: number | null;
  shots_on_goal?: number | null;
  hits?: number | null;
  blocked_shots?: number | null;
  faceoff_wins?: number | null;
  faceoff_pct?: number | null;
  power_plays?: number | null;
  power_play_goals?: number | null;
  penalty_minutes?: number | null;
}

export interface HockeyPeriodScore {
  p1?: number | null;
  p2?: number | null;
  p3?: number | null;
  ot?: number | null;
  so?: number | null;
}

export interface HockeyEventOut {
  period?: number | null;
  time?: string | null;
  type?: string | null;
  team?: string | null;
  player_name?: string | null;
  assist1?: string | null;
  assist2?: string | null;
  description?: string | null;
  score_home?: number | null;
  score_away?: number | null;
}

export interface HockeyLineupPlayer {
  name: string;
  number?: string | null;
  position?: string | null;
  is_starter: boolean;
  is_goalie: boolean;
}

export interface HockeyLineupOut {
  team_id: string;
  team_name: string;
  formation?: string | null;
  players: HockeyLineupPlayer[];
  goalie?: string | null;
}

export interface HockeyMatchDetail {
  id: string;
  sport: "hockey";
  league: string;
  season?: string | null;
  kickoff_utc: string;
  status: string;
  home: { id: string; name: string; logo_url?: string | null };
  away: { id: string; name: string; logo_url?: string | null };
  home_score?: number | null;
  away_score?: number | null;
  outcome?: string | null;
  live_clock?: string | null;
  current_period?: number | null;
  home_periods?: HockeyPeriodScore | null;
  away_periods?: HockeyPeriodScore | null;
  probabilities?: { home_win: number; away_win: number; draw?: number | null } | null;
  confidence?: number | null;
  fair_odds?: { home_win?: number | null; away_win?: number | null } | null;
  key_drivers?: Array<{ feature: string; importance: number; value?: number | null; direction?: string | null }> | null;
  model?: { version: string; algorithm?: string | null; trained_at?: string | null; n_train_samples?: number | null; accuracy?: number | null; brier_score?: number | null } | null;
  elo_home?: HockeyEloPanelOut | null;
  elo_away?: HockeyEloPanelOut | null;
  form_home?: HockeyTeamFormOut | null;
  form_away?: HockeyTeamFormOut | null;
  stats_home?: HockeyTeamStatsOut | null;
  stats_away?: HockeyTeamStatsOut | null;
  lineup_home?: HockeyLineupOut | null;
  lineup_away?: HockeyLineupOut | null;
  events?: HockeyEventOut[];
  h2h?: { total_matches: number; home_wins: number; away_wins: number; recent_matches: any[] } | null;
  odds_home?: number | null;
  odds_away?: number | null;
  odds_draw?: number | null;
  context?: Record<string, any> | null;
  data_completeness?: Record<string, boolean> | null;
}

// ─── Chart data shapes ─────────────────────────────────────────────────────

export interface EloPoint {
  date: string;
  home: number;
  away: number;
}

export interface SimBucket {
  score: string;        // "2-1", "1-0", etc.
  probability: number;
}

export interface RoiPoint {
  date: string;
  roi: number;
  pnl: number;
  cumulative_pnl: number;
}
