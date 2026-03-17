"use client";

import { Zap, Plus, Check } from "lucide-react";
import type { BettingMatch } from "@/lib/betting-types";
import { SPORT_CONFIG } from "@/lib/betting-types";
import { useBetting } from "./BettingContext";

interface TopPicksMiniModuleProps {
  matches: BettingMatch[];
  title?: string;
  maxPicks?: number;
}

export function TopPicksMiniModule({ 
  matches, 
  title = "Model's Top Picks Today",
  maxPicks = 3,
}: TopPicksMiniModuleProps) {
  const { addToQueue, removeFromQueue, isInQueue } = useBetting();

  // Top picks: highest edge, upcoming or live only
  const picks = [...matches]
    .filter((m) => m.status !== "finished" && m.status !== "cancelled")
    .sort((a, b) => (b.edgePercent ?? 0) - (a.edgePercent ?? 0))
    .slice(0, maxPicks);

  if (picks.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-text-muted">No picks available right now</p>
        <p className="text-[10px] text-text-subtle mt-1">Check back soon for new opportunities</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <div 
          className="w-5 h-5 rounded-md flex items-center justify-center"
          style={{ 
            background: "linear-gradient(135deg, rgba(251,191,36,0.2) 0%, rgba(251,191,36,0.08) 100%)",
            border: "1px solid rgba(251,191,36,0.25)",
          }}
        >
          <Zap size={11} style={{ color: "var(--warning)" }} />
        </div>
        <span className="text-[11px] font-bold text-text-primary">
          {title}
        </span>
      </div>

      {/* Pick cards */}
      <div className="flex flex-col gap-2">
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
          const cfg = SPORT_CONFIG[m.sport];

          const handleAdd = () => {
            if (added) { removeFromQueue(selId); return; }
            addToQueue({
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
            });
          };

          return (
            <div
              key={m.id}
              className="flex items-center gap-3 p-3 rounded-lg transition-all"
              style={{
                background: added 
                  ? "rgba(34,211,238,0.06)"
                  : "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)",
                border: added 
                  ? "1px solid rgba(34,211,238,0.2)"
                  : "1px solid rgba(255,255,255,0.07)",
              }}
            >
              {/* Sport indicator */}
              <span 
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: cfg.color }}
              />

              {/* Match info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text-primary leading-tight truncate">
                  {m.home.shortName} vs {m.away.shortName}
                </p>
                <p className="text-[10px] text-text-muted leading-tight mt-0.5 truncate">
                  {bestSel.label} · {bestMkt.name}
                </p>
              </div>

              {/* Edge + Add button */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {edge > 0 && (
                  <span 
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ 
                      color: edge >= 3 ? "var(--positive)" : "var(--warning)",
                      background: edge >= 3 ? "var(--positive-dim)" : "var(--warning-dim)",
                    }}
                  >
                    +{edge.toFixed(1)}%
                  </span>
                )}
                <button
                  onClick={handleAdd}
                  disabled={added}
                  className="flex items-center justify-center w-14 h-7 rounded-md border font-mono text-xs font-bold transition-all disabled:cursor-default"
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
                  {added ? (
                    <Check size={12} />
                  ) : (
                    <span className="flex items-center gap-0.5">
                      <Plus size={10} />
                      {bestSel.odds.toFixed(2)}
                    </span>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer tip */}
      <p className="text-[10px] text-text-subtle text-center px-2 leading-relaxed">
        Based on highest model edge for upcoming games
      </p>
    </div>
  );
}
