"use client";

import { useState, useCallback } from "react";
import type { SportMatchListItem } from "@/lib/types";
import type { SportSlug } from "@/lib/api";
import type { BettingMatch, BettingFilter } from "@/lib/betting-types";
import { DEFAULT_BETTING_FILTER } from "@/lib/betting-types";
import { adaptToMatchCard, applyBettingFilter, sortMatches } from "@/lib/betting-adapters";
import { LiveNowStrip } from "@/components/betting/LiveNowStrip";
import { StickyFilterBar } from "@/components/betting/StickyFilterBar";
import { MatchList } from "@/components/betting/MatchList";
import { QueueRail } from "@/components/betting/QueueRail";
import { MobileQueueDrawer } from "@/components/betting/MobileQueueDrawer";
import { useLiveMatches } from "@/hooks/useLiveMatches";

interface SportMatchesViewProps {
  sport: SportSlug;
  matches: SportMatchListItem[];
  total: number;
}

export function SportMatchesView({ sport, matches, total }: SportMatchesViewProps) {
  const [filter, setFilter] = useState<BettingFilter>(DEFAULT_BETTING_FILTER);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);

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

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - var(--topbar-height))" }}>
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
