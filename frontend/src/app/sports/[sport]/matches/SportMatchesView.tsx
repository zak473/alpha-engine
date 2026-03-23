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
import { useBetting } from "@/components/betting/BettingContext";
import { cn } from "@/lib/utils";
import { SkeletonCard } from "@/components/ui/Skeleton";
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
  id?: string;
  home_id?: string;
  away_id?: string;
  home_name: string;
  away_name: string;
  league?: string;
  status?: string;
  p_home: number | null;
  p_away: number | null;
  p_draw?: number | null;
  confidence: number | null;
  kickoff_utc: string;
  home_score?: number | null;
  away_score?: number | null;
}

async function fetchBackendPredictions(sport: SportSlug): Promise<BackendListItem[]> {
  try {
    const now = new Date();
    const dateFrom = new Date(now.getTime() - 3 * 3600_000).toISOString();
    const dateTo = new Date(now.getTime() + 7 * 24 * 3600_000).toISOString();
    const token = typeof window !== "undefined" ? localStorage.getItem("alpha_engine_token") : null;
    const res = await fetch(
      `/api/v1/sports/${sport}/matches?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&limit=200`,
      { cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

function backendItemToMatch(item: BackendListItem, sport: SportSlug): BettingMatch {
  const id = item.id ?? `backend-${item.home_name}-${item.away_name}`;
  const status: BettingMatch["status"] =
    item.status === "live" ? "live" :
    item.status === "finished" ? "finished" : "upcoming";
  return {
    id,
    sport,
    league: item.league ?? sport.toUpperCase(),
    startTime: item.kickoff_utc,
    status,
    homeScore: item.home_score ?? undefined,
    awayScore: item.away_score ?? undefined,
    home: { id: item.home_id ?? id + "-home", name: item.home_name, shortName: item.home_name.slice(0, 10) },
    away: { id: item.away_id ?? id + "-away", name: item.away_name, shortName: item.away_name.slice(0, 10) },
    featuredMarkets: [],
    allMarkets: [],
    pHome: item.p_home ?? undefined,
    pAway: item.p_away ?? undefined,
    pDraw: item.p_draw ?? undefined,
    modelConfidence: item.confidence != null ? item.confidence / 100 : undefined,
  };
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
  const { queue } = useBetting();
  const [filter, setFilter] = useState<BettingFilter>(DEFAULT_BETTING_FILTER);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [matches, setMatches] = useState<BettingMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setMatches([]);
    const leagues = SPORT_LEAGUES[sport] ?? [];

    // Sports with no SGO leagues (e.g. esports) — show backend matches directly
    if (!leagues.length) {
      fetchBackendPredictions(sport).then((backendItems) => {
        setMatches(backendItems.map((item) => backendItemToMatch(item, sport)));
        setLoading(false);
      });
      return;
    }

    Promise.all([
      Promise.all(leagues.map((l) => fetchSGOEvents(l))).then((results) =>
        results.flat().map((e) => sgoEventToMatch(e, sport))
      ),
      fetchBackendPredictions(sport),
    ]).then(async ([sgoMatches, backendItems]) => {
      const merged = mergeBackendData(sgoMatches, backendItems);
      setMatches(merged);
      setLoading(false);

      // Second pass: call preview endpoint for matches still missing probabilities
      const token = typeof window !== "undefined" ? localStorage.getItem("alpha_engine_token") : null;
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const unmatched = merged.filter((m) => m.pHome == null && m.status !== "finished");
      if (!unmatched.length) return;
      const previews = await Promise.all(
        unmatched.map(async (m) => {
          try {
            const res = await fetch(
              `/api/v1/sports/${sport}/matches/preview?home=${encodeURIComponent(m.home.name)}&away=${encodeURIComponent(m.away.name)}`,
              { cache: "no-store", headers: authHeaders }
            );
            if (!res.ok) return null;
            const d = await res.json();
            if (!d.probabilities) return null;
            return { id: m.id, pHome: d.probabilities.home_win ?? null, pAway: d.probabilities.away_win ?? null, pDraw: d.probabilities.draw ?? null };
          } catch { return null; }
        })
      );
      setMatches((prev) =>
        prev.map((m) => {
          if (m.pHome != null) return m;
          const idx = unmatched.findIndex((u) => u.id === m.id);
          const p = idx >= 0 ? previews[idx] : null;
          if (!p) return m;
          return { ...m, pHome: p.pHome ?? undefined, pAway: p.pAway ?? undefined, pDraw: p.pDraw ?? undefined };
        })
      );
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
            onShowQueueRail={() => setMobileQueueOpen(true)}
          />
          <div className="p-4 lg:p-6">
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
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

      {/* Mobile floating slip button */}
      {queue.length > 0 && !mobileQueueOpen && (
        <button
          onClick={() => setMobileQueueOpen(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 lg:hidden flex items-center gap-2.5 px-5 py-3 rounded-full text-sm font-bold shadow-xl transition-all"
          style={{ background: "#22e283", color: "#07110d" }}
        >
          <span className="flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-black" style={{ background: "rgba(0,0,0,0.18)" }}>
            {queue.length}
          </span>
          View Slip
        </button>
      )}
    </div>
  );
}
