"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { SportSlug } from "@/lib/api";
import type { BettingMatch, BettingFilter } from "@/lib/betting-types";
import { DEFAULT_BETTING_FILTER } from "@/lib/betting-types";
import { applyBettingFilter, sortMatches } from "@/lib/betting-adapters";
import { LiveNowStrip } from "@/components/betting/LiveNowStrip";
import { StickyFilterBar } from "@/components/betting/StickyFilterBar";
import { MatchList } from "@/components/betting/MatchList";
import { QueueRail } from "@/components/betting/QueueRail";
import { MobileQueueDrawer } from "@/components/betting/MobileQueueDrawer";
import { cn } from "@/lib/utils";
import { SPORT_LEAGUES, fetchSGOEvents, sgoEventToMatch } from "@/lib/sgo";

const SPORT_BAR: { slug: SportSlug; label: string; icon: string }[] = [
  { slug: "soccer",     label: "Soccer",     icon: "⚽" },
  { slug: "tennis",     label: "Tennis",     icon: "🎾" },
  { slug: "basketball", label: "Basketball", icon: "🏀" },
  { slug: "baseball",   label: "Baseball",   icon: "⚾" },
  { slug: "hockey",     label: "Hockey",     icon: "🏒" },
  { slug: "esports",    label: "Esports",    icon: "🎮" },
];

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

interface Props {
  sport: SportSlug;
}

export function SportMatchesView({ sport }: Props) {
  const [filter, setFilter] = useState<BettingFilter>(DEFAULT_BETTING_FILTER);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [matches, setMatches] = useState<BettingMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setMatches([]);
    const leagues = SPORT_LEAGUES[sport] ?? [];
    if (!leagues.length) { setLoading(false); return; }

    Promise.all([
      Promise.all(leagues.map((l) => fetchSGOEvents(l))).then((results) =>
        results.flat().map((e) => sgoEventToMatch(e, sport))
      ),
      fetchBackendPredictions(sport),
    ]).then(([sgoMatches, backendItems]) => {
      setMatches(mergeBackendData(sgoMatches, backendItems));
      setLoading(false);
    });
  }, [sport]);

  const filtered = sortMatches(applyBettingFilter(matches, filter));

  const nextUpcoming = (() => {
    const up = [...matches]
      .filter((m) => m.status === "upcoming")
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];
    if (!up) return null;
    const diff = Math.round((new Date(up.startTime).getTime() - Date.now()) / 60_000);
    if (diff < 0 || diff > 480) return null;
    return { label: `${up.home.shortName} vs ${up.away.shortName}`, minutesAway: diff };
  })();

  const handleTileClick = useCallback((matchId: string) => {
    setHighlightedId(matchId);
    setFilter((f) => ({ ...f, status: "all" }));
    setTimeout(() => {
      document.getElementById(`match-${matchId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setHighlightedId(null), 2000);
    }, 100);
  }, []);

  const handleShowTopPicks  = useCallback(() => setFilter({ ...DEFAULT_BETTING_FILTER, confidence: "55" }), []);
  const handleShowLive      = useCallback(() => setFilter({ ...DEFAULT_BETTING_FILTER, status: "live" }), []);
  const handleShowResults   = useCallback(() => setFilter({ ...DEFAULT_BETTING_FILTER, status: "finished" }), []);

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - var(--topbar-height))" }}>

      {/* Sport nav */}
      <div className="px-4 pt-4 lg:px-6">
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex min-w-max items-center gap-2 rounded-[24px] border border-white/8 bg-white/[0.03] p-2">
            {SPORT_BAR.map((s) => (
              <Link
                key={s.slug}
                href={`/sports/${s.slug}/matches`}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-all",
                  s.slug === sport
                    ? "bg-[#2edb6c] text-[#07110d] shadow-sm"
                    : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <LiveNowStrip matches={matches} onTileClick={handleTileClick} nextUpcoming={nextUpcoming} />

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <StickyFilterBar
            filter={filter}
            onChange={setFilter}
            totalShown={filtered.length}
            onShowTopPicks={handleShowTopPicks}
          />
          <div className="p-4 lg:p-6">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-white/40">Loading matches…</div>
            ) : (
              <MatchList
                matches={filtered}
                allMatches={matches}
                sport={sport}
                activeFilter={filter.status}
                highlightedId={highlightedId}
                onClearFilters={() => setFilter(DEFAULT_BETTING_FILTER)}
                onShowTopPicks={handleShowTopPicks}
                onShowLive={handleShowLive}
                onShowResults={handleShowResults}
              />
            )}
          </div>
        </div>
        <QueueRail matches={matches} />
      </div>

      <MobileQueueDrawer open={mobileQueueOpen} onClose={() => setMobileQueueOpen(false)} matches={matches} />
    </div>
  );
}
