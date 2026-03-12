"use client";

import { useState } from "react";
import Link from "next/link";
import { cn, sportColor, timeUntil } from "@/lib/utils";
import type { LiveMatchOut } from "@/lib/api";

const LIMIT = 5;
const ALL_SPORTS = ["soccer", "tennis", "esports", "basketball", "baseball"];

interface InPlayModuleProps {
  matches: LiveMatchOut[];
}

function MatchRow({ m }: { m: LiveMatchOut }) {
  return (
    <Link
      href={`/sports/${m.sport}/matches/${m.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.025] transition-colors group border-b border-surface-border/40 last:border-0"
    >
      <div className="shrink-0 w-4 flex justify-center">
        {m.is_live ? (
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
          </span>
        ) : (
          <span className="text-[9px] text-text-subtle">◷</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[12px] font-medium text-text-primary">
          <span className="truncate">{m.home_name}</span>
          <span className="text-text-subtle font-normal text-[10px] shrink-0">vs</span>
          <span className="truncate">{m.away_name}</span>
        </div>
        <p className="text-[10px] text-text-subtle truncate mt-0.5">{m.league}</p>
      </div>

      <div className="shrink-0">
        {m.is_live ? (
          <>
            <span className={cn("num text-[13px] font-bold tabular-nums", (m.home_score ?? 0) > (m.away_score ?? 0) ? "text-text-primary" : "text-text-muted")}>
              {m.home_score ?? 0}
            </span>
            <span className="text-text-subtle text-[11px] mx-0.5">–</span>
            <span className={cn("num text-[13px] font-bold tabular-nums", (m.away_score ?? 0) > (m.home_score ?? 0) ? "text-text-primary" : "text-text-muted")}>
              {m.away_score ?? 0}
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

export function InPlayModule({ matches }: InPlayModuleProps) {
  const [expanded, setExpanded] = useState(false);

  if (matches.length === 0) return null;

  // Build per-sport lookup
  const groups: Record<string, LiveMatchOut[]> = {};
  for (const m of matches) {
    (groups[m.sport] ??= []).push(m);
  }

  // Default to the sport with the most live matches (fall back to first sport with matches)
  const defaultSport = ALL_SPORTS.find((s) => (groups[s] ?? []).some((m) => m.is_live))
    ?? ALL_SPORTS.find((s) => groups[s]) ?? "soccer";
  const [activeSport, setActiveSport] = useState(defaultSport);

  const totalLive = matches.filter((m) => m.is_live).length;
  const activeRows = groups[activeSport] ?? [];
  const liveInActive = activeRows.filter((m) => m.is_live).length;
  const visible = expanded ? activeRows : activeRows.slice(0, LIMIT);
  const hidden = activeRows.length - LIMIT;

  return (
    <div className="bg-surface-overlay border border-surface-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-border">
        {totalLive > 0 ? (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        ) : (
          <span className="w-2 h-2 rounded-full bg-text-subtle shrink-0" />
        )}
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
          In-Play & Upcoming
        </h3>
        {totalLive > 0 && (
          <span className="ml-auto text-[10px] text-green-400 font-mono">{totalLive} live</span>
        )}
      </div>

      {/* Sport tabs */}
      <div className="flex items-center gap-0 border-b border-surface-border overflow-x-auto scrollbar-none">
        {ALL_SPORTS.filter((s) => groups[s]).map((sport) => {
          const liveCount = (groups[sport] ?? []).filter((m) => m.is_live).length;
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
              {liveCount > 0 && (
                <span className="text-[9px] font-bold text-green-400">{liveCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Matches for active sport */}
      {activeRows.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-text-subtle text-center">No matches available</p>
      ) : (
        <>
          {/* Status label */}
          <div className="flex items-center justify-between px-4 py-1.5 bg-surface-base/40">
            <span className="text-[10px] text-text-subtle">
              {liveInActive > 0 ? (
                <span className="text-green-400 font-semibold">{liveInActive} live now</span>
              ) : (
                "Next upcoming"
              )}
            </span>
            <Link
              href={`/sports/${activeSport}/matches${liveInActive > 0 ? "?status=live" : ""}`}
              className="text-[10px] text-accent-blue hover:underline"
            >
              All {activeSport} →
            </Link>
          </div>

          {visible.map((m) => <MatchRow key={m.id} m={m} />)}

          {hidden > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full px-4 py-2 text-[11px] text-text-subtle hover:text-text-muted transition-colors text-left border-t border-surface-border/40"
            >
              {expanded ? "▲ Show less" : `▼ See ${hidden} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
