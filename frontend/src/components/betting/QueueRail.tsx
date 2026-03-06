"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Trash2, TrendingUp, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
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
    <div className="flex items-start gap-2 p-3 rounded-lg border relative group"
         style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)" }}>
      {/* Sport dot */}
      <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
            style={{ background: cfg.color }} />

      <div className="flex-1 min-w-0">
        {/* Match */}
        <p className="text-[11px] text-text-muted leading-tight truncate">{sel.matchLabel}</p>
        {/* Market + selection */}
        <p className="text-xs font-semibold text-text-primary leading-tight mt-0.5">
          {sel.selectionLabel}
          <span className="text-text-muted font-normal"> · {sel.marketName}</span>
        </p>
        {/* Meta */}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs font-mono font-bold text-text-primary">{sel.odds.toFixed(2)}</span>
          {edge !== 0 && (
            <span className="text-[10px] font-semibold"
                  style={{ color: edge > 0 ? "var(--positive)" : "var(--negative)" }}>
              {edge > 0 ? "+" : ""}{edge.toFixed(1)}%
            </span>
          )}
          {soon && (
            <span className="text-[10px]" style={{ color: "var(--warning)" }}>Soon</span>
          )}
        </div>
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-text-muted hover:text-[var(--negative)]"
        aria-label="Remove from queue"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ── Running EV summary ────────────────────────────────────────────────────────

function EvSummary({ queue }: { queue: QueueSelection[] }) {
  const avgOdds = queue.reduce((s, q) => s + q.odds, 0) / queue.length;
  const avgEdge = queue.reduce((s, q) => s + (q.edge ?? 0), 0) / queue.length;
  const parlayOdds = queue.reduce((p, q) => p * q.odds, 1);

  return (
    <div className="grid grid-cols-3 gap-2 p-3 rounded-lg border"
         style={{ background: "rgba(34,211,238,0.04)", borderColor: "rgba(34,211,238,0.12)" }}>
      <div className="text-center">
        <p className="text-[10px] text-text-muted">Avg odds</p>
        <p className="text-xs font-mono font-bold text-text-primary">{avgOdds.toFixed(2)}</p>
      </div>
      <div className="text-center border-x" style={{ borderColor: "rgba(34,211,238,0.12)" }}>
        <p className="text-[10px] text-text-muted">Avg edge</p>
        <p className="text-xs font-bold"
           style={{ color: avgEdge > 0 ? "var(--positive)" : "var(--negative)" }}>
          {avgEdge > 0 ? "+" : ""}{avgEdge.toFixed(1)}%
        </p>
      </div>
      <div className="text-center">
        <p className="text-[10px] text-text-muted">Parlay</p>
        <p className="text-xs font-mono font-bold text-text-primary">{parlayOdds.toFixed(2)}</p>
      </div>
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
        width: "260px",
        borderColor: "var(--border0)",
        background: "linear-gradient(180deg, rgba(8,8,24,0.6) 0%, rgba(4,4,15,0.7) 100%)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
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
        <div className="flex items-center gap-2">
          <TrendingUp size={13} style={{ color: "var(--accent)" }} />
          <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
            Queue
          </span>
          {queue.length > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
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
      <div className="flex flex-col gap-4 p-4 flex-1">
        {isEmpty ? (
          <>
            {/* Empty state copy */}
            <div className="text-center py-4">
              <p className="text-xs font-semibold text-text-primary">Your slip is empty</p>
              <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
                Tap any odds button to add a pick.
              </p>
            </div>

            {/* Top picks auto-populated */}
            <TopPicksMiniModule matches={matches} />
          </>
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
              className="btn btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-70"
            >
              {tracked ? (
                <><CheckCircle2 size={13} /> Tracked!</>
              ) : tracking ? (
                <><Loader2 size={13} className="animate-spin" /> Saving…</>
              ) : (
                <>Track these picks <ChevronRight size={13} /></>
              )}
            </button>

            <p className="text-[10px] text-text-muted text-center leading-relaxed">
              Picks are saved to your Record for performance tracking.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function isWithinHour(iso: string): boolean {
  const diff = new Date(iso).getTime() - Date.now();
  return diff > 0 && diff < 3_600_000;
}
