/**
 * Betting-native types for the sports-first dashboard redesign.
 * These are frontend-only — the API adapters in betting-adapters.ts
 * map SportMatchListItem → BettingMatch so no backend changes are needed.
 */

export type SportSlug = "soccer" | "tennis" | "esports" | "basketball" | "baseball";

export type MatchStatus = "live" | "upcoming" | "finished" | "cancelled";

export interface BettingTeam {
  id: string;
  name: string;
  shortName: string;   // max 10 chars for tight layouts
  logoUrl?: string;
}

export interface Selection {
  id: string;
  label: string;       // "Arsenal", "Draw", "Over 2.5", "G2 -1.5"
  odds: number;        // decimal, e.g. 1.85
  impliedProb?: number;
  edge?: number;       // fractional edge vs model, e.g. 0.042 = +4.2%
}

export interface Market {
  id: string;
  name: string;        // "1X2", "O/U 2.5", "Moneyline", "Spread", "Map Total"
  selections: Selection[];
}

export interface BettingMatch {
  id: string;
  sport: SportSlug;
  league: string;
  startTime: string;        // ISO
  status: MatchStatus;
  liveClock?: string;       // "67'", "HT", "Q3 08:12", "Map 2", "7th Inning"
  homeScore?: number | null;
  awayScore?: number | null;
  home: BettingTeam;
  away: BettingTeam;
  featuredMarkets: Market[];   // 2–3 shown inline on the card
  allMarkets: Market[];        // full list in the expanded MarketDrawer
  modelConfidence?: number;    // 0–1
  edgePercent?: number;        // best edge in percentage points, e.g. 3.2
  pHome?: number;
  pAway?: number;
  pDraw?: number;
}

export interface QueueSelection {
  id: string;            // `${matchId}:${marketId}:${selectionId}`
  matchId: string;
  matchLabel: string;    // "Arsenal vs Barcelona"
  sport: SportSlug;
  league: string;
  marketId: string;
  marketName: string;
  selectionId: string;
  selectionLabel: string;
  odds: number;
  stake?: number;
  edge?: number;
  startTime: string;
  addedAt: string;
}

export interface BettingFilter {
  status: "all" | "live" | "upcoming" | "finished";
  time: "all" | "today" | "tomorrow";
  edge: "all" | "1" | "3" | "5";
  confidence: "all" | "55" | "65" | "75";
  search: string;
}

export const DEFAULT_BETTING_FILTER: BettingFilter = {
  status: "all",
  time: "all",
  edge: "all",
  confidence: "all",
  search: "",
};

// Sport display config
export const SPORT_CONFIG: Record<SportSlug, { label: string; color: string; icon: string }> = {
  soccer:     { label: "Soccer",     color: "#3b82f6", icon: "⚽" },
  tennis:     { label: "Tennis",     color: "#10d992", icon: "🎾" },
  esports:    { label: "Esports",    color: "#a855f7", icon: "🎮" },
  basketball: { label: "Basketball", color: "#f59e0b", icon: "🏀" },
  baseball:   { label: "Baseball",   color: "#ef4444", icon: "⚾" },
};
