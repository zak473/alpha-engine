// ─── Core types matching FastAPI backend schemas ───────────────────────────

export type Sport = "soccer" | "tennis" | "esports";

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
  participants: {
    home: MvpParticipant;
    away: MvpParticipant;
  };
  probabilities: MvpProbabilities;
  fair_odds: MvpFairOdds;
  confidence: number;
  key_drivers: MvpKeyDriver[];
  model: MvpModelMeta;
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
