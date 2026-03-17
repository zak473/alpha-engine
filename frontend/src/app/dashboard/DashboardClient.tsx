"use client";

import { useEffect, useState } from "react";
import { BettingDashboard } from "@/components/betting/BettingDashboard";
import type { SportSlug } from "@/lib/api";
import type { BettingMatch } from "@/lib/betting-types";
import { SPORT_LEAGUES, fetchSGOEvents, sgoEventToMatch } from "@/lib/sgo";

const SPORTS: SportSlug[] = ["soccer", "basketball", "tennis", "esports", "baseball", "hockey"];

// ── Helpers (mirrors SportMatchesView pattern) ────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|cf|ac|as|sc|cd|afc|rsc|fk|sk|bk|hc|hv)\b/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamsMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.length > 3 && nb.includes(na)) return true;
  if (nb.length > 3 && na.includes(nb)) return true;
  return false;
}

interface BackendListItem {
  home_name: string;
  away_name: string;
  p_home: number | null;
  p_away: number | null;
  p_draw?: number | null;
  confidence: number | null;
  kickoff_utc: string;
}

async function fetchBackendPredictions(sport: SportSlug): Promise<BackendListItem[]> {
  try {
    const now = new Date();
    const dateFrom = new Date(now.getTime() - 3 * 3600_000).toISOString();
    const dateTo = new Date(now.getTime() + 7 * 24 * 3600_000).toISOString();
    const res = await fetch(
      `/api/v1/sports/${sport}/matches?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&limit=200`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

function mergeBackendData(matches: BettingMatch[], backendItems: BackendListItem[]): BettingMatch[] {
  if (!backendItems.length) return matches;
  return matches.map((m) => {
    const found = backendItems.find(
      (b) =>
        teamsMatch(m.home.name, b.home_name) &&
        teamsMatch(m.away.name, b.away_name) &&
        Math.abs(new Date(m.startTime).getTime() - new Date(b.kickoff_utc).getTime()) < 6 * 3600_000
    );
    if (!found) return m;
    return {
      ...m,
      pHome: found.p_home ?? undefined,
      pAway: found.p_away ?? undefined,
      pDraw: found.p_draw ?? undefined,
      modelConfidence: found.confidence != null ? found.confidence / 100 : undefined,
    };
  });
}

async function fetchSportMatches(sport: SportSlug): Promise<BettingMatch[]> {
  const leagues = SPORT_LEAGUES[sport] ?? [];
  if (!leagues.length) return [];
  const [sgoMatches, backendItems] = await Promise.all([
    Promise.all(leagues.map((l) => fetchSGOEvents(l))).then((results) =>
      results.flat().map((e) => sgoEventToMatch(e, sport))
    ),
    fetchBackendPredictions(sport),
  ]);
  return mergeBackendData(sgoMatches, backendItems);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DashboardClient() {
  const [matches, setMatches] = useState<BettingMatch[]>([]);

  useEffect(() => {
    Promise.allSettled(SPORTS.map(fetchSportMatches)).then((results) => {
      const all = results
        .filter((r): r is PromiseFulfilledResult<BettingMatch[]> => r.status === "fulfilled")
        .flatMap((r) => r.value)
        .sort((a, b) => {
          if (a.status === "live" && b.status !== "live") return -1;
          if (b.status === "live" && a.status !== "live") return 1;
          const edgeDiff = (b.edgePercent ?? 0) - (a.edgePercent ?? 0);
          if (Math.abs(edgeDiff) > 0.5) return edgeDiff;
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });
      setMatches(all);
    });
  }, []);

  return <BettingDashboard matches={matches} />;
}
