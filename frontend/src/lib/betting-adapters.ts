/**
 * Adapts SportMatchListItem + optional SGOEvent into BettingMatch.
 * When a full SGOEvent is provided every market is built from live bookmaker data.
 * Falls back to model-probability-only markets when no SGO data exists.
 */
import type { SportMatchListItem } from "@/lib/types";
import type {
  BettingMatch, BettingTeam, Market, Selection, SportSlug, BettingFilter
} from "@/lib/betting-types";
import { americanToDecimal, type SGOEvent, type SGOOdd } from "@/lib/odds";

// ── Name helpers ─────────────────────────────────────────────────────────────

const STRIP_WORDS = new Set(["fc", "cf", "ac", "as", "sd", "cd", "sc", "bv", "uc"]);

export function toShortName(name: string, maxLen = 10): string {
  if (!name) return "?";
  const words = name.split(/\s+/);
  if (words.length === 1) return name.slice(0, maxLen);
  const first = words[0].toLowerCase();
  const start = STRIP_WORDS.has(first) ? 1 : 0;
  const meaningful = words.slice(start);
  return meaningful[0].slice(0, maxLen);
}

// ── Odds maths ───────────────────────────────────────────────────────────────

function probToOdds(prob: number): number {
  if (!prob || prob <= 0.01 || prob >= 0.99) return 0;
  return Math.round((1 / prob) * 100) / 100;
}

function calcEdge(modelProb: number, bookOdds: number): number {
  if (!bookOdds || bookOdds <= 1) return 0;
  const implied = 1 / bookOdds;
  return Math.round((modelProb - implied) * 1000) / 10;
}

// ── SGO market builder ───────────────────────────────────────────────────────

// Non-team stat entity IDs — anything else is a playerID
const TEAM_ENTITIES = new Set(["home", "away", "all", "draw", "not_draw", "home+draw", "away+draw"]);

interface MarketDef {
  id: string;
  name: string;
  homeKey: string;
  awayKey: string;
  drawKey?: string;
  isOU?: boolean;
}

function spreadLabel(odd: SGOOdd): string {
  if (odd.bookSpread == null) return "";
  const n = parseFloat(odd.bookSpread);
  return ` (${n > 0 ? "+" : ""}${n})`;
}

function getLine(odd: SGOOdd): string {
  return odd.bookOverUnder ?? "";
}

function buildSGOMarket(
  def: MarketDef,
  odds: Record<string, SGOOdd>,
  homeName: string,
  awayName: string,
  pHome = 0,
  pAway = 0,
  pDraw = 0,
): Market | null {
  const o1 = odds[def.homeKey];
  const o2 = odds[def.awayKey];
  if (!o1?.bookOddsAvailable || !o2?.bookOddsAvailable) return null;

  const odds1 = americanToDecimal(o1.bookOdds);
  const odds2 = americanToDecimal(o2.bookOdds);
  if (odds1 == null || odds2 == null) return null;

  const selections: Selection[] = [];

  if (def.isOU) {
    const line = getLine(o1);
    selections.push(
      { id: "over",  label: `Over${line  ? ` ${line}` : ""}`,  odds: odds1 },
      { id: "under", label: `Under${line ? ` ${line}` : ""}`, odds: odds2 },
    );
  } else {
    selections.push({
      id: "home",
      label: `${toShortName(homeName)}${spreadLabel(o1)}`,
      odds: odds1,
      edge: pHome ? calcEdge(pHome, odds1) : undefined,
    });
    if (def.drawKey) {
      const od = odds[def.drawKey];
      if (od?.bookOddsAvailable) {
        const dOdds = americanToDecimal(od.bookOdds);
        if (dOdds != null) {
          selections.push({ id: "draw", label: "Draw", odds: dOdds, edge: pDraw ? calcEdge(pDraw, dOdds) : undefined });
        }
      }
    }
    selections.push({
      id: "away",
      label: `${toShortName(awayName)}${spreadLabel(o2)}`,
      odds: odds2,
      edge: pAway ? calcEdge(pAway, odds2) : undefined,
    });
  }

  return { id: def.id, name: def.name, selections };
}

const GAME_MARKET_DEFS: MarketDef[] = [
  // Primary game-level markets
  { id: "ml",      name: "Moneyline",      homeKey: "points-home-game-ml-home",    awayKey: "points-away-game-ml-away" },
  { id: "1x2",     name: "1X2",            homeKey: "points-home-reg-ml3way-home", awayKey: "points-away-reg-ml3way-away", drawKey: "points-all-reg-ml3way-draw" },
  { id: "sp",      name: "Spread",         homeKey: "points-home-game-sp-home",    awayKey: "points-away-game-sp-away" },
  { id: "ou",      name: "Total",          homeKey: "points-all-game-ou-over",     awayKey: "points-all-game-ou-under",    isOU: true },
  // Team totals
  { id: "home-ou", name: "Home Total",     homeKey: "points-home-game-ou-over",    awayKey: "points-home-game-ou-under",   isOU: true },
  { id: "away-ou", name: "Away Total",     homeKey: "points-away-game-ou-over",    awayKey: "points-away-game-ou-under",   isOU: true },
  // 1st half
  { id: "1h-ml",   name: "1H Moneyline",   homeKey: "points-home-1h-ml-home",      awayKey: "points-away-1h-ml-away" },
  { id: "1h-sp",   name: "1H Spread",      homeKey: "points-home-1h-sp-home",      awayKey: "points-away-1h-sp-away" },
  { id: "1h-ou",   name: "1H Total",       homeKey: "points-all-1h-ou-over",       awayKey: "points-all-1h-ou-under",      isOU: true },
  // 2nd half
  { id: "2h-ml",   name: "2H Moneyline",   homeKey: "points-home-2h-ml-home",      awayKey: "points-away-2h-ml-away" },
  { id: "2h-sp",   name: "2H Spread",      homeKey: "points-home-2h-sp-home",      awayKey: "points-away-2h-sp-away" },
  { id: "2h-ou",   name: "2H Total",       homeKey: "points-all-2h-ou-over",       awayKey: "points-all-2h-ou-under",      isOU: true },
  // Quarters (basketball)
  { id: "1q-ml",   name: "1Q Moneyline",   homeKey: "points-home-1q-ml-home",      awayKey: "points-away-1q-ml-away" },
  { id: "1q-sp",   name: "1Q Spread",      homeKey: "points-home-1q-sp-home",      awayKey: "points-away-1q-sp-away" },
  { id: "1q-ou",   name: "1Q Total",       homeKey: "points-all-1q-ou-over",       awayKey: "points-all-1q-ou-under",      isOU: true },
  { id: "2q-ml",   name: "2Q Moneyline",   homeKey: "points-home-2q-ml-home",      awayKey: "points-away-2q-ml-away" },
  { id: "2q-sp",   name: "2Q Spread",      homeKey: "points-home-2q-sp-home",      awayKey: "points-away-2q-sp-away" },
  { id: "2q-ou",   name: "2Q Total",       homeKey: "points-all-2q-ou-over",       awayKey: "points-all-2q-ou-under",      isOU: true },
  { id: "3q-ml",   name: "3Q Moneyline",   homeKey: "points-home-3q-ml-home",      awayKey: "points-away-3q-ml-away" },
  { id: "3q-sp",   name: "3Q Spread",      homeKey: "points-home-3q-sp-home",      awayKey: "points-away-3q-sp-away" },
  { id: "3q-ou",   name: "3Q Total",       homeKey: "points-all-3q-ou-over",       awayKey: "points-all-3q-ou-under",      isOU: true },
  { id: "4q-ml",   name: "4Q Moneyline",   homeKey: "points-home-4q-ml-home",      awayKey: "points-away-4q-ml-away" },
  { id: "4q-sp",   name: "4Q Spread",      homeKey: "points-home-4q-sp-home",      awayKey: "points-away-4q-sp-away" },
  { id: "4q-ou",   name: "4Q Total",       homeKey: "points-all-4q-ou-over",       awayKey: "points-all-4q-ou-under",      isOU: true },
  // Periods (hockey)
  { id: "1p-ml",   name: "1P Moneyline",   homeKey: "points-home-1p-ml-home",      awayKey: "points-away-1p-ml-away" },
  { id: "1p-sp",   name: "1P Spread",      homeKey: "points-home-1p-sp-home",      awayKey: "points-away-1p-sp-away" },
  { id: "1p-ou",   name: "1P Total",       homeKey: "points-all-1p-ou-over",       awayKey: "points-all-1p-ou-under",      isOU: true },
  { id: "2p-ml",   name: "2P Moneyline",   homeKey: "points-home-2p-ml-home",      awayKey: "points-away-2p-ml-away" },
  { id: "2p-sp",   name: "2P Spread",      homeKey: "points-home-2p-sp-home",      awayKey: "points-away-2p-sp-away" },
  { id: "2p-ou",   name: "2P Total",       homeKey: "points-all-2p-ou-over",       awayKey: "points-all-2p-ou-under",      isOU: true },
  { id: "3p-ml",   name: "3P Moneyline",   homeKey: "points-home-3p-ml-home",      awayKey: "points-away-3p-ml-away" },
  { id: "3p-sp",   name: "3P Spread",      homeKey: "points-home-3p-sp-home",      awayKey: "points-away-3p-sp-away" },
  { id: "3p-ou",   name: "3P Total",       homeKey: "points-all-3p-ou-over",       awayKey: "points-all-3p-ou-under",      isOU: true },
];

function buildMarketsFromSGO(
  event: SGOEvent,
  homeName: string,
  awayName: string,
  pHome = 0,
  pAway = 0,
  pDraw = 0,
): Market[] {
  const markets: Market[] = [];
  const odds = event.odds;

  // Standard structured markets
  for (const def of GAME_MARKET_DEFS) {
    const mkt = buildSGOMarket(def, odds, homeName, awayName, pHome, pAway, pDraw);
    if (mkt) markets.push(mkt);
  }

  // Player props — group by playerID + statID
  type PropAccum = { stat: string; over?: { odds: number; line: string }; under?: { odds: number; line: string } };
  const playerProps = new Map<string, PropAccum>();

  for (const odd of Object.values(odds)) {
    if (!odd.bookOddsAvailable) continue;
    if (TEAM_ENTITIES.has(odd.statEntityID)) continue;
    if (odd.betTypeID !== "ou") continue;

    const key = `${odd.statEntityID}::${odd.statID}`;
    if (!playerProps.has(key)) playerProps.set(key, { stat: odd.statID });
    const prop = playerProps.get(key)!;

    const oddsVal = americanToDecimal(odd.bookOdds);
    if (oddsVal == null) continue;
    const line = odd.bookOverUnder ?? "";

    if (odd.sideID === "over")  prop.over  = { odds: oddsVal, line };
    if (odd.sideID === "under") prop.under = { odds: oddsVal, line };
  }

  for (const [key, prop] of Array.from(playerProps.entries())) {
    if (!prop.over && !prop.under) continue;
    const [playerID] = key.split("::");
    // Convert "ANTHONY_EDWARDS_1_NBA" → "Anthony Edwards"
    const nameParts = playerID.split("_");
    const nameOnly = nameParts.slice(0, nameParts.length > 2 ? -2 : nameParts.length);
    const playerName = nameOnly.map((w: string) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
    const statLabel = prop.stat.charAt(0).toUpperCase() + prop.stat.slice(1);
    const line = prop.over?.line || prop.under?.line || "";

    const selections: Selection[] = [];
    if (prop.over)  selections.push({ id: "over",  label: `Over ${line}`,  odds: prop.over.odds });
    if (prop.under) selections.push({ id: "under", label: `Under ${line}`, odds: prop.under.odds });

    markets.push({ id: `prop-${key}`, name: `${playerName} ${statLabel}`, selections });
  }

  return markets;
}

// ── Fallback model-only market builders ──────────────────────────────────────

function buildFallbackMarkets(
  sport: SportSlug,
  pHome: number, pDraw: number, pAway: number,
  homeName: string, awayName: string,
  realOddsHome?: number | null, realOddsDraw?: number | null, realOddsAway?: number | null,
): Market[] {
  const markets: Market[] = [];

  if (sport === "soccer") {
    const hasReal = realOddsHome != null && realOddsHome > 1.0 && realOddsAway != null && realOddsAway > 1.0;
    const hOdds = hasReal ? realOddsHome! : probToOdds(pHome);
    const dOdds = hasReal ? (realOddsDraw != null && realOddsDraw > 1.0 ? realOddsDraw : 0) : probToOdds(pDraw);
    const aOdds = hasReal ? realOddsAway! : probToOdds(pAway);
    if (hOdds && aOdds) {
      markets.push({
        id: "1x2", name: "1X2",
        selections: [
          { id: "home", label: toShortName(homeName), odds: hOdds, edge: calcEdge(pHome, hOdds) },
          ...(dOdds > 1 ? [{ id: "draw", label: "Draw", odds: dOdds }] : []),
          { id: "away", label: toShortName(awayName), odds: aOdds, edge: calcEdge(pAway, aOdds) },
        ],
      });
    }
  } else {
    const hasReal = realOddsHome != null && realOddsHome > 1.0 && realOddsAway != null && realOddsAway > 1.0;
    const hOdds = hasReal ? realOddsHome! : probToOdds(pHome);
    const aOdds = hasReal ? realOddsAway! : probToOdds(pAway);
    if (hOdds && aOdds) {
      const name = sport === "tennis" || sport === "esports" ? "Match Winner" : "Moneyline";
      markets.push({
        id: "ml", name,
        selections: [
          { id: "home", label: toShortName(homeName), odds: hOdds, edge: calcEdge(pHome, hOdds) },
          { id: "away", label: toShortName(awayName), odds: aOdds, edge: calcEdge(pAway, aOdds) },
        ],
      });
    }
  }

  return markets;
}

// ── Main adapter ──────────────────────────────────────────────────────────────

export function adaptToMatchCard(
  item: SportMatchListItem,
  sport: SportSlug,
  sgoEvent?: SGOEvent | null,
): BettingMatch {
  const hasRealPrediction = item.p_home != null && item.p_away != null;
  const rawHome = hasRealPrediction ? item.p_home! : 0;
  const rawAway = hasRealPrediction ? item.p_away! : 0;
  const rawDraw = (sport === "soccer" && item.p_draw != null) ? item.p_draw : 0;
  const sum = rawHome + rawAway + rawDraw || 1;
  const pHome = rawHome / sum;
  const pAway = rawAway / sum;
  const pDraw = rawDraw / sum;

  const confidence = hasRealPrediction ? (item.confidence ?? null) : null;
  const edgePercent = confidence != null ? Math.round((confidence - 0.5) * 20 * 10) / 10 : null;

  let allMarkets: Market[];

  if (sgoEvent) {
    allMarkets = buildMarketsFromSGO(sgoEvent, item.home_name, item.away_name, pHome, pAway, pDraw);
  } else {
    allMarkets = buildFallbackMarkets(
      sport, pHome, pDraw, pAway,
      item.home_name, item.away_name,
      item.odds_home, item.odds_draw, item.odds_away,
    );
  }

  // Featured = first 2 game-level markets (moneyline/1x2 + spread or total)
  const featuredMarkets = allMarkets.slice(0, 2);

  const status: BettingMatch["status"] =
    item.status === "live"      ? "live"      :
    item.status === "finished"  ? "finished"  :
    item.status === "cancelled" ? "cancelled" :
    "upcoming";

  const home: BettingTeam = { id: item.home_id, name: item.home_name, shortName: toShortName(item.home_name) };
  const away: BettingTeam = { id: item.away_id, name: item.away_name, shortName: toShortName(item.away_name) };

  return {
    id: item.id,
    sport,
    league: item.league,
    startTime: item.kickoff_utc,
    status,
    homeScore: item.home_score,
    awayScore: item.away_score,
    home,
    away,
    featuredMarkets,
    allMarkets,
    modelConfidence: confidence ?? undefined,
    edgePercent: edgePercent ?? undefined,
    pHome: hasRealPrediction ? pHome : undefined,
    pAway: hasRealPrediction ? pAway : undefined,
    pDraw: (sport === "soccer" && hasRealPrediction) ? pDraw : undefined,
  };
}

// ── Filter + sort ─────────────────────────────────────────────────────────────

export function applyBettingFilter(matches: BettingMatch[], f: BettingFilter): BettingMatch[] {
  return matches.filter((m) => {
    if (f.status === "all") {
      if (m.status === "finished" || m.status === "cancelled") return false;
    } else if (m.status !== f.status) {
      return false;
    }

    if (f.time !== "all") {
      const d = new Date(m.startTime);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrowStart = new Date(todayStart.getTime() + 86400_000);
      const dayAfterStart = new Date(tomorrowStart.getTime() + 86400_000);
      if (f.time === "today"    && (d < todayStart    || d >= tomorrowStart)) return false;
      if (f.time === "tomorrow" && (d < tomorrowStart || d >= dayAfterStart)) return false;
    }

    if (f.edge !== "all") {
      const threshold = parseInt(f.edge);
      if ((m.edgePercent ?? 0) < threshold) return false;
    }

    if (f.confidence !== "all") {
      const threshold = parseInt(f.confidence) / 100;
      if ((m.modelConfidence ?? 0) < threshold) return false;
    }

    if (f.search) {
      const q = f.search.toLowerCase();
      if (!m.home.name.toLowerCase().includes(q) &&
          !m.away.name.toLowerCase().includes(q) &&
          !m.league.toLowerCase().includes(q)) return false;
    }

    return true;
  });
}

export function sortMatches(matches: BettingMatch[]): BettingMatch[] {
  return [...matches].sort((a, b) => {
    if (a.status === "live" && b.status !== "live") return -1;
    if (b.status === "live" && a.status !== "live") return 1;
    const edgeDiff = (b.edgePercent ?? 0) - (a.edgePercent ?? 0);
    if (Math.abs(edgeDiff) > 0.5) return edgeDiff;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
}
