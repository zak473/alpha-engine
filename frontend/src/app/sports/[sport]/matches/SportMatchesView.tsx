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

    Promise.all(leagues.map((l) => fetchSGOEvents(l))).then((results) => {
      const all = results.flat().map((e) => sgoEventToMatch(e, sport));
      setMatches(all);
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
