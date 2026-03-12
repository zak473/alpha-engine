"use client";

import { useState } from "react";
import Link from "next/link";
import { cn, fmtPct, sportColor, timeUntil } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { computeEdge } from "@/lib/api";
import type { MvpPrediction } from "@/lib/types";
import type { QueueItem } from "./DecisionQueue";
import {
  Star,
  ChevronDown,
  ChevronUp,
  Eye,
  Inbox,
  ToggleLeft,
  ToggleRight,
  CheckSquare,
  Square,
  GitCompare,
  Info,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

export type SignalMode = "confidence" | "edge";

function impliedPick(p: MvpPrediction): "home" | "draw" | "away" {
  const { home_win, draw, away_win } = p.probabilities;
  if (home_win >= draw && home_win >= away_win) return "home";
  if (away_win >= draw && away_win >= home_win) return "away";
  return "draw";
}

function pickEdge(p: MvpPrediction): number {
  const m = p.market_odds;
  if (!m) return 0;
  const { home_win, draw, away_win } = p.probabilities;
  if (home_win >= away_win && home_win >= draw) return computeEdge(home_win, m.home_win);
  if (away_win >= home_win && away_win >= draw) return computeEdge(away_win, m.away_win);
  return computeEdge(draw, m.draw);
}

function timePressure(p: MvpPrediction): { label: string; level: "urgent" | "soon" | "normal" } {
  const ms = new Date(p.start_time).getTime() - Date.now();
  if (ms < 1_800_000)  return { label: `${Math.max(1, Math.floor(ms / 60000))}m`, level: "urgent" };
  if (ms < 7_200_000)  return { label: timeUntil(p.start_time), level: "soon"   };
  return                     { label: timeUntil(p.start_time), level: "normal" };
}

function volatility(p: MvpPrediction): string | null {
  if (!p.simulation?.distribution?.length) return null;
  const maxP = Math.max(...p.simulation.distribution.map((d) => d.probability));
  return maxP >= 0.13 ? "Stable" : "Swingy";
}

function explainNarrative(p: MvpPrediction): string {
  if (!p.key_drivers?.length) return "No explanation available.";
  const top = p.key_drivers.slice(0, 3);
  const parts = top.map((d) => {
    const v = d.value ?? 0;
    return `${d.feature.replace(/_/g, " ")}: ${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
  });
  return `Top factors — ${parts.join(" · ")}.`;
}

const WATCHLIST_KEY = "ae_watchlist_v1";
function addToWatchlist(e: { id: string; name: string; sport: string }) {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    const arr: typeof e[] = raw ? JSON.parse(raw) : [];
    if (!arr.find((x) => x.id === e.id)) localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...arr, e]));
  } catch {}
}

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfBadge({ value }: { value: number }) {
  if (value >= 80) return <span className="text-[10px] font-bold text-accent-green">HIGH</span>;
  if (value >= 65) return <span className="text-[10px] font-bold text-accent-amber">MED</span>;
  return <span className="text-[10px] font-bold text-text-subtle">LOW</span>;
}

// ── Odds / probability button ─────────────────────────────────────────────────

function OddsBtn({
  label,
  prob,
  fairOdds,
  isLean,
  isQueued,
  showOdds,
  onClick,
}: {
  label: string;
  prob: number;
  fairOdds: number;
  isLean: boolean;
  isQueued: boolean;
  showOdds: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "btn-odds group/ob",
        isQueued  ? "btn-odds-queued"  :
        isLean    ? "btn-odds-lean"    : ""
      )}
      title={`Add to queue: ${label}`}
    >
      <span className="text-[9px] text-text-subtle leading-none mb-0.5 group-hover/ob:text-text-muted transition-colors">
        {label}
      </span>
      <span className={cn(
        "num text-[13px] font-semibold leading-none",
        isQueued ? "text-accent-teal" : isLean ? "text-text-primary" : "text-text-muted",
        "group-hover/ob:text-text-primary transition-colors"
      )}>
        {showOdds && fairOdds > 0 ? fairOdds.toFixed(2) : `${Math.round(prob * 100)}%`}
      </span>
    </button>
  );
}

// ── Inline drawer ─────────────────────────────────────────────────────────────

function MatchDrawer({ p }: { p: MvpPrediction }) {
  const [showExplain, setShowExplain] = useState(false);
  const edge = pickEdge(p);
  const pick = impliedPick(p);
  const vol = volatility(p);
  const marketOdds = p.market_odds ?? undefined;

  return (
    <div className="bg-surface-base border-b border-surface-border px-3 pb-4 pt-3">
      {/* Callout strip */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-overlay border border-surface-border">
          <span className="text-[10px] text-text-muted">Edge</span>
          <span className={cn("num text-[12px] font-semibold", edge > 0 ? "text-accent-teal" : "text-text-muted")}>
            {edge > 0 ? "+" : ""}{edge}%
          </span>
        </div>
        {vol && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-overlay border border-surface-border">
            <span className="text-[10px] text-text-muted">Volatility</span>
            <span className={cn("text-[11px] font-medium", vol === "Stable" ? "text-accent-green" : "text-accent-amber")}>{vol}</span>
          </div>
        )}
        {p.model?.version && <span className="text-[10px] text-text-subtle font-mono ml-auto">{p.model.version}</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Probs */}
        <div className="bg-surface-overlay rounded border border-surface-border p-2.5 space-y-2">
          <p className="label">Probabilities</p>
          {[
            { label: "Home", name: p.participants.home.name, value: p.probabilities.home_win, mkt: marketOdds?.home_win, color: "#22c55e" },
            ...(p.probabilities.draw > 0 ? [{ label: "Draw", name: "Draw", value: p.probabilities.draw, mkt: marketOdds?.draw, color: "#f59e0b" }] : []),
            { label: "Away", name: p.participants.away.name, value: p.probabilities.away_win, mkt: marketOdds?.away_win, color: "#ef4444" },
          ].map(({ label, name, value, mkt, color }) => (
            <div key={label}>
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-[11px] text-text-muted truncate max-w-[90px]">{name}</span>
                <div className="flex items-center gap-1.5">
                  {mkt && mkt > 0 && <span className="text-[10px] text-text-subtle">{fmtPct(1/mkt)} mkt</span>}
                  <span className="num text-[12px] font-semibold" style={{ color }}>{fmtPct(value)}</span>
                </div>
              </div>
              <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${value * 100}%`, backgroundColor: color }} />
              </div>
            </div>
          ))}
        </div>

        {/* Key drivers + explain */}
        <div className="bg-surface-overlay rounded border border-surface-border p-2.5 space-y-2">
          <p className="label">Key Drivers</p>
          {p.key_drivers?.length ? (
            <div className="space-y-2">
              {p.key_drivers.slice(0, 4).map((d) => (
                <div key={d.feature}>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[11px] text-text-muted font-mono truncate max-w-[110px]">{d.feature.replace(/_/g, " ")}</span>
                    <span className="num text-[11px] text-text-primary shrink-0">{(d.importance * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1 bg-surface-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-accent-teal/60" style={{ width: `${d.importance * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-text-muted">No driver data</p>
          )}
          <div className="pt-2 border-t border-surface-border">
            <button onClick={() => setShowExplain((v) => !v)} className="flex items-center gap-1 text-[11px] text-accent-teal hover:opacity-80 transition-opacity">
              <Info size={10} />{showExplain ? "Hide" : "Explain →"}
            </button>
            {showExplain && (
              <p className="text-[11px] text-text-muted mt-1.5 leading-relaxed">{explainNarrative(p)}</p>
            )}
          </div>
        </div>

        {/* Simulation */}
        <div className="bg-surface-overlay rounded border border-surface-border p-2.5 space-y-2">
          <p className="label">Score Simulation</p>
          {p.simulation ? (
            <>
              <div className="flex gap-4 mb-1.5">
                <div><p className="num text-[13px] font-semibold text-text-primary">{p.simulation.mean_home_goals.toFixed(1)}</p><p className="text-[10px] text-text-muted">Exp. home</p></div>
                <div className="text-text-subtle flex items-center text-[11px]">–</div>
                <div><p className="num text-[13px] font-semibold text-text-primary">{p.simulation.mean_away_goals.toFixed(1)}</p><p className="text-[10px] text-text-muted">Exp. away</p></div>
              </div>
              {p.simulation.distribution.slice(0, 5).map((d) => (
                <div key={d.score} className="flex items-center gap-2">
                  <span className="num text-[11px] font-medium text-text-primary w-7 shrink-0">{d.score}</span>
                  <div className="flex-1 h-1 bg-surface-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-accent-purple/60" style={{ width: `${Math.min(d.probability * 500, 100)}%` }} />
                  </div>
                  <span className="num text-[10px] text-text-muted w-7 text-right">{fmtPct(d.probability)}</span>
                </div>
              ))}
            </>
          ) : (
            <p className="text-[11px] text-text-muted">No simulation available</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sport group header ────────────────────────────────────────────────────────

function SportGroupHeader({
  sport,
  count,
  collapsed,
  onToggle,
  stickyTop,
}: {
  sport: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  stickyTop: string;
}) {
  const color = sportColor(sport);
  return (
    <div className="sb-section-header" style={{ top: stickyTop }}>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
          {sport.charAt(0).toUpperCase() + sport.slice(1)}
        </span>
        <span className="num text-[10px] text-text-subtle">({count})</span>
      </div>
      <button onClick={onToggle} className="text-text-subtle hover:text-text-muted transition-colors">
        {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface MarketsTableProps {
  predictions: MvpPrediction[];
  loading?: boolean;
  mode?: SignalMode;
  onModeChange?: (m: SignalMode) => void;
  compareItems?: string[];
  onCompareToggle?: (id: string) => void;
  onQueueAdd?: (item: QueueItem) => void;
  stickyOffset?: number;   // px — top offset for sport group headers (below KPI bar + filter bar)
}

export function MarketsTable({
  predictions,
  loading,
  mode = "confidence",
  onModeChange,
  compareItems = [],
  onCompareToggle,
  onQueueAdd,
  stickyOffset = 80,
}: MarketsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showOdds, setShowOdds] = useState(false);
  const [queuedButtons, setQueuedButtons] = useState<Record<string, string>>({}); // eventId → "home"|"draw"|"away"
  const [watchlistedIds, setWatchlistedIds] = useState<Set<string>>(new Set());
  const [collapsedSports, setCollapsedSports] = useState<Set<string>>(new Set());

  // Group predictions by sport
  const groups = predictions.reduce<Record<string, MvpPrediction[]>>((acc, p) => {
    (acc[p.sport] ??= []).push(p);
    return acc;
  }, {});

  // Sort within each group
  const sportOrder = ["soccer", "tennis", "esports"];
  const orderedSports = [
    ...sportOrder.filter((s) => groups[s]),
    ...Object.keys(groups).filter((s) => !sportOrder.includes(s)),
  ];

  for (const sport of orderedSports) {
    groups[sport].sort((a, b) =>
      mode === "edge" ? pickEdge(b) - pickEdge(a) : b.confidence - a.confidence
    );
  }

  function toggleCollapse(sport: string) {
    setCollapsedSports((prev) => {
      const next = new Set(prev);
      next.has(sport) ? next.delete(sport) : next.add(sport);
      return next;
    });
  }

  function handleOddsClick(p: MvpPrediction, side: "home" | "draw" | "away", e: React.MouseEvent) {
    e.stopPropagation();
    const key = `${p.event_id}-${side}`;
    const alreadyQueued = queuedButtons[p.event_id] === side;

    if (alreadyQueued) {
      const next = { ...queuedButtons };
      delete next[p.event_id];
      setQueuedButtons(next);
      return;
    }

    setQueuedButtons((prev) => ({ ...prev, [p.event_id]: side }));

    if (onQueueAdd) {
      const names = { home: p.participants.home.name, draw: "Draw", away: p.participants.away.name };
      const probs  = { home: p.probabilities.home_win, draw: p.probabilities.draw, away: p.probabilities.away_win };
      const odds   = p.fair_odds ?? { home_win: 0, draw: 0, away_win: 0 };
      onQueueAdd({
        eventId: p.event_id,
        sport: p.sport,
        home: p.participants.home.name,
        away: p.participants.away.name,
        pick: names[side],
        pickPct: Math.round(probs[side] * 100),
        confidence: p.confidence,
        edge: pickEdge(p),
        startTime: p.start_time,
      });
    }
  }

  if (loading) {
    return (
      <div>
        {[...Array(3)].map((_, g) => (
          <div key={g}>
            <div className="sb-section-header" style={{ top: `${stickyOffset}px` }}>
              <div className="w-24 h-3 shimmer rounded" />
            </div>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="sb-row">
                <div className="flex-1 space-y-1.5">
                  <div className="w-48 h-3.5 shimmer rounded" />
                  <div className="w-32 h-2.5 shimmer rounded" />
                </div>
                {[...Array(3)].map((_, b) => <div key={b} className="btn-odds shimmer" />)}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (predictions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <Inbox size={24} className="text-text-subtle" />
        <p className="text-[13px] text-text-muted">No predictions match your filters</p>
        <p className="text-[11px] text-text-subtle">Adjust sport, range, or confidence filters</p>
      </div>
    );
  }

  return (
    <div>
      {/* Compare CTA bar */}
      {compareItems.length >= 2 && onCompareToggle && (
        <div className="flex items-center justify-between px-3 py-2 bg-accent-teal/8 border-b border-accent-teal/20 sticky z-20" style={{ top: `${stickyOffset}px` }}>
          <span className="text-[12px] text-accent-teal">{compareItems.length} picks selected</span>
          <div className="flex items-center gap-3">
            <button onClick={() => onCompareToggle("__open__")} className="flex items-center gap-1 text-[12px] font-medium text-accent-teal hover:opacity-80">
              <GitCompare size={11} />Compare
            </button>
            <button onClick={() => onCompareToggle("__clear__")} className="text-[11px] text-text-muted hover:text-text-primary transition-colors">Clear</button>
          </div>
        </div>
      )}

      {/* Header controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border bg-surface-base sticky z-10" style={{ top: `${stickyOffset}px` }}>
        <div className="flex items-center gap-2">
          {onModeChange && (
            <div className="flex items-center gap-0.5 bg-surface-raised border border-surface-border rounded p-0.5">
              <button onClick={() => onModeChange("confidence")} className={cn("px-2 py-0.5 rounded text-[11px] transition-colors", mode === "confidence" ? "bg-surface-border text-text-primary" : "text-text-subtle hover:text-text-muted")}>Conf</button>
              <button onClick={() => onModeChange("edge")} className={cn("px-2 py-0.5 rounded text-[11px] transition-colors", mode === "edge" ? "bg-accent-teal/15 text-accent-teal" : "text-text-subtle hover:text-text-muted")}>Edge</button>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowOdds((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text-primary transition-colors"
          title="Toggle between probability % and fair decimal odds"
        >
          {showOdds ? <ToggleRight size={13} className="text-accent-teal" /> : <ToggleLeft size={13} />}
          {showOdds ? "Odds" : "Prob %"}
        </button>
      </div>

      {/* Sport groups */}
      {orderedSports.map((sport) => {
        const rows = groups[sport];
        const collapsed = collapsedSports.has(sport);

        return (
          <div key={sport}>
            <SportGroupHeader
              sport={sport}
              count={rows.length}
              collapsed={collapsed}
              onToggle={() => toggleCollapse(sport)}
              stickyTop={`${stickyOffset + 36}px`}
            />

            {!collapsed && rows.map((p) => {
              const expanded = expandedId === p.event_id;
              const lean = impliedPick(p);
              const tp = timePressure(p);
              const edge = pickEdge(p);
              const hasDraw = p.probabilities.draw > 0;
              const isWatched = watchlistedIds.has(p.event_id);
              const isCompared = compareItems.includes(p.event_id);
              const queuedSide = queuedButtons[p.event_id];
              const fairOdds = p.fair_odds ?? { home_win: 0, draw: 0, away_win: 0 };

              return (
                <div key={p.event_id} className="group/mrow">
                  {/* Market row */}
                  <div
                    className={cn(
                      "sb-row",
                      expanded && "bg-white/[0.015]"
                    )}
                  >
                    {/* Compare checkbox */}
                    {onCompareToggle && (
                      <button
                        onClick={() => onCompareToggle(p.event_id)}
                        className="shrink-0 text-text-subtle hover:text-text-muted transition-colors"
                      >
                        {isCompared
                          ? <CheckSquare size={12} className="text-accent-teal" />
                          : <Square size={12} className="opacity-0 group-hover/mrow:opacity-100 transition-opacity" />}
                      </button>
                    )}

                    {/* Watchlist star */}
                    <button
                      onClick={() => {
                        addToWatchlist({ id: p.participants.home.id, name: p.participants.home.name, sport: p.sport });
                        setWatchlistedIds((prev) => new Set(prev).add(p.event_id));
                      }}
                      className={cn("shrink-0 transition-colors", isWatched ? "text-accent-gold" : "text-text-subtle opacity-0 group-hover/mrow:opacity-100 hover:text-text-muted")}
                    >
                      <Star size={12} fill={isWatched ? "currentColor" : "none"} />
                    </button>

                    {/* Match info — clicking this area navigates to match detail */}
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => window.open(`/sports/${p.sport}/matches/${p.event_id}`, "_blank")}
                    >
                      <p className="text-[13px] font-semibold text-text-primary leading-tight truncate">
                        {p.participants.home.name}
                        <span className="text-text-subtle font-normal text-[11px] mx-1">vs</span>
                        {p.participants.away.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-text-subtle">{p.league}</span>
                        <span className="text-text-subtle text-[9px]">·</span>
                        <span className={cn("text-[11px] font-medium", tp.level === "urgent" ? "text-accent-red" : tp.level === "soon" ? "text-accent-amber" : "text-text-subtle")}>
                          {tp.level === "urgent" && "⚡ "}{tp.label}
                        </span>
                        {edge !== 0 && (
                          <span className={cn("num text-[10px] font-semibold", edge > 0 ? "text-accent-teal" : "text-accent-red/60")}>
                            {edge > 0 ? "+" : ""}{edge}%
                          </span>
                        )}
                        <ConfBadge value={p.confidence} />
                      </div>
                    </div>

                    {/* Odds buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <OddsBtn
                        label={hasDraw ? "Home" : "P1"}
                        prob={p.probabilities.home_win}
                        fairOdds={fairOdds.home_win}
                        isLean={lean === "home"}
                        isQueued={queuedSide === "home"}
                        showOdds={showOdds}
                        onClick={(e) => handleOddsClick(p, "home", e)}
                      />
                      {hasDraw && (
                        <OddsBtn
                          label="Draw"
                          prob={p.probabilities.draw}
                          fairOdds={fairOdds.draw}
                          isLean={lean === "draw"}
                          isQueued={queuedSide === "draw"}
                          showOdds={showOdds}
                          onClick={(e) => handleOddsClick(p, "draw", e)}
                        />
                      )}
                      <OddsBtn
                        label={hasDraw ? "Away" : "P2"}
                        prob={p.probabilities.away_win}
                        fairOdds={fairOdds.away_win}
                        isLean={lean === "away"}
                        isQueued={queuedSide === "away"}
                        showOdds={showOdds}
                        onClick={(e) => handleOddsClick(p, "away", e)}
                      />
                    </div>

                    {/* View link + expand */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Link
                        href={`/sports/${p.sport}/matches/${p.event_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded text-text-subtle hover:text-text-muted opacity-0 group-hover/mrow:opacity-100 transition-all"
                        title="View match"
                      >
                        <Eye size={11} />
                      </Link>
                      <button
                        onClick={() => setExpandedId((prev) => prev === p.event_id ? null : p.event_id)}
                        className="p-1 rounded text-text-subtle hover:text-text-muted transition-colors"
                      >
                        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    </div>
                  </div>

                  {/* Animated drawer */}
                  <div className={cn("grid transition-all duration-200 ease-out", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                    <div className="overflow-hidden">
                      <MatchDrawer p={p} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
