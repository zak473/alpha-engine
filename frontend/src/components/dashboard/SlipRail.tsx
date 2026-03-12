"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cn, timeUntil, sportColor } from "@/lib/utils";
import { CheckCircle2, XCircle, Trophy, AlertCircle, AlertTriangle, CheckCircle, PanelRightClose, PanelRightOpen, Star, X } from "lucide-react";
import type { QueueItem } from "./DecisionQueue";
import type { MvpPrediction, MvpPerformance } from "@/lib/types";

// ── Compact watchlist (reads from localStorage) ───────────────────────────────

const WATCHLIST_KEY = "ae_watchlist_v1";

interface WatchEntry { id: string; name: string; sport: string; }

function useCompactWatchlist() {
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WATCHLIST_KEY);
      if (raw) setEntries(JSON.parse(raw));
    } catch {}
    // Also listen for storage changes from TopSignalsTable watchlist adds
    function onStorage(e: StorageEvent) {
      if (e.key === WATCHLIST_KEY && e.newValue) {
        try { setEntries(JSON.parse(e.newValue)); } catch {}
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function remove(id: string) {
    const next = entries.filter((e) => e.id !== id);
    setEntries(next);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
  }

  return { entries, remove };
}

// ── Alert item ────────────────────────────────────────────────────────────────

interface AlertItem {
  id: string;
  level: "error" | "warn" | "info";
  message: string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface SlipRailProps {
  queueItems: QueueItem[];
  onApprove: (id: string) => void;
  onSkip: (id: string) => void;
  predictions: MvpPrediction[];
  performance: MvpPerformance | null;
  systemStatus: { api: boolean; db: boolean; env: string };
  modelStaleDays: number | null;
  expiringCount: number;
  challengeEndingName?: string;
  open: boolean;
  onToggle: () => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export function SlipRail({
  queueItems,
  onApprove,
  onSkip,
  predictions,
  performance,
  systemStatus,
  modelStaleDays,
  expiringCount,
  challengeEndingName,
  open,
  onToggle,
}: SlipRailProps) {
  const { entries: watchlist, remove: removeWatch } = useCompactWatchlist();

  // Build alerts
  const alerts: AlertItem[] = [];
  if (!systemStatus.api || !systemStatus.db) alerts.push({ id: "pipeline", level: "error", message: systemStatus.api ? "DB unavailable" : "API offline — data may be stale" });
  if (modelStaleDays !== null && modelStaleDays > 14) alerts.push({ id: "stale", level: "warn", message: `Model stale — ${modelStaleDays}d since training` });
  if (expiringCount > 0) alerts.push({ id: "expire", level: "warn", message: `${expiringCount} event${expiringCount > 1 ? "s" : ""} starting in < 2h` });
  if (challengeEndingName) alerts.push({ id: "challenge", level: "info", message: `Challenge ending soon: ${challengeEndingName}` });

  const sorted = [...queueItems].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  // Collapsed icon-only mode
  if (!open) {
    return (
      <div className="w-9 flex flex-col items-center py-3 gap-3 border-l border-surface-border bg-surface-raised shrink-0">
        <button onClick={onToggle} title="Expand slip" className="text-text-subtle hover:text-text-muted transition-colors">
          <PanelRightOpen size={15} />
        </button>
        {queueItems.length > 0 && (
          <div className="w-5 h-5 rounded-full bg-accent-teal/20 border border-accent-teal/30 flex items-center justify-center">
            <span className="text-[9px] font-bold text-accent-teal">{queueItems.length}</span>
          </div>
        )}
        {alerts.some((a) => a.level === "error") && <div className="w-2 h-2 rounded-full bg-accent-red animate-pulse" />}
        {alerts.some((a) => a.level === "warn")  && <div className="w-2 h-2 rounded-full bg-accent-amber" />}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col border-l border-surface-border bg-surface-raised overflow-hidden shrink-0"
      style={{ width: "var(--slip-rail-width)" }}
    >
      {/* Header */}
      <div className="rail-header">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">Queue</span>
          {queueItems.length > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent-teal/20 text-accent-teal text-[9px] font-bold">
              {queueItems.length}
            </span>
          )}
        </div>
        <button onClick={onToggle} className="text-text-subtle hover:text-text-muted transition-colors">
          <PanelRightClose size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Queue items */}
        <section>
          {sorted.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-[12px] text-text-muted">Queue is empty</p>
              <p className="text-[10px] text-text-subtle mt-1">Click any odds button to add a pick</p>
            </div>
          ) : (
            <div>
              {sorted.map((item) => {
                const isUrgent = new Date(item.startTime).getTime() - Date.now() < 3_600_000;
                return (
                  <div key={item.eventId} className="px-3 py-2.5 border-b border-surface-border hover:bg-white/[0.015] transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-text-primary truncate">{item.home} vs {item.away}</p>
                        <p className="text-[11px] text-text-muted mt-0.5">
                          Lean: <span className="text-text-primary font-medium">{item.pick} ({item.pickPct}%)</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => onApprove(item.eventId)} title="Approve" className="p-1 rounded hover:bg-accent-green/10 text-text-subtle hover:text-accent-green transition-colors">
                          <CheckCircle2 size={13} />
                        </button>
                        <button onClick={() => onSkip(item.eventId)} title="Skip" className="p-1 rounded hover:bg-accent-red/10 text-text-subtle hover:text-accent-red transition-colors">
                          <XCircle size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className={cn("font-medium", item.edge > 0 ? "text-accent-teal" : "text-accent-red")}>
                        {item.edge > 0 ? "+" : ""}{item.edge}% edge
                      </span>
                      <span className="text-text-subtle">·</span>
                      <span className={cn("font-medium", isUrgent ? "text-accent-amber" : "text-text-subtle")}>
                        {timeUntil(item.startTime)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* CTA */}
              <div className="p-3">
                <Link href="/challenges" className="btn-cta w-full text-[12px] py-2">
                  <Trophy size={13} />
                  Create challenge from queue
                </Link>
                <button
                  onClick={() => sorted.forEach((i) => onSkip(i.eventId))}
                  className="mt-1.5 w-full text-center text-[11px] text-text-subtle hover:text-text-muted transition-colors py-1"
                >
                  Clear all
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Divider */}
        <div className="border-t border-surface-border" />

        {/* Compact watchlist */}
        <section>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-subtle">Watchlist</span>
            <span className="num text-[10px] text-text-subtle">{watchlist.length}</span>
          </div>
          {watchlist.length === 0 ? (
            <p className="px-3 pb-3 text-[11px] text-text-subtle">No items — star a pick to watch</p>
          ) : (
            <div>
              {watchlist.slice(0, 5).map((entry) => {
                const next = predictions.find((p) => {
                  const now = Date.now();
                  const isHome = p.participants.home.name.toLowerCase().includes(entry.name.toLowerCase()) || p.participants.home.id === entry.id;
                  const isAway = p.participants.away.name.toLowerCase().includes(entry.name.toLowerCase()) || p.participants.away.id === entry.id;
                  return (isHome || isAway) && new Date(p.start_time).getTime() > now;
                });
                return (
                  <div key={entry.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-surface-border/40 group/we hover:bg-white/[0.015] transition-colors">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: sportColor(entry.sport) }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-text-primary truncate">{entry.name}</p>
                      {next ? (
                        <p className="text-[10px] text-text-subtle truncate">
                          vs {next.participants.home.id === entry.id ? next.participants.away.name : next.participants.home.name}
                          {" · "}<span className="text-accent-amber">{timeUntil(next.start_time)}</span>
                        </p>
                      ) : (
                        <p className="text-[10px] text-text-subtle">No upcoming fixture</p>
                      )}
                    </div>
                    <button onClick={() => removeWatch(entry.id)} className="shrink-0 p-1 text-text-subtle hover:text-text-muted opacity-0 group-hover/we:opacity-100 transition-all">
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
              {watchlist.length > 5 && (
                <Link href="/dashboard" className="block px-3 py-1.5 text-[10px] text-text-subtle hover:text-text-muted transition-colors">
                  +{watchlist.length - 5} more →
                </Link>
              )}
            </div>
          )}
        </section>

        {/* Divider */}
        {alerts.length > 0 && <div className="border-t border-surface-border" />}

        {/* Alerts */}
        {alerts.length > 0 && (
          <section>
            <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-text-subtle">Alerts</p>
            <div className="space-y-0">
              {alerts.map((a) => {
                const Icon = a.level === "error" ? AlertCircle : a.level === "warn" ? AlertTriangle : CheckCircle;
                const color = a.level === "error" ? "text-accent-red" : a.level === "warn" ? "text-accent-amber" : "text-accent-green";
                return (
                  <div key={a.id} className="flex items-start gap-2 px-3 py-2 border-b border-surface-border/40">
                    <Icon size={11} className={cn("shrink-0 mt-0.5", color)} />
                    <p className="text-[11px] text-text-muted leading-snug">{a.message}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
