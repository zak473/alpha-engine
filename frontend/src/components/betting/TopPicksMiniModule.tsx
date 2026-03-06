"use client";

import { Zap } from "lucide-react";
import type { BettingMatch } from "@/lib/betting-types";
import { useBetting } from "./BettingContext";

interface TopPicksMiniModuleProps {
  matches: BettingMatch[];
}

export function TopPicksMiniModule({ matches }: TopPicksMiniModuleProps) {
  const { addToQueue, isInQueue } = useBetting();

  // Top 3 picks: highest edge, upcoming or live only
  const picks = [...matches]
    .filter((m) => m.status !== "finished" && m.status !== "cancelled")
    .sort((a, b) => (b.edgePercent ?? 0) - (a.edgePercent ?? 0))
    .slice(0, 3);

  if (picks.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 px-1">
        <Zap size={11} style={{ color: "var(--warning)" }} />
        <span className="label" style={{ color: "var(--warning)" }}>
          Model's Top Picks
        </span>
      </div>

      {picks.map((m) => {
        const bestMkt = m.featuredMarkets[0];
        const bestSel = bestMkt?.selections.reduce((best, s) =>
          (s.edge ?? -99) > (best.edge ?? -99) ? s : best,
          bestMkt.selections[0]
        );
        if (!bestMkt || !bestSel) return null;
        const selId = `${m.id}:${bestMkt.id}:${bestSel.id}`;
        const added = isInQueue(selId);
        const edge = m.edgePercent ?? 0;

        return (
          <div
            key={m.id}
            className="flex items-center gap-2 p-2.5 rounded-lg border"
            style={{
              background: "var(--glass-bg)",
              borderColor: "var(--glass-border)",
            }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-text-primary leading-tight truncate">
                {m.home.shortName} vs {m.away.shortName}
              </p>
              <p className="text-[10px] text-text-muted leading-tight mt-0.5">
                {bestMkt.name} · {bestSel.label}
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {edge > 0 && (
                <span className="text-[10px] font-bold"
                      style={{ color: edge >= 3 ? "var(--positive)" : "var(--warning)" }}>
                  +{edge.toFixed(1)}%
                </span>
              )}
              <button
                onClick={() => !added && addToQueue({
                  id: selId,
                  matchId: m.id,
                  matchLabel: `${m.home.name} vs ${m.away.name}`,
                  sport: m.sport,
                  league: m.league,
                  marketId: bestMkt.id,
                  marketName: bestMkt.name,
                  selectionId: bestSel.id,
                  selectionLabel: bestSel.label,
                  odds: bestSel.odds,
                  edge: bestSel.edge,
                  startTime: m.startTime,
                  addedAt: new Date().toISOString(),
                })}
                className="text-[11px] font-mono font-bold px-2 py-1 rounded-md border transition-all"
                style={added ? {
                  background: "var(--accent-dim)",
                  borderColor: "rgba(34,211,238,0.35)",
                  color: "var(--accent)",
                } : {
                  background: "rgba(255,255,255,0.05)",
                  borderColor: "rgba(255,255,255,0.1)",
                  color: "var(--text0)",
                }}
              >
                {added ? "✓" : bestSel.odds.toFixed(2)}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
