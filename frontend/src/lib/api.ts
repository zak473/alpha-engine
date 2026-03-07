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
  TennisMatchDetail,
  EsportsMatchDetail,
  BasketballMatchDetail,
  BaseballMatchDetail,
} from "./types";

// Always use the absolute backend URL (works for both SSR and browser).
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const BASE = `${API_ORIGIN}/api/v1`;

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
  if (typeof window === "undefined") return {};
  try {
    const token = localStorage.getItem("alpha_engine_token");
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    // ignore
  }
  return {};
}

// ─── Low-level fetch with retry/backoff ───────────────────────────────────

async function request<T>(
  path: string,
  options?: { revalidate?: number; retries?: number }
): Promise<T> {
  const maxRetries = options?.retries ?? 2;
  let lastError: Error = new Error("Request failed");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        next: { revalidate: options?.revalidate ?? 30 },
        headers: getAuthHeaders(),
      });

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
  const res = await fetch(`${API_ORIGIN}/health`, { next: { revalidate: 10 } });
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
  return request<MvpPredictionList>(`/predictions${suffix}`);
}

export async function getMatchPrediction(matchId: string): Promise<MvpPrediction> {
  return request<MvpPrediction>(`/predictions/match/${matchId}`);
}

export async function getPerformance(sport?: string): Promise<MvpPerformance> {
  const suffix = sport ? `?sport=${sport}` : "";
  return request<MvpPerformance>(`/predictions/performance${suffix}`);
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
  return request<Challenge[]>(`/challenges${suffix}`, { revalidate: 0 });
}

export async function getChallenge(id: string): Promise<Challenge> {
  return request<Challenge>(`/challenges/${id}`, { revalidate: 0 });
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

export async function getChallengeEntries(
  id: string,
  params?: { scope?: "feed" | "mine"; page?: number; page_size?: number }
): Promise<EntryFeedPage> {
  const qs = new URLSearchParams();
  if (params?.scope) qs.set("scope", params.scope);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<EntryFeedPage>(`/challenges/${id}/entries${suffix}`, { revalidate: 0 });
}

export async function getLeaderboard(id: string): Promise<LeaderboardOut> {
  return request<LeaderboardOut>(`/challenges/${id}/leaderboard`, { revalidate: 0 });
}

// ─── Sport-specific match endpoints ──────────────────────────────────────

export type SportSlug = "soccer" | "tennis" | "esports" | "basketball" | "baseball";

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
  return request<EsportsMatchDetail>(`/sports/esports/matches/${matchId}`, { revalidate: 30 });
}

export async function getEsportsTeamEloHistory(
  teamId: string,
  mapName?: string,
  limit = 30
): Promise<Array<{ date: string; rating: number; match_id?: string | null }>> {
  try {
    const qs = mapName ? `?map_name=${mapName}&limit=${limit}` : `?limit=${limit}`;
    return await request(`/sports/esports/teams/${teamId}/elo-history${qs}`, { revalidate: 60 });
  } catch {
    return [];
  }
}

export async function getTennisMatchDetail(matchId: string): Promise<TennisMatchDetail> {
  return request<TennisMatchDetail>(`/sports/tennis/matches/${matchId}`, { revalidate: 30 });
}

export async function getTennisPlayerEloHistory(
  playerId: string,
  surface?: string,
  limit = 30
): Promise<Array<{ date: string; rating: number; match_id?: string | null }>> {
  try {
    const qs = surface ? `?surface=${surface}&limit=${limit}` : `?limit=${limit}`;
    return await request(`/sports/tennis/players/${playerId}/elo-history${qs}`, { revalidate: 60 });
  } catch {
    return [];
  }
}

export async function getSoccerTeamEloHistory(
  teamId: string,
  limit = 30
): Promise<Array<{ date: string; rating: number; match_id?: string | null }>> {
  try {
    return await request(`/sports/soccer/teams/${teamId}/elo-history?limit=${limit}`, { revalidate: 60 });
  } catch {
    return [];
  }
}

export async function getBasketballMatchDetail(matchId: string): Promise<BasketballMatchDetail> {
  return request<BasketballMatchDetail>(`/sports/basketball/matches/${matchId}`, { revalidate: 30 });
}

export async function getBasketballTeamEloHistory(
  teamId: string,
  limit = 30
): Promise<Array<{ date: string; rating: number; match_id?: string | null }>> {
  try {
    return await request(`/sports/basketball/teams/${teamId}/elo-history?limit=${limit}`, { revalidate: 60 });
  } catch {
    return [];
  }
}

export async function getBaseballMatchDetail(matchId: string): Promise<BaseballMatchDetail> {
  return request<BaseballMatchDetail>(`/sports/baseball/matches/${matchId}`, { revalidate: 30 });
}

export async function getBaseballTeamEloHistory(
  teamId: string,
  limit = 30
): Promise<Array<{ date: string; rating: number; match_id?: string | null }>> {
  try {
    return await request(`/sports/baseball/teams/${teamId}/elo-history?limit=${limit}`, { revalidate: 60 });
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
}

export async function getLiveMatches(): Promise<LiveMatchOut[]> {
  return request<LiveMatchOut[]>("/matches/live", { revalidate: 15 });
}

// ─── Picks / Record ───────────────────────────────────────────────────────

export interface PickCreate {
  match_id: string;
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
  const res = await fetch(`${BASE}/picks${suffix}`, { cache: "no-store" });
  if (!res.ok) throw new ApiError(`API ${res.status}`, res.status, "/picks");
  return res.json();
}

export async function getPicksStats(sport?: string): Promise<PicksStatsOut> {
  const suffix = sport ? `?sport=${sport}` : "";
  const res = await fetch(`${BASE}/picks/stats${suffix}`, { cache: "no-store" });
  if (!res.ok) throw new ApiError(`API ${res.status}`, res.status, "/picks/stats");
  return res.json();
}

export async function deletePick(id: string): Promise<void> {
  return mutate<void>(`/picks/${id}`, "DELETE");
}

// ─── Tipsters ─────────────────────────────────────────────────────────────

export interface TipsterProfile {
  id: string;
  username: string;
  bio?: string;
  followers: number;
  is_following: boolean;
  weekly_win_rate: number;   // 0–1
  total_picks: number;
  won_picks: number;
  active_tips_count: number;
  recent_results: ("W" | "L")[];
}

export interface TipsterTip {
  id: string;
  tipster_id: string;
  match_label: string;
  selection_label: string;
  market_name: string;
  odds: number;
  sport: string;
  start_time: string;
  note?: string;
  outcome?: "won" | "lost" | "void" | "pending";
  created_at: string;
}

export async function getTipsters(): Promise<TipsterProfile[]> {
  return request<TipsterProfile[]>("/tipsters");
}

export async function getTipsterTips(tipsterId: string): Promise<TipsterTip[]> {
  return request<TipsterTip[]>(`/tipsters/${tipsterId}/tips`);
}

export async function followTipster(tipsterId: string): Promise<void> {
  return mutate<void>(`/tipsters/${tipsterId}/follow`, "POST");
}

export async function unfollowTipster(tipsterId: string): Promise<void> {
  return mutate<void>(`/tipsters/${tipsterId}/follow`, "DELETE");
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
  const res = await fetch(`${BASE}/bankroll`, { cache: "no-store" });
  if (!res.ok) throw new ApiError(`API ${res.status}`, res.status, "/bankroll");
  return res.json();
}

export async function depositBankroll(amount: number, notes?: string): Promise<BankrollSnapshotOut> {
  return mutate<BankrollSnapshotOut>("/bankroll/deposit", "POST", { amount, event_type: "deposit", notes });
}

export async function withdrawBankroll(amount: number, notes?: string): Promise<BankrollSnapshotOut> {
  return mutate<BankrollSnapshotOut>("/bankroll/withdraw", "POST", { amount, event_type: "withdrawal", notes });
}

// ─── Admin / pipeline control ─────────────────────────────────────────────

export async function triggerSync(): Promise<{ status: string; note: string }> {
  const res = await fetch(`${BASE}/admin/sync`, { method: "POST", cache: "no-store" });
  if (!res.ok) throw new ApiError("Sync trigger failed", res.status, "/admin/sync");
  return res.json();
}

// ─── Mock data (used until real data flows through) ───────────────────────
// Replace these with real endpoints as the backend data layer is built.

export function getMockMatches(): Match[] {
  return [
    {
      id: "m-001",
      sport: "soccer",
      competition: "Premier League",
      home_name: "Manchester City",
      away_name: "Arsenal",
      home_id: "man-city",
      away_id: "arsenal",
      scheduled_at: new Date(Date.now() + 3600 * 1000 * 2).toISOString(),
      status: "scheduled",
    },
    {
      id: "m-002",
      sport: "tennis",
      competition: "Wimbledon",
      home_name: "C. Alcaraz",
      away_name: "N. Djokovic",
      home_id: "alcaraz",
      away_id: "djokovic",
      scheduled_at: new Date(Date.now() + 3600 * 1000 * 5).toISOString(),
      status: "scheduled",
    },
    {
      id: "m-003",
      sport: "esports",
      competition: "CS2 Major",
      home_name: "Natus Vincere",
      away_name: "FaZe Clan",
      home_id: "navi",
      away_id: "faze",
      scheduled_at: new Date(Date.now() + 3600 * 1000 * 8).toISOString(),
      status: "scheduled",
    },
    {
      id: "m-004",
      sport: "soccer",
      competition: "La Liga",
      home_name: "Real Madrid",
      away_name: "Barcelona",
      home_id: "real-madrid",
      away_id: "barcelona",
      scheduled_at: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
      status: "finished",
      home_score: 2,
      away_score: 1,
      outcome: "home_win",
    },
  ];
}

export function getMockRatings(): RatingEntry[] {
  return [
    { entity_id: "man-city",    name: "Manchester City", sport: "soccer",  rating: 1872, context: "global", change: +12 },
    { entity_id: "liverpool",   name: "Liverpool",       sport: "soccer",  rating: 1845, context: "global", change: -4  },
    { entity_id: "arsenal",     name: "Arsenal",         sport: "soccer",  rating: 1831, context: "global", change: +8  },
    { entity_id: "alcaraz",     name: "C. Alcaraz",      sport: "tennis",  rating: 1940, context: "global", change: +18 },
    { entity_id: "djokovic",    name: "N. Djokovic",     sport: "tennis",  rating: 1921, context: "global", change: -2  },
    { entity_id: "navi",        name: "Natus Vincere",   sport: "esports", rating: 1780, context: "global", change: +22 },
    { entity_id: "faze",        name: "FaZe Clan",       sport: "esports", rating: 1762, context: "global", change: -8  },
  ];
}

export function getMockRoiSeries() {
  const data = [];
  let cumPnl = 0;
  let date = new Date("2024-01-01");
  for (let i = 0; i < 90; i++) {
    const daily = (Math.random() - 0.42) * 3;
    cumPnl += daily;
    data.push({
      date: date.toISOString().slice(0, 10),
      roi: parseFloat(((cumPnl / (i + 1)) * 100).toFixed(2)),
      pnl: parseFloat(daily.toFixed(2)),
      cumulative_pnl: parseFloat(cumPnl.toFixed(2)),
    });
    date = new Date(date.getTime() + 86400 * 1000);
  }
  return data;
}

export function getMockSimulationBuckets() {
  return [
    { score: "1-0", probability: 0.14 },
    { score: "2-1", probability: 0.12 },
    { score: "1-1", probability: 0.11 },
    { score: "2-0", probability: 0.09 },
    { score: "0-1", probability: 0.08 },
    { score: "1-2", probability: 0.07 },
    { score: "0-0", probability: 0.07 },
    { score: "3-1", probability: 0.06 },
    { score: "2-2", probability: 0.05 },
    { score: "Other",probability: 0.21 },
  ];
}

export function getMockKpis() {
  return {
    winRate:    0.584,
    roi:        12.4,
    brierScore: 0.218,
    ece:        0.032,
    totalBets:  312,
    pnlUnits:   43.2,
    sharpe:     1.84,
    maxDrawdown: -8.6,
  };
}

// ─── Mock rich predictions (for TopSignalsTable) ─────────────────────────

export function getMockPredictions(): MvpPrediction[] {
  const now = Date.now();
  const h = (hours: number) => new Date(now + hours * 3_600_000).toISOString();
  const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString();

  return [
    {
      event_id: "pred-001", sport: "soccer", league: "Premier League", season: "2025-26",
      start_time: h(2), status: "scheduled",
      participants: { home: { id: "man-city", name: "Manchester City" }, away: { id: "arsenal", name: "Arsenal" } },
      probabilities: { home_win: 0.62, draw: 0.22, away_win: 0.16 },
      fair_odds: { home_win: 1.61, draw: 4.55, away_win: 6.25 },
      confidence: 87,
      key_drivers: [
        { feature: "elo_diff",        value: 0.82, importance: 0.34 },
        { feature: "home_form_pts",   value: 13.0, importance: 0.22 },
        { feature: "h2h_home_win_pct",value: 0.58, importance: 0.18 },
      ],
      simulation: { n_simulations: 10000, mean_home_goals: 1.9, mean_away_goals: 1.1, distribution: [
        { score: "1-0", probability: 0.14 }, { score: "2-1", probability: 0.12 },
        { score: "1-1", probability: 0.11 }, { score: "2-0", probability: 0.10 }, { score: "0-1", probability: 0.07 },
      ]},
      model: { version: "soccer_lr_v1", trained_at: ago(24 * 30) }, created_at: ago(2),
    },
    {
      event_id: "pred-002", sport: "soccer", league: "La Liga", season: "2025-26",
      start_time: h(5), status: "scheduled",
      participants: { home: { id: "real-madrid", name: "Real Madrid" }, away: { id: "barcelona", name: "Barcelona" } },
      probabilities: { home_win: 0.45, draw: 0.28, away_win: 0.27 },
      fair_odds: { home_win: 2.22, draw: 3.57, away_win: 3.70 },
      confidence: 72,
      key_drivers: [
        { feature: "elo_diff",      value: 0.12, importance: 0.28 },
        { feature: "away_form_pts", value: 12.0, importance: 0.25 },
        { feature: "rest_diff",     value: -1.0, importance: 0.15 },
      ],
      simulation: { n_simulations: 10000, mean_home_goals: 1.5, mean_away_goals: 1.4, distribution: [
        { score: "1-1", probability: 0.15 }, { score: "1-0", probability: 0.11 },
        { score: "2-1", probability: 0.10 }, { score: "0-1", probability: 0.09 }, { score: "2-2", probability: 0.08 },
      ]},
      model: { version: "soccer_lr_v1", trained_at: ago(24 * 30) }, created_at: ago(3),
    },
    {
      event_id: "pred-003", sport: "tennis", league: "Wimbledon", season: "2026",
      start_time: h(4), status: "scheduled",
      participants: { home: { id: "alcaraz", name: "C. Alcaraz" }, away: { id: "djokovic", name: "N. Djokovic" } },
      probabilities: { home_win: 0.58, draw: 0, away_win: 0.42 },
      fair_odds: { home_win: 1.72, draw: 0, away_win: 2.38 },
      confidence: 81,
      key_drivers: [
        { feature: "elo_surface",  value: 0.65, importance: 0.42 },
        { feature: "recent_form",  value: 0.80, importance: 0.31 },
        { feature: "h2h_win_pct",  value: 0.55, importance: 0.19 },
      ],
      simulation: null,
      model: { version: "tennis_lr_v1", trained_at: ago(24 * 45) }, created_at: ago(1),
    },
    {
      event_id: "pred-004", sport: "tennis", league: "Roland Garros", season: "2026",
      start_time: h(7), status: "scheduled",
      participants: { home: { id: "sinner", name: "J. Sinner" }, away: { id: "medvedev", name: "D. Medvedev" } },
      probabilities: { home_win: 0.67, draw: 0, away_win: 0.33 },
      fair_odds: { home_win: 1.49, draw: 0, away_win: 3.03 },
      confidence: 76,
      key_drivers: [
        { feature: "elo_surface", value: 0.72, importance: 0.45 },
        { feature: "clay_win_pct",value: 0.74, importance: 0.29 },
      ],
      simulation: null,
      model: { version: "tennis_lr_v1", trained_at: ago(24 * 45) }, created_at: ago(1.5),
    },
    {
      event_id: "pred-005", sport: "esports", league: "CS2 Major", season: "2026",
      start_time: h(8), status: "scheduled",
      participants: { home: { id: "navi", name: "Natus Vincere" }, away: { id: "faze", name: "FaZe Clan" } },
      probabilities: { home_win: 0.54, draw: 0, away_win: 0.46 },
      fair_odds: { home_win: 1.85, draw: 0, away_win: 2.17 },
      confidence: 63,
      key_drivers: [
        { feature: "elo_map",    value: 0.21, importance: 0.38 },
        { feature: "patch_form", value: 0.55, importance: 0.27 },
      ],
      simulation: null,
      model: { version: "esports_lr_v1", trained_at: ago(24 * 7) }, created_at: ago(4),
    },
    {
      event_id: "pred-006", sport: "soccer", league: "Bundesliga", season: "2025-26",
      start_time: h(12), status: "scheduled",
      participants: { home: { id: "bvb", name: "Borussia Dortmund" }, away: { id: "bayern", name: "Bayern Munich" } },
      probabilities: { home_win: 0.31, draw: 0.29, away_win: 0.40 },
      fair_odds: { home_win: 3.23, draw: 3.45, away_win: 2.50 },
      confidence: 68,
      key_drivers: [
        { feature: "elo_diff",      value: -0.32, importance: 0.36 },
        { feature: "away_form_pts", value: 14.0,  importance: 0.24 },
        { feature: "h2h_away_wins", value: 0.62,  importance: 0.20 },
      ],
      simulation: { n_simulations: 10000, mean_home_goals: 1.2, mean_away_goals: 1.7, distribution: [
        { score: "1-2", probability: 0.13 }, { score: "0-1", probability: 0.12 },
        { score: "1-1", probability: 0.11 }, { score: "0-2", probability: 0.09 }, { score: "2-2", probability: 0.07 },
      ]},
      model: { version: "soccer_lr_v1", trained_at: ago(24 * 30) }, created_at: ago(5),
    },
    {
      event_id: "pred-007", sport: "esports", league: "Valorant Champions", season: "2026",
      start_time: h(18), status: "scheduled",
      participants: { home: { id: "sentinels", name: "Sentinels" }, away: { id: "loud", name: "LOUD" } },
      probabilities: { home_win: 0.61, draw: 0, away_win: 0.39 },
      fair_odds: { home_win: 1.64, draw: 0, away_win: 2.56 },
      confidence: 70,
      key_drivers: [
        { feature: "map_pool_adv",  value: 0.68, importance: 0.40 },
        { feature: "recent_form",   value: 0.72, importance: 0.30 },
      ],
      simulation: null,
      model: { version: "esports_lr_v1", trained_at: ago(24 * 7) }, created_at: ago(6),
    },
    {
      event_id: "pred-008", sport: "soccer", league: "Serie A", season: "2025-26",
      start_time: h(24), status: "scheduled",
      participants: { home: { id: "inter", name: "Inter Milan" }, away: { id: "juventus", name: "Juventus" } },
      probabilities: { home_win: 0.51, draw: 0.27, away_win: 0.22 },
      fair_odds: { home_win: 1.96, draw: 3.70, away_win: 4.55 },
      confidence: 59,
      key_drivers: [
        { feature: "elo_diff",      value: 0.22, importance: 0.31 },
        { feature: "home_form_pts", value: 11.0, importance: 0.21 },
      ],
      simulation: null,
      model: { version: "soccer_lr_v1", trained_at: ago(24 * 30) }, created_at: ago(8),
    },
    {
      event_id: "pred-009", sport: "tennis", league: "US Open", season: "2026",
      start_time: h(36), status: "scheduled",
      participants: { home: { id: "zverev", name: "A. Zverev" }, away: { id: "fritz", name: "T. Fritz" } },
      probabilities: { home_win: 0.64, draw: 0, away_win: 0.36 },
      fair_odds: { home_win: 1.56, draw: 0, away_win: 2.78 },
      confidence: 74,
      key_drivers: [
        { feature: "elo_surface", value: 0.58, importance: 0.44 },
        { feature: "serve_rating",value: 0.71, importance: 0.28 },
      ],
      simulation: null,
      model: { version: "tennis_lr_v1", trained_at: ago(24 * 45) }, created_at: ago(10),
    },
    {
      event_id: "pred-010", sport: "soccer", league: "Ligue 1", season: "2025-26",
      start_time: h(48), status: "scheduled",
      participants: { home: { id: "psg", name: "Paris Saint-Germain" }, away: { id: "marseille", name: "Olympique Marseille" } },
      probabilities: { home_win: 0.55, draw: 0.25, away_win: 0.20 },
      fair_odds: { home_win: 1.82, draw: 4.00, away_win: 5.00 },
      confidence: 65,
      key_drivers: [
        { feature: "elo_diff",       value: 0.40,  importance: 0.33 },
        { feature: "home_xg_avg",    value: 2.4,   importance: 0.22 },
        { feature: "h2h_home_wins",  value: 0.60,  importance: 0.19 },
      ],
      simulation: { n_simulations: 10000, mean_home_goals: 1.8, mean_away_goals: 1.0, distribution: [
        { score: "2-0", probability: 0.14 }, { score: "1-0", probability: 0.13 },
        { score: "2-1", probability: 0.11 }, { score: "1-1", probability: 0.10 }, { score: "3-1", probability: 0.07 },
      ]},
      model: { version: "soccer_lr_v1", trained_at: ago(24 * 30) }, created_at: ago(12),
    },
  ];
}

// ─── Mock market odds (for edge computation) ──────────────────────────────
// Market odds are slightly different from model fair odds — the gap is the "edge"

export function getMockMarketOdds(): Record<string, { home_win: number; draw: number; away_win: number }> {
  return {
    "pred-001": { home_win: 1.75, draw: 4.80, away_win: 6.00 },  // Model +4.9% edge on home
    "pred-002": { home_win: 2.10, draw: 3.60, away_win: 3.80 },  // Market more bullish, −5% edge
    "pred-003": { home_win: 1.90, draw: 0,    away_win: 2.05 },  // +3.5% edge
    "pred-004": { home_win: 1.55, draw: 0,    away_win: 2.90 },  // +6.3% edge on Sinner
    "pred-005": { home_win: 1.97, draw: 0,    away_win: 1.97 },  // Near 50/50, small edge
    "pred-006": { home_win: 3.10, draw: 3.20, away_win: 2.40 },  // +5.3% edge on away (Bayern)
    "pred-007": { home_win: 1.72, draw: 0,    away_win: 2.55 },  // +2.8% edge
    "pred-008": { home_win: 2.10, draw: 3.50, away_win: 4.20 },  // +2.2% edge
    "pred-009": { home_win: 1.65, draw: 0,    away_win: 2.65 },  // +3.3% edge
    "pred-010": { home_win: 1.78, draw: 3.80, away_win: 4.80 },  // −0.4% (market ahead)
  };
}

/** Model edge = model probability − market implied probability (%). +ve = value bet. */
export function computeEdge(modelProb: number, marketOdds: number): number {
  if (marketOdds <= 0) return 0;
  const marketProb = 1 / marketOdds;
  return Math.round((modelProb - marketProb) * 1000) / 10;
}

// ─── Mock performance windows ─────────────────────────────────────────────

export type PerformanceWindow = "7d" | "30d" | "season";

export interface MockPerformanceData {
  winRate: number;
  brierScore: number;
  calibration: "good" | "ok" | "poor";
  series: Array<{ date: string; value: number }>;
}

export function getMockPerformanceByWindow(window: PerformanceWindow): MockPerformanceData {
  const WINDOWS: Record<PerformanceWindow, MockPerformanceData> = {
    "7d": {
      winRate: 0.612, brierScore: 0.201, calibration: "good",
      series: [
        { date: "Mon", value: 0.58 }, { date: "Tue", value: 0.64 }, { date: "Wed", value: 0.60 },
        { date: "Thu", value: 0.67 }, { date: "Fri", value: 0.61 }, { date: "Sat", value: 0.70 },
        { date: "Sun", value: 0.612 },
      ],
    },
    "30d": {
      winRate: 0.584, brierScore: 0.218, calibration: "ok",
      series: Array.from({ length: 8 }, (_, i) => ({
        date: `W${i + 1}`,
        value: 0.55 + Math.sin(i * 0.8) * 0.05 + i * 0.004,
      })),
    },
    "season": {
      winRate: 0.571, brierScore: 0.224, calibration: "ok",
      series: Array.from({ length: 10 }, (_, i) => ({
        date: `M${i + 1}`,
        value: 0.52 + i * 0.006 + Math.sin(i * 0.6) * 0.03,
      })),
    },
  };
  return WINDOWS[window];
}
