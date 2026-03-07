"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { StickyFilterBar } from "./StickyFilterBar";
import { MatchList } from "./MatchList";
import { QueueRail } from "./QueueRail";
import { MobileQueueDrawer } from "./MobileQueueDrawer";
import { BettingHero } from "./BettingHero";
import type { BettingMatch, BettingFilter, SportSlug } from "@/lib/betting-types";
import { DEFAULT_BETTING_FILTER, SPORT_CONFIG } from "@/lib/betting-types";
import { applyBettingFilter, sortMatches } from "@/lib/betting-adapters";
import { useBetting } from "./BettingContext";
import { cn } from "@/lib/utils";

function SportChips({
  activeSport,
  onSelect,
  counts,
}: {
  activeSport: SportSlug | "all";
  onSelect: (s: SportSlug | "all") => void;
  counts: Record<SportSlug | "all", number>;
}) {
  const sports: (SportSlug | "all")[] = ["all", "soccer", "basketball", "tennis", "esports", "baseball"];

  return (
    <div className="flex items-center gap-2 overflow-x-auto px-4 py-3 lg:px-6" style={{ scrollbarWidth: "none" }}>
      {sports.map((s) => {
        const active = s === activeSport;
        const cfg = s === "all" ? null : SPORT_CONFIG[s];
        const count = counts[s];

        return (
          <button
            key={s}
            onClick={() => onSelect(s)}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-medium transition-all",
              active ? "shadow-[0_8px_20px_rgba(23,148,71,0.10)]" : "text-text-muted hover:text-text-primary"
            )}
            style={active ? {
              background: "rgba(48,224,106,0.10)",
              borderColor: "rgba(48,224,106,0.22)",
              color: "#14532d",
            } : {
              background: "var(--bg1)",
              borderColor: "var(--border0)",
            }}
          >
            {cfg && <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />}
            <span>{s === "all" ? "All Sports" : cfg?.label}</span>
            {count > 0 && (
              <span className="rounded-full bg-[rgba(23,148,71,0.08)] px-1.5 py-0.5 text-[10px] font-bold">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface BettingDashboardProps {
  matches: BettingMatch[];
  sport?: SportSlug;
}

export function BettingDashboard({ matches, sport }: BettingDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { queue } = useBetting();

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

  const sportCounts = useMemo(() => {
    const active = matches.filter((m) => m.status !== "finished" && m.status !== "cancelled");
    return {
      all: active.length,
      soccer: active.filter((m) => m.sport === "soccer").length,
      basketball: active.filter((m) => m.sport === "basketball").length,
      tennis: active.filter((m) => m.sport === "tennis").length,
      esports: active.filter((m) => m.sport === "esports").length,
      baseball: active.filter((m) => m.sport === "baseball").length,
    };
  }, [matches]);

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

  useEffect(() => {
    const urlSport = searchParams.get("sport") as SportSlug | null;
    if (urlSport && Object.keys(SPORT_CONFIG).includes(urlSport)) setActiveSport(urlSport);
  }, [searchParams]);

  const displaySport: SportSlug = activeSport === "all" ? "soccer" : activeSport;
  const activeSportLabel = activeSport === "all" ? "All sports" : SPORT_CONFIG[activeSport].label;

  return (
    <div className="flex flex-1 overflow-hidden min-h-0 bg-[radial-gradient(circle_at_top,rgba(48,224,106,0.08),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.55),transparent_45%)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          <BettingHero matches={sportFiltered} filteredCount={filtered.length} activeSportLabel={activeSportLabel} />

          {!sport && <SportChips activeSport={activeSport} onSelect={handleSportSelect} counts={sportCounts} />}

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
