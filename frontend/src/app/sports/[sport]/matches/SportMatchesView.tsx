"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { SportMatchListItem } from "@/lib/types";
import type { SportSlug } from "@/lib/api";
import { getLiveMatches } from "@/lib/api";
import type { BettingMatch, BettingFilter } from "@/lib/betting-types";
import { DEFAULT_BETTING_FILTER } from "@/lib/betting-types";
import { applyBettingFilter, sortMatches } from "@/lib/betting-adapters";
import { LiveNowStrip } from "@/components/betting/LiveNowStrip";
import { StickyFilterBar } from "@/components/betting/StickyFilterBar";
import { MatchList } from "@/components/betting/MatchList";
import { QueueRail } from "@/components/betting/QueueRail";
import { MobileQueueDrawer } from "@/components/betting/MobileQueueDrawer";
import { cn } from "@/lib/utils";

const SPORT_BAR: { slug: SportSlug; label: string; icon: string }[] = [
  { slug: "soccer",     label: "Soccer",     icon: "⚽" },
  { slug: "tennis",     label: "Tennis",     icon: "🎾" },
  { slug: "basketball", label: "Basketball", icon: "🏀" },
  { slug: "baseball",   label: "Baseball",   icon: "⚾" },
  { slug: "hockey",     label: "Hockey",     icon: "🏒" },
  { slug: "esports",    label: "Esports",    icon: "🎮" },
];

interface SportMatchesViewProps {
  sport: SportSlug;
  matches: SportMatchListItem[];
  total: number;
}

export function SportMatchesView({ sport, matches }: SportMatchesViewProps) {
  const [filter, setFilter] = useState<BettingFilter>(DEFAULT_BETTING_FILTER);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    getLiveMatches().then((all) => {
      const counts: Record<string, number> = {};
      for (const m of all) {
        if (m.is_live) counts[m.sport] = (counts[m.sport] ?? 0) + 1;
      }
      setLiveCounts(counts);
    }).catch(() => {});
  }, []);

  // Clean slate — no data sources connected yet
  const mergedMatches: BettingMatch[] = [];

  const filtered = sortMatches(applyBettingFilter(mergedMatches, filter));

  const nextUpcoming = (() => {
    const up = [...mergedMatches]
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
      const el = document.getElementById(`match-${matchId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setHighlightedId(null), 2000);
    }, 100);
  }, []);

  const handleShowTopPicks = useCallback(() => {
    setFilter({ ...DEFAULT_BETTING_FILTER, confidence: "55" });
  }, []);

  const handleShowLive = useCallback(() => {
    setFilter({ ...DEFAULT_BETTING_FILTER, status: "live" });
  }, []);

  const handleShowResults = useCallback(() => {
    setFilter({ ...DEFAULT_BETTING_FILTER, status: "finished" });
  }, []);

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - var(--topbar-height))" }}>
      <div className="px-4 pt-4 lg:px-6">
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex min-w-max items-center gap-2 rounded-[24px] border border-white/8 bg-white/[0.03] p-2">
            {SPORT_BAR.map((s) => {
              const isActive = s.slug === sport;
              const liveCount = liveCounts[s.slug] ?? 0;
              return (
                <Link
                  key={s.slug}
                  href={`/sports/${s.slug}/matches`}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-all",
                    isActive
                      ? "bg-[#2edb6c] text-[#07110d] shadow-sm"
                      : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                  {liveCount > 0 && (
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                      isActive
                        ? "bg-[#07110d]/20 text-[#07110d]"
                        : "bg-[#2edb6c]/15 text-[#2edb6c]"
                    )}>
                      {liveCount} live
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <LiveNowStrip matches={mergedMatches} onTileClick={handleTileClick} nextUpcoming={nextUpcoming} />

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <StickyFilterBar
            filter={filter}
            onChange={setFilter}
            totalShown={filtered.length}
            onShowTopPicks={handleShowTopPicks}
          />
          <div className="p-4 lg:p-6">
            <MatchList
              matches={filtered}
              allMatches={mergedMatches}
              sport={sport}
              activeFilter={filter.status}
              highlightedId={highlightedId}
              onClearFilters={() => setFilter(DEFAULT_BETTING_FILTER)}
              onShowTopPicks={handleShowTopPicks}
              onShowLive={handleShowLive}
              onShowResults={handleShowResults}
            />
          </div>
        </div>
        <QueueRail matches={mergedMatches} />
      </div>

      <MobileQueueDrawer open={mobileQueueOpen} onClose={() => setMobileQueueOpen(false)} matches={mergedMatches} />
    </div>
  );
}
