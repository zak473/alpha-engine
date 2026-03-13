"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { SportMatchListItem } from "@/lib/types";
import type { SportSlug } from "@/lib/api";
import { getLiveMatches } from "@/lib/api";
import type { BettingMatch, BettingFilter } from "@/lib/betting-types";
import { DEFAULT_BETTING_FILTER } from "@/lib/betting-types";
import { adaptToMatchCard, applyBettingFilter, sortMatches } from "@/lib/betting-adapters";
import { LiveNowStrip } from "@/components/betting/LiveNowStrip";
import { StickyFilterBar } from "@/components/betting/StickyFilterBar";
import { MatchList } from "@/components/betting/MatchList";
import { QueueRail } from "@/components/betting/QueueRail";
import { MobileQueueDrawer } from "@/components/betting/MobileQueueDrawer";
import { useLiveMatches } from "@/hooks/useLiveMatches";
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

export function SportMatchesView({ sport, matches, total }: SportMatchesViewProps) {
  const [filter, setFilter] = useState<BettingFilter>(DEFAULT_BETTING_FILTER);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});

  // Fetch live counts for all sports once on mount
  useEffect(() => {
    getLiveMatches().then((all) => {
      const counts: Record<string, number> = {};
      for (const m of all) {
        if (m.is_live) counts[m.sport] = (counts[m.sport] ?? 0) + 1;
      }
      setLiveCounts(counts);
    }).catch(() => {});
  }, []);

  // Poll full match list every 30s — initialise with SSR snapshot (no flash)
  const liveItems = useLiveMatches(sport, matches);

  // Adapt to betting model
  const mergedMatches: BettingMatch[] = liveItems.map((m) => adaptToMatchCard(m, sport));

  // Apply filter + sort
  const filtered = sortMatches(applyBettingFilter(mergedMatches, filter));

  // Build next upcoming for the live strip
  const nextUpcoming = (() => {
    const up = [...mergedMatches]
      .filter((m) => m.status === "upcoming")
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];
    if (!up) return null;
    const diff = Math.round((new Date(up.startTime).getTime() - Date.now()) / 60_000);
    if (diff < 0 || diff > 480) return null;
    return { label: `${up.home.shortName} vs ${up.away.shortName}`, minutesAway: diff };
  })();

  // Scroll to match card when live tile is clicked
  const handleTileClick = useCallback((matchId: string) => {
    setHighlightedId(matchId);
    // Ensure the live/all filter doesn't hide it
    setFilter((f) => ({ ...f, status: "all" }));
    setTimeout(() => {
      const el = document.getElementById(`match-${matchId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setHighlightedId(null), 2000);
    }, 100);
  }, []);

  // "Show top picks" — reset filter + sort by edge
  const handleShowTopPicks = useCallback(() => {
    setFilter({ ...DEFAULT_BETTING_FILTER, confidence: "55" });
  }, []);

  // "Explore live" — filter to live only
  const handleShowLive = useCallback(() => {
    setFilter({ ...DEFAULT_BETTING_FILTER, status: "live" });
  }, []);

  // "Show results" — switch to finished filter
  const handleShowResults = useCallback(() => {
    setFilter({ ...DEFAULT_BETTING_FILTER, status: "finished" });
  }, []);

  // Count scheduled matches per the full unfiltered set
  const scheduledCount = mergedMatches.filter((m) => m.status === "upcoming").length;

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - var(--topbar-height))" }}>
      {/* Sport navigation bar */}
      <div className="px-4 pt-4 lg:px-6">
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex min-w-max items-center gap-2 rounded-[24px] border border-[#27272a] bg-[#18181b] p-2">
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

      {/* Live strip — full width */}
      <LiveNowStrip
        matches={mergedMatches}
        onTileClick={handleTileClick}
        nextUpcoming={nextUpcoming}
      />

      {/* Content row: main + right rail */}
      <div className="flex flex-1 min-h-0">
        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Sticky filter bar */}
          <StickyFilterBar
            filter={filter}
            onChange={setFilter}
            totalShown={filtered.length}
            onShowTopPicks={handleShowTopPicks}
          />

          {/* Cards */}
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

        {/* Right rail — desktop only */}
        <QueueRail matches={mergedMatches} />
      </div>

      {/* Mobile queue drawer */}
      <MobileQueueDrawer open={mobileQueueOpen} onClose={() => setMobileQueueOpen(false)} matches={mergedMatches} />
    </div>
  );
}
