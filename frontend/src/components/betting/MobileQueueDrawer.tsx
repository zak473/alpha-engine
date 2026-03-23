"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Trash2, TrendingUp, CheckCircle2, Loader2, Zap, Plus, Trophy, BookMarked } from "lucide-react";
import type { BettingMatch, QueueSelection } from "@/lib/betting-types";
import { useBetting } from "./BettingContext";
import { TopPicksMiniModule } from "./TopPicksMiniModule";
import { ChallengePickerModal } from "./ChallengePickerModal";
import { cn } from "@/lib/utils";
import { SPORT_CONFIG } from "@/lib/betting-types";
import { trackPicks } from "@/lib/api";

interface MobileQueueDrawerProps {
  open: boolean;
  onClose: () => void;
  matches: BettingMatch[];
}

function MobileQueueItem({ sel, onRemove }: { sel: QueueSelection; onRemove: () => void }) {
  const cfg = SPORT_CONFIG[sel.sport];
  const edge = sel.edge ?? 0;

  return (
    <div 
      className="flex items-start gap-2.5 p-3 rounded-lg border"
      style={{ 
        background: "rgba(255,255,255,0.03)", 
        borderColor: "rgba(255,255,255,0.08)" 
      }}
    >
      <span 
        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
        style={{ background: cfg.color }} 
      />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-text-muted truncate">{sel.matchLabel}</p>
        <p className="text-sm font-semibold text-text-primary mt-0.5">
          {sel.selectionLabel}
          <span className="text-text-muted font-normal text-xs"> · {sel.marketName}</span>
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm font-mono font-bold text-text-primary">{sel.odds.toFixed(2)}</span>
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
        </div>
      </div>
      <button
        onClick={onRemove}
        className="p-1.5 rounded-md text-text-muted hover:text-[var(--negative)]"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function MobileQueueDrawer({ open, onClose, matches }: MobileQueueDrawerProps) {
  const { queue, removeFromQueue, clearQueue } = useBetting();
  const router = useRouter();
  const [tracking, setTracking] = useState(false);
  const [tracked, setTracked] = useState(false);
  const [challengeModalOpen, setChallengeModalOpen] = useState(false);
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
        onClose();
        router.push("/record");
      }, 1000);
    } catch {
      // silently fail
    } finally {
      setTracking(false);
    }
  };

  // Summary
  const avgOdds = queue.length > 0 ? queue.reduce((s, q) => s + q.odds, 0) / queue.length : 0;
  const avgEdge = queue.length > 0 ? queue.reduce((s, q) => s + (q.edge ?? 0), 0) / queue.length : 0;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 lg:hidden transition-transform duration-300 rounded-t-2xl overflow-hidden",
          open ? "translate-y-0" : "translate-y-full"
        )}
        style={{
          maxHeight: "85vh",
          background: "rgba(8,8,24,0.98)",
          borderTop: "1px solid var(--border0)",
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{ borderColor: "var(--border0)" }}
        >
          <div className="flex items-center gap-2">
            <TrendingUp size={16} style={{ color: queue.length > 0 ? "var(--accent)" : "var(--text1)" }} />
            <span className="text-sm font-bold text-text-primary">Queue</span>
            {queue.length > 0 && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
              >
                {queue.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {queue.length > 0 && (
              <button
                onClick={clearQueue}
                className="text-xs text-text-muted hover:text-[var(--negative)] flex items-center gap-1"
              >
                <Trash2 size={12} /> Clear
              </button>
            )}
            <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-4" style={{ maxHeight: "calc(85vh - 100px)" }}>
          {isEmpty ? (
            <div className="flex flex-col gap-4">
              <div className="text-center py-4">
                <div 
                  className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
                  style={{ 
                    background: "rgba(34,211,238,0.08)",
                    border: "1px solid rgba(34,211,238,0.15)",
                  }}
                >
                  <Plus size={20} style={{ color: "var(--accent)" }} />
                </div>
                <p className="text-sm font-semibold text-text-primary">Your slip is empty</p>
                <p className="text-xs text-text-muted mt-1">
                  Tap odds on any match to add to queue
                </p>
              </div>
              <TopPicksMiniModule matches={matches} />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Queue items */}
              <div className="flex flex-col gap-2">
                {queue.map((sel) => (
                  <MobileQueueItem
                    key={sel.id}
                    sel={sel}
                    onRemove={() => removeFromQueue(sel.id)}
                  />
                ))}
              </div>

              {/* Summary */}
              <div 
                className="grid grid-cols-2 gap-px rounded-lg overflow-hidden"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                <div className="text-center py-3" style={{ background: "rgba(4,4,15,0.6)" }}>
                  <p className="text-[10px] text-text-muted uppercase">Avg Odds</p>
                  <p className="text-sm font-mono font-bold text-text-primary">{avgOdds.toFixed(2)}</p>
                </div>
                <div className="text-center py-3" style={{ background: "rgba(4,4,15,0.6)" }}>
                  <p className="text-[10px] text-text-muted uppercase">Avg Edge</p>
                  <p 
                    className="text-sm font-bold"
                    style={{ color: avgEdge > 0 ? "var(--positive)" : "var(--text0)" }}
                  >
                    {avgEdge > 0 ? "+" : ""}{avgEdge.toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* CTAs */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleTrack}
                  disabled={tracking || tracked}
                  className="btn btn-primary w-full h-12 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {tracked ? (
                    <><CheckCircle2 size={16} /> Tracked!</>
                  ) : tracking ? (
                    <><Loader2 size={16} className="animate-spin" /> Saving...</>
                  ) : (
                    <><BookMarked size={16} /> Add to Tracker</>
                  )}
                </button>
                <button
                  onClick={() => setChallengeModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-bold transition-all"
                  style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" }}
                >
                  <Trophy size={16} /> Post to Challenge
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer tip */}
        <div
          className="px-4 py-3 border-t"
          style={{ borderColor: "var(--border0)" }}
        >
          <div className="flex items-center justify-center gap-2">
            <Zap size={11} style={{ color: "var(--warning)" }} />
            <span className="text-[10px] text-text-muted">
              Track picks to monitor your performance
            </span>
          </div>
        </div>
      </div>

      {challengeModalOpen && (
        <ChallengePickerModal
          queue={queue}
          onClose={() => setChallengeModalOpen(false)}
          onSuccess={clearQueue}
        />
      )}
    </>
  );
}
