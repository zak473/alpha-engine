/**
 * SportsGameOdds API utilities — api.sportsgameodds.com/v2
 */

// ─── League mapping ───────────────────────────────────────────────────────────

/** Sport slug → SGO leagueID list */
export const SPORT_LEAGUE_IDS: Record<string, string[]> = {
  soccer:     ["EPL", "LA_LIGA", "BUNDESLIGA", "IT_SERIA_A", "FR_LIGUE_1", "UEFA_CHAMPIONS_LEAGUE", "UEFA_EUROPA_LEAGUE"],
  basketball: ["NBA"],
  baseball:   ["MLB"],
  hockey:     ["NHL"],
  tennis:     ["ATP", "WTA"],
  esports:    [],
};

/** Backend league name → SGO leagueID (for match detail pages) */
const LEAGUE_NAME_MAP: Record<string, string> = {
  "premier league":         "EPL",
  "epl":                    "EPL",
  "english premier league": "EPL",
  "la liga":                "LA_LIGA",
  "serie a":                "IT_SERIA_A",
  "ligue 1":                "FR_LIGUE_1",
  "bundesliga":             "BUNDESLIGA",
  "champions league":       "UEFA_CHAMPIONS_LEAGUE",
  "uefa champions league":  "UEFA_CHAMPIONS_LEAGUE",
  "europa league":          "UEFA_EUROPA_LEAGUE",
  "uefa europa league":     "UEFA_EUROPA_LEAGUE",
  "nba":                    "NBA",
  "mlb":                    "MLB",
  "nhl":                    "NHL",
  "atp":                    "ATP",
  "wta":                    "WTA",
};

export function leagueIDForName(league: string): string | null {
  return LEAGUE_NAME_MAP[league.toLowerCase().trim()] ?? null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SGOTeamInfo {
  teamID: string;
  names: { long: string; short: string; abbr?: string };
}

export interface SGOBookmakerOdds {
  odds: string;
  spread?: string;
  overUnder?: string;
  available: boolean;
}

export interface SGOOdd {
  oddID: string;
  betTypeID: string;
  sideID: string;
  statID: string;
  statEntityID: string;
  periodID: string;
  playerID?: string;
  bookOddsAvailable: boolean;
  bookOdds: string;
  bookSpread?: string;
  bookOverUnder?: string;
  fairOdds?: string;
  byBookmaker: Record<string, SGOBookmakerOdds>;
}

export interface SGOEvent {
  eventID: string;
  sportID: string;
  leagueID: string;
  type: string;
  teams: { home: SGOTeamInfo; away: SGOTeamInfo };
  status: { live: boolean; started: boolean; ended: boolean; startsAt: string };
  odds: Record<string, SGOOdd>;
}

export interface BestOdds {
  home_h2h:          number | null;
  away_h2h:          number | null;
  draw_h2h:          number | null;
  home_spread:       number | null;
  away_spread:       number | null;
  home_spread_point: number | null;
  away_spread_point: number | null;
  bookmaker:         string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert American odds string ("+310", "-115") to decimal. */
export function americanToDecimal(american: string): number | null {
  const n = parseInt(american, 10);
  if (isNaN(n) || n === 0) return null;
  if (n > 0) return Math.round(((n / 100) + 1) * 100) / 100;
  return Math.round(((100 / Math.abs(n)) + 1) * 100) / 100;
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function teamMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

// oddID keys to check per market type — ordered by preference
const HOME_ML_KEYS = ["points-home-game-ml-home", "points-home-reg-ml3way-home", "points-home-reg-ml-home"];
const AWAY_ML_KEYS = ["points-away-game-ml-away", "points-away-reg-ml3way-away", "points-away-reg-ml-away"];
const DRAW_KEYS    = ["points-all-reg-ml3way-draw", "points-all-game-ml3way-draw"];
const HOME_SP_KEYS = ["points-home-game-sp-home", "points-home-reg-sp-home"];
const AWAY_SP_KEYS = ["points-away-game-sp-away", "points-away-reg-sp-away"];

function firstAvailable(odds: Record<string, SGOOdd>, keys: string[]): SGOOdd | null {
  for (const k of keys) {
    if (odds[k]?.bookOddsAvailable) return odds[k];
  }
  return null;
}

/** Find the SGO event matching our home/away team names. */
export function findMatchingEvent(
  events: SGOEvent[],
  homeName: string,
  awayName: string
): SGOEvent | null {
  return (
    events.find(
      (e) =>
        teamMatch(e.teams.home.names.long, homeName) &&
        teamMatch(e.teams.away.names.long, awayName)
    ) ?? null
  );
}

/** Extract best H2H + spread odds from a SGO event. */
export function extractBestOdds(event: SGOEvent): BestOdds {
  const o = event.odds;
  const best: BestOdds = {
    home_h2h: null, away_h2h: null, draw_h2h: null,
    home_spread: null, away_spread: null,
    home_spread_point: null, away_spread_point: null,
    bookmaker: null,
  };

  const homeML = firstAvailable(o, HOME_ML_KEYS);
  if (homeML) {
    best.home_h2h = americanToDecimal(homeML.bookOdds);
    const bm = Object.entries(homeML.byBookmaker).find(([, v]) => v.available);
    if (bm) best.bookmaker = bm[0];
  }

  const awayML = firstAvailable(o, AWAY_ML_KEYS);
  if (awayML) best.away_h2h = americanToDecimal(awayML.bookOdds);

  const draw = firstAvailable(o, DRAW_KEYS);
  if (draw) best.draw_h2h = americanToDecimal(draw.bookOdds);

  const homeSp = firstAvailable(o, HOME_SP_KEYS);
  if (homeSp) {
    best.home_spread = americanToDecimal(homeSp.bookOdds);
    best.home_spread_point = homeSp.bookSpread != null ? parseFloat(homeSp.bookSpread) : null;
  }

  const awaySp = firstAvailable(o, AWAY_SP_KEYS);
  if (awaySp) {
    best.away_spread = americanToDecimal(awaySp.bookOdds);
    best.away_spread_point = awaySp.bookSpread != null ? parseFloat(awaySp.bookSpread) : null;
  }

  return best;
}

/** Fetch SGO events for a leagueID via our proxy route. */
export async function fetchOddsEvents(leagueID: string, live = false): Promise<SGOEvent[]> {
  try {
    const params = new URLSearchParams({
      league_id: leagueID,
      ...(live ? { live: "1" } : {}),
    });
    const res = await fetch(`/api/odds?${params}`, { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.events ?? [];
  } catch {
    return [];
  }
}
