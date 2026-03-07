"use client";

import { Activity, TrendingUp } from "lucide-react";
import type { BettingMatch } from "@/lib/betting-types";

interface BettingHeroProps {
  matches: BettingMatch[];
  filteredCount: number;
  activeSportLabel: string;
}

export function BettingHero({ matches, filteredCount, activeSportLabel }: BettingHeroProps) {
  const liveCount = matches.filter((m) => m.status === "live").length;
  const topEdge = matches.reduce((max, m) => Math.max(max, m.edgePercent ?? 0), 0);

  return (
    <section className="px-4 pt-3 pb-2 lg:px-6">
      <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: "rgba(48,224,106,0.07)", border: "1px solid rgba(48,224,106,0.15)" }}>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
          <span className="text-sm font-semibold" style={{ color: "var(--positive)" }}>Never In Doubt</span>
          <span className="hidden text-xs text-text-muted sm:inline">— {activeSportLabel}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-text-muted">
          {liveCount > 0 && (
            <span className="flex items-center gap-1.5">
              <Activity size={12} className="text-[var(--accent)]" />
              <span className="font-medium text-text-primary">{liveCount}</span> live
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <TrendingUp size={12} />
            {filteredCount} markets
          </span>
          {topEdge > 0 && (
            <span className="hidden font-medium sm:inline" style={{ color: "var(--positive)" }}>+{topEdge.toFixed(1)}% top edge</span>
          )}
        </div>
      </div>
    </section>
  );
}
