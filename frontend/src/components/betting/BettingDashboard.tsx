"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { StickyFilterBar } from "./StickyFilterBar";
import { MatchList } from "./MatchList";
import { QueueRail } from "./QueueRail";
import { DashboardShowcase } from "./DashboardShowcase";
import { MobileQueueDrawer } from "./MobileQueueDrawer";
import { BettingHero } from "./BettingHero";
import type { BettingMatch, BettingFilter, SportSlug } from "@/lib/betting-types";
import { DEFAULT_BETTING_FILTER, SPORT_CONFIG } from "@/lib/betting-types";
import { applyBettingFilter, sortMatches } from "@/lib/betting-adapters";

interface BettingDashboardProps {
  matches: BettingMatch[];
  sport?: SportSlug;
}

export function BettingDashboard({ matches, sport }: BettingDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeSport, setActiveSport] = useState<SportSlug | "all">(sport ?? "all");
  const [filter, setFilter] = useState<BettingFilter>(DEFAULT_BETTING_FILTER);
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const sportFiltered = useMemo(() => {
    if (activeSport === "all") return matches;
    return matches.filter((m) => m.sport === activeSport);
  }, [matches, activeSport]);

  const filtered = useMemo(() => {
    return sortMatches(applyBettingFilter(sportFiltered, filter));
  }, [sportFiltered, filter]);

  const liveMatches = useMemo(() => {
    const live = matches.filter((m) => m.status === "live");
    if (activeSport === "all") return live;
    return live.filter((m) => m.sport === activeSport);
  }, [matches, activeSport]);

  const nextUpcoming = useMemo(() => {
    const upcoming = matches
      .filter((m) => m.status === "upcoming")
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    if (upcoming.length === 0) return null;
    const next = upcoming[0];
    const mins = Math.max(0, Math.round((new Date(next.startTime).getTime() - Date.now()) / 60000));
    return { label: `${next.home.shortName} vs ${next.away.shortName}`, minutesAway: mins };
  }, [matches]);

  const handleSportSelect = useCallback((s: SportSlug | "all") => {
    setActiveSport(s);
    const params = new URLSearchParams(searchParams.toString());
    if (s === "all") params.delete("sport");
    else params.set("sport", s);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const handleTileClick = useCallback((matchId: string) => {
    setHighlightedId(matchId);
    setTimeout(() => {
      const el = document.getElementById(`match-${matchId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    setTimeout(() => setHighlightedId(null), 2500);
  }, []);

  const handleClearFilters = useCallback(() => setFilter(DEFAULT_BETTING_FILTER), []);
  const handleShowTopPicks = useCallback(() => setFilter({ ...DEFAULT_BETTING_FILTER, edge: "3" }), []);
  const handleShowLive = useCallback(() => setFilter({ ...filter, status: "live" }), [filter]);
  const handleShowResults = useCallback(() => setFilter({ ...filter, status: "finished" }), [filter]);
  const handleDashboardMode = useCallback((mode: "all" | "inplay") => {
    if (mode === "all") {
      setFilter((prev) => ({ ...prev, status: "all" }));
      return;
    }
    setFilter((prev) => ({ ...prev, status: "live" }));
  }, []);

  useEffect(() => {
    const urlSport = searchParams.get("sport") as SportSlug | null;
    if (urlSport && Object.keys(SPORT_CONFIG).includes(urlSport)) setActiveSport(urlSport);
  }, [searchParams]);

  const displaySport: SportSlug = activeSport === "all" ? "soccer" : activeSport;
  const activeSportLabel = activeSport === "all" ? "All sports" : SPORT_CONFIG[activeSport].label;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,#f7faf6_0%,#f3f7f2_100%)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          <BettingHero matches={sportFiltered} filteredCount={filtered.length} activeSportLabel={activeSportLabel} />

          {!sport && (
            <div className="px-4 pb-3 lg:px-6">
              <DashboardShowcase
                matches={sportFiltered}
                activeSport={activeSport}
                filter={filter}
                onSelectSport={(sport) => handleSportSelect(sport)}
                onSetInPlay={() => handleDashboardMode("inplay")}
              />
            </div>
          )}

          <div className="px-4 lg:px-6">
            <StickyFilterBar
              filter={filter}
              onChange={setFilter}
              totalShown={filtered.length}
              onShowTopPicks={handleShowTopPicks}
              onShowQueueRail={() => setMobileQueueOpen(true)}
            />
          </div>

          <div className="px-4 py-4 lg:px-6 lg:py-5">
            <MatchList
              matches={filtered}
              allMatches={sportFiltered}
              sport={displaySport}
              activeFilter={filter.status}
              highlightedId={highlightedId}
              onClearFilters={handleClearFilters}
              onShowTopPicks={handleShowTopPicks}
              onShowLive={handleShowLive}
              onShowResults={handleShowResults}
            />
          </div>
        </div>
      </div>

      <QueueRail matches={matches} />
      <MobileQueueDrawer open={mobileQueueOpen} onClose={() => setMobileQueueOpen(false)} matches={matches} />
    </div>
  );
}
