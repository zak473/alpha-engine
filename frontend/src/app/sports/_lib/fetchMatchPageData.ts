/**
 * Server-side helper: fetch SGO event + find matching backend match via search.
 * Used by all sport match detail pages.
 */

import type { SportSlug } from "@/lib/betting-types";
import type { SportMatchDetail } from "@/lib/types";
import type { SGOEvent } from "@/lib/sgo";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1`;

function getServerAuthHeaders(): Record<string, string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { cookies } = require("next/headers") as { cookies: () => { get(k: string): { value: string } | undefined } };
    const token = cookies().get("ae_token")?.value;
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    // Not in request context (build time, edge)
  }
  return {};
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|afc|cf|ac|as|sc|cd|rsc|fk|sk|bk|hc|hv)\b/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Generic words that appear in many team names and shouldn't count as a match alone
const GENERIC_TEAM_WORDS = new Set(["united", "city", "town", "athletic", "sports", "club", "wanderers", "rovers", "county"]);

function teamsMatch(sgoName: string, backendName: string): boolean {
  const a = normalizeName(sgoName);
  const b = normalizeName(backendName);
  if (a === b) return true;
  if (a.length > 3 && b.includes(a)) return true;
  if (b.length > 3 && a.includes(b)) return true;
  // Word overlap — exclude generic suffixes to avoid "Leeds United" matching "West Ham United"
  const wa = a.split(" ").filter((w) => w.length > 2 && !GENERIC_TEAM_WORDS.has(w));
  const wb = new Set(b.split(" ").filter((w) => w.length > 2 && !GENERIC_TEAM_WORDS.has(w)));
  if (wa.length > 0 && wa.some((w) => wb.has(w))) return true;
  return false;
}

// Score how precisely a SGO name matches a backend name (higher = better)
function nameMatchScore(sgoName: string, backendName: string): number {
  const a = normalizeName(sgoName);
  const b = normalizeName(backendName);
  if (a === b) return 3;
  if (a.length > 3 && b.includes(a)) return 2;
  if (b.length > 3 && a.includes(b)) return 1;
  return 0;
}

function parseDate(val: unknown): Date | null {
  if (!val) return null;
  const n = Number(val);
  if (!isNaN(n) && n > 1_000_000_000) return new Date(n * 1000);
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d;
}

function eloHistoryUrl(sport: SportSlug, id: string): string {
  if (sport === "tennis") return `${API_BASE}/sports/tennis/players/${id}/elo-history?limit=30`;
  return `${API_BASE}/sports/${sport}/teams/${id}/elo-history?limit=30`;
}

export interface EloPoint { date: string; rating: number }

export interface MatchPageData {
  event: SGOEvent;
  backendMatch: SportMatchDetail | null;
  eloHome: EloPoint[];
  eloAway: EloPoint[];
}

interface SearchResult {
  id: string;
  type: string;
  sport: string;
  title: string;
  subtitle: string;
  href: string;
  status: string | null;
}

/** Decimal odds → American odds string (e.g. 2.5 → "+150", 1.5 → "-200") */
function decimalToAmerican(decimal: number): string {
  if (decimal <= 1) return "+100";
  if (decimal >= 2.0) return `+${Math.round((decimal - 1) * 100)}`;
  return `${Math.round(-100 / (decimal - 1))}`;
}

import type { SGOOdd } from "@/lib/sgo";

function makeSGOOdd(id: string, decimalOdds: number): SGOOdd {
  return {
    oddID: id,
    statID: id.split("-")[0] ?? "points",
    statEntityID: id.split("-")[1] ?? "home",
    periodID: id.split("-")[2] ?? "game",
    betTypeID: id.includes("ml3way") ? "ml3way" : "ml",
    sideID: id.split("-").slice(-1)[0] ?? "home",
    bookOddsAvailable: true,
    bookOdds: decimalToAmerican(decimalOdds),
    byBookmaker: {},
  };
}

/** Build a minimal SGOEvent from a backend SportMatchDetail so SGOMatchDetail renders. */
function buildSyntheticSGOEvent(m: SportMatchDetail): SGOEvent {
  const status = m.status ?? "scheduled";
  const isLive = status === "live";
  const isFinished = status === "finished" || status === "completed";
  const isCancelled = status === "cancelled";

  // Populate odds from fair_odds (model-derived) or betting (market odds if available)
  const odds: Record<string, SGOOdd> = {};
  const src = m.betting ?? m.fair_odds;
  if (src) {
    const hw = src.home_win != null ? Number(src.home_win) : null;
    const aw = src.away_win != null ? Number(src.away_win) : null;
    const dr = (src as { draw?: number | null }).draw != null ? Number((src as { draw?: number | null }).draw) : null;
    if (hw && hw > 1) {
      odds["points-home-reg-ml3way-home"] = makeSGOOdd("points-home-reg-ml3way-home", hw);
      odds["points-home-game-ml-home"]    = makeSGOOdd("points-home-game-ml-home", hw);
    }
    if (aw && aw > 1) {
      odds["points-away-reg-ml3way-away"] = makeSGOOdd("points-away-reg-ml3way-away", aw);
      odds["points-away-game-ml-away"]    = makeSGOOdd("points-away-game-ml-away", aw);
    }
    if (dr && dr > 1) {
      odds["points-all-reg-ml3way-draw"]  = makeSGOOdd("points-all-reg-ml3way-draw", dr);
    }
  }

  return {
    eventID: m.id,
    sportID: m.sport,
    leagueID: m.league,
    teams: {
      home: {
        teamID: m.home.id,
        names: { long: m.home.name },
        score: m.home_score ?? undefined,
      },
      away: {
        teamID: m.away.id,
        names: { long: m.away.name },
        score: m.away_score ?? undefined,
      },
    },
    status: {
      live: isLive,
      started: isLive || isFinished,
      ended: isFinished,
      completed: isFinished,
      cancelled: isCancelled,
      startsAt: m.kickoff_utc,
      displayLong: isLive ? "Live" : isFinished ? "Final" : isCancelled ? "Cancelled" : "Upcoming",
      currentPeriodID: m.current_period ? String(m.current_period) : "",
      clock: m.live_clock ?? undefined,
    },
    odds,
    info: m.context ? {
      venue: {
        name: m.context.venue_name ?? undefined,
        city: m.context.venue_city ?? undefined,
      },
    } : undefined,
  };
}

export async function fetchMatchPageData(
  sport: SportSlug,
  eventID: string
): Promise<MatchPageData | null> {
  const apiKey = process.env.SGO_API_KEY ?? "";
  const authHeaders = getServerAuthHeaders();

  // ── Step 1: Try SGO ──────────────────────────────────────────────────────
  let event: SGOEvent | null = null;
  try {
    if (apiKey) {
      const sgoRes = await fetch(
        `https://api.sportsgameodds.com/v2/events/?apiKey=${apiKey}&eventID=${eventID}`,
        { cache: "no-store" }
      );
      if (sgoRes.ok) {
        const sgoData = await sgoRes.json();
        event = sgoData.data?.[0] ?? null;
      }
    }
  } catch {
    // SGO unreachable, fall through
  }

  // ── Step 2: Backend-direct path (when SGO unavailable or ID is a backend ID) ──
  if (!event) {
    try {
      const directRes = await fetch(
        `${API_BASE}/sports/${sport}/matches/${eventID}`,
        { cache: "no-store", headers: authHeaders }
      );
      if (directRes.ok) {
        const backendMatch: SportMatchDetail = await directRes.json();
        let eloHome: EloPoint[] = [];
        let eloAway: EloPoint[] = [];
        if (backendMatch.home?.id && backendMatch.away?.id && !backendMatch.home.id.startsWith("preview-")) {
          const [eloHomeRes, eloAwayRes] = await Promise.all([
            fetch(eloHistoryUrl(sport, backendMatch.home.id), { cache: "no-store", headers: authHeaders }),
            fetch(eloHistoryUrl(sport, backendMatch.away.id), { cache: "no-store", headers: authHeaders }),
          ]);
          if (eloHomeRes.ok) { const d = await eloHomeRes.json(); eloHome = Array.isArray(d) ? d : (d.history ?? []); }
          if (eloAwayRes.ok) { const d = await eloAwayRes.json(); eloAway = Array.isArray(d) ? d : (d.history ?? []); }
        }
        return { event: buildSyntheticSGOEvent(backendMatch), backendMatch, eloHome, eloAway };
      }
    } catch (err) {
      console.error("[fetchMatchPageData] Backend-direct fetch failed:", err);
    }
    return null;
  }

  // ── Step 3: SGO event found — enrich with backend data ───────────────────
  let backendMatch: SportMatchDetail | null = null;
  let eloHome: EloPoint[] = [];
  let eloAway: EloPoint[] = [];

  try {
    const sgoHome = event.teams?.home?.names?.long ?? "";
    const sgoAway = event.teams?.away?.names?.long ?? "";
    const startAt = parseDate(event.status?.startsAt);

    // For tennis, player names can be abbreviated in the backend (e.g. "Daniil Medvedev" → "D. Medvedev").
    // Search by last name to ensure we match abbreviated forms.
    const searchTerm = sport === "tennis"
      ? (sgoHome.split(" ").slice(-1)[0] ?? sgoHome)
      : sgoHome;

    // Search backend by home team name
    const searchRes = await fetch(
      `${API_BASE}/matches/search?q=${encodeURIComponent(searchTerm)}&limit=20`,
      { cache: "no-store", headers: authHeaders }
    );

    // Sports that support the preview endpoint (ELO-based prediction from team names)
    const PREVIEW_SPORTS = new Set(["baseball", "basketball", "hockey", "soccer", "tennis", "esports"]);

    // Step 3a: search backend by home team name for an exact DB match
    let best: SearchResult | null = null;
    if (searchRes.ok) {
      const results: SearchResult[] = await searchRes.json();

      // Filter to matches of the right sport with a matching away team
      const candidates = results.filter(
        (r) =>
          r.type === "match" &&
          r.sport === sport &&
          teamsMatch(sgoAway, r.title.split(" vs ").slice(-1)[0] ?? "")
      );

      // Score candidates by name match quality, then break ties by date proximity
      const scored = candidates.map((r) => {
        const parts = r.title.split(" vs ");
        const homeScore = nameMatchScore(sgoHome, parts[0] ?? "");
        const awayScore = nameMatchScore(sgoAway, parts.slice(-1)[0] ?? "");
        const dateVal = parseDate(r.subtitle.split("·").slice(-1)[0]?.trim());
        const dateDiff = (startAt && dateVal) ? Math.abs(dateVal.getTime() - startAt.getTime()) : Infinity;
        return { r, nameScore: homeScore + awayScore, dateDiff };
      });
      scored.sort((a, b) => b.nameScore - a.nameScore || a.dateDiff - b.dateDiff);
      best = scored[0]?.r ?? null;
    } else {
      console.warn(`[fetchMatchPageData] Search failed (${searchRes.status}) for ${sgoHome} vs ${sgoAway}`);
    }

    // Step 3b: fetch full detail for the best match
    if (best) {
      const detailRes = await fetch(
        `${API_BASE}/sports/${sport}/matches/${best.id}`,
        { cache: "no-store", headers: authHeaders }
      );
      if (detailRes.ok) {
        backendMatch = await detailRes.json();
      }
    }

    // Step 3c: fallback to ELO preview when no DB match found or detail fetch failed
    if (!backendMatch && PREVIEW_SPORTS.has(sport)) {
      const previewRes = await fetch(
        `${API_BASE}/sports/${sport}/matches/preview?home=${encodeURIComponent(sgoHome)}&away=${encodeURIComponent(sgoAway)}`,
        { cache: "no-store", headers: authHeaders }
      );
      if (previewRes.ok) {
        backendMatch = await previewRes.json();
      } else {
        console.warn(`[fetchMatchPageData] Preview fallback failed (${previewRes.status}) for ${sgoHome} vs ${sgoAway} (${sport})`);
      }
    }

    // Step 3d: fetch ELO history using team IDs from whichever response we got
    if (backendMatch?.home?.id && backendMatch?.away?.id) {
      const isPreview = backendMatch.home.id.startsWith("preview-");
      if (!isPreview) {
        const [eloHomeRes, eloAwayRes] = await Promise.all([
          fetch(eloHistoryUrl(sport, backendMatch.home.id), { cache: "no-store", headers: authHeaders }),
          fetch(eloHistoryUrl(sport, backendMatch.away.id), { cache: "no-store", headers: authHeaders }),
        ]);
        if (eloHomeRes.ok) { const d = await eloHomeRes.json(); eloHome = Array.isArray(d) ? d : (d.history ?? []); }
        if (eloAwayRes.ok) { const d = await eloAwayRes.json(); eloAway = Array.isArray(d) ? d : (d.history ?? []); }
      }
    }
  } catch (err) {
    console.error("[fetchMatchPageData] Backend lookup failed:", err);
  }

  return { event, backendMatch, eloHome, eloAway };
}
