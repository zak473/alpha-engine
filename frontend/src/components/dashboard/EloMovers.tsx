"use client";

import { useState } from "react";
import { PanelCard } from "@/components/ui/PanelCard";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { getMockRatings } from "@/lib/api";
import { fmtRating, cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Info } from "lucide-react";

// Mock recent form strings per entity
const MOCK_FORM: Record<string, string[]> = {
  default: ["W", "W", "L", "W", "D"],
};
function getForm(entityId: string): string[] {
  return MOCK_FORM[entityId] ?? MOCK_FORM.default;
}

interface EloMoversProps {
  loading?: boolean;
  onEntityClick?: (name: string) => void;
}

export function EloMovers({ loading, onEntityClick }: EloMoversProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (loading) {
    return (
      <PanelCard title="ELO Movers" padding="flush">
        <div className="divide-y divide-surface-border/50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="w-7 h-7 rounded-full" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </PanelCard>
    );
  }

  const ratings = getMockRatings()
    .sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0))
    .slice(0, 5);

  return (
    <PanelCard title="ELO Movers" subtitle="Biggest changes" padding="flush">
      <div className="divide-y divide-surface-border/50">
        {ratings.map((r) => {
          const up = (r.change ?? 0) > 0;
          const delta = r.change ?? 0;
          const form = getForm(r.entity_id);
          const isHovered = hoveredId === r.entity_id;

          return (
            <div
              key={r.entity_id}
              className="relative"
              onMouseEnter={() => setHoveredId(r.entity_id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <button
                onClick={() => onEntityClick?.(r.name)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.025] transition-colors text-left"
                title={`Filter signals by ${r.name}`}
              >
                {/* Trend icon */}
                <div className={cn(
                  "shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
                  up ? "bg-accent-green/10" : "bg-accent-red/10"
                )}>
                  {up
                    ? <TrendingUp size={13} className="text-accent-green" />
                    : <TrendingDown size={13} className="text-accent-red" />}
                </div>

                {/* Name + sport */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary truncate">{r.name}</p>
                  <Badge sport={r.sport} className="mt-0.5 capitalize text-2xs">{r.sport}</Badge>
                </div>

                {/* Rating + delta */}
                <div className="text-right shrink-0">
                  <p className="num text-sm font-semibold text-text-primary">{fmtRating(r.rating)}</p>
                  <p className={cn(
                    "num text-xs font-medium",
                    up ? "text-accent-green" : "text-accent-red"
                  )}>
                    {up ? "+" : ""}{delta}
                  </p>
                </div>

                {/* Hover hint icon */}
                <Info size={11} className="shrink-0 text-text-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              {/* "Why moved?" tooltip */}
              {isHovered && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-surface-overlay border border-surface-border rounded-lg px-3 py-2 shadow-xl pointer-events-none">
                  <p className="text-2xs text-text-muted mb-1.5 font-medium">Recent form</p>
                  <div className="flex gap-1">
                    {form.map((result, i) => (
                      <span
                        key={i}
                        className={cn(
                          "w-5 h-5 rounded flex items-center justify-center text-2xs font-bold",
                          result === "W" && "bg-accent-green/20 text-accent-green",
                          result === "L" && "bg-accent-red/20 text-accent-red",
                          result === "D" && "bg-accent-amber/20 text-accent-amber"
                        )}
                      >
                        {result}
                      </span>
                    ))}
                  </div>
                  <p className="text-2xs text-text-subtle mt-1.5">Click to filter signals →</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PanelCard>
  );
}
