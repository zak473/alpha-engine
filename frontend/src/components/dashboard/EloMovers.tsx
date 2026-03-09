"use client";

import { useState, useEffect } from "react";
import { PanelCard } from "@/components/ui/PanelCard";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { getEloMovers } from "@/lib/api";
import type { RatingEntry } from "@/lib/types";
import { fmtRating } from "@/lib/utils";
import { TrendingUp, TrendingDown, Info } from "lucide-react";

interface EloMoversProps {
  loading?: boolean;
  onEntityClick?: (name: string) => void;
}

export function EloMovers({ loading, onEntityClick }: EloMoversProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [ratings, setRatings] = useState<RatingEntry[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    getEloMovers(10)
      .then(setRatings)
      .catch(() => setRatings([]))
      .finally(() => setFetching(false));
  }, []);

  if (loading || fetching) {
    return (
      <PanelCard title="ELO Movers" padding="flush">
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: "1px solid var(--border0)" }}
            >
              <Skeleton className="w-7 h-7 rounded-full" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </PanelCard>
    );
  }

  if (ratings.length === 0) {
    return (
      <PanelCard title="ELO Movers" subtitle="No recent changes">
        <p className="px-4 py-6 text-sm text-center" style={{ color: "var(--text2)" }}>
          No ELO changes in the last 14 days
        </p>
      </PanelCard>
    );
  }

  return (
    <PanelCard title="ELO Movers" subtitle="Biggest changes" padding="flush">
      <div>
        {ratings.map((r) => {
          const up = (r.change ?? 0) > 0;
          const delta = r.change ?? 0;
          const isHovered = hoveredId === r.entity_id;

          return (
            <div
              key={r.entity_id}
              className="relative"
              style={{ borderBottom: "1px solid var(--border0)" }}
              onMouseEnter={() => setHoveredId(r.entity_id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <button
                onClick={() => onEntityClick?.(r.name)}
                className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left"
                style={{}}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                title={`Filter signals by ${r.name}`}
              >
                {/* Trend icon */}
                <div
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: up ? "var(--positive-dim)" : "var(--negative-dim)" }}
                >
                  {up
                    ? <TrendingUp size={13} style={{ color: "var(--positive)" }} />
                    : <TrendingDown size={13} style={{ color: "var(--negative)" }} />}
                </div>

                {/* Name + sport */}
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm truncate"
                    style={{ color: "var(--text0)", fontWeight: 500 }}
                  >
                    {r.name}
                  </p>
                  <Badge sport={r.sport} className="mt-0.5 capitalize text-2xs">{r.sport}</Badge>
                </div>

                {/* Rating + delta */}
                <div className="text-right shrink-0">
                  <p
                    className="num text-sm font-semibold"
                    style={{ color: "var(--text0)" }}
                  >
                    {fmtRating(r.rating)}
                  </p>
                  <p
                    className="num text-xs font-medium"
                    style={{ color: up ? "var(--positive)" : "var(--negative)" }}
                  >
                    {up ? "+" : ""}{delta}
                  </p>
                </div>

                {/* Hover hint icon */}
                <Info size={11} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text2)" }} />
              </button>

              {/* Hover tooltip */}
              {isHovered && (
                <div
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 rounded-lg px-3 py-2 shadow-xl pointer-events-none"
                  style={{
                    background: "var(--bg2)",
                    border: "1px solid var(--border1)",
                  }}
                >
                  <p className="text-2xs" style={{ color: "var(--text2)" }}>Click to filter signals →</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PanelCard>
  );
}
