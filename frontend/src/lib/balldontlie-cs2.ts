/**
 * BallDontLie GOAT — CS2 types and client fetch functions
 * All data fetches go via Next.js API route handlers so the API key stays server-side.
 */

// ─── Core types ───────────────────────────────────────────────────────────

export interface Cs2Team {
  id: number;
  name: string;
  slug?: string;
  acronym?: string;
  image_url?: string | null;
}

export type Cs2MatchStatus = "upcoming" | "running" | "finished" | "canceled" | "defwin";

export interface Cs2SeriesScore {
  team1_wins: number;
  team2_wins: number;
}

export interface Cs2Match {
  id: number;
  status: Cs2MatchStatus;
  scheduled_at: string | null;   // ISO string
  begin_at: string | null;
  end_at: string | null;
  best_of: number;               // 1 | 2 | 3 | 5
  tournament_id: number;
  tournament: {
    id: number;
    name: string;
    tier?: string;
    prizepool?: string | null;
  };
  serie?: {
    id: number;
    full_name: string;
  };
  league?: {
    id: number;
    name: string;
    image_url?: string | null;
  };
  opponents?: Array<{
    opponent: Cs2Team;
    type: "Team";
  }>;
  results?: Array<{
    team_id: number;
    score: number;
  }>;
  // Convenience — populated from opponents/results
  team1?: Cs2Team;
  team2?: Cs2Team;
  team1_score?: number;
  team2_score?: number;
}

export type Cs2MapStatus = "upcoming" | "running" | "finished";

export interface Cs2MatchMap {
  id: number;
  match_id: number;
  map_name: string;               // "Mirage" | "Dust2" | "Inferno" | etc.
  status: Cs2MapStatus;
  order: number;                   // 1-indexed
  team1_score: number | null;
  team2_score: number | null;
  team1_side_first: "T" | "CT" | null;
  winner_id?: number | null;
}

export interface Cs2RoundStat {
  id: number;
  match_map_id: number;
  team_id: number;
  round_number: number;
  team_side: "T" | "CT";
  won: boolean;
  is_pistol_round: boolean;
  kills: number;
  deaths: number;
  headshots: number;
  first_kills: number;
  trade_kills: number;
  damage: number;
  equipment_value: number;
  money_spent: number;
  win_streak: number;
  clutches: number;
}

export interface Cs2PlayerMapStat {
  id: number;
  match_map_id: number;
  player_id: number;
  player: {
    id: number;
    name: string;
    slug?: string;
    image_url?: string | null;
    nationality?: string | null;
  };
  team_id: number;
  team?: Cs2Team;
  kills: number;
  deaths: number;
  assists: number;
  adr: number;                   // Average Damage per Round
  kast: number;                  // 0-100 (percentage × 100 or raw %)
  rating: number;                // BDL custom scale (0-10)
  headshot_percentage: number;   // 0-100
  first_kills: number;
  first_deaths: number;
  clutches_won: number;
}

// ─── Derived helpers ──────────────────────────────────────────────────────

export function isMatchLive(status: Cs2MatchStatus): boolean {
  return status === "running";
}

export function isMatchFinished(status: Cs2MatchStatus): boolean {
  return status === "finished" || status === "defwin";
}

export function isMatchUpcoming(status: Cs2MatchStatus): boolean {
  return status === "upcoming";
}

/** Normalize a Cs2Match so team1/team2 and scores are always populated */
export function normalizeMatch(m: Cs2Match): Cs2Match {
  // BallDontLie returns team1/team2 directly; fall back to opponents[] for other sources
  const t1 = m.team1 ?? m.opponents?.[0]?.opponent;
  const t2 = m.team2 ?? m.opponents?.[1]?.opponent;
  const s1 = m.team1_score ?? m.results?.find((r) => r.team_id === t1?.id)?.score ?? 0;
  const s2 = m.team2_score ?? m.results?.find((r) => r.team_id === t2?.id)?.score ?? 0;
  return {
    ...m,
    team1: t1,
    team2: t2,
    team1_score: s1,
    team2_score: s2,
  };
}

export function getSeriesLabel(m: Cs2Match): string {
  const s1 = m.team1_score ?? 0;
  const s2 = m.team2_score ?? 0;
  return `${s1} – ${s2}`;
}

export function getBestOfLabel(bo: number): string {
  return `BO${bo}`;
}

/** Returns round half split index. Rounds 1-12 = first half (MR12). */
export function isFirstHalf(round: number): boolean {
  return round <= 12;
}

export function calcKd(kills: number, deaths: number): string {
  if (!deaths) return kills.toFixed(2);
  return (kills / deaths).toFixed(2);
}

export function fmtRating(rating: number): string {
  // BDL returns rating on 0-10 scale; display as-is with 2dp
  return rating.toFixed(2);
}

// ─── Client fetch functions ───────────────────────────────────────────────

export async function getCS2Matches(dates?: string[]): Promise<Cs2Match[]> {
  const today = new Date().toISOString().split("T")[0];
  const ds = dates ?? [today];
  try {
    const res = await fetch(`/api/balldontlie/cs2/matches?dates=${ds.join(",")}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? []).map(normalizeMatch);
  } catch {
    return [];
  }
}

export async function getCS2Maps(matchIds: number[]): Promise<Cs2MatchMap[]> {
  if (!matchIds.length) return [];
  try {
    const res = await fetch(
      `/api/balldontlie/cs2/maps?match_ids=${matchIds.join(",")}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

export async function getCS2MapStats(matchMapId: number): Promise<Cs2RoundStat[]> {
  try {
    const res = await fetch(
      `/api/balldontlie/cs2/map-stats?match_map_id=${matchMapId}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

export async function getCS2PlayerMapStats(matchMapId: number): Promise<Cs2PlayerMapStat[]> {
  try {
    const res = await fetch(
      `/api/balldontlie/cs2/player-map-stats?match_map_id=${matchMapId}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}
