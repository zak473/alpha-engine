/**
 * Adapts existing SportMatchListItem data into BettingMatch.
 * Markets are derived from model probabilities with a simulated book margin.
 * When real market odds are available from the API they can replace these mocks.
 *
 * Feature-flag: NEXT_PUBLIC_REAL_ODDS=1 to swap in real odds (future).
 */
import type { SportMatchListItem } from "@/lib/types";
import type {
  BettingMatch, BettingTeam, Market, Selection, SportSlug, BettingFilter
} from "@/lib/betting-types";

// ── Name helpers ────────────────────────────────────────────────────────────

const STRIP_WORDS = new Set(["fc", "cf", "ac", "as", "sd", "cd", "sc", "bv", "uc"]);

export function toShortName(name: string, maxLen = 10): string {
  if (!name) return "?";
  const words = name.split(/\s+/);
  // If only one word, truncate it
  if (words.length === 1) return name.slice(0, maxLen);
  // Skip leading filler words (FC Barcelona → Barcelona)
  const first = words[0].toLowerCase();
  const start = STRIP_WORDS.has(first) ? 1 : 0;
  const meaningful = words.slice(start);
  // Return first meaningful word, truncated
  return meaningful[0].slice(0, maxLen);
}

// ── Odds maths ──────────────────────────────────────────────────────────────

/** Convert a model probability to book decimal odds with a vig margin. */
function probToOdds(prob: number, vigFraction = 0.048): number {
  if (prob <= 0.01) return 50;
  if (prob >= 0.99) return 1.01;
  // Fair odds = 1/prob; book shades slightly worse for the bettor
  const fair = 1 / prob;
  const book = fair * (1 - vigFraction);
  return Math.round(book * 100) / 100;
}

/**
 * Edge = model_prob − implied_prob_from_book_odds.
 * Positive → model sees value. Expressed as a fraction (multiply by 100 for %).
 */
function calcEdge(modelProb: number, bookOdds: number): number {
  const implied = 1 / bookOdds;
  return Math.round((modelProb - implied) * 1000) / 10; // in pct points
}

// ── Market builders ─────────────────────────────────────────────────────────

function soccerMarkets(
  pHome: number, pDraw: number, pAway: number,
  homeName: string, awayName: string
): Market[] {
  const hOdds = probToOdds(pHome);
  const dOdds = probToOdds(pDraw);
  const aOdds = probToOdds(pAway);
  return [
    {
      id: "1x2",
      name: "1X2",
      selections: [
        { id: "home", label: toShortName(homeName), odds: hOdds, impliedProb: 1/hOdds, edge: calcEdge(pHome, hOdds) },
        { id: "draw", label: "Draw",                odds: dOdds, impliedProb: 1/dOdds },
        { id: "away", label: toShortName(awayName), odds: aOdds, impliedProb: 1/aOdds, edge: calcEdge(pAway, aOdds) },
      ],
    },
    {
      id: "ou25",
      name: "O/U 2.5",
      selections: [
        { id: "over",  label: "Over 2.5",  odds: 1.88 },
        { id: "under", label: "Under 2.5", odds: 1.92 },
      ],
    },
    {
      id: "btts",
      name: "Both Teams Score",
      selections: [
        { id: "yes", label: "Yes", odds: 1.76 },
        { id: "no",  label: "No",  odds: 2.08 },
      ],
    },
  ];
}

function basketballMarkets(
  pHome: number, pAway: number,
  homeName: string, awayName: string
): Market[] {
  const hOdds = probToOdds(pHome, 0.04);
  const aOdds = probToOdds(pAway, 0.04);
  const spreadFav = pHome > 0.5 ? toShortName(homeName) : toShortName(awayName);
  return [
    {
      id: "ml",
      name: "Moneyline",
      selections: [
        { id: "home", label: toShortName(homeName), odds: hOdds, impliedProb: 1/hOdds, edge: calcEdge(pHome, hOdds) },
        { id: "away", label: toShortName(awayName), odds: aOdds, impliedProb: 1/aOdds, edge: calcEdge(pAway, aOdds) },
      ],
    },
    {
      id: "spread",
      name: "Spread",
      selections: [
        { id: "home_sp", label: `${spreadFav} -4.5`, odds: 1.91 },
        { id: "away_sp", label: `+4.5`,              odds: 1.91 },
      ],
    },
    {
      id: "total",
      name: "Total",
      selections: [
        { id: "over",  label: "Over 218.5",  odds: 1.91 },
        { id: "under", label: "Under 218.5", odds: 1.91 },
      ],
    },
  ];
}

function tennisMarkets(
  pHome: number, pAway: number,
  homeName: string, awayName: string
): Market[] {
  const hOdds = probToOdds(pHome, 0.04);
  const aOdds = probToOdds(pAway, 0.04);
  return [
    {
      id: "winner",
      name: "Match Winner",
      selections: [
        { id: "home", label: toShortName(homeName), odds: hOdds, impliedProb: 1/hOdds, edge: calcEdge(pHome, hOdds) },
        { id: "away", label: toShortName(awayName), odds: aOdds, impliedProb: 1/aOdds, edge: calcEdge(pAway, aOdds) },
      ],
    },
    {
      id: "games_ou",
      name: "Total Games O/U",
      selections: [
        { id: "over",  label: "Over 22.5",  odds: 1.85 },
        { id: "under", label: "Under 22.5", odds: 1.95 },
      ],
    },
  ];
}

function esportsMarkets(
  pHome: number, pAway: number,
  homeName: string, awayName: string
): Market[] {
  const hOdds = probToOdds(pHome, 0.05);
  const aOdds = probToOdds(pAway, 0.05);
  return [
    {
      id: "winner",
      name: "Match Winner",
      selections: [
        { id: "home", label: toShortName(homeName), odds: hOdds, impliedProb: 1/hOdds, edge: calcEdge(pHome, hOdds) },
        { id: "away", label: toShortName(awayName), odds: aOdds, impliedProb: 1/aOdds, edge: calcEdge(pAway, aOdds) },
      ],
    },
    {
      id: "maps",
      name: "Map Total",
      selections: [
        { id: "over",  label: "Over 2.5",  odds: 1.92 },
        { id: "under", label: "Under 2.5", odds: 1.88 },
      ],
    },
  ];
}

function baseballMarkets(
  pHome: number, pAway: number,
  homeName: string, awayName: string
): Market[] {
  const hOdds = probToOdds(pHome, 0.04);
  const aOdds = probToOdds(pAway, 0.04);
  return [
    {
      id: "ml",
      name: "Moneyline",
      selections: [
        { id: "home", label: toShortName(homeName), odds: hOdds, impliedProb: 1/hOdds, edge: calcEdge(pHome, hOdds) },
        { id: "away", label: toShortName(awayName), odds: aOdds, impliedProb: 1/aOdds, edge: calcEdge(pAway, aOdds) },
      ],
    },
    {
      id: "runline",
      name: "Run Line",
      selections: [
        { id: "home_rl", label: `${toShortName(homeName)} -1.5`, odds: 2.10 },
        { id: "away_rl", label: `${toShortName(awayName)} +1.5`, odds: 1.75 },
      ],
    },
  ];
}

// ── Main adapter ─────────────────────────────────────────────────────────────

export function adaptToMatchCard(item: SportMatchListItem, sport: SportSlug): BettingMatch {
  // Normalise probabilities so they sum to 1
  const rawHome = item.p_home ?? 0.5;
  const rawAway = item.p_away ?? 0.5;
  const rawDraw = (sport === "soccer" && item.p_draw != null) ? item.p_draw : 0;
  const sum = rawHome + rawAway + rawDraw || 1;
  const pHome = rawHome / sum;
  const pAway = rawAway / sum;
  const pDraw = rawDraw / sum;

  // Edge heuristic: confidence above 0.5 implies model has an edge
  const confidence = item.confidence ?? 0.5;
  const edgePercent = Math.round((confidence - 0.5) * 20 * 10) / 10; // –10 to +10

  let featuredMarkets: Market[] = [];
  switch (sport) {
    case "soccer":
      featuredMarkets = soccerMarkets(pHome, pDraw, pAway, item.home_name, item.away_name);
      break;
    case "basketball":
      featuredMarkets = basketballMarkets(pHome, pAway, item.home_name, item.away_name);
      break;
    case "tennis":
      featuredMarkets = tennisMarkets(pHome, pAway, item.home_name, item.away_name);
      break;
    case "esports":
      featuredMarkets = esportsMarkets(pHome, pAway, item.home_name, item.away_name);
      break;
    case "baseball":
      featuredMarkets = baseballMarkets(pHome, pAway, item.home_name, item.away_name);
      break;
    case "hockey":
      featuredMarkets = basketballMarkets(pHome, pAway, item.home_name, item.away_name);
      break;
  }

  const status: BettingMatch["status"] =
    item.status === "live"      ? "live"      :
    item.status === "finished"  ? "finished"  :
    item.status === "cancelled" ? "cancelled" :
    "upcoming";

  const home: BettingTeam = {
    id: item.home_id,
    name: item.home_name,
    shortName: toShortName(item.home_name),
  };
  const away: BettingTeam = {
    id: item.away_id,
    name: item.away_name,
    shortName: toShortName(item.away_name),
  };

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
    allMarkets: featuredMarkets, // same for now; API can enrich later
    modelConfidence: confidence,
    edgePercent,
    pHome,
    pAway,
    pDraw: sport === "soccer" ? pDraw : undefined,
  };
}

// ── Filter helper ─────────────────────────────────────────────────────────────

export function applyBettingFilter(matches: BettingMatch[], f: BettingFilter): BettingMatch[] {
  return matches.filter((m) => {
    // Status — "all" means active (live + upcoming), NOT finished/cancelled
    if (f.status === "all") {
      if (m.status === "finished" || m.status === "cancelled") return false;
    } else if (m.status !== f.status) {
      return false;
    }

    // Time
    if (f.time !== "all") {
      const d = new Date(m.startTime);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrowStart = new Date(todayStart.getTime() + 86400_000);
      const dayAfterStart = new Date(tomorrowStart.getTime() + 86400_000);
      if (f.time === "today"    && (d < todayStart    || d >= tomorrowStart)) return false;
      if (f.time === "tomorrow" && (d < tomorrowStart || d >= dayAfterStart)) return false;
    }

    // Edge
    if (f.edge !== "all") {
      const threshold = parseInt(f.edge);
      if ((m.edgePercent ?? 0) < threshold) return false;
    }

    // Confidence
    if (f.confidence !== "all") {
      const threshold = parseInt(f.confidence) / 100;
      if ((m.modelConfidence ?? 0) < threshold) return false;
    }

    // Search
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
    // Live always tops
    if (a.status === "live" && b.status !== "live") return -1;
    if (b.status === "live" && a.status !== "live") return 1;
    // Then edge descending
    const edgeDiff = (b.edgePercent ?? 0) - (a.edgePercent ?? 0);
    if (Math.abs(edgeDiff) > 0.5) return edgeDiff;
    // Then start time ascending
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
}
