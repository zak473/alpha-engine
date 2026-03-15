/**
 * SportsGameOdds — types, helpers, and match adapter.
 * Single source of truth for match data + odds.
 */

import type { BettingMatch, BettingTeam, Market, Selection, SportSlug } from "@/lib/betting-types";

// ─── League config ────────────────────────────────────────────────────────────

export const SPORT_LEAGUES: Record<SportSlug, string[]> = {
  soccer:      ["EPL", "LA_LIGA", "BUNDESLIGA", "FR_LIGUE_1", "IT_SERIA_A", "UEFA_CHAMPIONS_LEAGUE", "UEFA_EUROPA_LEAGUE", "MLS"],
  basketball:  ["NBA"],
  baseball:    ["MLB"],
  hockey:      ["NHL"],
  tennis:      ["ATP", "WTA"],
  esports:     [],
  horseracing: [],
};

export const LEAGUE_LABELS: Record<string, string> = {
  EPL:                    "Premier League",
  LA_LIGA:                "La Liga",
  BUNDESLIGA:             "Bundesliga",
  FR_LIGUE_1:             "Ligue 1",
  IT_SERIA_A:             "Serie A",
  UEFA_CHAMPIONS_LEAGUE:  "Champions League",
  UEFA_EUROPA_LEAGUE:     "Europa League",
  MLS:                    "MLS",
  NBA:                    "NBA",
  MLB:                    "MLB",
  NHL:                    "NHL",
  ATP:                    "ATP",
  WTA:                    "WTA",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SGOTeam {
  teamID: string;
  names: { long: string; medium?: string; short?: string };
  score?: number | string;
  colors?: { primary?: string; secondary?: string };
}

export interface SGOPlayer {
  teamID: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}

export interface SGOTeamStats {
  possession?: number | string;
  shots?: number;
  shotsOnTarget?: number;
  corners?: number;
  fouls?: number;
  yellowCards?: number;
  redCards?: number;
  passes?: number;
  passesAccurate?: number;
  clearances?: number;
  offsides?: number;
  saves?: number;
  attacks?: number;
  dangerousAttacks?: number;
  [key: string]: unknown;
}

export interface SGOResultPeriod {
  home?: SGOTeamStats;
  away?: SGOTeamStats;
  [playerID: string]: unknown;
}

export interface SGOBookmakerOdds {
  odds?: string;
  spread?: string;
  overUnder?: string;
  available: boolean;
}

export interface SGOOdd {
  oddID: string;
  statID: string;
  statEntityID: string;
  periodID: string;
  betTypeID: string;
  sideID: string;
  bookOddsAvailable: boolean;
  bookOdds: string;
  bookSpread?: string;
  bookOverUnder?: string;
  byBookmaker: Record<string, SGOBookmakerOdds>;
}

export interface SGOEvent {
  eventID: string;
  sportID: string;
  leagueID: string;
  teams: { home: SGOTeam; away: SGOTeam };
  status: {
    live: boolean;
    started: boolean;
    ended: boolean;
    completed: boolean;
    cancelled: boolean;
    startsAt: string;
    displayLong: string;
    currentPeriodID: string;
    clock?: string;
  };
  odds: Record<string, SGOOdd>;
  info?: {
    venue?: { name?: string; capacity?: number; city?: string };
  };
  players?: Record<string, SGOPlayer>;
  results?: {
    game?: SGOResultPeriod;
    "1h"?: SGOResultPeriod;
    "2h"?: SGOResultPeriod;
    [period: string]: SGOResultPeriod | undefined;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** American odds string (+310, -115) → decimal */
function toDecimal(american: string): number | null {
  const n = parseInt(american, 10);
  if (isNaN(n) || n === 0) return null;
  return n > 0
    ? Math.round(((n / 100) + 1) * 100) / 100
    : Math.round(((100 / Math.abs(n)) + 1) * 100) / 100;
}

function shortName(name: string, max = 12): string {
  if (!name) return "?";
  const stop = new Set(["fc", "cf", "ac", "as", "sd", "cd", "sc"]);
  const words = name.split(/\s+/);
  if (words.length === 1) return name.slice(0, max);
  const start = stop.has(words[0].toLowerCase()) ? 1 : 0;
  return words.slice(start)[0].slice(0, max);
}

// ─── Market builder ───────────────────────────────────────────────────────────

const TEAM_ENTITIES = new Set(["home","away","all","draw","not_draw","home+draw","away+draw"]);

interface MarketDef {
  id: string;
  name: string;
  h: string;   // home oddID
  a: string;   // away oddID
  d?: string;  // draw oddID
  ou?: true;   // is over/under
}

const MARKET_DEFS: MarketDef[] = [
  // Full game
  { id: "ml",      name: "Moneyline",    h: "points-home-game-ml-home",    a: "points-away-game-ml-away" },
  { id: "1x2",     name: "1X2",          h: "points-home-reg-ml3way-home", a: "points-away-reg-ml3way-away", d: "points-all-reg-ml3way-draw" },
  { id: "sp",      name: "Spread",       h: "points-home-game-sp-home",    a: "points-away-game-sp-away" },
  { id: "ou",      name: "Total",        h: "points-all-game-ou-over",     a: "points-all-game-ou-under",    ou: true },
  { id: "h-ou",    name: "Home Total",   h: "points-home-game-ou-over",    a: "points-home-game-ou-under",   ou: true },
  { id: "a-ou",    name: "Away Total",   h: "points-away-game-ou-over",    a: "points-away-game-ou-under",   ou: true },
  // 1st half
  { id: "1h-ml",   name: "1H Moneyline", h: "points-home-1h-ml-home",      a: "points-away-1h-ml-away" },
  { id: "1h-1x2",  name: "1H 1X2",       h: "points-home-1h-ml3way-home",  a: "points-away-1h-ml3way-away",  d: "points-all-1h-ml3way-draw" },
  { id: "1h-sp",   name: "1H Spread",    h: "points-home-1h-sp-home",      a: "points-away-1h-sp-away" },
  { id: "1h-ou",   name: "1H Total",     h: "points-all-1h-ou-over",       a: "points-all-1h-ou-under",      ou: true },
  // 2nd half
  { id: "2h-ml",   name: "2H Moneyline", h: "points-home-2h-ml-home",      a: "points-away-2h-ml-away" },
  { id: "2h-sp",   name: "2H Spread",    h: "points-home-2h-sp-home",      a: "points-away-2h-sp-away" },
  { id: "2h-ou",   name: "2H Total",     h: "points-all-2h-ou-over",       a: "points-all-2h-ou-under",      ou: true },
  // Quarters (NBA)
  { id: "1q-ml",   name: "Q1 Moneyline", h: "points-home-1q-ml-home",      a: "points-away-1q-ml-away" },
  { id: "1q-sp",   name: "Q1 Spread",    h: "points-home-1q-sp-home",      a: "points-away-1q-sp-away" },
  { id: "1q-ou",   name: "Q1 Total",     h: "points-all-1q-ou-over",       a: "points-all-1q-ou-under",      ou: true },
  { id: "2q-ml",   name: "Q2 Moneyline", h: "points-home-2q-ml-home",      a: "points-away-2q-ml-away" },
  { id: "2q-sp",   name: "Q2 Spread",    h: "points-home-2q-sp-home",      a: "points-away-2q-sp-away" },
  { id: "2q-ou",   name: "Q2 Total",     h: "points-all-2q-ou-over",       a: "points-all-2q-ou-under",      ou: true },
  { id: "3q-ml",   name: "Q3 Moneyline", h: "points-home-3q-ml-home",      a: "points-away-3q-ml-away" },
  { id: "3q-sp",   name: "Q3 Spread",    h: "points-home-3q-sp-home",      a: "points-away-3q-sp-away" },
  { id: "3q-ou",   name: "Q3 Total",     h: "points-all-3q-ou-over",       a: "points-all-3q-ou-under",      ou: true },
  { id: "4q-ml",   name: "Q4 Moneyline", h: "points-home-4q-ml-home",      a: "points-away-4q-ml-away" },
  { id: "4q-sp",   name: "Q4 Spread",    h: "points-home-4q-sp-home",      a: "points-away-4q-sp-away" },
  { id: "4q-ou",   name: "Q4 Total",     h: "points-all-4q-ou-over",       a: "points-all-4q-ou-under",      ou: true },
  // Periods (NHL)
  { id: "1p-ml",   name: "P1 Moneyline", h: "points-home-1p-ml-home",      a: "points-away-1p-ml-away" },
  { id: "1p-sp",   name: "P1 Spread",    h: "points-home-1p-sp-home",      a: "points-away-1p-sp-away" },
  { id: "1p-ou",   name: "P1 Total",     h: "points-all-1p-ou-over",       a: "points-all-1p-ou-under",      ou: true },
  { id: "2p-ml",   name: "P2 Moneyline", h: "points-home-2p-ml-home",      a: "points-away-2p-ml-away" },
  { id: "2p-sp",   name: "P2 Spread",    h: "points-home-2p-sp-home",      a: "points-away-2p-sp-away" },
  { id: "2p-ou",   name: "P2 Total",     h: "points-all-2p-ou-over",       a: "points-all-2p-ou-under",      ou: true },
  { id: "3p-ml",   name: "P3 Moneyline", h: "points-home-3p-ml-home",      a: "points-away-3p-ml-away" },
  { id: "3p-sp",   name: "P3 Spread",    h: "points-home-3p-sp-home",      a: "points-away-3p-sp-away" },
  { id: "3p-ou",   name: "P3 Total",     h: "points-all-3p-ou-over",       a: "points-all-3p-ou-under",      ou: true },
];

function buildMarkets(odds: Record<string, SGOOdd>, homeName: string, awayName: string): Market[] {
  const markets: Market[] = [];

  for (const def of MARKET_DEFS) {
    const o1 = odds[def.h];
    const o2 = odds[def.a];
    if (!o1?.bookOddsAvailable || !o2?.bookOddsAvailable) continue;

    const p1 = toDecimal(o1.bookOdds);
    const p2 = toDecimal(o2.bookOdds);
    if (!p1 || !p2) continue;

    let selections: Selection[];

    if (def.ou) {
      const line = o1.bookOverUnder ? ` ${o1.bookOverUnder}` : "";
      selections = [
        { id: "over",  label: `Over${line}`,  odds: p1 },
        { id: "under", label: `Under${line}`, odds: p2 },
      ];
    } else {
      const sp1 = o1.bookSpread ? ` (${parseFloat(o1.bookSpread) > 0 ? "+" : ""}${o1.bookSpread})` : "";
      const sp2 = o2.bookSpread ? ` (${parseFloat(o2.bookSpread) > 0 ? "+" : ""}${o2.bookSpread})` : "";
      selections = [{ id: "home", label: shortName(homeName) + sp1, odds: p1 }];
      if (def.d) {
        const od = odds[def.d];
        const dp = od?.bookOddsAvailable ? toDecimal(od.bookOdds) : null;
        if (dp) selections.push({ id: "draw", label: "Draw", odds: dp });
      }
      selections.push({ id: "away", label: shortName(awayName) + sp2, odds: p2 });
    }

    markets.push({ id: def.id, name: def.name, selections });
  }

  // Player props
  type Prop = { name: string; over?: { odds: number; line: string }; under?: { odds: number; line: string } };
  const props = new Map<string, Prop>();

  for (const odd of Object.values(odds)) {
    if (!odd.bookOddsAvailable || TEAM_ENTITIES.has(odd.statEntityID) || odd.betTypeID !== "ou") continue;
    const key = `${odd.statEntityID}::${odd.statID}`;
    if (!props.has(key)) {
      const parts = odd.statEntityID.split("_");
      const nameWords = parts.slice(0, parts.length > 2 ? -2 : parts.length);
      const pName = nameWords.map((w: string) => w[0] + w.slice(1).toLowerCase()).join(" ");
      const stat = odd.statID[0].toUpperCase() + odd.statID.slice(1);
      props.set(key, { name: `${pName} ${stat}` });
    }
    const prop = props.get(key)!;
    const dec = toDecimal(odd.bookOdds);
    if (!dec) continue;
    const line = odd.bookOverUnder ?? "";
    if (odd.sideID === "over")  prop.over  = { odds: dec, line };
    if (odd.sideID === "under") prop.under = { odds: dec, line };
  }

  for (const [key, prop] of Array.from(props.entries())) {
    if (!prop.over && !prop.under) continue;
    const line = prop.over?.line || prop.under?.line || "";
    markets.push({
      id: `prop-${key}`,
      name: prop.name,
      selections: [
        ...(prop.over  ? [{ id: "over",  label: `Over ${line}`,  odds: prop.over.odds  }] : []),
        ...(prop.under ? [{ id: "under", label: `Under ${line}`, odds: prop.under.odds }] : []),
      ],
    });
  }

  return markets;
}

// ─── Main converter ───────────────────────────────────────────────────────────

export function sgoEventToMatch(event: SGOEvent, sport: SportSlug): BettingMatch {
  const homeName = event.teams.home.names.long;
  const awayName = event.teams.away.names.long;

  const s = event.status;
  const status: BettingMatch["status"] =
    s.cancelled  ? "cancelled" :
    s.completed || s.ended ? "finished" :
    s.live || s.started    ? "live"     :
    "upcoming";

  const allMarkets = buildMarkets(event.odds, homeName, awayName);

  const home: BettingTeam = { id: event.teams.home.teamID, name: homeName, shortName: shortName(homeName) };
  const away: BettingTeam = { id: event.teams.away.teamID, name: awayName, shortName: shortName(awayName) };

  return {
    id: event.eventID,
    sport,
    league: LEAGUE_LABELS[event.leagueID] ?? event.leagueID,
    startTime: s.startsAt,
    status,
    liveClock: s.live ? (s.clock ? `${s.clock}'` : s.currentPeriodID || undefined) : undefined,
    homeScore: event.teams.home.score != null ? Number(event.teams.home.score) : undefined,
    awayScore: event.teams.away.score != null ? Number(event.teams.away.score) : undefined,
    home,
    away,
    featuredMarkets: allMarkets.slice(0, 2),
    allMarkets,
  };
}

// ─── Fetch helper (client-side) ───────────────────────────────────────────────

export async function fetchSGOEvents(leagueID: string, live = false): Promise<SGOEvent[]> {
  try {
    const params = new URLSearchParams({ leagueID, ...(live ? { live: "1" } : {}) });
    const res = await fetch(`/api/sgo?${params}`, { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.events ?? [];
  } catch {
    return [];
  }
}
