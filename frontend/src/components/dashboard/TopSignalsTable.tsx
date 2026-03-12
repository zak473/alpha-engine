"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { cn, fmtPct, timeUntil } from "@/lib/utils";
import { PanelCard } from "@/components/ui/PanelCard";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { computeEdge } from "@/lib/api";
import type { MvpPrediction } from "@/lib/types";
import { TimelineView } from "./TimelineView";
import type { QueueItem } from "./DecisionQueue";
import {
  ChevronDown,
  ChevronRight,
  Inbox,
  Star,
  Eye,
  Plus,
  ListOrdered,
  Clock,
  Layers,
  CheckSquare,
  Square,
  ArrowUpDown,
  GitCompare,
  Info,
  ChevronUp,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function impliedPick(p: MvpPrediction): { label: string; pct: number } {
  const { home_win, draw, away_win } = p.probabilities;
  if (home_win >= away_win && home_win >= draw) return { label: p.participants.home.name, pct: Math.round(home_win * 100) };
  if (away_win >= home_win && away_win >= draw) return { label: p.participants.away.name, pct: Math.round(away_win * 100) };
  return { label: "Draw", pct: Math.round(draw * 100) };
}

function pickEdge(p: MvpPrediction): number {
  const m = p.market_odds;
  if (!m) return 0;
  const { home_win, draw, away_win } = p.probabilities;
  if (home_win >= away_win && home_win >= draw) return computeEdge(home_win, m.home_win);
  if (away_win >= home_win && away_win >= draw) return computeEdge(away_win, m.away_win);
  return computeEdge(draw, m.draw);
}

function volatility(p: MvpPrediction): "Stable" | "Swingy" | null {
  if (!p.simulation?.distribution?.length) return null;
  const maxP = Math.max(...p.simulation.distribution.map((d) => d.probability));
  return maxP >= 0.13 ? "Stable" : "Swingy";
}

function timePressure(p: MvpPrediction): { label: string; level: "urgent" | "soon" | "normal" } {
  const ms = new Date(p.start_time).getTime() - Date.now();
  if (ms < 1_800_000)  return { label: `Locks in ${Math.max(1, Math.floor(ms / 60000))}m`, level: "urgent" };
  if (ms < 7_200_000)  return { label: timeUntil(p.start_time), level: "soon"   };
  return                     { label: timeUntil(p.start_time), level: "normal" };
}

function explainNarrative(p: MvpPrediction): string {
  if (!p.key_drivers?.length) return "No explanation available for this prediction.";
  const top = p.key_drivers.slice(0, 3);
  const parts = top.map((d) => {
    const v = d.value ?? 0;
    const sign = v >= 0 ? "+" : "";
    return `${d.feature.replace(/_/g, " ")}: ${sign}${v.toFixed(2)} (${(d.importance * 100).toFixed(0)}% weight)`;
  });
  const pick = impliedPick(p);
  return `Model leans ${pick.label} (${pick.pct}%) — top factors: ${parts.join(", ")}.`;
}

const STORAGE_KEY = "ae_watchlist_v1";
function addToWatchlist(entry: { id: string; name: string; sport: string }) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const entries: typeof entry[] = raw ? JSON.parse(raw) : [];
    if (!entries.find((e) => e.id === entry.id)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...entries, entry]));
    }
  } catch {}
}

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfBadge({ value }: { value: number }) {
  if (value >= 80) return <span className="inline-flex px-1.5 py-0.5 rounded text-2xs font-semibold bg-accent-green/15 text-accent-green border border-accent-green/25">HIGH</span>;
  if (value >= 65) return <span className="inline-flex px-1.5 py-0.5 rounded text-2xs font-semibold bg-accent-amber/15 text-accent-amber border border-accent-amber/25">MED</span>;
  return <span className="inline-flex px-1.5 py-0.5 rounded text-2xs font-semibold bg-surface-border/50 text-text-muted border border-surface-border">LOW</span>;
}

// ── Mini prob bar ─────────────────────────────────────────────────────────────

function MiniProbBar({ pH, pD, pA }: { pH: number; pD: number; pA: number }) {
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden w-16 gap-px">
      <div className="bg-accent-green" style={{ width: `${pH * 100}%` }} />
      {pD > 0 && <div className="bg-accent-amber" style={{ width: `${pD * 100}%` }} />}
      <div className="bg-accent-red" style={{ width: `${pA * 100}%` }} />
    </div>
  );
}

// ── Prediction drawer ─────────────────────────────────────────────────────────

function PredictionDrawer({ p, mode }: { p: MvpPrediction; mode: SignalMode }) {
  const { probabilities: prob, fair_odds: odds, key_drivers: drivers, simulation: sim } = p;
  const [showExplain, setShowExplain] = useState(false);
  const marketOdds = p.market_odds ?? undefined;
  const edge = pickEdge(p);
  const pick = impliedPick(p);

  return (
    <div className="bg-surface-base/60 border-y border-surface-border">
      {/* Top callout row */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent-blue/10 border border-accent-blue/20">
          <span className="text-2xs text-text-muted">Edge</span>
          <span className={cn("num text-sm font-semibold", edge > 0 ? "text-accent-blue" : "text-text-muted")}>
            {edge > 0 ? "+" : ""}{edge}%
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-overlay border border-surface-border">
          <span className="text-2xs text-text-muted">Lean</span>
          <span className="text-xs font-medium text-text-primary">{pick.label} ({pick.pct}%)</span>
        </div>
        {p.model?.version && (
          <span className="text-2xs text-text-subtle font-mono ml-auto">{p.model.version}</span>
        )}
      </div>

      {/* 3 mini-cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 pb-3">
        {/* Card 1: Probabilities + odds */}
        <div className="bg-surface-overlay rounded-lg border border-surface-border p-3 space-y-2">
          <p className="label">Win Probabilities</p>
          {[
            { label: "Home", name: p.participants.home.name, value: prob.home_win, marketOdds: marketOdds?.home_win, color: "#22c55e" },
            ...(prob.draw > 0 ? [{ label: "Draw", name: "Draw", value: prob.draw, marketOdds: marketOdds?.draw, color: "#f59e0b" }] : []),
            { label: "Away", name: p.participants.away.name, value: prob.away_win, marketOdds: marketOdds?.away_win, color: "#ef4444" },
          ].map(({ label, name, value, marketOdds: mkt, color }) => {
            const mktImplied = mkt && mkt > 0 ? (1 / mkt) : null;
            return (
              <div key={label}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-text-muted truncate max-w-[100px]">{name}</span>
                  <div className="flex items-center gap-1.5">
                    {mode === "edge" && mktImplied && (
                      <span className="text-2xs text-text-subtle">{fmtPct(mktImplied)} mkt</span>
                    )}
                    <span className="num text-xs font-semibold" style={{ color }}>{fmtPct(value)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${value * 100}%`, backgroundColor: color }} />
                </div>
              </div>
            );
          })}
          {odds && (
            <div className="pt-2 border-t border-surface-border">
              <p className="label mb-1">Fair Odds</p>
              <div className="flex gap-3">
                {odds.home_win > 0 && <div className="text-center"><p className="num text-sm font-semibold text-text-primary">{odds.home_win.toFixed(2)}</p><p className="text-2xs text-text-muted">Home</p></div>}
                {odds.draw    > 0 && <div className="text-center"><p className="num text-sm font-semibold text-text-primary">{odds.draw.toFixed(2)}</p><p className="text-2xs text-text-muted">Draw</p></div>}
                {odds.away_win > 0 && <div className="text-center"><p className="num text-sm font-semibold text-text-primary">{odds.away_win.toFixed(2)}</p><p className="text-2xs text-text-muted">Away</p></div>}
              </div>
            </div>
          )}
        </div>

        {/* Card 2: Key Drivers */}
        <div className="bg-surface-overlay rounded-lg border border-surface-border p-3 space-y-2">
          <p className="label">Key Drivers</p>
          {drivers?.length ? (
            <div className="space-y-2.5">
              {drivers.slice(0, 4).map((d) => (
                <div key={d.feature} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-text-muted font-mono truncate max-w-[120px]">{d.feature.replace(/_/g, " ")}</span>
                    <span className="num text-xs text-text-primary shrink-0 ml-1">{(d.importance * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1 bg-surface-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-accent-blue/70" style={{ width: `${d.importance * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted">No driver data</p>
          )}

          {/* Explain this */}
          <div className="pt-2 border-t border-surface-border">
            <button
              onClick={() => setShowExplain((v) => !v)}
              className="flex items-center gap-1 text-2xs text-accent-blue hover:text-accent-blue/80 transition-colors"
            >
              <Info size={10} />
              {showExplain ? "Hide explanation" : "Explain this →"}
            </button>
            {showExplain && (
              <p className="text-xs text-text-muted mt-2 leading-relaxed">
                {explainNarrative(p)}
              </p>
            )}
          </div>
        </div>

        {/* Card 3: Simulation */}
        <div className="bg-surface-overlay rounded-lg border border-surface-border p-3 space-y-2">
          <p className="label">Score Simulation</p>
          {sim ? (
            <>
              <div className="flex gap-4 mb-2">
                <div>
                  <p className="num text-base font-semibold text-text-primary">{sim.mean_home_goals.toFixed(1)}</p>
                  <p className="text-2xs text-text-muted">Exp. home</p>
                </div>
                <div className="text-text-subtle flex items-center">–</div>
                <div>
                  <p className="num text-base font-semibold text-text-primary">{sim.mean_away_goals.toFixed(1)}</p>
                  <p className="text-2xs text-text-muted">Exp. away</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {sim.distribution.slice(0, 5).map((d) => (
                  <div key={d.score} className="flex items-center gap-2">
                    <span className="num text-xs font-medium text-text-primary w-8 shrink-0">{d.score}</span>
                    <div className="flex-1 h-1 bg-surface-border rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-accent-purple/60" style={{ width: `${Math.min(d.probability * 500, 100)}%` }} />
                    </div>
                    <span className="num text-2xs text-text-muted w-8 text-right">{fmtPct(d.probability)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-text-muted">No simulation available</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SignalMode = "confidence" | "edge";
type SortKey = "confidence" | "time" | "sport" | "edge";
type ViewMode = "list" | "timeline";

// ── Props ─────────────────────────────────────────────────────────────────────

interface TopSignalsTableProps {
  predictions: MvpPrediction[];
  loading?: boolean;
  entityFilter?: string | null;
  mode?: SignalMode;
  onModeChange?: (m: SignalMode) => void;
  compareItems?: string[];
  onCompareToggle?: (id: string) => void;
  onQueueAdd?: (item: QueueItem) => void;
  searchRef?: React.RefObject<HTMLInputElement>;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function TopSignalsTable({
  predictions,
  loading,
  entityFilter,
  mode = "confidence",
  onModeChange,
  compareItems = [],
  onCompareToggle,
  onQueueAdd,
  searchRef,
}: TopSignalsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("confidence");
  const [watchlistedIds, setWatchlistedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  function handleWatchlist(p: MvpPrediction, e: React.MouseEvent) {
    e.stopPropagation();
    addToWatchlist({ id: p.participants.home.id, name: p.participants.home.name, sport: p.sport });
    setWatchlistedIds((prev) => new Set(prev).add(p.event_id));
  }

  // Apply entity filter
  const prefiltered = entityFilter
    ? predictions.filter((p) => {
        const q = entityFilter.toLowerCase();
        return p.participants.home.name.toLowerCase().includes(q) || p.participants.away.name.toLowerCase().includes(q);
      })
    : predictions;

  // Sort
  const sorted = [...prefiltered].sort((a, b) => {
    if (sortBy === "confidence" || mode === "confidence") {
      if (sortBy === "confidence") return b.confidence - a.confidence;
    }
    if (sortBy === "edge") return pickEdge(b) - pickEdge(a);
    if (sortBy === "time") return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    if (sortBy === "sport") return a.sport.localeCompare(b.sport);
    return b.confidence - a.confidence;
  }).slice(0, 10);

  // ── Keyboard navigation ───────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "/") {
        e.preventDefault();
        searchRef?.current?.focus();
        return;
      }
      if (e.key === "a" || e.key === "A") return; // handled in DashboardShell

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, sorted.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const p = sorted[selectedIdx];
        if (p) toggle(p.event_id);
      }
      if (e.key === "w" || e.key === "W") {
        const p = sorted[selectedIdx];
        if (p) {
          addToWatchlist({ id: p.participants.home.id, name: p.participants.home.name, sport: p.sport });
          setWatchlistedIds((prev) => new Set(prev).add(p.event_id));
        }
      }
      if (e.key === "q" || e.key === "Q") {
        const p = sorted[selectedIdx];
        if (p && onQueueAdd) {
          const pick = impliedPick(p);
          onQueueAdd({ eventId: p.event_id, sport: p.sport, home: p.participants.home.name, away: p.participants.away.name, pick: pick.label, pickPct: pick.pct, confidence: p.confidence, edge: pickEdge(p), startTime: p.start_time });
        }
      }
      if (e.key === "c" || e.key === "C") {
        const p = sorted[selectedIdx];
        if (p && onCompareToggle) onCompareToggle(p.event_id);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sorted, selectedIdx, onQueueAdd, onCompareToggle, searchRef]);

  // ── Sort controls ─────────────────────────────────────────────────────────

  const SORT_OPTIONS: { label: string; value: SortKey }[] = [
    { label: "Confidence", value: "confidence" },
    { label: "Edge",       value: "edge"       },
    { label: "Time",       value: "time"       },
    { label: "Sport",      value: "sport"      },
  ];

  const headerAction = (
    <div className="flex items-center gap-1.5">
      {/* Mode toggle */}
      {onModeChange && (
        <div className="flex items-center gap-0.5 bg-surface-overlay border border-surface-border rounded-md p-0.5">
          <button
            onClick={() => onModeChange("confidence")}
            className={cn("px-2 py-0.5 rounded text-2xs transition-colors", mode === "confidence" ? "bg-accent-blue/15 text-accent-blue" : "text-text-muted hover:text-text-primary")}
          >
            Conf
          </button>
          <button
            onClick={() => onModeChange("edge")}
            className={cn("px-2 py-0.5 rounded text-2xs transition-colors", mode === "edge" ? "bg-accent-green/15 text-accent-green" : "text-text-muted hover:text-text-primary")}
          >
            Edge
          </button>
        </div>
      )}
      {/* View toggle */}
      <button
        onClick={() => setViewMode((v) => v === "list" ? "timeline" : "list")}
        title={viewMode === "list" ? "Switch to timeline view" : "Switch to list view"}
        className={cn("p-1 rounded text-text-subtle hover:text-text-muted transition-colors", viewMode === "timeline" && "text-accent-blue")}
      >
        {viewMode === "list" ? <Clock size={12} /> : <ListOrdered size={12} />}
      </button>
      {/* Sort */}
      <ArrowUpDown size={11} className="text-text-subtle" />
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setSortBy(opt.value)}
          className={cn("text-2xs px-1.5 py-0.5 rounded transition-colors", sortBy === opt.value ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/25" : "text-text-muted hover:text-text-primary")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PanelCard title="Top Signals" subtitle="By confidence" padding="flush">
        <div className="divide-y divide-surface-border/50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="w-4 h-4" />
              <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-48" /><Skeleton className="h-2.5 w-32" /></div>
              <Skeleton className="h-5 w-10" />
            </div>
          ))}
        </div>
      </PanelCard>
    );
  }

  // ── Compare indicator ──────────────────────────────────────────────────────

  const compareCount = compareItems.length;

  // ── Timeline view ──────────────────────────────────────────────────────────

  if (viewMode === "timeline") {
    return (
      <PanelCard
        title="Top Signals"
        subtitle="Timeline — next 24 hours"
        padding="flush"
        action={headerAction}
      >
        <TimelineView
          predictions={sorted}
          onSelect={(p: MvpPrediction) => { setViewMode("list"); toggle(p.event_id); }}
        />
      </PanelCard>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────

  return (
    <PanelCard
      title="Top Signals"
      subtitle={entityFilter ? `Filtered: ${entityFilter}` : mode === "edge" ? "Sorted by model edge vs market" : "Ranked by model confidence"}
      padding="flush"
      action={headerAction}
    >
      {/* Compare CTA */}
      {compareCount >= 2 && onCompareToggle && (
        <div className="px-4 py-2 bg-accent-blue/8 border-b border-accent-blue/20 flex items-center justify-between">
          <span className="text-xs text-accent-blue">{compareCount} picks selected</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onCompareToggle("__open__")}
              className="flex items-center gap-1 text-xs font-medium text-accent-blue hover:text-accent-blue/80 transition-colors"
            >
              <GitCompare size={11} />
              Compare ({compareCount})
            </button>
            <button
              onClick={() => onCompareToggle("__clear__")}
              className="text-2xs text-text-muted hover:text-text-primary transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState icon={Inbox} title="No predictions available" description="Predictions will appear once the pipeline has run." />
      ) : (
        <div className="divide-y divide-surface-border/50">
          {sorted.map((p, idx) => {
            const expanded  = expandedId === p.event_id;
            const isKeyboard = selectedIdx === idx;
            const isUrgent  = new Date(p.start_time).getTime() - Date.now() < 1_800_000;
            const pick      = impliedPick(p);
            const edge      = pickEdge(p);
            const vol       = volatility(p);
            const tp        = timePressure(p);
            const isWatched = watchlistedIds.has(p.event_id);
            const isCompare = compareItems.includes(p.event_id);

            return (
              <div key={p.event_id} className={cn("group/row", isKeyboard && !expanded && "bg-white/[0.015]")}>
                {/* Row */}
                <button
                  onClick={() => window.open(`/sports/${p.sport}/matches/${p.event_id}`, "_blank")}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors",
                    "hover:bg-white/[0.025]",
                    expanded && "bg-white/[0.02]"
                  )}
                >
                  {/* Compare checkbox */}
                  {onCompareToggle && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onCompareToggle(p.event_id); }}
                      className="shrink-0 text-text-subtle hover:text-text-muted transition-colors"
                      title="Select for comparison"
                    >
                      {isCompare
                        ? <CheckSquare size={13} className="text-accent-blue" />
                        : <Square size={13} />}
                    </button>
                  )}

                  {/* Expand indicator */}
                  <span className="shrink-0 text-text-subtle">
                    {expanded ? <ChevronDown size={13} className="text-accent-blue" /> : <ChevronRight size={13} />}
                  </span>

                  {/* Match info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-text-primary leading-tight">
                        {p.participants.home.name}
                        <span className="text-text-subtle mx-1.5 font-normal text-xs">vs</span>
                        {p.participants.away.name}
                      </span>
                      <ConfBadge value={p.confidence} />
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <Badge sport={p.sport} className="capitalize text-2xs">{p.sport}</Badge>
                      <span className="text-2xs text-text-muted truncate">{p.league}</span>
                      <span className="text-text-subtle text-2xs">·</span>
                      <span className={cn("text-2xs font-medium", tp.level === "urgent" ? "text-accent-red" : tp.level === "soon" ? "text-accent-amber" : "text-text-muted")}>
                        {tp.label}
                      </span>
                      {isUrgent && <span className="text-2xs text-accent-red font-medium animate-pulse">LOCKING</span>}
                    </div>
                    <p className="text-2xs text-text-subtle mt-0.5">
                      Lean: <span className="text-text-muted font-medium">{pick.label} ({pick.pct}%)</span>
                      {vol && <span className="ml-2 text-text-subtle">· <span className={vol === "Stable" ? "text-accent-green/70" : "text-accent-amber/70"}>{vol}</span></span>}
                    </p>
                  </div>

                  {/* Mini prob bar */}
                  <div className="hidden sm:block shrink-0">
                    <MiniProbBar pH={p.probabilities.home_win} pD={p.probabilities.draw} pA={p.probabilities.away_win} />
                  </div>

                  {/* Edge or confidence value */}
                  <div className="shrink-0 text-right hidden md:block w-16">
                    {mode === "edge" ? (
                      <div>
                        <span className={cn("num text-sm font-semibold", edge > 0 ? "text-accent-green" : edge < 0 ? "text-accent-red" : "text-text-muted")}>
                          {edge > 0 ? "+" : ""}{edge}%
                        </span>
                        <p className="text-2xs text-text-subtle">edge</p>
                      </div>
                    ) : (
                      <span className="num text-sm font-semibold text-text-primary">{p.confidence}%</span>
                    )}
                  </div>

                  {/* Hover quick actions */}
                  <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                    <button
                      title={isWatched ? "Added to watchlist" : "Add to watchlist (W)"}
                      onClick={(e) => handleWatchlist(p, e)}
                      className={cn("p-1.5 rounded hover:bg-white/[0.06] transition-colors", isWatched ? "text-accent-amber" : "text-text-subtle hover:text-text-muted")}
                    >
                      <Star size={12} fill={isWatched ? "currentColor" : "none"} />
                    </button>
                    <Link href={`/sports/${p.sport}/matches/${p.event_id}`} onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer" title="View match" className="p-1.5 rounded hover:bg-white/[0.06] transition-colors text-text-subtle hover:text-text-muted">
                      <Eye size={12} />
                    </Link>
                    <button
                      title="Add to decision queue (Q)"
                      onClick={(e) => {
                        e.stopPropagation();
                        onQueueAdd?.({ eventId: p.event_id, sport: p.sport, home: p.participants.home.name, away: p.participants.away.name, pick: pick.label, pickPct: pick.pct, confidence: p.confidence, edge, startTime: p.start_time });
                      }}
                      className="p-1.5 rounded hover:bg-white/[0.06] transition-colors text-text-subtle hover:text-text-muted"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </button>

                {/* Animated drawer */}
                <div className={cn("grid transition-all duration-200 ease-out", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                  <div className="overflow-hidden">
                    <PredictionDrawer p={p} mode={mode} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}
