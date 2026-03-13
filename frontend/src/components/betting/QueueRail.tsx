"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Trash2, TrendingUp, ChevronRight, CheckCircle2, Loader2, Zap, Plus } from "lucide-react";
import type { BettingMatch, QueueSelection } from "@/lib/betting-types";
import { useBetting } from "./BettingContext";
import { TopPicksMiniModule } from "./TopPicksMiniModule";
import { cn } from "@/lib/utils";
import { SPORT_CONFIG } from "@/lib/betting-types";
import { trackPicks } from "@/lib/api";

// ── Queue item row ────────────────────────────────────────────────────────────

function QueueItem({ sel, onRemove }: { sel: QueueSelection; onRemove: () => void }) {
  const cfg = SPORT_CONFIG[sel.sport];
  const soon = isWithinHour(sel.startTime);
  const edge = sel.edge ?? 0;

  return (
    <div
      className="flex items-start gap-2.5 p-3 rounded-lg border relative group transition-all"
      style={{
        background: "var(--bg2)",
        borderColor: "var(--border0)"
      }}
    >
      {/* Sport dot */}
      <span 
        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
        style={{ background: cfg.color }} 
      />

      <div className="flex-1 min-w-0">
        {/* Match */}
        <p className="text-[11px] text-text-muted leading-tight truncate">{sel.matchLabel}</p>
        {/* Market + selection */}
        <p className="text-xs font-semibold text-text-primary leading-tight mt-1">
          {sel.selectionLabel}
          <span className="text-text-muted font-normal"> · {sel.marketName}</span>
        </p>
        {/* Meta */}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs font-mono font-bold text-text-primary tabular-nums">
            {sel.odds.toFixed(2)}
          </span>
          {edge !== 0 && (
            <span 
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ 
                color: edge > 0 ? "var(--positive)" : "var(--negative)",
                background: edge > 0 ? "var(--positive-dim)" : "var(--negative-dim)",
              }}
            >
              {edge > 0 ? "+" : ""}{edge.toFixed(1)}%
            </span>
          )}
          {soon && (
            <span 
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ color: "var(--warning)", background: "var(--warning-dim)" }}
            >
              Soon
            </span>
          )}
        </div>
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md text-text-muted hover:text-[var(--negative)] hover:bg-[var(--negative-dim)]"
        aria-label="Remove from queue"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ── Running EV summary ────────────────────────────────────────────────────────

function EvSummary({ queue }: { queue: QueueSelection[] }) {
  const n = queue.length || 1; // guard against division by zero
  const avgOdds = queue.reduce((s, q) => s + q.odds, 0) / n;
  const avgEdge = queue.reduce((s, q) => s + (q.edge ?? 0), 0) / n;
  const parlayOdds = queue.reduce((p, q) => p * q.odds, 1);

  return (
    <div 
      className="grid grid-cols-3 gap-px rounded-lg overflow-hidden"
      style={{ 
        background: "var(--bg2)",
        border: "1px solid var(--border0)",
      }}
    >
      <SummaryCell label="Avg odds" value={avgOdds.toFixed(2)} mono />
      <SummaryCell 
        label="Avg edge" 
        value={`${avgEdge > 0 ? "+" : ""}${avgEdge.toFixed(1)}%`} 
        color={avgEdge > 0 ? "var(--positive)" : "var(--negative)"}
      />
      <SummaryCell label="Parlay" value={parlayOdds.toFixed(2)} mono />
    </div>
  );
}

function SummaryCell({ 
  label, 
  value, 
  mono, 
  color 
}: { 
  label: string; 
  value: string; 
  mono?: boolean;
  color?: string;
}) {
  return (
    <div className="text-center py-2.5 px-2" style={{ background: "var(--bg2)" }}>
      <p className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5">{label}</p>
      <p 
        className={cn("text-xs font-bold", mono && "font-mono tabular-nums")}
        style={{ color: color ?? "var(--text0)" }}
      >
        {value}
      </p>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyQueueState({ matches }: { matches: BettingMatch[] }) {
  return (
    <div className="flex flex-col gap-5">
      {/* Helper copy */}
      <div className="text-center py-3">
        <div 
          className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
          style={{ 
            background: "rgba(34, 226, 131, 0.14)",
            border: "1px solid rgba(24, 206, 116, 0.22)",
          }}
        >
          <Plus size={20} style={{ color: "var(--accent)" }} />
        </div>
        <p className="text-sm font-semibold text-text-primary">Your slip is empty</p>
        <p className="text-[11px] text-text-muted mt-1 leading-relaxed px-2">
          Tap any odds button on a match card to add it to your queue.
        </p>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2 px-2">
        <div className="flex-1 h-px" style={{ background: "var(--border0)" }} />
        <span className="text-[9px] text-text-subtle uppercase tracking-widest">or try these</span>
        <div className="flex-1 h-px" style={{ background: "var(--border0)" }} />
      </div>

      {/* Top picks module */}
      <TopPicksMiniModule matches={matches} />
    </div>
  );
}

// ── Main QueueRail ────────────────────────────────────────────────────────────

interface QueueRailProps {
  matches: BettingMatch[];
}

export function QueueRail({ matches }: QueueRailProps) {
  const { queue, removeFromQueue, clearQueue } = useBetting();
  const router = useRouter();
  const [tracking, setTracking] = useState(false);
  const [tracked, setTracked] = useState(false);
  const isEmpty = queue.length === 0;

  const handleTrack = async () => {
    if (tracking || queue.length === 0) return;
    setTracking(true);
    try {
      await trackPicks(queue.map((sel) => ({
        match_id:        sel.matchId,
        match_label:     sel.matchLabel,
        sport:           sel.sport,
        league:          sel.league,
        start_time:      sel.startTime,
        market_name:     sel.marketName,
        selection_label: sel.selectionLabel,
        odds:            sel.odds,
        edge:            sel.edge ?? undefined,
      })));
      setTracked(true);
      clearQueue();
      setTimeout(() => {
        setTracked(false);
        router.push("/record");
      }, 1200);
    } catch {
      // silently fail — queue persists so user can retry
    } finally {
      setTracking(false);
    }
  };

  return (
    <aside
      className="hidden lg:flex flex-col gap-0 flex-shrink-0 border-l"
      style={{
        width: "280px",
        borderColor: "var(--border0)",
        background: "var(--bg1)",
        boxShadow: "inset 1px 0 0 var(--border0)",
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: "var(--border0)" }}
      >
        <div className="flex items-center gap-2.5">
          <div 
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ 
              background: queue.length > 0 
                ? "#22e283"
                : "var(--bg2)",
            }}
          >
            <TrendingUp size={12} color={queue.length > 0 ? "#0f2418" : "var(--text1)"} />
          </div>
          <span className="text-xs font-bold text-text-primary">
            Queue
          </span>
          {queue.length > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
            >
              {queue.length}
            </span>
          )}
        </div>
        {queue.length > 0 && (
          <button
            onClick={clearQueue}
            className="flex items-center gap-1 text-[10px] text-text-muted hover:text-[var(--negative)] transition-colors"
          >
            <Trash2 size={11} />
            Clear
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 p-4 flex-1 overflow-y-auto">
        {isEmpty ? (
          <EmptyQueueState matches={matches} />
        ) : (
          <>
            {/* Queue items */}
            <div className="flex flex-col gap-2">
              {queue.map((sel) => (
                <QueueItem
                  key={sel.id}
                  sel={sel}
                  onRemove={() => removeFromQueue(sel.id)}
                />
              ))}
            </div>

            {/* EV summary */}
            <EvSummary queue={queue} />

            {/* Track CTA */}
            <button
              onClick={handleTrack}
              disabled={tracking || tracked}
              className="btn btn-primary w-full flex items-center justify-center gap-2 h-10 disabled:opacity-70"
            >
              {tracked ? (
                <><CheckCircle2 size={14} /> Tracked!</>
              ) : tracking ? (
                <><Loader2 size={14} className="animate-spin" /> Saving...</>
              ) : (
                <>Track picks <ChevronRight size={14} /></>
              )}
            </button>

            <p className="text-[10px] text-text-muted text-center leading-relaxed">
              Picks are saved to your Record for performance tracking.
            </p>
          </>
        )}
      </div>

      {/* Footer hint */}
      <div 
        className="px-4 py-3 border-t flex-shrink-0"
        style={{ borderColor: "var(--border0)" }}
      >
        <div className="flex items-center gap-2">
          <Zap size={11} style={{ color: "var(--accent)" }} />
          <span className="text-[10px] text-text-muted">
            Track picks to monitor your ROI over time
          </span>
        </div>
      </div>
    </aside>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function isWithinHour(iso: string): boolean {
  const diff = new Date(iso).getTime() - Date.now();
  return diff > 0 && diff < 3_600_000;
}
