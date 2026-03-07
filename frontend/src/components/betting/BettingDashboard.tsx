"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { QueueRail } from "./QueueRail";
import { MobileQueueDrawer } from "./MobileQueueDrawer";
import { BettingHero } from "./BettingHero";
import type { BettingMatch, SportSlug, Market } from "@/lib/betting-types";
import { SPORT_CONFIG } from "@/lib/betting-types";
import { sortMatchesBy } from "@/lib/betting-adapters";
import { useBetting } from "./BettingContext";
import { useOddsFormat } from "@/lib/odds-format";
import { cn } from "@/lib/utils";

// ── Compact match row (bet365-style) ──────────────────────────────────────────

function CompactOddsBtn({ label, odds, initOdds, matchId, marketId, selId, match, market }: {
  label: string; odds: number; initOdds: number; matchId: string; marketId: string; selId: string;
  match: BettingMatch; market: Market;
}) {
  const { addToQueue, isInQueue } = useBetting();
  const { fmt } = useOddsFormat();
  const id = `${matchId}:${marketId}:${selId}`;
  const added = isInQueue(id);
  const drift = odds - initOdds;
  const driftDir = Math.abs(drift) > 0.01 ? (drift > 0 ? "up" : "down") : null;

  return (
    <button
      onClick={() => !added && addToQueue({
        id, matchId, matchLabel: `${match.home.name} vs ${match.away.name}`,
        sport: match.sport, league: match.league,
        marketId, marketName: market.name,
        selectionId: selId, selectionLabel: label,
        odds, startTime: match.startTime, addedAt: new Date().toISOString(),
      })}
      className="flex flex-col items-center justify-center rounded border px-2 py-1 min-w-[48px] transition-all relative"
      style={added ? {
        background: "rgba(46,219,108,0.10)", borderColor: "rgba(46,219,108,0.30)", color: "var(--positive)",
      } : {
        background: "var(--bg1)", borderColor: "var(--border0)", color: "var(--text0)",
      }}
    >
      <span className="text-[9px] text-text-muted leading-none mb-0.5 truncate max-w-[44px]">{added ? "✓" : label}</span>
      <span className="text-[11px] font-bold font-mono tabular-nums leading-none">{added ? "Added" : fmt(odds)}</span>
      {driftDir && !added && (
        <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold leading-none" style={{ color: driftDir === "up" ? "var(--positive)" : "var(--negative)" }}>
          {driftDir === "up" ? "▲" : "▼"}
        </span>
      )}
    </button>
  );
}

function CompactMatchRow({ match, initOddsMap }: { match: BettingMatch; initOddsMap: Map<string, number> }) {
  const cfg = SPORT_CONFIG[match.sport];
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const isLive = match.status === "live";
  const time = isLive
    ? (match.liveClock ?? "Live")
    : new Date(match.startTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const featuredMarket = match.featuredMarkets[0];
  const extraMarkets = match.featuredMarkets.slice(1);
  const matchHref = `/sports/${match.sport}/matches/${match.id}`;

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: "var(--border0)" }}>
      <div
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg2)] transition-colors cursor-pointer"
        onClick={() => router.push(matchHref)}
      >
        {/* Sport dot + time */}
        <div className="flex flex-col items-center gap-0.5 w-10 flex-shrink-0">
          {isLive ? (
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cfg.color }} />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
          )}
          <span className={cn("text-[10px] font-semibold tabular-nums", isLive ? "text-[var(--positive)]" : "text-text-muted")}>
            {time}
          </span>
        </div>

        {/* Teams */}
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="text-[12px] font-semibold text-text-primary leading-tight truncate">{match.home.name}</span>
          <span className="text-[12px] text-text-muted leading-tight truncate">{match.away.name}</span>
        </div>

        {/* Score (live) or league */}
        {isLive && match.homeScore != null ? (
          <div className="flex flex-col items-center gap-0 w-8 flex-shrink-0">
            <span className="text-[12px] font-bold font-mono text-text-primary leading-tight">{match.homeScore}</span>
            <span className="text-[12px] font-bold font-mono text-text-primary leading-tight">{match.awayScore}</span>
          </div>
        ) : (
          <span className="text-[10px] text-text-subtle truncate max-w-[80px] hidden sm:block">{match.league}</span>
        )}

        {/* Expand chevron */}
        {extraMarkets.length > 0 && (
          <span className="text-text-muted ml-1 flex-shrink-0" onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        )}

        {/* Odds */}
        {featuredMarket && (
          <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            {featuredMarket.selections.map((sel) => (
              <CompactOddsBtn
                key={sel.id}
                label={sel.label}
                odds={sel.odds}
                initOdds={initOddsMap.get(`${match.id}:${featuredMarket.id}:${sel.id}`) ?? sel.odds}
                matchId={match.id}
                marketId={featuredMarket.id}
                selId={sel.id}
                match={match}
                market={featuredMarket}
              />
            ))}
          </div>
        )}

      </div>

      {/* Expanded extra markets */}
      {expanded && extraMarkets.map(mkt => (
        <div key={mkt.id} className="flex items-center gap-3 px-4 py-2 border-t" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
          <span className="text-[10px] text-text-muted w-10 flex-shrink-0 truncate">{mkt.name}</span>
          <div className="flex-1" />
          <div className="flex items-center gap-1 flex-shrink-0">
            {mkt.selections.map((sel) => (
              <CompactOddsBtn
                key={sel.id}
                label={sel.label}
                odds={sel.odds}
                initOdds={initOddsMap.get(`${match.id}:${mkt.id}:${sel.id}`) ?? sel.odds}
                matchId={match.id}
                marketId={mkt.id}
                selId={sel.id}
                match={match}
                market={mkt}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const SPORT_ORDER: SportSlug[] = ["soccer", "basketball", "tennis", "esports", "baseball"];

function CompactMatchList({ matches, activeSport }: { matches: BettingMatch[]; activeSport: SportSlug | "all" }) {
  const [expanded, setExpanded] = useState<Partial<Record<SportSlug, boolean>>>({});
  const [flatExpanded, setFlatExpanded] = useState(false);

  // Snapshot initial odds on mount so we can show drift arrows
  const initOddsMap = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const map = new Map<string, number>();
    for (const m of matches) {
      for (const mkt of m.featuredMarkets) {
        for (const sel of mkt.selections) {
          const key = `${m.id}:${mkt.id}:${sel.id}`;
          if (!initOddsMap.current.has(key)) map.set(key, sel.odds);
        }
      }
    }
    map.forEach((v, k) => initOddsMap.current.set(k, v));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setFlatExpanded(false); }, [activeSport]);

  if (!matches.length) return null;

  // ── Specific sport: flat list ──────────────────────────────────────────────
  if (activeSport !== "all") {
    const visible = flatExpanded ? matches : matches.slice(0, 4);
    const remaining = matches.length - 4;
    return (
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border0)", background: "var(--bg1)" }}>
        {visible.map((m) => <CompactMatchRow key={m.id} match={m} initOddsMap={initOddsMap.current} />)}
        {remaining > 0 && !flatExpanded && (
          <button
            onClick={() => setFlatExpanded(true)}
            className="w-full py-2.5 text-[11px] font-semibold text-text-muted hover:text-text-primary hover:bg-[var(--bg2)] transition-colors border-t"
            style={{ borderColor: "var(--border0)" }}
          >
            See all {matches.length} matches
          </button>
        )}
      </div>
    );
  }

  // ── All sports: grouped by sport ───────────────────────────────────────────
  const bySport = new Map<SportSlug, BettingMatch[]>();
  for (const s of SPORT_ORDER) {
    const group = matches.filter((m) => m.sport === s);
    if (group.length) bySport.set(s, group);
  }

  return (
    <div className="flex flex-col gap-3">
      {Array.from(bySport.entries()).map(([sport, group]) => {
        const cfg = SPORT_CONFIG[sport];
        const isExpanded = expanded[sport];
        const visible = isExpanded ? group : group.slice(0, 4);
        const remaining = group.length - 4;
        return (
          <div key={sport} className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border0)", background: "var(--bg1)" }}>
            <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <span className="text-sm leading-none">{cfg.icon}</span>
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>{cfg.label}</span>
              <span className="text-[10px] text-text-muted ml-auto">{group.length} matches</span>
            </div>
            {visible.map((m) => <CompactMatchRow key={m.id} match={m} initOddsMap={initOddsMap.current} />)}
            {remaining > 0 && !isExpanded && (
              <button
                onClick={() => setExpanded((p) => ({ ...p, [sport]: true }))}
                className="w-full py-2.5 text-[11px] font-semibold text-text-muted hover:text-text-primary hover:bg-[var(--bg2)] transition-colors border-t"
                style={{ borderColor: "var(--border0)" }}
              >
                See all {group.length} {cfg.label} matches
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

type Mode = "prematch" | "inplay";

function PrimaryNav({
  mode,
  onMode,
  liveCount,
  prematchCount,
  activeSport,
  onSport,
  sportCounts,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  liveCount: number;
  prematchCount: number;
  activeSport: SportSlug | "all";
  onSport: (s: SportSlug | "all") => void;
  sportCounts: Record<SportSlug | "all", number>;
}) {
  const sports: (SportSlug | "all")[] = ["all", "soccer", "basketball", "tennis", "esports", "baseball"];

  return (
    <div
      className="sticky top-0 z-30 border-b flex-shrink-0"
      style={{
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderColor: "var(--border0)",
      }}
    >
      {/* Mode toggle row */}
      <div className="flex items-stretch gap-0 px-4 pt-3 pb-0 lg:px-6">
        <button
          onClick={() => onMode("prematch")}
          className={cn(
            "relative flex items-center gap-2.5 px-6 py-3 rounded-t-xl text-[15px] font-bold tracking-tight transition-all duration-150 border border-b-0",
            mode === "prematch"
              ? "text-text-primary bg-white border-[var(--border1)] z-10 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]"
              : "text-text-muted bg-transparent border-transparent hover:text-text-primary"
          )}
        >
          <span className="text-[17px] leading-none">🌐</span>
          <span>All Sports</span>
          {prematchCount > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
              style={mode === "prematch"
                ? { background: "rgba(48,224,106,0.12)", color: "var(--positive)" }
                : { background: "var(--bg2)", color: "var(--text-muted)" }
              }
            >
              {prematchCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onMode("inplay")}
          className={cn(
            "relative flex items-center gap-2.5 px-6 py-3 rounded-t-xl text-[15px] font-bold tracking-tight transition-all duration-150 border border-b-0",
            mode === "inplay"
              ? "text-white z-10 border-transparent shadow-[0_-4px_20px_rgba(23,148,71,0.18)]"
              : "text-text-muted bg-transparent border-transparent hover:text-text-primary"
          )}
          style={mode === "inplay" ? { background: "var(--positive)" } : {}}
        >
          <span
            className={cn(
              "w-2.5 h-2.5 rounded-full flex-shrink-0",
              mode === "inplay" ? "bg-white animate-pulse" : "bg-[var(--positive)] animate-pulse"
            )}
          />
          <span>In Play</span>
          {liveCount > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
              style={mode === "inplay"
                ? { background: "rgba(255,255,255,0.25)", color: "white" }
                : { background: "rgba(48,224,106,0.12)", color: "var(--positive)" }
              }
            >
              {liveCount}
            </span>
          )}
        </button>
      </div>

      {/* Sport chips row */}
      <div
        className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto lg:px-6"
        style={{ scrollbarWidth: "none" }}
      >
        {sports.map((s) => {
          const active = s === activeSport;
          const cfg = s === "all" ? null : SPORT_CONFIG[s];
          const count = sportCounts[s];
          return (
            <button
              key={s}
              onClick={() => onSport(s)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all duration-120 flex-shrink-0 border",
                active
                  ? "text-text-primary border-[var(--border1)] bg-white shadow-sm"
                  : "text-text-muted border-transparent hover:text-text-primary hover:bg-[var(--bg2)]"
              )}
            >
              <span className="text-sm leading-none">{cfg ? cfg.icon : "🌐"}</span>
              <span>{s === "all" ? "All" : cfg!.label}</span>
              {count > 0 && (
                <span className="text-[10px] font-bold tabular-nums text-text-muted">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface BettingDashboardProps {
  matches: BettingMatch[];
  sport?: SportSlug;
}

export function BettingDashboard({ matches, sport }: BettingDashboardProps) {
  const searchParams = useSearchParams();
  const { queue } = useBetting();

  const [mode, setMode] = useState<Mode>("prematch");
  const [activeSport, setActiveSport] = useState<SportSlug | "all">(sport ?? "all");
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const handleModeChange = useCallback((m: Mode) => {
    setMode(m);
  }, []);

  const handleSportChange = useCallback((s: SportSlug | "all") => {
    setActiveSport(s);
  }, []);

  const sportFiltered = useMemo(() => {
    if (activeSport === "all") return matches;
    return matches.filter((m) => m.sport === activeSport);
  }, [matches, activeSport]);

  const filtered = useMemo(() => {
    const statusFilter = mode === "inplay" ? "live" : "upcoming";
    return sortMatchesBy(sportFiltered.filter((m) => m.status === statusFilter), "default");
  }, [sportFiltered, mode]);

  const liveCount = useMemo(() => matches.filter((m) => m.status === "live").length, [matches]);
  const prematchCount = useMemo(() => matches.filter((m) => m.status === "upcoming").length, [matches]);

  const sportCounts = useMemo(() => {
    const base = mode === "inplay"
      ? matches.filter((m) => m.status === "live")
      : matches.filter((m) => m.status === "upcoming");
    return {
      all:        base.length,
      soccer:     base.filter((m) => m.sport === "soccer").length,
      basketball: base.filter((m) => m.sport === "basketball").length,
      tennis:     base.filter((m) => m.sport === "tennis").length,
      esports:    base.filter((m) => m.sport === "esports").length,
      baseball:   base.filter((m) => m.sport === "baseball").length,
    };
  }, [matches, mode]);


  useEffect(() => {
    const urlSport = searchParams.get("sport") as SportSlug | null;
    if (urlSport && Object.keys(SPORT_CONFIG).includes(urlSport)) setActiveSport(urlSport);
  }, [searchParams]);

  const displaySport: SportSlug = activeSport === "all" ? "soccer" : activeSport;
  const activeSportLabel = activeSport === "all" ? "All Sports" : SPORT_CONFIG[activeSport].label;

  // Best bet: match + selection with highest edge across all filtered matches
  const bestBet = useMemo(() => {
    let best: { match: BettingMatch; selLabel: string; marketName: string; odds: number; edge: number } | null = null;
    for (const m of filtered) {
      for (const mkt of m.featuredMarkets) {
        for (const sel of mkt.selections) {
          const edge = sel.edge ?? 0;
          if (!best || edge > best.edge) {
            best = { match: m, selLabel: sel.label, marketName: mkt.name, odds: sel.odds, edge };
          }
        }
      }
    }
    return best && best.edge > 2 ? best : null;
  }, [filtered]);

  return (
    <div className="flex flex-1 overflow-hidden min-h-0 bg-[radial-gradient(circle_at_top,rgba(48,224,106,0.08),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.55),transparent_45%)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <PrimaryNav
          mode={mode}
          onMode={handleModeChange}
          liveCount={liveCount}
          prematchCount={prematchCount}
          activeSport={activeSport}
          onSport={handleSportChange}
          sportCounts={sportCounts}
        />

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          <BettingHero matches={sportFiltered} filteredCount={filtered.length} activeSportLabel={activeSportLabel} />

          {/* Best bet callout */}
          {bestBet && (
            <div className="px-4 pt-2 lg:px-6">
              <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "linear-gradient(135deg,rgba(34,226,131,0.12),rgba(34,226,131,0.06))", border: "1px solid rgba(34,226,131,0.22)" }}>
                <span className="text-base leading-none flex-shrink-0">⚡</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--positive)" }}>Best bet today</p>
                  <p className="text-xs font-semibold text-text-primary truncate">
                    {bestBet.selLabel} · {bestBet.marketName}
                    <span className="text-text-muted font-normal ml-1">{bestBet.match.home.name} vs {bestBet.match.away.name}</span>
                  </p>
                </div>
                <span className="text-xs font-bold font-mono flex-shrink-0" style={{ color: "var(--positive)" }}>+{bestBet.edge.toFixed(1)}% edge</span>
              </div>
            </div>
          )}

          {/* Compact match preview — grouped by sport, 4 per group */}
          <div className="px-4 pt-2 pb-2 lg:px-6">
            {filtered.length === 0 ? (
              <div className="rounded-xl border py-10 flex flex-col items-center gap-2 text-center" style={{ borderColor: "var(--border0)", background: "var(--bg1)" }}>
                <span className="text-2xl">{mode === "inplay" ? "📡" : "📅"}</span>
                <p className="text-sm font-semibold text-text-primary">
                  {mode === "inplay" ? "No live matches right now" : "No upcoming matches"}
                </p>
                <p className="text-xs text-text-muted">
                  {mode === "inplay" ? "Check back soon — live matches will appear here" : "Try selecting a different sport"}
                </p>
              </div>
            ) : (
              <CompactMatchList matches={filtered} activeSport={activeSport} />
            )}
          </div>

          {/* Tipsters promo banner */}
          <div className="px-4 py-4 lg:px-6">
            <Link
              href="/tipsters"
              className="flex items-center justify-between gap-4 rounded-2xl px-5 py-4 transition-all hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #0f2418 0%, #1a3d28 60%, #0f2418 100%)",
                border: "1px solid rgba(34,226,131,0.18)",
                boxShadow: "0 4px 20px rgba(34,226,131,0.08)",
              }}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex -space-x-2 flex-shrink-0">
                  {["TC", "PM", "G7"].map((initials, i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white"
                      style={{
                        borderColor: "#0f2418",
                        background: ["#22e283", "#60a5fa", "#f59e0b"][i],
                      }}
                    >
                      {initials}
                    </div>
                  ))}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white leading-tight">Follow community tipsters</p>
                  <p className="text-[11px] leading-snug mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Tail verified picks from top-performing tipsters
                  </p>
                </div>
              </div>
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold flex-shrink-0"
                style={{ background: "#22e283", color: "#0f2418" }}
              >
                View tipsters
              </div>
            </Link>
          </div>

          {/* Mobile queue pill */}
          <div className="lg:hidden flex justify-end px-4 py-2">
            <button
              onClick={() => setMobileQueueOpen(true)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium",
                queue.length > 0
                  ? "text-[var(--positive)] border-[rgba(48,224,106,0.24)] bg-[var(--accent-dim)]"
                  : "text-text-muted border-[var(--border0)]"
              )}
            >
              {queue.length > 0 ? queue.length : "Queue"}
            </button>
          </div>
        </div>
      </div>

      <QueueRail matches={matches} />
      <MobileQueueDrawer open={mobileQueueOpen} onClose={() => setMobileQueueOpen(false)} matches={matches} />
    </div>
  );
}
