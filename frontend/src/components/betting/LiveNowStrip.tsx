"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BettingMatch } from "@/lib/betting-types";
import { SPORT_CONFIG } from "@/lib/betting-types";
import { cn } from "@/lib/utils";

interface LiveNowStripProps {
  matches: BettingMatch[];
  onTileClick?: (matchId: string) => void;
  nextUpcoming?: { label: string; minutesAway: number } | null;
}

function LiveTile({ match, onClick }: { match: BettingMatch; onClick?: () => void }) {
  const cfg = SPORT_CONFIG[match.sport];
  const hasScore = match.homeScore != null && match.awayScore != null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-shrink-0 flex flex-col gap-1 px-3 py-2 rounded-lg border cursor-pointer text-left",
        "transition-all duration-150 group",
        "bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.14]"
      )}
      style={{ minWidth: 148 }}
    >
      {/* Sport + clock */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse"
            style={{ background: cfg.color }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: cfg.color }}>
            LIVE
          </span>
        </div>
        {match.liveClock && (
          <span className="text-[10px] text-text-muted font-mono">{match.liveClock}</span>
        )}
      </div>

      {/* Teams + score */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <span className="text-xs font-semibold text-text-primary leading-tight truncate">
            {match.home.shortName}
          </span>
          <span className="text-xs font-semibold text-text-primary leading-tight truncate">
            {match.away.shortName}
          </span>
        </div>
        {hasScore && (
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
            <span className="text-xs font-mono font-bold text-text-primary">{match.homeScore}</span>
            <span className="text-xs font-mono font-bold text-text-primary">{match.awayScore}</span>
          </div>
        )}
      </div>
    </button>
  );
}

export function LiveNowStrip({ matches, onTileClick, nextUpcoming }: LiveNowStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "right" ? 200 : -200, behavior: "smooth" });
  };

  const liveMatches = matches.filter((m) => m.status === "live");

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 border-b"
      style={{ borderColor: "var(--border0)", background: "rgba(8,8,24,0.6)" }}
    >
      {/* Label */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
          style={{ background: "var(--positive)" }}
        />
        <span className="text-[11px] font-bold uppercase tracking-widest"
              style={{ color: "var(--positive)" }}>
          Live
        </span>
      </div>

      {liveMatches.length === 0 ? (
        <div className="flex-1 flex items-center gap-2 text-[11px] text-text-muted px-2">
          No live events right now
          {nextUpcoming && (
            <span className="text-text-subtle">
              · Next: {nextUpcoming.label} in {nextUpcoming.minutesAway}m
            </span>
          )}
        </div>
      ) : (
        <>
          {/* Scroll left */}
          <button
            onClick={() => scroll("left")}
            className="flex-shrink-0 p-1 rounded text-text-muted hover:text-text-primary transition-colors"
          >
            <ChevronLeft size={13} />
          </button>

          {/* Tiles */}
          <div
            ref={scrollRef}
            className="flex gap-2 overflow-x-auto flex-1"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {liveMatches.map((m) => (
              <LiveTile
                key={m.id}
                match={m}
                onClick={() => onTileClick?.(m.id)}
              />
            ))}
          </div>

          {/* Scroll right */}
          <button
            onClick={() => scroll("right")}
            className="flex-shrink-0 p-1 rounded text-text-muted hover:text-text-primary transition-colors"
          >
            <ChevronRight size={13} />
          </button>

          <span className="flex-shrink-0 text-[11px] text-text-muted font-mono">
            {liveMatches.length} live
          </span>
        </>
      )}
    </div>
  );
}
