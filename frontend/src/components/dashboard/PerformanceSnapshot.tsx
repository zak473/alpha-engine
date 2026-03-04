"use client";

import { useState } from "react";
import { PanelCard } from "@/components/ui/PanelCard";
import { StateTabs } from "@/components/ui/Tabs";
import { SparklineChart } from "@/components/charts/SparklineChart";
import { Skeleton } from "@/components/ui/Skeleton";
import { getMockPerformanceByWindow, type PerformanceWindow } from "@/lib/api";
import { cn, formatPercent } from "@/lib/utils";
import type { MvpPerformance } from "@/lib/types";
import { AlertTriangle, Info, ChevronDown } from "lucide-react";

const CALIBRATION_STYLES = {
  good: { label: "Well-calibrated", color: "#22c55e", bg: "bg-accent-green/10", border: "border-accent-green/20" },
  ok:   { label: "Acceptable",      color: "#f59e0b", bg: "bg-accent-amber/10", border: "border-accent-amber/20" },
  poor: { label: "Needs review",    color: "#ef4444", bg: "bg-accent-red/10",   border: "border-accent-red/20"   },
};

type ChartMetric = "winrate" | "brier" | "calibration";

const CHART_OPTIONS: { label: string; value: ChartMetric }[] = [
  { label: "Win %",  value: "winrate"     },
  { label: "Brier",  value: "brier"       },
  { label: "Calib",  value: "calibration" },
];

// ── Mock drill-down data ──────────────────────────────────────────────────────

const DRILL_BY_SPORT = [
  { label: "Soccer",  win: 0.592, brier: 0.204, count: 180 },
  { label: "Tennis",  win: 0.628, brier: 0.191, count: 95  },
  { label: "Esports", win: 0.544, brier: 0.233, count: 37  },
];

const DRILL_BY_CONF = [
  { label: "60–70%", win: 0.531, brier: 0.228, count: 82 },
  { label: "70–80%", win: 0.581, brier: 0.213, count: 109 },
  { label: "80–90%", win: 0.641, brier: 0.194, count: 89  },
  { label: "90%+",   win: 0.710, brier: 0.165, count: 32  },
];

type DrillMode = "sport" | "confidence";

function DrillTable({ rows }: { rows: { label: string; win: number; brier: number; count: number }[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-text-subtle border-b border-surface-border">
          <th className="text-left py-1.5 font-medium">Segment</th>
          <th className="text-right py-1.5 font-medium num">Win %</th>
          <th className="text-right py-1.5 font-medium num">Brier</th>
          <th className="text-right py-1.5 font-medium num">N</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-surface-border/40 hover:bg-white/[0.02] transition-colors">
            <td className="py-1.5 text-text-muted">{r.label}</td>
            <td className={cn("py-1.5 text-right num font-medium", r.win >= 0.6 ? "text-accent-green" : r.win >= 0.55 ? "text-accent-amber" : "text-accent-red")}>
              {formatPercent(r.win)}
            </td>
            <td className={cn("py-1.5 text-right num", r.brier < 0.21 ? "text-accent-green" : r.brier < 0.24 ? "text-accent-amber" : "text-accent-red")}>
              {r.brier.toFixed(3)}
            </td>
            <td className="py-1.5 text-right num text-text-muted">{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface PerformanceSnapshotProps {
  performance: MvpPerformance | null;
  loading?: boolean;
}

export function PerformanceSnapshot({ performance, loading }: PerformanceSnapshotProps) {
  const [window, setWindow] = useState<PerformanceWindow>("7d");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("winrate");
  const [showBrierInfo, setShowBrierInfo] = useState(false);
  const [showDrill, setShowDrill] = useState(false);
  const [drillMode, setDrillMode] = useState<DrillMode>("sport");

  if (loading) {
    return (
      <PanelCard title="Performance">
        <div className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-12 w-full" />
        </div>
      </PanelCard>
    );
  }

  const mockData = getMockPerformanceByWindow(window);
  const liveModel = performance?.models.find((m) => m.is_live);

  const winRate    = liveModel?.accuracy ?? mockData.winRate;
  const brierScore = liveModel?.brier_score ?? mockData.brierScore;
  const calibration = brierScore < 0.21 ? "good" : brierScore < 0.24 ? "ok" : "poor";
  const calStyle = CALIBRATION_STYLES[calibration];

  function getChartSeries(): { value: number }[] {
    if (chartMetric === "winrate") return mockData.series;
    if (chartMetric === "brier")   return mockData.series.map((s) => ({ value: 1 - s.value * 0.4 }));
    return mockData.series.map((s, i) => ({ value: 0.5 + Math.sin(i * 0.8) * 0.15 * (1 - s.value) }));
  }

  const chartSeries = getChartSeries();
  const chartAutoColor = chartMetric === "brier"
    ? chartSeries[chartSeries.length - 1].value < chartSeries[0].value
    : chartSeries[chartSeries.length - 1].value >= chartSeries[0].value;

  return (
    <PanelCard
      title="Performance"
      action={
        <StateTabs<PerformanceWindow>
          items={[
            { label: "7d",     value: "7d"     },
            { label: "30d",    value: "30d"    },
            { label: "Season", value: "season" },
          ]}
          value={window}
          onChange={setWindow}
          className="border-0 gap-0"
        />
      }
    >
      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="label mb-1">Win Rate</p>
          <p className="num text-xl font-semibold text-text-primary">{formatPercent(winRate)}</p>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-1">
            <p className="label">Avg Brier</p>
            <button onClick={() => setShowBrierInfo((v) => !v)} className="text-text-subtle hover:text-text-muted transition-colors" title="What is Brier score?">
              <Info size={11} />
            </button>
          </div>
          <p className={cn("num text-xl font-semibold", brierScore < 0.21 ? "text-accent-green" : brierScore < 0.24 ? "text-accent-amber" : "text-accent-red")}>
            {brierScore.toFixed(3)}
          </p>
        </div>
      </div>

      {/* Brier info */}
      {showBrierInfo && (
        <div className="mb-4 p-3 rounded-lg bg-surface-overlay border border-surface-border text-xs text-text-muted leading-relaxed">
          <strong className="text-text-primary">Brier Score</strong> = mean squared error between predicted probabilities and outcomes.{" "}
          <span className="text-accent-green">Lower is better.</span> 0.0 = perfect, 0.25 = no skill, 1.0 = worst.
        </div>
      )}

      {/* Calibration badge */}
      <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border mb-4", calStyle.bg, calStyle.border)} style={{ color: calStyle.color }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: calStyle.color }} />
        {calStyle.label}
      </div>

      {/* Calibration drift callout */}
      {calibration === "poor" && (
        <div className="flex items-start gap-2 mb-4 p-2.5 rounded-lg bg-accent-red/8 border border-accent-red/20">
          <AlertTriangle size={13} className="text-accent-red shrink-0 mt-0.5" />
          <p className="text-xs text-accent-red/90">
            Calibration drift detected. Consider retraining or recalibrating model outputs.
          </p>
        </div>
      )}

      {/* Metric toggle + sparkline */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="label">
            {chartMetric === "winrate" ? "Win rate trend" : chartMetric === "brier" ? "Brier score trend" : "Calibration trend"}
          </p>
          <div className="flex items-center gap-1">
            {CHART_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setChartMetric(opt.value)}
                className={cn("text-2xs px-2 py-0.5 rounded transition-colors", chartMetric === opt.value ? "bg-surface-overlay text-text-primary border border-surface-border" : "text-text-muted hover:text-text-primary")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <SparklineChart data={chartSeries} autoColor={chartAutoColor} height={48} />
      </div>

      {/* Drill-down toggle */}
      <button
        onClick={() => setShowDrill((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors w-full"
      >
        <ChevronDown size={12} className={cn("transition-transform", showDrill && "rotate-180")} />
        {showDrill ? "Hide breakdown" : "Breakdown by sport / confidence"}
      </button>

      {/* Drill-down table */}
      {showDrill && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            {(["sport", "confidence"] as DrillMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setDrillMode(m)}
                className={cn("text-2xs px-2.5 py-1 rounded-md border transition-colors capitalize", drillMode === m ? "bg-surface-overlay border-surface-border text-text-primary" : "border-transparent text-text-muted hover:text-text-primary")}
              >
                By {m}
              </button>
            ))}
          </div>
          <DrillTable rows={drillMode === "sport" ? DRILL_BY_SPORT : DRILL_BY_CONF} />
        </div>
      )}
    </PanelCard>
  );
}
