/**
 * Server-side helper: fetch SGO event + try to find matching backend match detail.
 * Used by all sport match detail pages.
 */

import type { SportSlug } from "@/lib/betting-types";
import type { SportMatchDetail } from "@/lib/types";
import type { SGOEvent } from "@/lib/sgo";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1`;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|cf|ac|as|sc|cd|afc|rsc|fk|sk|bk|hc|hv|city|united|athletic|sporting|real|club|de|la|el)\b/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function surname(name: string): string {
  // Works for "Carlos Alcaraz" → "alcaraz" and "Alcaraz C." → "alcaraz"
  const parts = normalizeName(name).split(" ").filter(Boolean);
  return parts.length > 0 ? (parts[parts.length - 1].length > 2 ? parts[parts.length - 1] : parts[0]) : normalizeName(name);
}

function wordOverlap(a: string, b: string): number {
  const wa = new Set(normalizeName(a).split(" ").filter((w) => w.length > 2));
  const wb = new Set(normalizeName(b).split(" ").filter((w) => w.length > 2));
  let overlap = 0;
  wa.forEach((w) => { if (wb.has(w)) overlap++; });
  return overlap;
}

function teamsMatch(sgoName: string, backendName: string): boolean {
  const a = normalizeName(sgoName);
  const b = normalizeName(backendName);
  if (a === b) return true;
  if (a.length > 3 && b.includes(a)) return true;
  if (b.length > 3 && a.includes(b)) return true;
  // Surname match (important for tennis)
  if (surname(sgoName) === surname(backendName)) return true;
  // Word overlap ≥ 1 significant word
  if (wordOverlap(sgoName, backendName) >= 1) return true;
  return false;
}

function parseDate(val: unknown): Date | null {
  if (!val) return null;
  // Unix timestamp (number or numeric string)
  const n = Number(val);
  if (!isNaN(n) && n > 1_000_000_000) return new Date(n * 1000);
  // ISO string
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
    const startAt = parseDate(event.status?.startsAt);
    const sgoHome = event.teams?.home?.names?.long ?? "";
    const sgoAway = event.teams?.away?.names?.long ?? "";

    // Build date range — wide window to handle timezone differences
    let listUrl = `${API_BASE}/sports/${sport}/matches?limit=200`;
    if (startAt) {
      const dateFrom = new Date(startAt.getTime() - 12 * 3600_000).toISOString();
      const dateTo   = new Date(startAt.getTime() + 12 * 3600_000).toISOString();
      listUrl = `${API_BASE}/sports/${sport}/matches?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&limit=200`;
    }

    const listRes = await fetch(listUrl, { cache: "no-store" });

    if (listRes.ok) {
      const listData = await listRes.json();
      const items: Array<{ id: string; home_id: string; away_id: string; home_name: string; away_name: string }> = listData.items ?? [];

      // Score each candidate by match quality
      let best: typeof items[0] | null = null;
      let bestScore = 0;

      for (const m of items) {
        const homeOk = teamsMatch(sgoHome, m.home_name);
        const awayOk = teamsMatch(sgoAway, m.away_name);
        if (!homeOk || !awayOk) continue;
        // Higher score = more specific match
        const score = wordOverlap(sgoHome, m.home_name) + wordOverlap(sgoAway, m.away_name);
        if (score > bestScore) { best = m; bestScore = score; }
      }

      // Fallback: any 1-word overlap on both sides
      if (!best) {
        best = items.find((m) => teamsMatch(sgoHome, m.home_name) && teamsMatch(sgoAway, m.away_name)) ?? null;
      }

      if (best) {
        const [detailRes, eloHomeRes, eloAwayRes] = await Promise.all([
          fetch(`${API_BASE}/sports/${sport}/matches/${best.id}`, { cache: "no-store" }),
          fetch(eloHistoryUrl(sport, best.home_id), { cache: "no-store" }),
          fetch(eloHistoryUrl(sport, best.away_id), { cache: "no-store" }),
        ]);

        if (detailRes.ok) backendMatch = await detailRes.json();
        if (eloHomeRes.ok) { const d = await eloHomeRes.json(); eloHome = Array.isArray(d) ? d : (d.history ?? []); }
        if (eloAwayRes.ok) { const d = await eloAwayRes.json(); eloAway = Array.isArray(d) ? d : (d.history ?? []); }
      } else {
        console.warn(`[fetchMatchPageData] No backend match found for ${sgoHome} vs ${sgoAway} (${sport})`);
      }
    } else {
      console.warn(`[fetchMatchPageData] Backend list failed: ${listRes.status} ${listUrl}`);
    }
  } catch (err) {
    console.error("[fetchMatchPageData] Backend lookup failed:", err);
  }

  return { event, backendMatch, eloHome, eloAway };
}
