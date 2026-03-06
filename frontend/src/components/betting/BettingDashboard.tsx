"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { LiveNowStrip } from "./LiveNowStrip";
import { StickyFilterBar } from "./StickyFilterBar";
import { MatchList } from "./MatchList";
import { QueueRail } from "./QueueRail";
import { MobileQueueDrawer } from "./MobileQueueDrawer";
import type { BettingMatch, BettingFilter, SportSlug } from "@/lib/betting-types";
import { DEFAULT_BETTING_FILTER, SPORT_CONFIG } from "@/lib/betting-types";
import { applyBettingFilter, sortMatches } from "@/lib/betting-adapters";
import { useBetting } from "./BettingContext";
import { cn } from "@/lib/utils";

// ── Sport filter chips ─────────────────────────────────────────────────────

function SportChips({ 
  activeSport, 
  onSelect, 
  counts 
}: { 
  activeSport: SportSlug | "all"; 
  onSelect: (s: SportSlug | "all") => void;
  counts: Record<SportSlug | "all", number>;
}) {
  const sports: (SportSlug | "all")[] = ["all", "soccer", "basketball", "tennis", "esports", "baseball"];

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      {sports.map((s) => {
        const active = s === activeSport;
        const cfg = s === "all" ? null : SPORT_CONFIG[s];
        const count = counts[s];
        
        return (
          <button
            key={s}
            onClick={() => onSelect(s)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
              active
                ? "border text-[var(--accent)]"
                : "text-text-muted hover:text-text-primary hover:bg-white/[0.05]"
            )}
            style={active ? {
              background: "var(--accent-dim)",
              borderColor: "rgba(34,211,238,0.3)",
            } : { border: "1px solid transparent" }}
          >
            {cfg && (
              <span 
                className="w-2 h-2 rounded-full flex-shrink-0" 
                style={{ background: cfg.color }} 
              />
            )}
            <span>{s === "all" ? "All Sports" : cfg?.label}</span>
            {count > 0 && (
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                active ? "bg-white/10" : "bg-white/[0.06]"
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────────────

interface BettingDashboardProps {
  matches: BettingMatch[];
  sport?: SportSlug;
}

export function BettingDashboard({ matches, sport }: BettingDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { queue } = useBetting();

  // ── State ─────────────────────────────────────────────────────────────────
  const [activeSport, setActiveSport] = useState<SportSlug | "all">(sport ?? "all");
  const [filter, setFilter] = useState<BettingFilter>(DEFAULT_BETTING_FILTER);
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Filtered + sorted matches ─────────────────────────────────────────────
  const sportFiltered = useMemo(() => {
    if (activeSport === "all") return matches;
    return matches.filter((m) => m.sport === activeSport);
  }, [matches, activeSport]);

  const filtered = useMemo(() => {
    return sortMatches(applyBettingFilter(sportFiltered, filter));
  }, [sportFiltered, filter]);

  // Count by sport (only active matches for tabs)
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

  // Live matches for the strip
  const liveMatches = useMemo(() => {
    const live = matches.filter((m) => m.status === "live");
    if (activeSport === "all") return live;
    return live.filter((m) => m.sport === activeSport);
  }, [matches, activeSport]);

  // Next upcoming (for empty live strip)
  const nextUpcoming = useMemo(() => {
    const upcoming = matches
      .filter((m) => m.status === "upcoming")
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    if (upcoming.length === 0) return null;
    const next = upcoming[0];
    const mins = Math.max(0, Math.round((new Date(next.startTime).getTime() - Date.now()) / 60000));
    return { label: `${next.home.shortName} vs ${next.away.shortName}`, minutesAway: mins };
  }, [matches]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSportSelect = useCallback((s: SportSlug | "all") => {
    setActiveSport(s);
    // Optionally update URL
    const params = new URLSearchParams(searchParams.toString());
    if (s === "all") {
      params.delete("sport");
    } else {
      params.set("sport", s);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const handleTileClick = useCallback((matchId: string) => {
    setHighlightedId(matchId);
    // Scroll to the match card
    setTimeout(() => {
      const el = document.getElementById(`match-${matchId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
    // Clear highlight after animation
    setTimeout(() => setHighlightedId(null), 2500);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilter(DEFAULT_BETTING_FILTER);
  }, []);

  const handleShowTopPicks = useCallback(() => {
    setFilter({ ...DEFAULT_BETTING_FILTER, edge: "3" });
  }, []);

  const handleShowLive = useCallback(() => {
    setFilter({ ...filter, status: "live" });
  }, [filter]);

  const handleShowResults = useCallback(() => {
    setFilter({ ...filter, status: "finished" });
  }, [filter]);

  // Sync from URL on mount
  useEffect(() => {
    const urlSport = searchParams.get("sport") as SportSlug | null;
    if (urlSport && Object.keys(SPORT_CONFIG).includes(urlSport)) {
      setActiveSport(urlSport);
    }
  }, [searchParams]);

  // ── Derived sport for MatchList ───────────────────────────────────────────
  const displaySport: SportSlug = activeSport === "all" ? "soccer" : activeSport;

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {/* ── Main content area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Live Now Strip */}
        <LiveNowStrip 
          matches={liveMatches}
          onTileClick={handleTileClick}
          nextUpcoming={nextUpcoming}
        />

        {/* Sport filter chips */}
        {!sport && (
          <div className="border-b flex-shrink-0" style={{ borderColor: "var(--border0)" }}>
            <SportChips 
              activeSport={activeSport} 
              onSelect={handleSportSelect}
              counts={sportCounts}
            />
          </div>
        )}

        {/* Sticky filter bar */}
        <StickyFilterBar
          filter={filter}
          onChange={setFilter}
          totalShown={filtered.length}
          onShowTopPicks={handleShowTopPicks}
          onShowQueueRail={() => setMobileQueueOpen(true)}
        />

        {/* Match list */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-4"
        >
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

      {/* ── Right rail: Queue ──────────────────────────────────────────────── */}
      <QueueRail matches={matches} />

      {/* ── Mobile queue drawer ────────────────────────────────────────────── */}
      <MobileQueueDrawer 
        open={mobileQueueOpen}
        onClose={() => setMobileQueueOpen(false)}
        matches={matches}
      />
    </div>
  );
}
