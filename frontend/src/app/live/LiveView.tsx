"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SGOEvent } from "@/lib/sgo";
import { SPORT_LEAGUES, LEAGUE_LABELS } from "@/lib/sgo";

// ─── Sport mapping ────────────────────────────────────────────────────────────

const LEAGUE_TO_SPORT: Record<string, string> = {};
for (const [sport, leagues] of Object.entries(SPORT_LEAGUES)) {
  for (const leagueID of leagues) LEAGUE_TO_SPORT[leagueID] = sport;
}

const SPORT_ORDER = ["soccer", "basketball", "baseball", "hockey", "tennis"];

const SPORT_COLOR: Record<string, string> = {
  soccer:     "#3b82f6",
  basketball: "#f97316",
  baseball:   "#22c55e",
  hockey:     "#a78bfa",
  tennis:     "#facc15",
  other:      "#6b7280",
};

const SPORT_EMOJI: Record<string, string> = {
  soccer:     "⚽",
  basketball: "🏀",
  baseball:   "⚾",
  hockey:     "🏒",
  tennis:     "🎾",
  other:      "🎮",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveMatch {
  eventID:   string;
  sport:     string;
  leagueID:  string;
  homeName:  string;
  awayName:  string;
  homeScore: number | null;
  awayScore: number | null;
  clock:     string | null;
  period:    string | null;
  startsAt:  string;
}

function eventToMatch(e: SGOEvent): LiveMatch {
  const sport = LEAGUE_TO_SPORT[e.leagueID] ?? "other";
  return {
    eventID:   e.eventID,
    sport,
    leagueID:  e.leagueID,
    homeName:  e.teams?.home?.names?.long ?? "Home",
    awayName:  e.teams?.away?.names?.long ?? "Away",
    homeScore: e.teams?.home?.score != null ? Number(e.teams.home.score) : null,
    awayScore: e.teams?.away?.score != null ? Number(e.teams.away.score) : null,
    clock:     e.status?.clock ?? null,
    period:    e.status?.currentPeriodID ?? null,
    startsAt:  e.status?.startsAt ?? "",
  };
}

// ─── Match card ───────────────────────────────────────────────────────────────

function MatchCard({ m }: { m: LiveMatch }) {
  const color = SPORT_COLOR[m.sport] ?? SPORT_COLOR.other;
  const hasScore = m.homeScore !== null && m.awayScore !== null;
  const homeWin  = hasScore && m.homeScore! > m.awayScore!;
  const awayWin  = hasScore && m.awayScore! > m.homeScore!;

  const clockLabel = m.clock
    ? `${m.clock}'`
    : m.period
    ? m.period.replace(/_/g, " ")
    : "In Progress";

  return (
    <Link
      href={`/sports/${m.sport}/matches/${m.eventID}`}
      className="group relative flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-150"
    >
      {/* Live pill + league */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: color }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: color }} />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>
            {clockLabel}
          </span>
        </div>
        <span className="text-[10px] text-white/38 truncate ml-2">
          {LEAGUE_LABELS[m.leagueID] ?? m.leagueID}
        </span>
      </div>

      {/* Teams + score */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          {/* Home */}
          <div className="flex items-center justify-between gap-2">
            <span className={cn(
              "text-[13px] font-semibold truncate",
              homeWin ? "text-white" : "text-white/60"
            )}>
              {m.homeName}
            </span>
            {hasScore && (
              <span className={cn(
                "text-[18px] font-bold tabular-nums shrink-0",
                homeWin ? "text-white" : "text-white/50"
              )}>
                {m.homeScore}
              </span>
            )}
          </div>
          {/* Away */}
          <div className="flex items-center justify-between gap-2">
            <span className={cn(
              "text-[13px] font-semibold truncate",
              awayWin ? "text-white" : "text-white/60"
            )}>
              {m.awayName}
            </span>
            {hasScore && (
              <span className={cn(
                "text-[18px] font-bold tabular-nums shrink-0",
                awayWin ? "text-white" : "text-white/50"
              )}>
                {m.awayScore}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* View arrow on hover */}
      <span className="absolute bottom-3 right-3 text-[11px] text-white/30 opacity-0 group-hover:opacity-100 transition-opacity">
        View →
      </span>
    </Link>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

const POLL_MS = 30_000;

export function LiveView() {
  const [matches,     setMatches]     = useState<LiveMatch[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeSport, setActiveSport] = useState<string>("all");

  const fetchLive = useCallback(async () => {
    try {
      const res  = await fetch("/api/sgo/live", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const events: SGOEvent[] = json.events ?? [];
      const live = events.filter((e) => e.status?.live).map(eventToMatch);
      setMatches(live);
      setLastUpdated(new Date());
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    const id = setInterval(fetchLive, POLL_MS);
    return () => clearInterval(id);
  }, [fetchLive]);

  // Build sport groups
  const groups: Record<string, LiveMatch[]> = {};
  for (const m of matches) (groups[m.sport] ??= []).push(m);

  const sports = SPORT_ORDER.filter((s) => groups[s])
    .concat(Object.keys(groups).filter((s) => !SPORT_ORDER.includes(s)));

  const visible = activeSport === "all" ? matches : (groups[activeSport] ?? []);

  // Auto-select first sport with matches
  useEffect(() => {
    if (matches.length > 0 && activeSport === "all") {
      // keep "all" as default — shows everything
    }
  }, [matches, activeSport]);

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6 max-w-5xl mx-auto w-full">

      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {matches.length > 0 ? (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
          ) : (
            <span className="h-3 w-3 rounded-full bg-white/20" />
          )}
          <h2 className="text-[15px] font-semibold text-white">
            {loading ? "Loading…" : matches.length > 0 ? `${matches.length} match${matches.length !== 1 ? "es" : ""} live now` : "No live matches right now"}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[10px] text-white/30 font-mono hidden sm:block">
              updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <button
            onClick={fetchLive}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.07] text-[11px] text-white/50 hover:text-white/80 hover:border-white/[0.15] transition-all"
          >
            <RefreshCw size={11} />
            Refresh
          </button>
        </div>
      </div>

      {/* Sport tabs */}
      {sports.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1">
          <button
            onClick={() => setActiveSport("all")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-medium whitespace-nowrap transition-all",
              activeSport === "all"
                ? "bg-white/[0.1] text-white border border-white/[0.15]"
                : "text-white/40 border border-transparent hover:text-white/70 hover:bg-white/[0.04]"
            )}
          >
            All sports
            <span className="text-[10px] opacity-70">{matches.length}</span>
          </button>
          {sports.map((sport) => {
            const color = SPORT_COLOR[sport] ?? SPORT_COLOR.other;
            const count = groups[sport]?.length ?? 0;
            const isActive = activeSport === sport;
            return (
              <button
                key={sport}
                onClick={() => setActiveSport(sport)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-medium whitespace-nowrap transition-all border",
                  isActive ? "text-white" : "text-white/40 border-transparent hover:text-white/70 hover:bg-white/[0.04]"
                )}
                style={isActive ? { borderColor: `${color}40`, background: `${color}15`, color } : {}}
              >
                <span>{SPORT_EMOJI[sport] ?? ""}</span>
                <span className="capitalize">{sport}</span>
                <span className="text-[10px] opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Match grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-[108px] rounded-2xl bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <span className="text-4xl">📡</span>
          <p className="text-white/40 text-[13px]">
            {matches.length > 0 ? "No live matches for this sport right now." : "No live matches detected. Check back soon."}
          </p>
          <p className="text-white/20 text-[11px]">Refreshes every 30 seconds</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((m) => <MatchCard key={m.eventID} m={m} />)}
        </div>
      )}
    </div>
  );
}
