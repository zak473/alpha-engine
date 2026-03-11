"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getLiveMatches } from "@/lib/api";
import type { LiveMatchOut } from "@/lib/api";
import { useLiveRefresh } from "@/lib/hooks/useLiveRefresh";
import { cn } from "@/lib/utils";

const SPORT_ICONS: Record<string, string> = {
  soccer: "⚽",
  basketball: "🏀",
  baseball: "⚾",
  hockey: "🏒",
  tennis: "🎾",
  esports: "🎮",
};

function SportBadge({ sport }: { sport: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/[0.06] text-text-muted capitalize">
      <span>{SPORT_ICONS[sport] ?? "🏅"}</span>
      {sport}
    </span>
  );
}

function LivePulse() {
  return (
    <span className="relative flex h-2 w-2 flex-shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
    </span>
  );
}

function TeamLogo({ src, name }: { src?: string | null; name: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="w-8 h-8 rounded-full object-contain bg-white/5 flex-shrink-0"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-white/[0.06] text-text-muted flex-shrink-0">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function MatchCard({ match }: { match: LiveMatchOut }) {
  const href = `/sports/${match.sport}/matches/${match.id}`;
  const isLive = match.is_live;

  return (
    <Link href={href} className="block group">
      <div
        className={cn(
          "rounded-xl border p-4 transition-colors",
          isLive
            ? "bg-green-950/20 border-green-500/20 hover:border-green-500/40"
            : "bg-surface-overlay border-surface-border hover:border-white/20"
        )}
      >
        {/* Header: league + sport + status */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {match.league_logo ? (
              <img src={match.league_logo} alt={match.league} className="w-4 h-4 object-contain flex-shrink-0" />
            ) : null}
            <span className="text-text-subtle text-xs truncate">{match.league}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <SportBadge sport={match.sport} />
            {isLive ? (
              <div className="flex items-center gap-1.5">
                <LivePulse />
                <span className="text-green-400 text-xs font-semibold uppercase tracking-widest">Live</span>
                {match.live_clock && (
                  <span className="text-green-300/70 text-xs font-mono">{match.live_clock}</span>
                )}
              </div>
            ) : (
              <span className="text-text-subtle text-xs">
                {new Date(match.kickoff_utc).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "UTC",
                })}{" "}
                UTC
              </span>
            )}
          </div>
        </div>

        {/* Score row */}
        <div className="flex items-center justify-between gap-3">
          {/* Home team */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <TeamLogo src={match.home_logo} name={match.home_name} />
            <span className="text-text-primary font-medium text-sm truncate">{match.home_name}</span>
          </div>

          {/* Score */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={cn(
                "text-2xl font-bold tabular-nums min-w-[2ch] text-right",
                isLive ? "text-green-300" : "text-text-primary"
              )}
            >
              {match.home_score != null ? match.home_score : isLive ? "–" : "—"}
            </span>
            <span className="text-text-subtle text-sm">:</span>
            <span
              className={cn(
                "text-2xl font-bold tabular-nums min-w-[2ch] text-left",
                isLive ? "text-green-300" : "text-text-primary"
              )}
            >
              {match.away_score != null ? match.away_score : isLive ? "–" : "—"}
            </span>
          </div>

          {/* Away team */}
          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            <span className="text-text-primary font-medium text-sm truncate text-right">{match.away_name}</span>
            <TeamLogo src={match.away_logo} name={match.away_name} />
          </div>
        </div>

        {/* Period indicator for live matches */}
        {isLive && match.current_period != null && match.current_period > 0 && (
          <div className="mt-2 text-center">
            <span className="text-green-400/60 text-xs">
              {match.sport === "soccer"
                ? match.current_period === 1 ? "1st Half" : match.current_period === 2 ? "2nd Half" : "Extra Time"
                : match.sport === "hockey"
                ? `Period ${match.current_period}`
                : match.sport === "basketball"
                ? `Q${match.current_period}`
                : match.sport === "baseball"
                ? `Inning ${match.current_period}`
                : `Period ${match.current_period}`}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

interface LiveViewProps {
  initialMatches: LiveMatchOut[];
}

export function LiveView({ initialMatches }: LiveViewProps) {
  const router = useRouter();
  const [matches, setMatches] = useState<LiveMatchOut[]>(initialMatches);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const hasLive = matches.some((m) => m.is_live);
  const tick = useLiveRefresh(true, 30_000);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const fresh = await getLiveMatches();
      setMatches(fresh);
      setLastUpdated(new Date());
    } catch {
      // silently fail — keep stale data
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Also trigger router.refresh() to revalidate SSR cache
  useEffect(() => {
    if (tick === 0) return;
    refresh();
    router.refresh();
  }, [tick, refresh, router]);

  const liveMatches = matches.filter((m) => m.is_live);
  const upcomingMatches = matches.filter((m) => !m.is_live);

  const sportGroups = upcomingMatches.reduce<Record<string, LiveMatchOut[]>>((acc, m) => {
    if (!acc[m.sport]) acc[m.sport] = [];
    acc[m.sport].push(m);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {hasLive ? (
            <>
              <LivePulse />
              <span className="text-green-400 text-sm font-medium">{liveMatches.length} live now</span>
            </>
          ) : (
            <span className="text-text-subtle text-sm">No live matches right now</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isRefreshing && (
            <span className="text-text-subtle text-xs animate-pulse">Updating…</span>
          )}
          <span className="text-text-subtle text-xs">
            Updated {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="text-text-subtle text-xs">· Auto-refresh every 30s</span>
        </div>
      </div>

      {/* Live matches section */}
      {liveMatches.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-text-muted text-xs uppercase tracking-widest font-medium flex items-center gap-2">
            <LivePulse />
            Live Now
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {liveMatches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming fallbacks by sport */}
      {Object.entries(sportGroups).map(([sport, sportMatches]) => (
        <div key={sport} className="flex flex-col gap-3">
          <h2 className="text-text-muted text-xs uppercase tracking-widest font-medium flex items-center gap-2">
            <span>{SPORT_ICONS[sport] ?? "🏅"}</span>
            Next Up — {sport.charAt(0).toUpperCase() + sport.slice(1)}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sportMatches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </div>
      ))}

      {matches.length === 0 && (
        <div className="flex flex-col items-center justify-center h-60 gap-3 text-text-muted">
          <span className="text-4xl">📡</span>
          <span className="text-sm">No match data available right now</span>
          <button
            onClick={refresh}
            className="text-xs text-accent-blue hover:text-accent-blue/80 underline-offset-2 underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
