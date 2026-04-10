/**
 * Typed API client for the Alpha Engine FastAPI backend.
 * All requests go through Next.js rewrites → /api/* → backend.
 */

import type {
  BacktestResponse,
  Challenge,
  ChallengeCreate,
  ChallengeEntry,
  EntryFeedPage,
  HeadToHeadResponse,
  LeaderboardOut,
  Match,
  MatchDetail,
  MvpPrediction,
  MvpPredictionList,
  MvpPerformance,
  PredictionResponse,
  RatingEntry,
  RatingResponse,
  SimulationResponse,
  Sport,
  SportMatchListItem,
  SportMatchDetail,
  StandingsResponse,
  TennisMatchDetail,
  EsportsMatchDetail,
  BasketballMatchDetail,
  BaseballMatchDetail,
  HockeyMatchDetail,
} from "./types";

// Server: absolute URL (Next.js rewrites are browser-only)
// Client: relative URL through Next.js proxy (same-origin, avoids CORS)
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const BASE = typeof window === "undefined"
  ? `${API_ORIGIN}/api/v1`
  : "/api/v1";

// ─── Typed error class ────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Auth token helper ────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  if (typeof window !== "undefined") {
    try {
      const token = localStorage.getItem("alpha_engine_token");
      if (token) return { Authorization: `Bearer ${token}` };
    } catch {}
    return {};
  }
  // Server-side: read ae_token cookie via next/headers
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { cookies } = require("next/headers") as { cookies: () => { get(k: string): { value: string } | undefined } };
    const token = cookies().get("ae_token")?.value;
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    // Not in request context (build time, edge, etc.)
  }
  return {};
}

// ─── Low-level fetch with retry/backoff ───────────────────────────────────

async function request<T>(
  path: string,
  options?: { retries?: number; revalidate?: number }
): Promise<T> {
  const maxRetries = options?.retries ?? 2;
  let lastError: Error = new Error("Request failed");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const fetchOptions: RequestInit = options?.revalidate != null
        ? { next: { revalidate: options.revalidate }, headers: getAuthHeaders() }
        : { cache: "no-store", headers: getAuthHeaders() };   // never cache — auth responses are user-specific
      const res = await fetch(`${BASE}${path}`, fetchOptions);

      if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        const err = new ApiError(`API ${res.status}: ${text}`, res.status, path);
        // Don't retry 4xx client errors
        if (res.status >= 400 && res.status < 500) throw err;
        lastError = err;
        throw err;
      }

      return res.json() as Promise<T>;
    } catch (err) {
      lastError = err as Error;
      // Retry only on non-4xx errors
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) throw err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
        continue;
      }
    }
  }

  throw lastError;
}

// ─── Health + Readiness ───────────────────────────────────────────────────

export async function getHealth(): Promise<{ status: string; env: string }> {
  const res = await fetch(`${API_ORIGIN}/health`, { cache: "no-store" });
  if (!res.ok) throw new ApiError("Health check failed", res.status, "/health");
  return res.json();
}

export async function getReady(): Promise<{ status: "ok" | "degraded"; db: boolean }> {
  const res = await fetch(`${API_ORIGIN}/ready`, { cache: "no-store" });
  return res.json();
}

// ─── Soccer ───────────────────────────────────────────────────────────────

export async function getSoccerPrediction(matchId: string): Promise<PredictionResponse> {
  return request(`/soccer/predictions/${matchId}`);
}

export async function getSoccerRating(teamId: string): Promise<RatingResponse> {
  return request(`/soccer/ratings/${teamId}`);
}

export async function getSoccerH2H(teamAId: string, teamBId: string): Promise<HeadToHeadResponse> {
  return request(`/soccer/h2h/${teamAId}/${teamBId}`);
}

// ─── Tennis ───────────────────────────────────────────────────────────────

export async function getTennisPrediction(matchId: string): Promise<PredictionResponse> {
  return request(`/tennis/predictions/${matchId}`);
}

export async function getTennisRating(playerId: string, surface = "global"): Promise<RatingResponse> {
  return request(`/tennis/ratings/${playerId}?surface=${surface}`);
}

export async function getTennisH2H(
  playerAId: string,
  playerBId: string,
  surface = "global"
): Promise<HeadToHeadResponse> {
  return request(`/tennis/h2h/${playerAId}/${playerBId}?surface=${surface}`);
}

// ─── Esports ──────────────────────────────────────────────────────────────

export async function getEsportsPrediction(matchId: string): Promise<PredictionResponse> {
  return request(`/esports/predictions/${matchId}`);
}

export async function getEsportsRating(teamId: string, mapName = "global"): Promise<RatingResponse> {
  return request(`/esports/ratings/${teamId}?map_name=${mapName}`);
}

export async function getEsportsH2H(
  teamAId: string,
  teamBId: string,
  mapName = "global"
): Promise<HeadToHeadResponse> {
  return request(`/esports/h2h/${teamAId}/${teamBId}?map_name=${mapName}`);
}

// ─── Generic prediction by sport ──────────────────────────────────────────

export async function getPrediction(
  matchId: string,
  sport: Sport
): Promise<PredictionResponse> {
  switch (sport) {
    case "soccer":  return getSoccerPrediction(matchId);
    case "tennis":  return getTennisPrediction(matchId);
    case "esports": return getEsportsPrediction(matchId);
    default:        throw new Error(`Unsupported sport: ${sport}`);
  }
}

// ─── MVP prediction endpoints (live data) ─────────────────────────────────

export async function getPredictions(params?: {
  sport?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}): Promise<MvpPredictionList> {
  const qs = new URLSearchParams();
  if (params?.sport)     qs.set("sport",      params.sport);
  if (params?.status)    qs.set("status",     params.status);
  if (params?.date_from) qs.set("date_from",  params.date_from);
  if (params?.date_to)   qs.set("date_to",    params.date_to);
  if (params?.limit)     qs.set("limit",      String(params.limit));
  if (params?.offset)    qs.set("offset",     String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<MvpPredictionList>(`/predictions${suffix}`, { revalidate: 30 });
}

export async function getMatchPrediction(matchId: string): Promise<MvpPrediction> {
  return request<MvpPrediction>(`/predictions/match/${matchId}`, { revalidate: 30 });
}

export async function getPerformance(sport?: string): Promise<MvpPerformance> {
  const suffix = sport ? `?sport=${sport}` : "";
  return request<MvpPerformance>(`/predictions/performance${suffix}`, { revalidate: 60 });
}

// ─── Challenges ───────────────────────────────────────────────────────────

async function mutate<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE" | "PATCH",
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...getAuthHeaders(), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new ApiError(`API ${res.status}: ${text}`, res.status, path);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function getChallenges(params?: {
  mine?: boolean;
  visibility?: "public" | "private";
}): Promise<Challenge[]> {
  const qs = new URLSearchParams();
  if (params?.mine) qs.set("mine", "true");
  if (params?.visibility) qs.set("visibility", params.visibility);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<Challenge[]>(`/challenges${suffix}`);
}

export async function getChallenge(id: string): Promise<Challenge> {
  return request<Challenge>(`/challenges/${id}`);
}

export async function createChallenge(data: ChallengeCreate): Promise<Challenge> {
  return mutate<Challenge>("/challenges", "POST", data);
}

export async function joinChallenge(id: string): Promise<Challenge> {
  return mutate<Challenge>(`/challenges/${id}/join`, "POST");
}

export async function leaveChallenge(id: string): Promise<void> {
  return mutate<void>(`/challenges/${id}/leave`, "POST");
}

export async function submitChallengeEntry(challengeId: string, data: {
  event_id: string;
  sport: string;
  event_start_at: string;
  pick_type: string;
  pick_payload: Record<string, unknown>;
  prediction_payload?: Record<string, unknown>;
}): Promise<ChallengeEntry> {
  return mutate<ChallengeEntry>(`/challenges/${challengeId}/entries`, "POST", data);
}

export async function getChallengeEntries(
  id: string,
  params?: { scope?: "feed" | "mine"; page?: number; page_size?: number }
): Promise<EntryFeedPage> {
  const qs = new URLSearchParams();
  if (params?.scope) qs.set("scope", params.scope);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<EntryFeedPage>(`/challenges/${id}/entries${suffix}`);
}

export async function getLeaderboard(id: string): Promise<LeaderboardOut> {
  return request<LeaderboardOut>(`/challenges/${id}/leaderboard`);
}

// ─── Sport-specific match endpoints ──────────────────────────────────────

export type SportSlug = "soccer" | "tennis" | "esports" | "basketball" | "baseball" | "hockey";

export async function getSportMatches(
  sport: SportSlug,
  params?: {
    status?: string;
    league?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ items: SportMatchListItem[]; total: number; sport: string }> {
  const qs = new URLSearchParams();
  if (params?.status)    qs.set("status",    params.status);
  if (params?.league)    qs.set("league",    params.league);
  if (params?.date_from) qs.set("date_from", params.date_from);
  if (params?.date_to)   qs.set("date_to",   params.date_to);
  if (params?.limit)     qs.set("limit",     String(params.limit));
  if (params?.offset)    qs.set("offset",    String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<{ items: SportMatchListItem[]; total: number; sport: string }>(
    `/sports/${sport}/matches${suffix}`,
    { revalidate: 30 }
  );
}

export async function getSportMatchDetail(
  sport: SportSlug,
  matchId: string
): Promise<SportMatchDetail> {
  return request<SportMatchDetail>(`/sports/${sport}/matches/${matchId}`, { revalidate: 30 });
}

export async function getEsportsMatchDetail(matchId: string): Promise<EsportsMatchDetail> {
  return request<EsportsMatchDetail>(`/sports/esports/matches/${matchId}`);
}

export async function getEsportsTeamEloHistory(
  teamId: string,
  mapName?: string,
  limit = 30
): Promise<Array<{ date: string; rating: number; match_id?: string | null }>> {
  try {
    const qs = mapName ? `?map_name=${mapName}&limit=${limit}` : `?limit=${limit}`;
    return await request(`/sports/esports/teams/${teamId}/elo-history${qs}`);
  } catch {
    return [];
  }
}

export async function getTennisMatchDetail(matchId: string): Promise<TennisMatchDetail> {
  return request<TennisMatchDetail>(`/sports/tennis/matches/${matchId}`);
}

export async function getTennisPlayerEloHistory(
  playerId: string,
  surface?: string,
  limit = 30
): Promise<Array<{ date: string; rating: number; match_id?: string | null }>> {
  try {
    const qs = surface ? `?surface=${surface}&limit=${limit}` : `?limit=${limit}`;
    return await request(`/sports/tennis/players/${playerId}/elo-history${qs}`);
  } catch {
    return [];
  }
}

export async function getSoccerTeamEloHistory(
  teamId: string,
  limit = 30
): Promise<Array<{ date: string; rating: number; match_id?: string | null }>> {
  try {
    return await request(`/sports/soccer/teams/${teamId}/elo-history?limit=${limit}`);
  } catch {
    return [];
  }
}

export async function getBasketballMatchDetail(matchId: string): Promise<BasketballMatchDetail> {
  return request<BasketballMatchDetail>(`/sports/basketball/matches/${matchId}`);
}

export async function getBasketballTeamEloHistory(
  teamId: string,
  limit = 30
): Promise<Array<{ date: string; rating: number; match_id?: string | null }>> {
  try {
    return await request(`/sports/basketball/teams/${teamId}/elo-history?limit=${limit}`);
  } catch {
    return [];
  }
}

export async function getBaseballMatchDetail(matchId: string): Promise<BaseballMatchDetail> {
  return request<BaseballMatchDetail>(`/sports/baseball/matches/${matchId}`);
}

export async function getBaseballTeamEloHistory(
  teamId: string,
  limit = 30
): Promise<Array<{ date: string; rating: number; match_id?: string | null }>> {
  try {
    return await request(`/sports/baseball/teams/${teamId}/elo-history?limit=${limit}`);
  } catch {
    return [];
  }
}

export async function getHockeyMatchDetail(matchId: string): Promise<HockeyMatchDetail> {
  return request<HockeyMatchDetail>(`/sports/hockey/matches/${matchId}`);
}

export async function getHockeyTeamEloHistory(
  teamId: string,
  limit = 30
): Promise<Array<{ date: string; rating: number; match_id?: string | null }>> {
  try {
    return await request(`/sports/hockey/teams/${teamId}/elo-history?limit=${limit}`);
  } catch {
    return [];
  }
}

export interface LiveMatchOut {
  id: string;
  sport: string;
  league: string;
  home_id: string;
  home_name: string;
  away_id: string;
  away_name: string;
  home_score: number | null;
  away_score: number | null;
  kickoff_utc: string;
  is_live: boolean;
  live_clock?: string | null;
  current_period?: number | null;
  home_logo?: string | null;
  away_logo?: string | null;
  league_logo?: string | null;
}

export async function getLiveMatches(): Promise<LiveMatchOut[]> {
  return request<LiveMatchOut[]>("/matches/live", { revalidate: 30 });
}

// ─── Picks / Record ───────────────────────────────────────────────────────

export interface PickCreate {
  match_id?: string;   // omit for manually entered matches
  match_label: string;
  sport: string;
  league?: string;
  start_time: string;
  market_name: string;
  selection_label: string;
  odds: number;
  edge?: number;
}

export interface PickOut {
  id: string;
  match_id: string;
  match_label: string;
  sport: string;
  league: string | null;
  start_time: string;
  market_name: string;
  selection_label: string;
  odds: number;
  edge: number | null;
  kelly_fraction: number | null;
  stake_fraction: number | null;
  closing_odds: number | null;
  clv: number | null;
  auto_generated: boolean;
  is_manual: boolean;
  outcome: "won" | "lost" | "void" | null;
  settled_at: string | null;
  created_at: string;
}

export interface PicksStatsOut {
  total: number;
  settled: number;
  pending: number;
  won: number;
  lost: number;
  void: number;
  win_rate: number;
  avg_odds: number;
  avg_edge: number;
  roi: number;
  avg_clv: number | null;
  kelly_roi: number | null;
}

export async function trackPicks(picks: PickCreate[]): Promise<PickOut[]> {
  return mutate<PickOut[]>("/picks", "POST", { picks });
}

export async function getPicks(params?: {
  sport?: string;
  outcome?: "won" | "lost" | "void" | "pending";
  limit?: number;
  offset?: number;
}): Promise<PickOut[]> {
  const qs = new URLSearchParams();
  if (params?.sport)   qs.set("sport",   params.sport);
  if (params?.outcome) qs.set("outcome", params.outcome);
  if (params?.limit)   qs.set("limit",   String(params.limit));
  if (params?.offset)  qs.set("offset",  String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await fetch(`${BASE}/picks${suffix}`, { cache: "no-store", headers: getAuthHeaders() });
  if (!res.ok) throw new ApiError(`API ${res.status}`, res.status, "/picks");
  return res.json();
}

export async function getPicksStats(sport?: string): Promise<PicksStatsOut> {
  const suffix = sport ? `?sport=${sport}` : "";
  const res = await fetch(`${BASE}/picks/stats${suffix}`, { cache: "no-store", headers: getAuthHeaders() });
  if (!res.ok) throw new ApiError(`API ${res.status}`, res.status, "/picks/stats");
  return res.json();
}

export interface PicksStatsAllOut {
  overall: PicksStatsOut;
  by_sport: Record<string, PicksStatsOut>;
}

export async function getPicksStatsAll(): Promise<PicksStatsAllOut> {
  const res = await fetch(`${BASE}/picks/stats/all`, { cache: "no-store", headers: getAuthHeaders() });
  if (!res.ok) throw new ApiError(`API ${res.status}`, res.status, "/picks/stats/all");
  return res.json();
}

export async function deletePick(id: string): Promise<void> {
  return mutate<void>(`/picks/${id}`, "DELETE");
}

export async function settlePick(id: string, outcome: "won" | "lost" | "void"): Promise<PickOut> {
  return mutate<PickOut>(`/picks/${id}/settle`, "PATCH", { outcome });
}

export async function getRecentWins(limit = 5): Promise<PickOut[]> {
  const res = await fetch(`${BASE}/picks/recent-wins?limit=${limit}`, { cache: "no-store", headers: getAuthHeaders() });
  if (!res.ok) throw new ApiError(`API ${res.status}`, res.status, "/picks/recent-wins");
  return res.json();
}

// ─── Bankroll ──────────────────────────────────────────────────────────────

export interface BankrollSnapshotOut {
  id: string;
  balance: number;
  event_type: string;
  pnl: number | null;
  notes: string | null;
  created_at: string;
}

export interface BankrollStatsOut {
  current_balance: number;
  starting_balance: number;
  peak_balance: number;
  total_deposited: number;
  total_withdrawn: number;
  total_pnl: number;
  roi: number;
  max_drawdown: number;
  sharpe: number | null;
  snapshots: BankrollSnapshotOut[];
}

export async function getBankroll(): Promise<BankrollStatsOut> {
  const res = await fetch(`${BASE}/bankroll`, { cache: "no-store", headers: getAuthHeaders() });
  if (!res.ok) throw new ApiError(`API ${res.status}`, res.status, "/bankroll");
  return res.json();
}

export async function depositBankroll(amount: number, notes?: string): Promise<BankrollSnapshotOut> {
  return mutate<BankrollSnapshotOut>("/bankroll/deposit", "POST", { amount, event_type: "deposit", notes });
}

export async function withdrawBankroll(amount: number, notes?: string): Promise<BankrollSnapshotOut> {
  return mutate<BankrollSnapshotOut>("/bankroll/withdraw", "POST", { amount, event_type: "withdrawal", notes });
}

// ─── Tipsters ─────────────────────────────────────────────────────────────

export interface TipsterProfile {
  id: string;
  username: string;
  display_name?: string | null;
  bio?: string | null;
  is_ai: boolean;
  followers: number;
  is_following: boolean;
  weekly_win_rate: number;
  total_picks: number;
  won_picks: number;
  active_tips_count: number;
  lost_picks: number;
  settled_picks: number;
  void_picks: number;
  overall_win_rate: number;
  roi: number;
  avg_odds: number;
  profit_loss: number;
  recent_results: ("W" | "L")[];
}

export interface TipsterTip {
  id: string;
  sport: string;
  match_id?: string | null;
  match_label: string;
  market_name: string;
  selection_label: string;
  odds: number;
  outcome?: string | null;
  start_time: string;
  note?: string | null;
}

export async function getTipsters(): Promise<TipsterProfile[]> {
  const res = await fetch(`${BASE}/tipsters`, { next: { revalidate: 60 } });
  if (!res.ok) throw new ApiError(`API ${res.status}`, res.status, "/tipsters");
  return res.json();
}

export async function getTipsterTips(tipsterId: string, includeSettled = false): Promise<TipsterTip[]> {
  const url = includeSettled
    ? `${BASE}/tipsters/${tipsterId}/tips?include_settled=true`
    : `${BASE}/tipsters/${tipsterId}/tips`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new ApiError(`API ${res.status}`, res.status, `/tipsters/${tipsterId}/tips`);
  return res.json();
}

// ─── Admin / pipeline control ─────────────────────────────────────────────

export async function triggerSync(): Promise<{ status: string; note: string }> {
  const res = await fetch(`${BASE}/admin/sync`, { method: "POST", cache: "no-store" });
  if (!res.ok) throw new ApiError("Sync trigger failed", res.status, "/admin/sync");
  return res.json();
}

export async function getEloMovers(limit = 10): Promise<RatingEntry[]> {
  return request(`/sports/elo-movers?limit=${limit}`, { revalidate: 60 });
}

// ─── Picks ROI series ─────────────────────────────────────────────────────

export type PerformanceWindow = "7d" | "30d" | "season";

export interface RoiSeriesPoint {
  date: string;
  cumulative_pnl: number;
  win_rate: number;
  value: number;
}

export async function getPicksRoiSeries(window: PerformanceWindow = "30d"): Promise<{
  series: RoiSeriesPoint[];
  window: string;
  n: number;
}> {
  const res = await fetch(`${BASE}/picks/roi-series?window=${window}`, { cache: "no-store", headers: getAuthHeaders() });
  if (!res.ok) return { series: [], window, n: 0 };
  return res.json();
}

// ─── Backtest ─────────────────────────────────────────────────────────────

export interface BacktestRunResult {
  sport: string;
  staking: string;
  n_predictions: number;
  n_correct: number;
  accuracy: number;
  roi: number;
  sharpe_ratio: number;
  max_drawdown: number;
  brier_score: number;
  calibration_error: number;
  pnl_units: number;
  n_bets_placed?: number;
  n_bets_won?: number;
  message?: string;
}

export async function runBacktest(params?: {
  sport?: string;
  staking?: string;
  min_edge?: number;
}): Promise<BacktestRunResult> {
  const qs = new URLSearchParams();
  if (params?.sport)    qs.set("sport",    params.sport);
  if (params?.staking)  qs.set("staking",  params.staking);
  if (params?.min_edge !== undefined) qs.set("min_edge", String(params.min_edge));
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<BacktestRunResult>(`/backtest/run${suffix}`);
}

export async function getBacktestSummary(): Promise<Record<string, BacktestRunResult>> {
  const res = await request<{ sports: Record<string, BacktestRunResult> }>("/backtest/summary");
  return res.sports;
}

// ─── Edge utility ─────────────────────────────────────────────────────────

/** Model edge = model probability − market implied probability (%). +ve = value bet. */
export function computeEdge(modelProb: number, marketOdds: number): number {
  if (marketOdds <= 1.0) return 0;
  const marketProb = 1 / marketOdds;
  return Math.round((modelProb - marketProb) * 1000) / 10;
}


// ─── Search ───────────────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  type: "match" | "team";
  sport: string;
  title: string;
  subtitle: string;
  href: string;
  status?: string | null;
}

export async function searchMatches(q: string, limit = 10): Promise<SearchResult[]> {
  if (!q || q.trim().length < 2) return [];
  const qs = new URLSearchParams({ q: q.trim(), limit: String(limit) });
  return request<SearchResult[]>(`/matches/search?${qs}`);
}

// ─── Prediction accuracy ──────────────────────────────────────────────────

export interface AccuracyStat { n: number; accuracy: number | null; avg_brier: number | null; }
export interface PredictionAccuracy {
  overall: AccuracyStat;
  by_sport: Record<string, AccuracyStat>;
  recent: { sport: string; kickoff: string; correct: boolean; predicted_prob: number; brier: number }[];
}

export async function getPredictionAccuracy(sport?: string): Promise<PredictionAccuracy> {
  const qs = sport ? `?sport=${sport}` : "";
  return request<PredictionAccuracy>(`/predictions/accuracy${qs}`, { revalidate: 60 });
}

// ─── Notifications ────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
  data: Record<string, unknown>;
}

export async function getNotifications(limit = 50): Promise<Notification[]> {
  return request(`/notifications?limit=${limit}`);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const r = await request<{ count: number }>(`/notifications/unread-count`);
  return r.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await fetch(`${BASE}/notifications/${id}/read`, { method: "POST", headers: getAuthHeaders() });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetch(`${BASE}/notifications/read-all`, { method: "POST", headers: getAuthHeaders() });
}

export async function updateProfile(data: { display_name?: string; current_password?: string; new_password?: string }): Promise<{ user_id: string; email: string; display_name: string | null }> {
  return mutate("/auth/me", "PATCH", data);
}

// ─── Standings ─────────────────────────────────────────────────────────────

export async function getStandingsBySport(sport: string, season?: string): Promise<StandingsResponse[]> {
  const suffix = season ? `?season=${encodeURIComponent(season)}` : "";
  return request<StandingsResponse[]>(`/standings/${sport}${suffix}`, { revalidate: 3600 });
}

export async function getStandingsForMatch(matchId: string): Promise<StandingsResponse | null> {
  try {
    return await request<StandingsResponse>(`/standings/match/${matchId}`, { revalidate: 3600 });
  } catch {
    return null;
  }
}

// ─── Match reasoning ────────────────────────────────────────────────────────

export async function getMatchReasoning(matchId: string): Promise<string | null> {
  try {
    const res = await request<{ match_id: string; reasoning: string }>(`/reasoning/${matchId}`, { revalidate: 3600 });
    return res.reasoning;
  } catch {
    return null;
  }
}

export async function getMatchReasoningPreview(params: {
  home: string;
  away: string;
  sport: string;
  league?: string;
  p_home?: number;
  p_draw?: number;
  p_away?: number;
  confidence?: number;
  fair_home?: number;
  fair_draw?: number;
  fair_away?: number;
  elo_home?: number | null;
  elo_away?: number | null;
}): Promise<string | null> {
  try {
    const q = new URLSearchParams();
    q.set("home", params.home);
    q.set("away", params.away);
    q.set("sport", params.sport);
    if (params.league) q.set("league", params.league);
    if (params.p_home != null) q.set("p_home", String(params.p_home));
    if (params.p_draw != null) q.set("p_draw", String(params.p_draw));
    if (params.p_away != null) q.set("p_away", String(params.p_away));
    if (params.confidence != null) q.set("confidence", String(params.confidence));
    if (params.fair_home != null) q.set("fair_home", String(params.fair_home));
    if (params.fair_draw != null) q.set("fair_draw", String(params.fair_draw));
    if (params.fair_away != null) q.set("fair_away", String(params.fair_away));
    if (params.elo_home != null) q.set("elo_home", String(params.elo_home));
    if (params.elo_away != null) q.set("elo_away", String(params.elo_away));
    const res = await request<{ match_id: string; reasoning: string }>(`/reasoning/preview?${q.toString()}`);
    return res.reasoning;
  } catch {
    return null;
  }
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export async function createCheckoutSession(): Promise<{ url: string }> {
  return mutate<{ url: string }>("/billing/checkout", "POST");
}

export async function createPortalSession(): Promise<{ url: string }> {
  return mutate<{ url: string }>("/billing/portal", "POST");
}

export async function getBillingStatus(): Promise<{
  status: string | null;
  current_period_end: string | null;
  is_active: boolean;
}> {
  return request("/billing/status");
}
