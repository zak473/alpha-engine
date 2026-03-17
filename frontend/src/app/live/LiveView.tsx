"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SGOEvent } from "@/lib/sgo";
import { SPORT_LEAGUES, LEAGUE_LABELS } from "@/lib/sgo";

const LEAGUE_TO_SPORT: Record<string, string> = {};
for (const [sport, leagues] of Object.entries(SPORT_LEAGUES)) {
  for (const leagueID of leagues) LEAGUE_TO_SPORT[leagueID] = sport;
}

const SPORT_ORDER = ["soccer", "basketball", "baseball", "hockey", "tennis"];

const SPORT_COLOR: Record<string, string> = {
  soccer: "#3b82f6",
  basketball: "#f97316",
  baseball: "#22c55e",
  hockey: "#a78bfa",
  tennis: "#facc15",
  other: "#6b7280",
};

interface LiveMatch {
  eventID: string;
  sport: string;
  leagueID: string;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  clock: string | null;
  period: string | null;
  startsAt: string;
}

function eventToMatch(e: SGOEvent): LiveMatch {
  const sport = LEAGUE_TO_SPORT[e.leagueID] ?? "other";
  return {
    eventID: e.eventID,
    sport,
    leagueID: e.leagueID,
    homeName: e.teams?.home?.names?.long ?? "Home",
    awayName: e.teams?.away?.names?.long ?? "Away",
    homeScore: e.teams?.home?.score != null ? Number(e.teams.home.score) : null,
    awayScore: e.teams?.away?.score != null ? Number(e.teams.away.score) : null,
    clock: e.status?.clock ?? null,
    period: e.status?.currentPeriodID ?? null,
    startsAt: e.status?.startsAt ?? "",
  };
}

function MatchCard({ m }: { m: LiveMatch }) {
  const color = SPORT_COLOR[m.sport] ?? SPORT_COLOR.other;
  const hasScore = m.homeScore !== null && m.awayScore !== null;
  const homeWin = hasScore && m.homeScore! > m.awayScore!;
  const awayWin = hasScore && m.awayScore! > m.homeScore!;

  const clockLabel = m.clock
    ? `${m.clock}'`
    : m.period
    ? m.period.replace(/_/g, " ")
    : "In Progress";

  return (
    <Link
      href={`/sports/${m.sport}/matches/${m.eventID}`}
      className="group relative flex flex-col gap-3 rounded-[22px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.025))] p-4 shadow-[0_18px_36px_rgba(0,0,0,0.16)] transition-all duration-150 hover:-translate-y-px hover:border-white/[0.12] hover:bg-white/[0.06]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: color }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: color }} />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color }}>
            {clockLabel}
          </span>
        </div>
        <span className="truncate text-[10px] text-white/38">{LEAGUE_LABELS[m.leagueID] ?? m.leagueID}</span>
      </div>

      <div className="rounded-[18px] border border-white/[0.06] bg-[#0d1713] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className={cn("truncate text-[13px] font-semibold", homeWin ? "text-white" : "text-white/65")}>{m.homeName}</span>
              {hasScore && <span className={cn("text-[18px] font-bold tabular-nums shrink-0", homeWin ? "text-white" : "text-white/55")}>{m.homeScore}</span>}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={cn("truncate text-[13px] font-semibold", awayWin ? "text-white" : "text-white/65")}>{m.awayName}</span>
              {hasScore && <span className={cn("text-[18px] font-bold tabular-nums shrink-0", awayWin ? "text-white" : "text-white/55")}>{m.awayScore}</span>}
            </div>
          </div>
        </div>
      </div>

      <span className="text-[11px] text-white/30 opacity-0 transition-opacity group-hover:opacity-100">Open live match center →</span>
    </Link>
  );
}

const POLL_MS = 30_000;

export function LiveView() {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeSport, setActiveSport] = useState<string>("all");

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/sgo/live", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const events: SGOEvent[] = json.events ?? [];
      const live = events
        .filter((e) => e.status?.started && !e.status?.ended && !e.status?.completed && !e.status?.cancelled)
        .map(eventToMatch);
      setMatches(live);
      setLastUpdated(new Date());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    const id = setInterval(fetchLive, POLL_MS);
    return () => clearInterval(id);
  }, [fetchLive]);

  const groups: Record<string, LiveMatch[]> = {};
  for (const m of matches) (groups[m.sport] ??= []).push(m);

  const sports = SPORT_ORDER.filter((s) => groups[s]).concat(Object.keys(groups).filter((s) => !SPORT_ORDER.includes(s)));
  const visible = activeSport === "all" ? matches : (groups[activeSport] ?? []);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-8">
      <section className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/72">Live center</div>
            <h2 className="mt-2 text-[1.35rem] font-semibold tracking-[-0.04em] text-white">
              {loading ? "Loading live matches…" : matches.length > 0 ? `${matches.length} match${matches.length !== 1 ? "es" : ""} live now` : "No live matches right now"}
            </h2>
            <p className="mt-1 text-sm text-white/48">A cleaner live view with direct access to each live match page.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {lastUpdated && (
              <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/45">
                updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <button
              onClick={fetchLive}
              className="flex items-center gap-1.5 rounded-full border border-white/[0.07] px-3 py-1.5 text-[11px] text-white/55 transition-all hover:border-white/[0.15] hover:bg-white/[0.04] hover:text-white/80"
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          </div>
        </div>

        {sports.length > 1 && (
          <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setActiveSport("all")}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all",
                activeSport === "all" ? "bg-[#2edb6c] text-[#07110d]" : "border border-white/8 bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white"
              )}
            >
              All sports
            </button>
            {sports.map((sport) => (
              <button
                key={sport}
                onClick={() => setActiveSport(sport)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] font-semibold capitalize transition-all",
                  activeSport === sport ? "bg-[#2edb6c] text-[#07110d]" : "border border-white/8 bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                {sport}
              </button>
            ))}
          </div>
        )}
      </section>

      {visible.length === 0 ? (
        <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-6 py-14 text-center text-white/50 shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
          No live matches in this view.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((m) => (
            <MatchCard key={m.eventID} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}
