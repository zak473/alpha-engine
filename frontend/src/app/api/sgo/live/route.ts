/**
 * Fetches all currently live events across every league we track in Sports Hub.
 * Uses live=true per-league (same parameter as the main /api/sgo route).
 * Deduplicates by eventID and returns only status.live === true events.
 */
import { NextResponse } from "next/server";

const BASE = "https://api.sportsgameodds.com/v2";

// All leagues we track — must stay in sync with lib/sgo.ts SPORT_LEAGUES
const ALL_LEAGUES = [
  // Soccer
  "EPL", "LA_LIGA", "BUNDESLIGA", "FR_LIGUE_1", "IT_SERIA_A",
  "UEFA_CHAMPIONS_LEAGUE", "UEFA_EUROPA_LEAGUE", "MLS",
  // Basketball
  "NBA",
  // Baseball
  "MLB",
  // Hockey
  "NHL",
  // Tennis
  "ATP", "WTA",
];

async function fetchLeagueLive(leagueID: string, apiKey: string): Promise<unknown[]> {
  try {
    const params = new URLSearchParams({ apiKey, leagueID, live: "true" });
    const res = await fetch(`${BASE}/events/?${params}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.data) ? data.data : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const apiKey = process.env.SGO_API_KEY ?? "";

  const results = await Promise.all(
    ALL_LEAGUES.map((id) => fetchLeagueLive(id, apiKey))
  );

  // Flatten + deduplicate by eventID
  const seen = new Set<string>();
  const events: unknown[] = [];
  for (const batch of results) {
    for (const e of batch) {
      const ev = e as { eventID?: string; status?: { live?: boolean } };
      if (!ev.eventID || seen.has(ev.eventID)) continue;
      if (!ev.status?.live) continue;   // only truly live
      seen.add(ev.eventID);
      events.push(e);
    }
  }

  return NextResponse.json({ events });
}
