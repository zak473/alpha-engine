"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { StickyFilterBar } from "./StickyFilterBar";
import { MatchList } from "./MatchList";
import { BettingHero } from "./BettingHero";
import type { BettingMatch, BettingFilter, SportSlug } from "@/lib/betting-types";
import { DEFAULT_BETTING_FILTER, SPORT_CONFIG } from "@/lib/betting-types";
import { applyBettingFilter, sortMatches } from "@/lib/betting-adapters";
import { Activity, ArrowRight, Radar, Sparkles } from "lucide-react";
import { InPlayModule } from "@/components/dashboard/InPlayModule";

function InsightCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/38">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">{value}</div>
      <div className="mt-2 text-sm text-white/52">{note}</div>
    </div>
  );
}

export function BettingDashboard({ matches, sport }: { matches: BettingMatch[]; sport?: SportSlug }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeSport, setActiveSport] = useState<SportSlug | "all">(sport ?? "all");
  const [filter, setFilter] = useState<BettingFilter>(DEFAULT_BETTING_FILTER);
  const highlightedId: string | null = null;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const sportFiltered = useMemo(() => activeSport === "all" ? matches : matches.filter((m) => m.sport === activeSport), [matches, activeSport]);
  const filtered = useMemo(() => sortMatches(applyBettingFilter(sportFiltered, filter)), [sportFiltered, filter]);

  const liveMatches = useMemo(() => {
    const live = matches.filter((m) => m.status === "live");
    return activeSport === "all" ? live : live.filter((m) => m.sport === activeSport);
  }, [matches, activeSport]);

  const topEdge = useMemo(() => Math.max(0, ...sportFiltered.map((m) => m.edgePercent ?? 0)), [sportFiltered]);
  const nextUpcoming = useMemo(() => {
    const upcoming = sportFiltered
      .filter((m) => m.status === "upcoming")
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return upcoming[0] ?? null;
  }, [sportFiltered]);

  const handleSportSelect = useCallback((s: SportSlug | "all") => {
    setActiveSport(s);
    const params = new URLSearchParams(searchParams.toString());
    if (s === "all") params.delete("sport");
    else params.set("sport", s);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

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

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          <BettingHero matches={sportFiltered} filteredCount={filtered.length} activeSportLabel={activeSportLabel} />

          <div className="px-4 lg:px-6">
            <section className="grid gap-4 pb-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[30px] border border-white/8 bg-white/[0.04] p-5 lg:p-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/16 bg-emerald-300/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
                  <Sparkles size={12} />
                  Board controls
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(["all", "soccer", "tennis", "esports", "basketball", "baseball", "hockey"] as Array<SportSlug | "all">).map((entry) => (
                    <button
                      key={entry}
                      onClick={() => handleSportSelect(entry)}
                      className={activeSport === entry
                        ? "rounded-full border border-emerald-300/20 bg-emerald-300/12 px-4 py-2 text-sm text-emerald-200"
                        : "rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-sm text-white/58"}
                    >
                      {entry === "all" ? "All sports" : SPORT_CONFIG[entry].label}
                    </button>
                  ))}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <button onClick={handleShowTopPicks} className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4 text-left transition hover:border-emerald-300/20">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/38"><Radar size={12} /> Top edges</div>
                    <div className="mt-2 text-lg font-semibold text-white">Show strongest spots</div>
                  </button>
                  <button onClick={handleShowLive} className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4 text-left transition hover:border-emerald-300/20">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/38"><Activity size={12} /> Live only</div>
                    <div className="mt-2 text-lg font-semibold text-white">Focus on matches in play</div>
                  </button>
                  <button onClick={handleClearFilters} className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4 text-left transition hover:border-emerald-300/20">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/38"><ArrowRight size={12} /> Reset</div>
                    <div className="mt-2 text-lg font-semibold text-white">Back to full board</div>
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
                <InsightCard label="Live now" value={`${liveMatches.length}`} note="Matches currently being scanned" />
                <InsightCard label="Top edge" value={`+${topEdge.toFixed(1)}%`} note="Best ranked opportunity" />
                <InsightCard
                  label="Next up"
                  value={nextUpcoming ? `${nextUpcoming.home.shortName} vs ${nextUpcoming.away.shortName}` : "—"}
                  note={nextUpcoming ? new Date(nextUpcoming.startTime).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "No upcoming fixture"}
                />
              </div>
            </section>
          </div>

          <div className="px-4 lg:px-6">
            <StickyFilterBar
              filter={filter}
              onChange={setFilter}
              totalShown={filtered.length}
              onShowTopPicks={handleShowTopPicks}
            />
          </div>

          <div className="px-4 pb-2 lg:px-6">
            <InPlayModule />
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
    </div>
  );
}
