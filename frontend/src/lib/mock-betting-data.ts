import type { BettingMatch, Market } from "./betting-types";

// Helper to create featured markets
function createMarkets(sport: string, homeShort: string, awayShort: string, homeOdds: number, awayOdds: number, drawOdds?: number): { featured: Market[]; all: Market[] } {
  const featured: Market[] = [];
  const all: Market[] = [];

  if (drawOdds !== undefined) {
    // Soccer-style 1X2
    const market1X2: Market = {
      id: "1x2",
      name: "1X2",
      selections: [
        { id: "home", label: homeShort, odds: homeOdds, edge: 0.042 },
        { id: "draw", label: "Draw", odds: drawOdds, edge: -0.01 },
        { id: "away", label: awayShort, odds: awayOdds, edge: -0.02 },
      ],
    };
    featured.push(market1X2);
    all.push(market1X2);
  } else {
    // Moneyline
    const moneyline: Market = {
      id: "ml",
      name: "Moneyline",
      selections: [
        { id: "home", label: homeShort, odds: homeOdds, edge: 0.038 },
        { id: "away", label: awayShort, odds: awayOdds, edge: -0.015 },
      ],
    };
    featured.push(moneyline);
    all.push(moneyline);
  }

  // Over/Under or Total
  const total: Market = {
    id: "total",
    name: sport === "soccer" ? "O/U 2.5" : "Total",
    selections: [
      { id: "over", label: "Over", odds: 1.9, edge: 0.02 },
      { id: "under", label: "Under", odds: 1.9, edge: -0.01 },
    ],
  };
  featured.push(total);
  all.push(total);

  return { featured, all };
}

// Mock data for UI preview when backend is unavailable
export const MOCK_MATCHES: BettingMatch[] = [
  // Live matches
  {
    id: "soccer-live-1",
    sport: "soccer",
    league: "Premier League",
    status: "live",
    startTime: new Date().toISOString(),
    liveClock: "67'",
    homeScore: 2,
    awayScore: 1,
    home: { id: "mci", name: "Manchester City", shortName: "MCI" },
    away: { id: "liv", name: "Liverpool", shortName: "LIV" },
    ...(() => {
      const m = createMarkets("soccer", "MCI", "LIV", 1.65, 4.5, 3.8);
      return { featuredMarkets: m.featured, allMarkets: m.all };
    })(),
    modelConfidence: 0.72,
    edgePercent: 4.2,
    pHome: 0.58,
    pAway: 0.18,
    pDraw: 0.24,
  },
  {
    id: "basketball-live-1",
    sport: "basketball",
    league: "NBA",
    status: "live",
    startTime: new Date().toISOString(),
    liveClock: "Q3 8:12",
    homeScore: 78,
    awayScore: 82,
    home: { id: "lal", name: "Los Angeles Lakers", shortName: "LAL" },
    away: { id: "bos", name: "Boston Celtics", shortName: "BOS" },
    ...(() => {
      const m = createMarkets("basketball", "LAL", "BOS", 2.1, 1.75);
      return { featuredMarkets: m.featured, allMarkets: m.all };
    })(),
    modelConfidence: 0.68,
    edgePercent: 3.8,
    pHome: 0.42,
    pAway: 0.58,
  },
  {
    id: "tennis-live-1",
    sport: "tennis",
    league: "ATP Tour",
    status: "live",
    startTime: new Date().toISOString(),
    liveClock: "3rd Set",
    homeScore: 2,
    awayScore: 1,
    home: { id: "alc", name: "Carlos Alcaraz", shortName: "ALC" },
    away: { id: "sin", name: "Jannik Sinner", shortName: "SIN" },
    ...(() => {
      const m = createMarkets("tennis", "ALC", "SIN", 1.85, 1.95);
      return { featuredMarkets: m.featured, allMarkets: m.all };
    })(),
    modelConfidence: 0.61,
    edgePercent: 2.1,
    pHome: 0.54,
    pAway: 0.46,
  },

  // Upcoming matches
  {
    id: "soccer-upcoming-1",
    sport: "soccer",
    league: "La Liga",
    status: "upcoming",
    startTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    home: { id: "rma", name: "Real Madrid", shortName: "RMA" },
    away: { id: "bar", name: "Barcelona", shortName: "BAR" },
    ...(() => {
      const m = createMarkets("soccer", "RMA", "BAR", 2.2, 3.0, 3.4);
      return { featuredMarkets: m.featured, allMarkets: m.all };
    })(),
    modelConfidence: 0.78,
    edgePercent: 5.6,
    pHome: 0.48,
    pAway: 0.26,
    pDraw: 0.26,
  },
  {
    id: "soccer-upcoming-2",
    sport: "soccer",
    league: "Bundesliga",
    status: "upcoming",
    startTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    home: { id: "bay", name: "Bayern Munich", shortName: "BAY" },
    away: { id: "bvb", name: "Borussia Dortmund", shortName: "BVB" },
    ...(() => {
      const m = createMarkets("soccer", "BAY", "BVB", 1.55, 5.5, 4.2);
      return { featuredMarkets: m.featured, allMarkets: m.all };
    })(),
    modelConfidence: 0.71,
    edgePercent: 3.2,
    pHome: 0.64,
    pAway: 0.14,
    pDraw: 0.22,
  },
  {
    id: "basketball-upcoming-1",
    sport: "basketball",
    league: "NBA",
    status: "upcoming",
    startTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    home: { id: "gsw", name: "Golden State Warriors", shortName: "GSW" },
    away: { id: "phx", name: "Phoenix Suns", shortName: "PHX" },
    ...(() => {
      const m = createMarkets("basketball", "GSW", "PHX", 1.9, 1.9);
      return { featuredMarkets: m.featured, allMarkets: m.all };
    })(),
    modelConfidence: 0.63,
    edgePercent: 2.4,
    pHome: 0.55,
    pAway: 0.45,
  },
  {
    id: "basketball-upcoming-2",
    sport: "basketball",
    league: "EuroLeague",
    status: "upcoming",
    startTime: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
    home: { id: "rmb", name: "Real Madrid", shortName: "RMB" },
    away: { id: "oly", name: "Olympiacos", shortName: "OLY" },
    ...(() => {
      const m = createMarkets("basketball", "RMB", "OLY", 1.7, 2.15);
      return { featuredMarkets: m.featured, allMarkets: m.all };
    })(),
    modelConfidence: 0.69,
    edgePercent: 4.1,
    pHome: 0.62,
    pAway: 0.38,
  },
  {
    id: "tennis-upcoming-1",
    sport: "tennis",
    league: "WTA Tour",
    status: "upcoming",
    startTime: new Date(Date.now() + 1.5 * 60 * 60 * 1000).toISOString(),
    home: { id: "swi", name: "Iga Swiatek", shortName: "SWI" },
    away: { id: "sab", name: "Aryna Sabalenka", shortName: "SAB" },
    ...(() => {
      const m = createMarkets("tennis", "SWI", "SAB", 1.75, 2.05);
      return { featuredMarkets: m.featured, allMarkets: m.all };
    })(),
    modelConfidence: 0.67,
    edgePercent: 3.5,
    pHome: 0.59,
    pAway: 0.41,
  },
  {
    id: "esports-upcoming-1",
    sport: "esports",
    league: "LEC",
    status: "upcoming",
    startTime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    home: { id: "g2", name: "G2 Esports", shortName: "G2" },
    away: { id: "fnc", name: "Fnatic", shortName: "FNC" },
    ...(() => {
      const m = createMarkets("esports", "G2", "FNC", 1.65, 2.2);
      return { featuredMarkets: m.featured, allMarkets: m.all };
    })(),
    modelConfidence: 0.64,
    edgePercent: 2.8,
    pHome: 0.63,
    pAway: 0.37,
  },
  {
    id: "baseball-upcoming-1",
    sport: "baseball",
    league: "MLB",
    status: "upcoming",
    startTime: new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString(),
    home: { id: "nyy", name: "New York Yankees", shortName: "NYY" },
    away: { id: "bos", name: "Boston Red Sox", shortName: "BOS" },
    ...(() => {
      const m = createMarkets("baseball", "NYY", "BOS", 1.8, 2.0);
      return { featuredMarkets: m.featured, allMarkets: m.all };
    })(),
    modelConfidence: 0.58,
    edgePercent: 1.9,
    pHome: 0.56,
    pAway: 0.44,
  },

  // Finished matches
  {
    id: "soccer-finished-1",
    sport: "soccer",
    league: "Serie A",
    status: "finished",
    startTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    homeScore: 3,
    awayScore: 1,
    home: { id: "int", name: "Inter Milan", shortName: "INT" },
    away: { id: "acm", name: "AC Milan", shortName: "ACM" },
    ...(() => {
      const m = createMarkets("soccer", "INT", "ACM", 1.9, 3.8, 3.5);
      return { featuredMarkets: m.featured, allMarkets: m.all };
    })(),
    modelConfidence: 0.74,
    edgePercent: 4.8,
    pHome: 0.52,
    pAway: 0.23,
    pDraw: 0.25,
  },
  {
    id: "basketball-finished-1",
    sport: "basketball",
    league: "NBA",
    status: "finished",
    startTime: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    homeScore: 98,
    awayScore: 112,
    home: { id: "mia", name: "Miami Heat", shortName: "MIA" },
    away: { id: "mil", name: "Milwaukee Bucks", shortName: "MIL" },
    ...(() => {
      const m = createMarkets("basketball", "MIA", "MIL", 2.3, 1.6);
      return { featuredMarkets: m.featured, allMarkets: m.all };
    })(),
    modelConfidence: 0.66,
    edgePercent: 3.1,
    pHome: 0.38,
    pAway: 0.62,
  },
  {
    id: "tennis-finished-1",
    sport: "tennis",
    league: "ATP Tour",
    status: "finished",
    startTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    homeScore: 2,
    awayScore: 0,
    home: { id: "djo", name: "Novak Djokovic", shortName: "DJO" },
    away: { id: "med", name: "Daniil Medvedev", shortName: "MED" },
    ...(() => {
      const m = createMarkets("tennis", "DJO", "MED", 1.5, 2.6);
      return { featuredMarkets: m.featured, allMarkets: m.all };
    })(),
    modelConfidence: 0.55,
    edgePercent: 1.2,
    pHome: 0.68,
    pAway: 0.32,
  },
];
