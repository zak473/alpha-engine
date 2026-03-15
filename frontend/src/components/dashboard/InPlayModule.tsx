"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cn, sportColor, timeUntil } from "@/lib/utils";
import type { SGOEvent } from "@/lib/sgo";
import { SPORT_LEAGUES } from "@/lib/sgo";

const LIMIT = 5;
const POLL_INTERVAL = 30_000;

// Build leagueID → sport slug from our existing SPORT_LEAGUES config
const LEAGUE_TO_SPORT: Record<string, string> = {};
for (const [sport, leagues] of Object.entries(SPORT_LEAGUES)) {
  for (const leagueID of leagues) {
    LEAGUE_TO_SPORT[leagueID] = sport;
  }
}

function sgoSport(leagueID: string): string {
  return LEAGUE_TO_SPORT[leagueID] ?? "other";
}

interface LiveItem {
  id: string;
  sport: string;
  home_name: string;
  away_name: string;
  league: string;
  kickoff_utc: string;
  is_live: boolean;
  home_score?: number;
  away_score?: number;
  clock?: string;
}

function eventToItem(event: SGOEvent): LiveItem {
  const home = event.teams?.home;
  const away = event.teams?.away;
  const s = event.status;
  return {
    id:          event.eventID,
    sport:       sgoSport(event.leagueID),
    home_name:   home?.names?.long ?? "Home",
    away_name:   away?.names?.long ?? "Away",
    league:      event.leagueID,
    kickoff_utc: s.startsAt,
    is_live:     s.live,
    home_score:  home?.score != null ? Number(home.score) : undefined,
    away_score:  away?.score != null ? Number(away.score) : undefined,
    clock:       s.clock ?? s.currentPeriodID ?? undefined,
  };
}

const ALL_SPORTS = ["soccer", "tennis", "basketball", "baseball", "hockey"];

function MatchRow({ m }: { m: LiveItem }) {
  return (
    <Link
      href={`/sports/${m.sport}/matches/${m.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.025] transition-colors group border-b border-white/[0.032] last:border-0"
    >
      <div className="shrink-0 w-4 flex justify-center">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[12px] font-medium text-text-primary">
          <span className="truncate">{m.home_name}</span>
          <span className="text-text-subtle font-normal text-[10px] shrink-0">vs</span>
          <span className="truncate">{m.away_name}</span>
        </div>
        <p className="text-[10px] text-text-subtle truncate mt-0.5">
          {m.league}{m.clock ? ` · ${m.clock}` : ""}
        </p>
      </div>

      <div className="shrink-0">
        {m.home_score != null && m.away_score != null ? (
          <>
            <span className={cn("num text-[13px] font-bold tabular-nums", m.home_score > m.away_score ? "text-text-primary" : "text-text-muted")}>
              {m.home_score}
            </span>
            <span className="text-text-subtle text-[11px] mx-0.5">–</span>
            <span className={cn("num text-[13px] font-bold tabular-nums", m.away_score > m.home_score ? "text-text-primary" : "text-text-muted")}>
              {m.away_score}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-accent-amber font-mono">{timeUntil(m.kickoff_utc)}</span>
        )}
      </div>

      <span className="text-[10px] text-accent-blue opacity-0 group-hover:opacity-100 transition-opacity shrink-0">→</span>
    </Link>
  );
}

export function InPlayModule() {
  const [matches, setMatches] = useState<LiveItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [activeSport, setActiveSport] = useState<string>("soccer");

  useEffect(() => {
    async function fetchLive() {
      try {
        const res = await fetch("/api/sgo/live", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const events: SGOEvent[] = json.events ?? [];
        const items = events
          .filter((e) => e.status?.started && !e.status?.ended && !e.status?.completed && !e.status?.cancelled)
          .map(eventToItem);
        setMatches(items);
        // Auto-select the sport with most live matches
        if (items.length > 0) {
          const counts: Record<string, number> = {};
          for (const m of items) counts[m.sport] = (counts[m.sport] ?? 0) + 1;
          const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
          if (top) setActiveSport(top);
        }
      } catch {
        // silently ignore
      }
    }

    fetchLive();
    const id = setInterval(fetchLive, POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  if (matches.length === 0) return null;

  const groups: Record<string, LiveItem[]> = {};
  for (const m of matches) {
    (groups[m.sport] ??= []).push(m);
  }

  const activeRows = groups[activeSport] ?? [];
  const visible = expanded ? activeRows : activeRows.slice(0, LIMIT);
  const hidden = activeRows.length - LIMIT;

  return (
    <div className="bg-white/[0.04] border border-white/8 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
          Live Now
        </h3>
        <span className="ml-auto text-[10px] text-green-400 font-mono">{matches.length} live</span>
      </div>

      {/* Sport tabs */}
      {Object.keys(groups).length > 1 && (
        <div className="flex items-center gap-0 border-b border-white/8 overflow-x-auto scrollbar-none">
          {ALL_SPORTS.filter((s) => groups[s]).concat(
            Object.keys(groups).filter((s) => !ALL_SPORTS.includes(s))
          ).map((sport) => {
            const isActive = activeSport === sport;
            return (
              <button
                key={sport}
                onClick={() => { setActiveSport(sport); setExpanded(false); }}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-medium capitalize whitespace-nowrap border-b-2 transition-colors shrink-0",
                  isActive
                    ? "border-b-2 text-text-primary"
                    : "border-transparent text-text-subtle hover:text-text-muted hover:bg-white/[0.02]"
                )}
                style={isActive ? { borderBottomColor: sportColor(sport) } : {}}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: sportColor(sport) }}
                />
                {sport}
                <span className="text-[9px] font-bold text-green-400">{groups[sport].length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Matches */}
      {activeRows.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-text-subtle text-center">No live matches</p>
      ) : (
        <>
          {visible.map((m) => <MatchRow key={m.id} m={m} />)}
          {hidden > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full px-4 py-2 text-[11px] text-text-subtle hover:text-text-muted transition-colors text-left border-t border-white/[0.032]"
            >
              {expanded ? "▲ Show less" : `▼ See ${hidden} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
