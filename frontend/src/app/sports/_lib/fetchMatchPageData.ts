/**
 * Server-side helper: fetch SGO event + find matching backend match via search.
 * Used by all sport match detail pages.
 */

import type { SportSlug } from "@/lib/betting-types";
import type { SportMatchDetail } from "@/lib/types";
import type { SGOEvent } from "@/lib/sgo";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1`;

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

export async function fetchMatchPageData(
  sport: SportSlug,
  eventID: string
): Promise<MatchPageData | null> {
  const apiKey = process.env.SGO_API_KEY ?? "";

  const sgoRes = await fetch(
    `https://api.sportsgameodds.com/v2/events/?apiKey=${apiKey}&eventID=${eventID}`,
    { cache: "no-store" }
  );
  if (!sgoRes.ok) return null;
  const sgoData = await sgoRes.json();
  const event = sgoData.data?.[0];
  if (!event) return null;

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
      { cache: "no-store" }
    );

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
      const best: SearchResult | null = scored[0]?.r ?? null;

      // Sports that support the preview endpoint (ELO-based prediction from team names)
      const PREVIEW_SPORTS = new Set(["baseball", "basketball"]);

      if (best) {
        const detailRes = await fetch(
          `${API_BASE}/sports/${sport}/matches/${best.id}`,
          { cache: "no-store" }
        );

        if (detailRes.ok) {
          backendMatch = await detailRes.json();
        }
      } else if (PREVIEW_SPORTS.has(sport)) {
        // Fallback: build ELO preview from team names when no DB match found
        const previewRes = await fetch(
          `${API_BASE}/sports/${sport}/matches/preview?home=${encodeURIComponent(sgoHome)}&away=${encodeURIComponent(sgoAway)}`,
          { cache: "no-store" }
        );
        if (previewRes.ok) {
          backendMatch = await previewRes.json();
        } else {
          console.warn(`[fetchMatchPageData] No match found for ${sgoHome} vs ${sgoAway} (${sport})`);
        }
      } else {
        console.warn(`[fetchMatchPageData] No match found for ${sgoHome} vs ${sgoAway} (${sport})`);
      }

      // Fetch ELO history using team IDs from the match/preview response
      if (backendMatch?.home?.id && backendMatch?.away?.id) {
        const isPreview = backendMatch.home.id.startsWith("preview-");
        if (!isPreview) {
          const [eloHomeRes, eloAwayRes] = await Promise.all([
            fetch(eloHistoryUrl(sport, backendMatch.home.id), { cache: "no-store" }),
            fetch(eloHistoryUrl(sport, backendMatch.away.id), { cache: "no-store" }),
          ]);
          if (eloHomeRes.ok) { const d = await eloHomeRes.json(); eloHome = Array.isArray(d) ? d : (d.history ?? []); }
          if (eloAwayRes.ok) { const d = await eloAwayRes.json(); eloAway = Array.isArray(d) ? d : (d.history ?? []); }
        }
      }
    }
  } catch (err) {
    console.error("[fetchMatchPageData] Backend lookup failed:", err);
  }

  return { event, backendMatch, eloHome, eloAway };
}
