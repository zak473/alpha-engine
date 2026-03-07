"use client";

import { cn, timeUntil } from "@/lib/utils";
import { PanelCard } from "@/components/ui/PanelCard";
import { CheckCircle2, XCircle, Trophy, Inbox } from "lucide-react";
import Link from "next/link";

export interface QueueItem {
  eventId: string;
  sport: string;
  home: string;
  away: string;
  pick: string;
  pickPct: number;
  confidence: number;
  edge: number;
  startTime: string;
}

interface DecisionQueueProps {
  items: QueueItem[];
  onApprove: (id: string) => void;
  onSkip: (id: string) => void;
}

export function DecisionQueue({ items, onApprove, onSkip }: DecisionQueueProps) {
  const sorted = [...items].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  return (
    <PanelCard
      title="Decision Queue"
      subtitle={`${items.length} pending decision${items.length !== 1 ? "s" : ""}`}
      padding="flush"
      action={
        items.length > 0 ? (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent-amber/20 text-accent-amber text-2xs font-bold">
            {items.length}
          </span>
        ) : undefined
      }
    >
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Inbox size={20} className="text-text-subtle" />
          <p className="text-xs text-text-muted">Queue is empty</p>
          <p className="text-2xs text-text-subtle">Add picks from Top Signals (Q key)</p>
        </div>
      ) : (
        <div className="divide-y divide-surface-border/50">
          {sorted.map((item) => {
            const isUrgent = new Date(item.startTime).getTime() - Date.now() < 3_600_000;
            return (
              <div key={item.eventId} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.015] transition-colors">
                {/* Match info */}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-text-primary truncate">
                    {item.home} vs {item.away}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-2xs text-text-muted">
                      Lean: <span className="text-text-primary font-medium">{item.pick} ({item.pickPct}%)</span>
                    </span>
                    <span className="text-text-subtle text-2xs">·</span>
                    <span className={cn(
                      "num text-2xs font-medium",
                      item.edge > 0 ? "text-accent-green" : "text-accent-red"
                    )}>
                      {item.edge > 0 ? "+" : ""}{item.edge}% edge
                    </span>
                    <span className="text-text-subtle text-2xs">·</span>
                    <span className={cn("text-2xs", isUrgent ? "text-accent-amber font-medium" : "text-text-muted")}>
                      {timeUntil(item.startTime)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="shrink-0 flex items-center gap-1">
                  <button
                    onClick={() => onApprove(item.eventId)}
                    title="Approve — add to challenge"
                    className="p-1.5 rounded-lg hover:bg-accent-green/10 text-text-subtle hover:text-accent-green transition-colors"
                  >
                    <CheckCircle2 size={14} />
                  </button>
                  <button
                    onClick={() => onSkip(item.eventId)}
                    title="Skip"
                    className="p-1.5 rounded-lg hover:bg-accent-red/10 text-text-subtle hover:text-accent-red transition-colors"
                  >
                    <XCircle size={14} />
                  </button>
                  <Link
                    href="/challenges"
                    title="Add to challenge"
                    className="p-1.5 rounded-lg hover:bg-accent-purple/10 text-text-subtle hover:text-accent-purple transition-colors"
                  >
                    <Trophy size={14} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}
