/**
 * Adapts SportMatchListItem data into BettingMatch.
 * Markets are only built when real data exists:
 *   - 1X2/Moneyline: requires real model probabilities OR real API odds
 *   - Secondary markets (O/U, BTTS, etc.): only shown when real API odds exist
 * Nothing is fabricated or defaulted — missing data = no market shown.
 */
import type { SportMatchListItem } from "@/lib/types";
import type {
  BettingMatch, BettingTeam, Market, SportSlug, BettingFilter
} from "@/lib/betting-types";

// ── Name helpers ────────────────────────────────────────────────────────────

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

// ── Odds maths ──────────────────────────────────────────────────────────────

/** Convert a real model probability to fair decimal odds (no vig — we show fair odds). */
function probToOdds(prob: number): number {
  if (!prob || prob <= 0.01 || prob >= 0.99) return 0;
  return Math.round((1 / prob) * 100) / 100;
}

function calcEdge(modelProb: number, bookOdds: number): number {
  if (!bookOdds || bookOdds <= 1) return 0;
  const implied = 1 / bookOdds;
  return Math.round((modelProb - implied) * 1000) / 10;
}

// ── Market builders ─────────────────────────────────────────────────────────

/**
 * Build 1X2 market. Returns null if neither real probabilities nor real odds exist.
 * Uses real API odds when available; falls back to model-implied fair odds.
 */
function build1x2(
  pHome: number, pDraw: number, pAway: number,
  homeName: string, awayName: string,
  realOddsHome?: number | null, realOddsDraw?: number | null, realOddsAway?: number | null,
): Market | null {
  const hasReal = realOddsHome != null && realOddsHome > 1.0 && realOddsAway != null && realOddsAway > 1.0;
  const hOdds = hasReal ? realOddsHome! : probToOdds(pHome);
  const dOdds = hasReal
    ? (realOddsDraw != null && realOddsDraw > 1.0 ? realOddsDraw : 0)
    : probToOdds(pDraw);
  const aOdds = hasReal ? realOddsAway! : probToOdds(pAway);

  if (!hOdds || !aOdds) return null;

  const selections = [
    { id: "home", label: toShortName(homeName), odds: hOdds, impliedProb: 1/hOdds, edge: calcEdge(pHome, hOdds) },
    ...(dOdds > 1 ? [{ id: "draw", label: "Draw", odds: dOdds, impliedProb: 1/dOdds }] : []),
    { id: "away", label: toShortName(awayName), odds: aOdds, impliedProb: 1/aOdds, edge: calcEdge(pAway, aOdds) },
  ];
  return { id: "1x2", name: "1X2", selections };
}

function buildMoneyline(
  pHome: number, pAway: number,
  homeName: string, awayName: string,
  realOddsHome?: number | null, realOddsAway?: number | null,
  marketId = "ml", marketName = "Moneyline",
): Market | null {
  const hasReal = realOddsHome != null && realOddsHome > 1.0 && realOddsAway != null && realOddsAway > 1.0;
  const hOdds = hasReal ? realOddsHome! : probToOdds(pHome);
  const aOdds = hasReal ? realOddsAway! : probToOdds(pAway);
  if (!hOdds || !aOdds) return null;
  return {
    id: marketId,
    name: marketName,
    selections: [
      { id: "home", label: toShortName(homeName), odds: hOdds, impliedProb: 1/hOdds, edge: calcEdge(pHome, hOdds) },
      { id: "away", label: toShortName(awayName), odds: aOdds, impliedProb: 1/aOdds, edge: calcEdge(pAway, aOdds) },
    ],
  };
}

function soccerMarkets(
  pHome: number, pDraw: number, pAway: number,
  homeName: string, awayName: string,
  realOddsHome?: number | null, realOddsDraw?: number | null, realOddsAway?: number | null,
): Market[] {
  const markets: Market[] = [];
  const m1x2 = build1x2(pHome, pDraw, pAway, homeName, awayName, realOddsHome, realOddsDraw, realOddsAway);
  if (m1x2) markets.push(m1x2);
  // Secondary markets only when real odds exist (no hardcoded values)
  return markets;
}

function basketballMarkets(
  pHome: number, pAway: number,
  homeName: string, awayName: string,
  realOddsHome?: number | null, realOddsAway?: number | null,
): Market[] {
  const markets: Market[] = [];
  const ml = buildMoneyline(pHome, pAway, homeName, awayName, realOddsHome, realOddsAway);
  if (ml) markets.push(ml);
  return markets;
}

function tennisMarkets(
  pHome: number, pAway: number,
  homeName: string, awayName: string,
  realOddsHome?: number | null, realOddsAway?: number | null,
): Market[] {
  const markets: Market[] = [];
  const ml = buildMoneyline(pHome, pAway, homeName, awayName, realOddsHome, realOddsAway, "winner", "Match Winner");
  if (ml) markets.push(ml);
  return markets;
}

function esportsMarkets(
  pHome: number, pAway: number,
  homeName: string, awayName: string,
  realOddsHome?: number | null, realOddsAway?: number | null,
): Market[] {
  const markets: Market[] = [];
  const ml = buildMoneyline(pHome, pAway, homeName, awayName, realOddsHome, realOddsAway, "winner", "Match Winner");
  if (ml) markets.push(ml);
  return markets;
}

function baseballMarkets(
  pHome: number, pAway: number,
  homeName: string, awayName: string,
  realOddsHome?: number | null, realOddsAway?: number | null,
): Market[] {
  const markets: Market[] = [];
  const ml = buildMoneyline(pHome, pAway, homeName, awayName, realOddsHome, realOddsAway, "ml", "Moneyline");
  if (ml) markets.push(ml);
  return markets;
}

// ── Main adapter ─────────────────────────────────────────────────────────────

export function adaptToMatchCard(item: SportMatchListItem, sport: SportSlug): BettingMatch {
  // Only use real probabilities — never default to 50/50
  const hasRealPrediction = item.p_home != null && item.p_away != null;
  const rawHome = hasRealPrediction ? item.p_home! : 0;
  const rawAway = hasRealPrediction ? item.p_away! : 0;
  const rawDraw = (sport === "soccer" && item.p_draw != null) ? item.p_draw : 0;
  const sum = rawHome + rawAway + rawDraw || 1;
  const pHome = rawHome / sum;
  const pAway = rawAway / sum;
  const pDraw = rawDraw / sum;

  // Confidence and edge only shown when real prediction exists
  const confidence = hasRealPrediction ? (item.confidence ?? null) : null;
  const edgePercent = confidence != null ? Math.round((confidence - 0.5) * 20 * 10) / 10 : null;

  let featuredMarkets: Market[] = [];
  switch (sport) {
    case "soccer":
      featuredMarkets = soccerMarkets(pHome, pDraw, pAway, item.home_name, item.away_name, item.odds_home, item.odds_draw, item.odds_away);
      break;
    case "basketball":
      featuredMarkets = basketballMarkets(pHome, pAway, item.home_name, item.away_name, item.odds_home, item.odds_away);
      break;
    case "tennis":
      featuredMarkets = tennisMarkets(pHome, pAway, item.home_name, item.away_name, item.odds_home, item.odds_away);
      break;
    case "esports":
      featuredMarkets = esportsMarkets(pHome, pAway, item.home_name, item.away_name, item.odds_home, item.odds_away);
      break;
    case "baseball":
      featuredMarkets = baseballMarkets(pHome, pAway, item.home_name, item.away_name, item.odds_home, item.odds_away);
      break;
    case "hockey":
      featuredMarkets = basketballMarkets(pHome, pAway, item.home_name, item.away_name, item.odds_home, item.odds_away);
      break;
  }

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
    allMarkets: featuredMarkets,
    modelConfidence: confidence ?? undefined,
    edgePercent: edgePercent ?? undefined,
    pHome: hasRealPrediction ? pHome : undefined,
    pAway: hasRealPrediction ? pAway : undefined,
    pDraw: (sport === "soccer" && hasRealPrediction) ? pDraw : undefined,
  };
}

// ── Filter helper ─────────────────────────────────────────────────────────────

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

/** Sort: live first, then by edge desc, then by startTime asc */
export function sortMatches(matches: BettingMatch[]): BettingMatch[] {
  return [...matches].sort((a, b) => {
    if (a.status === "live" && b.status !== "live") return -1;
    if (b.status === "live" && a.status !== "live") return 1;
    const edgeDiff = (b.edgePercent ?? 0) - (a.edgePercent ?? 0);
    if (Math.abs(edgeDiff) > 0.5) return edgeDiff;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
}
