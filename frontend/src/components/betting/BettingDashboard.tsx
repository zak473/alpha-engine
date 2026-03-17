"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { StickyFilterBar } from "./StickyFilterBar";
import { MatchList } from "./MatchList";
import { BettingHero } from "./BettingHero";
import type { BettingMatch, BettingFilter, SportSlug } from "@/lib/betting-types";
import { DEFAULT_BETTING_FILTER, SPORT_CONFIG } from "@/lib/betting-types";
import { applyBettingFilter, sortMatches } from "@/lib/betting-adapters";
import { Activity, X, Zap } from "lucide-react";
import { InPlayModule } from "@/components/dashboard/InPlayModule";
import { cn } from "@/lib/utils";

const SPORT_ENTRIES = ["all", "soccer", "tennis", "esports", "basketball", "baseball", "hockey"] as const;
type SportEntry = (typeof SPORT_ENTRIES)[number];

export function BettingDashboard({ matches, sport }: { matches: BettingMatch[]; sport?: SportSlug }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeSport, setActiveSport] = useState<SportSlug | "all">(sport ?? "all");
  const [filter, setFilter] = useState<BettingFilter>(DEFAULT_BETTING_FILTER);
  const highlightedId: string | null = null;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const sportFiltered = useMemo(
    () => (activeSport === "all" ? matches : matches.filter((m) => m.sport === activeSport)),
    [matches, activeSport]
  );
  const filtered = useMemo(
    () => sortMatches(applyBettingFilter(sportFiltered, filter)),
    [sportFiltered, filter]
  );

  const handleSportSelect = useCallback(
    (s: SportEntry) => {
      setActiveSport(s);
      const params = new URLSearchParams(searchParams.toString());
      if (s === "all") params.delete("sport");
      else params.set("sport", s);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const handleClearFilters = useCallback(() => setFilter(DEFAULT_BETTING_FILTER), []);
  const handleShowTopPicks = useCallback(() => setFilter({ ...DEFAULT_BETTING_FILTER, edge: "3" }), []);
  const handleShowLive = useCallback(() => setFilter((prev) => ({ ...prev, status: "live" })), []);
  const handleShowResults = useCallback(() => setFilter((prev) => ({ ...prev, status: "finished" })), []);

  useEffect(() => {
    const urlSport = searchParams.get("sport") as SportSlug | null;
    if (urlSport && Object.keys(SPORT_CONFIG).includes(urlSport)) setActiveSport(urlSport);
  }, [searchParams]);

  const activeSportLabel = activeSport === "all" ? "All sports" : SPORT_CONFIG[activeSport].label;
  const displaySport: SportSlug = activeSport === "all" ? "soccer" : activeSport;
  const isFilterDirty = filter.status !== "all" || filter.edge !== "all" || filter.search !== "";

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">

          {/* ── Command header — title row + sport tab row in one unified block ── */}
          <div
            className="border-b"
            style={{ background: "rgba(255,255,255,0.024)", borderColor: "rgba(255,255,255,0.085)" }}
          >
            {/* Row 1: title + KPI chips */}
            <BettingHero
              matches={sportFiltered}
              filteredCount={filtered.length}
              activeSportLabel={activeSportLabel}
            />

            {/* Internal row divider */}
            <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

            {/* Row 2: sport tabs + quick actions */}
            <div className="flex flex-wrap items-center gap-1 px-4 py-1.5 lg:px-6">
              {SPORT_ENTRIES.map((entry) => (
                <button
                  key={entry}
                  onClick={() => handleSportSelect(entry)}
                  className={cn(
                    "rounded px-3 py-0.5 text-[12px] font-semibold transition-all duration-100",
                    activeSport === entry
                      ? "bg-[#2edb6c] text-[#07110d]"
                      : "text-white/40 hover:bg-white/[0.06] hover:text-white/80"
                  )}
                >
                  {entry === "all" ? "All" : SPORT_CONFIG[entry].label}
                </button>
              ))}

              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={handleShowTopPicks}
                  className="flex items-center gap-1 rounded border px-2.5 py-0.5 text-[11px] font-semibold transition-all duration-100 hover:bg-amber-400/[0.14]"
                  style={{ borderColor: "rgba(251,191,36,0.22)", background: "rgba(251,191,36,0.08)", color: "#fcd34d" }}
                >
                  <Zap size={10} />
                  Top picks
                </button>
                {isFilterDirty ? (
                  <button
                    onClick={handleClearFilters}
                    className="flex items-center gap-1 rounded border px-2.5 py-0.5 text-[11px] font-medium transition-all duration-100 hover:text-white/70 hover:bg-white/[0.05]"
                    style={{ borderColor: "transparent", color: "rgba(255,255,255,0.38)" }}
                  >
                    <X size={10} />
                    Reset
                  </button>
                ) : (
                  <button
                    onClick={handleShowLive}
                    className="flex items-center gap-1 rounded border px-2.5 py-0.5 text-[11px] font-medium transition-all duration-100 hover:text-white/70 hover:bg-white/[0.05]"
                    style={{ borderColor: "transparent", color: "rgba(255,255,255,0.38)" }}
                  >
                    <Activity size={10} />
                    Live only
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Filter band (sticky) ── */}
          <div className="px-4 lg:px-6">
            <StickyFilterBar
              filter={filter}
              onChange={setFilter}
              totalShown={filtered.length}
            />
          </div>

          {/* ── In-play strip ── */}
          <div className="px-4 pb-2 lg:px-6">
            <InPlayModule />
          </div>

          {/* ── Match board ── */}
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
    </div>
  );
}
