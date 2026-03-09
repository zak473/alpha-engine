"use client";

import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { fmtPct, cn, timeUntil } from "@/lib/utils";
import type { MvpPrediction } from "@/lib/types";

interface CompareModalProps {
  open: boolean;
  onClose: () => void;
  predictions: MvpPrediction[];
}

// ── helpers ───────────────────────────────────────────────────────────────────

function impliedPick(p: MvpPrediction): { label: string; pct: number } {
  const { home_win, draw, away_win } = p.probabilities;
  if (home_win >= away_win && home_win >= draw) return { label: p.participants.home.name, pct: Math.round(home_win * 100) };
  if (away_win >= home_win && away_win >= draw) return { label: p.participants.away.name, pct: Math.round(away_win * 100) };
  return { label: "Draw", pct: Math.round(draw * 100) };
}

function pickEdge(_p: MvpPrediction): number {
  return 0;
}

function volatility(p: MvpPrediction): "Stable" | "Swingy" | "—" {
  if (!p.simulation) return "—";
  const maxP = Math.max(...p.simulation.distribution.map((d) => d.probability));
  return maxP >= 0.13 ? "Stable" : "Swingy";
}

function confLabel(v: number): { text: string; color: string } {
  if (v >= 80) return { text: "HIGH",   color: "#22c55e" };
  if (v >= 65) return { text: "MED",    color: "#f59e0b" };
  return           { text: "LOW",    color: "#71717a" };
}

// ── Prediction column ─────────────────────────────────────────────────────────

function PredCol({ p }: { p: MvpPrediction }) {
  const pick  = impliedPick(p);
  const edge  = pickEdge(p);
  const vol   = volatility(p);
  const conf  = confLabel(p.confidence);
  const drivers = p.key_drivers?.slice(0, 3) ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <p className="text-sm font-semibold text-text-primary leading-tight">
          {p.participants.home.name}
          <span className="text-text-subtle mx-1.5 font-normal text-xs">vs</span>
          {p.participants.away.name}
        </p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <Badge sport={p.sport} className="capitalize text-2xs">{p.sport}</Badge>
          <span className="text-2xs text-text-muted">{p.league}</span>
          <span className="text-text-subtle text-2xs">·</span>
          <span className="text-2xs text-accent-amber">{timeUntil(p.start_time)}</span>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface-base rounded-lg p-2.5 border border-surface-border">
          <p className="text-2xs text-text-muted mb-0.5">Confidence</p>
          <p className="num text-sm font-semibold" style={{ color: conf.color }}>
            {p.confidence}% <span className="text-2xs">{conf.text}</span>
          </p>
        </div>
        <div className="bg-surface-base rounded-lg p-2.5 border border-surface-border">
          <p className="text-2xs text-text-muted mb-0.5">Edge</p>
          <p className={cn("num text-sm font-semibold", edge > 0 ? "text-accent-green" : edge < 0 ? "text-accent-red" : "text-text-muted")}>
            {edge > 0 ? "+" : ""}{edge}%
          </p>
        </div>
        <div className="bg-surface-base rounded-lg p-2.5 border border-surface-border">
          <p className="text-2xs text-text-muted mb-0.5">Volatility</p>
          <p className={cn(
            "text-xs font-medium",
            vol === "Stable" ? "text-accent-green" : vol === "Swingy" ? "text-accent-amber" : "text-text-muted"
          )}>{vol}</p>
        </div>
        <div className="bg-surface-base rounded-lg p-2.5 border border-surface-border">
          <p className="text-2xs text-text-muted mb-0.5">Lean</p>
          <p className="text-xs font-medium text-text-primary truncate">{pick.label} ({pick.pct}%)</p>
        </div>
      </div>

      {/* Probabilities */}
      <div className="space-y-2">
        <p className="label">Probabilities</p>
        {[
          { name: p.participants.home.name, value: p.probabilities.home_win, color: "#22c55e" },
          ...(p.probabilities.draw > 0 ? [{ name: "Draw", value: p.probabilities.draw, color: "#f59e0b" }] : []),
          { name: p.participants.away.name, value: p.probabilities.away_win, color: "#ef4444" },
        ].map(({ name, value, color }) => (
          <div key={name}>
            <div className="flex justify-between mb-0.5">
              <span className="text-xs text-text-muted truncate max-w-[120px]">{name}</span>
              <span className="num text-xs font-medium" style={{ color }}>{fmtPct(value)}</span>
            </div>
            <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${value * 100}%`, backgroundColor: color }} />
            </div>
          </div>
        ))}
      </div>

      {/* Top drivers */}
      {drivers.length > 0 && (
        <div className="space-y-1.5">
          <p className="label">Top Drivers</p>
          {drivers.map((d) => (
            <div key={d.feature} className="flex items-center justify-between">
              <span className="text-2xs text-text-muted font-mono truncate max-w-[130px]">{d.feature.replace(/_/g, " ")}</span>
              <span className="num text-2xs text-text-primary">{(d.importance * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function CompareModal({ open, onClose, predictions }: CompareModalProps) {
  const cols = predictions.slice(0, 3);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Compare ${cols.length} Picks`}
      className="max-w-4xl"
    >
      <div className={cn(
        "grid gap-4",
        cols.length === 2 ? "grid-cols-2" : "grid-cols-3"
      )}>
        {cols.map((p) => (
          <div key={p.event_id} className="border border-surface-border rounded-lg p-3">
            <PredCol p={p} />
          </div>
        ))}
      </div>
    </Modal>
  );
}
