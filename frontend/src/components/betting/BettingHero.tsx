"use client";

import type { BettingMatch } from "@/lib/betting-types";

interface BettingHeroProps {
  matches: BettingMatch[];
  filteredCount: number;
  activeSportLabel: string;
}

export function BettingHero({ matches, filteredCount, activeSportLabel }: BettingHeroProps) {
  const liveCount = matches.filter((m) => m.status === "live").length;
  const topEdge = matches.reduce((max, m) => Math.max(max, m.edgePercent ?? 0), 0);
  const predictedMatches = matches.filter((m) => m.modelConfidence != null);
  const avgConfidence = predictedMatches.length
    ? Math.round(
        predictedMatches.reduce((sum, m) => sum + m.modelConfidence! * 100, 0) /
          predictedMatches.length
      )
    : null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 lg:px-6 lg:pt-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <h1 className="text-[15px] font-semibold tracking-[-0.02em] text-white">Betting Board</h1>
        <span className="hidden text-[11px] font-medium uppercase tracking-[0.14em] text-white/38 sm:inline">
          {activeSportLabel}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {liveCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            {liveCount} live
          </span>
        )}
        {topEdge > 0 && (
          <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.07] px-2.5 py-1 text-[11px] font-semibold text-amber-300">
            +{topEdge.toFixed(1)}% top edge
          </span>
        )}
        {avgConfidence != null && (
          <span className="hidden rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/45 sm:inline">
            {avgConfidence}% avg conf
          </span>
        )}
        <span className="text-[11px] tabular-nums text-white/28">
          {filteredCount} {filteredCount === 1 ? "match" : "matches"}
        </span>
      </div>
    </div>
  );
}
