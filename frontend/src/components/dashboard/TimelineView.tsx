"use client";

import { cn, sportColor, timeUntil } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { MvpPrediction } from "@/lib/types";
import { Clock } from "lucide-react";

interface TimelineViewProps {
  predictions: MvpPrediction[];
  onSelect?: (p: MvpPrediction) => void;
}

// ── Confidence badge inline ───────────────────────────────────────────────────

function ConfDot({ value }: { value: number }) {
  const color = value >= 80 ? "#22c55e" : value >= 65 ? "#f59e0b" : "#71717a";
  return <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: color }} />;
}

// ── Hour label ────────────────────────────────────────────────────────────────

function hourLabel(h: number): string {
  if (h === 0) return "Now";
  if (h === 24) return "Tomorrow";
  const d = new Date();
  d.setHours(d.getHours() + h, 0, 0, 0);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// ── Main timeline ─────────────────────────────────────────────────────────────

export function TimelineView({ predictions, onSelect }: TimelineViewProps) {
  const now = Date.now();

  // Only show events in the next 24h, sorted by time
  const upcoming = [...predictions]
    .filter((p) => {
      const t = new Date(p.start_time).getTime();
      return t > now && t - now <= 86_400_000;
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  if (upcoming.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="No events in the next 24 hours"
        description="Expand the time range to see more predictions."
      />
    );
  }

  // Group by hour bucket
  const buckets: Record<number, MvpPrediction[]> = {};
  for (const p of upcoming) {
    const hoursFromNow = Math.floor((new Date(p.start_time).getTime() - now) / 3_600_000);
    const bucket = hoursFromNow; // 0 = <1h, 1 = 1-2h, etc.
    if (!buckets[bucket]) buckets[bucket] = [];
    buckets[bucket].push(p);
  }

  const bucketKeys = Object.keys(buckets)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="px-4 py-3 space-y-0">
      {bucketKeys.map((hour, idx) => {
        const group = buckets[hour];
        const isFirst = idx === 0;
        return (
          <div key={hour} className="flex gap-3 min-h-[56px]">
            {/* Time axis */}
            <div className="flex flex-col items-center w-14 shrink-0">
              <div className={cn(
                "w-2 h-2 rounded-full border-2 mt-1 shrink-0",
                hour < 1 ? "border-accent-amber bg-accent-amber/30" : "border-white/8 bg-white/[0.03]"
              )} />
              <div className={cn("w-px flex-1 mt-1", idx < bucketKeys.length - 1 ? "bg-white/8" : "bg-transparent")} />
            </div>

            {/* Hour label + cards */}
            <div className="pb-4 flex-1 min-w-0">
              <p className={cn(
                "text-2xs font-medium mb-1.5 -mt-0.5",
                hour < 1 ? "text-accent-amber" : "text-text-subtle"
              )}>
                {hourLabel(hour)} — {hourLabel(hour + 1)}
              </p>
              <div className="space-y-1.5">
                {group.map((p) => (
                  <button
                    key={p.event_id}
                    onClick={() => onSelect?.(p)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-white/8 bg-white/[0.02] hover:bg-white/[0.03] hover:border-zinc-600 transition-all text-left"
                  >
                    <ConfDot value={p.confidence} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-text-primary truncate">
                        {p.participants.home.name}
                        <span className="text-text-subtle mx-1 font-normal">vs</span>
                        {p.participants.away.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge sport={p.sport} className="capitalize text-2xs">{p.sport}</Badge>
                        <span className="text-2xs text-text-muted">{p.league}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="num text-xs font-semibold text-text-primary">{p.confidence}%</p>
                      <p className="text-2xs text-accent-amber">{timeUntil(p.start_time)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
