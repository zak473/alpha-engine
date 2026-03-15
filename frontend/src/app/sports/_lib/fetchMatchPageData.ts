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
    .replace(/\b(fc|cf|ac|as|sc|cd|afc|rsc|fk|sk|bk|hc|hv)\b/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamsMatch(sgoName: string, backendName: string): boolean {
  const a = normalizeName(sgoName);
  const b = normalizeName(backendName);
  if (a === b) return true;
  if (a.length > 3 && b.includes(a)) return true;
  if (b.length > 3 && a.includes(b)) return true;
  return false;
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
    const startAt = new Date(event.status?.startsAt ?? "");
    if (!isNaN(startAt.getTime())) {
      const dateFrom = new Date(startAt.getTime() - 6 * 3600_000).toISOString();
      const dateTo   = new Date(startAt.getTime() + 6 * 3600_000).toISOString();

      const listRes = await fetch(
        `${API_BASE}/sports/${sport}/matches?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&limit=100`,
        { cache: "no-store" }
      );

      if (listRes.ok) {
        const listData = await listRes.json();
        const found = (listData.items ?? []).find(
          (m: { home_name: string; away_name: string }) =>
            teamsMatch(event.teams.home.names.long, m.home_name) &&
            teamsMatch(event.teams.away.names.long, m.away_name)
        );

        if (found) {
          const [detailRes, eloHomeRes, eloAwayRes] = await Promise.all([
            fetch(`${API_BASE}/sports/${sport}/matches/${found.id}`, { cache: "no-store" }),
            fetch(eloHistoryUrl(sport, found.home_id), { cache: "no-store" }),
            fetch(eloHistoryUrl(sport, found.away_id), { cache: "no-store" }),
          ]);

          if (detailRes.ok) backendMatch = await detailRes.json();
          if (eloHomeRes.ok) { const d = await eloHomeRes.json(); eloHome = Array.isArray(d) ? d : (d.history ?? []); }
          if (eloAwayRes.ok) { const d = await eloAwayRes.json(); eloAway = Array.isArray(d) ? d : (d.history ?? []); }
        }
      }
    }
  } catch {
    // Backend unavailable — show SGO data only
  }

  return { event, backendMatch, eloHome, eloAway };
}
