"use client";

import { useState, useEffect } from "react";
import { PanelCard } from "@/components/ui/PanelCard";
import { StateTabs } from "@/components/ui/Tabs";
import dynamic from "next/dynamic";
const SparklineChart = dynamic(() => import("@/components/charts/SparklineChart").then((m) => ({ default: m.SparklineChart })), {
  loading: () => <div className="h-20 animate-pulse bg-white/5 rounded" />,
  ssr: false,
});
import { Skeleton } from "@/components/ui/Skeleton";
import { getPicksRoiSeries, getBacktestSummary, type PerformanceWindow, type RoiSeriesPoint, type BacktestRunResult } from "@/lib/api";
import { cn, formatPercent } from "@/lib/utils";
import type { MvpPerformance } from "@/lib/types";
import { AlertTriangle, Info, ChevronDown } from "lucide-react";

const CALIBRATION_STYLES = {
  good: { label: "Well-calibrated", color: "var(--positive)", bgColor: "var(--positive-dim)", borderColor: "var(--positive)" },
  ok:   { label: "Acceptable",      color: "var(--warning)",  bgColor: "var(--warning-dim)",  borderColor: "var(--warning)"  },
  poor: { label: "Needs review",    color: "var(--negative)", bgColor: "var(--negative-dim)", borderColor: "var(--negative)" },
};

type ChartMetric = "winrate" | "pnl";

const CHART_OPTIONS: { label: string; value: ChartMetric }[] = [
  { label: "Win %", value: "winrate" },
  { label: "PnL",   value: "pnl"    },
];

function DrillTable({ rows }: { rows: { label: string; win: number; brier: number; count: number; roi?: number }[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs py-3 text-center" style={{ color: "var(--text2)" }}>
        No data yet
      </p>
    );
  }
  const hasRoi = rows.some((r) => r.roi != null);
  return (
    <table className="data-table w-full text-xs">
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border0)" }}>
          <th className="text-left py-1.5 font-medium" style={{ color: "var(--text2)" }}>Segment</th>
          <th className="text-right py-1.5 font-medium num" style={{ color: "var(--text2)" }}>Win %</th>
          <th className="text-right py-1.5 font-medium num" style={{ color: "var(--text2)" }}>Brier</th>
          {hasRoi && <th className="text-right py-1.5 font-medium num" style={{ color: "var(--text2)" }}>ROI</th>}
          <th className="text-right py-1.5 font-medium num" style={{ color: "var(--text2)" }}>N</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.label}
            className="transition-colors"
            style={{ borderBottom: "1px solid var(--border0)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <td className="py-1.5 capitalize" style={{ color: "var(--text1)" }}>{r.label}</td>
            <td
              className="py-1.5 text-right num font-medium"
              style={{ color: r.win >= 0.6 ? "var(--positive)" : r.win >= 0.55 ? "var(--warning)" : "var(--negative)" }}
            >
              {formatPercent(r.win)}
            </td>
            <td
              className="py-1.5 text-right num"
              style={{ color: r.brier < 0.21 ? "var(--positive)" : r.brier < 0.24 ? "var(--warning)" : "var(--negative)" }}
            >
              {r.brier > 0 ? r.brier.toFixed(3) : "—"}
            </td>
            {hasRoi && (
              <td
                className="py-1.5 text-right num font-medium"
                style={{ color: r.roi == null ? "var(--text2)" : r.roi >= 0 ? "var(--positive)" : "var(--negative)" }}
              >
                {r.roi != null ? `${r.roi >= 0 ? "+" : ""}${(r.roi * 100).toFixed(1)}%` : "—"}
              </td>
            )}
            <td className="py-1.5 text-right num" style={{ color: "var(--text1)" }}>
              {r.count > 0 ? r.count : "—"}
            </td>
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
  const [window, setWindow] = useState<PerformanceWindow>("30d");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("winrate");
  const [showBrierInfo, setShowBrierInfo] = useState(false);
  const [showDrill, setShowDrill] = useState(false);
  const [series, setSeries] = useState<RoiSeriesPoint[]>([]);
  const [backtest, setBacktest] = useState<Record<string, BacktestRunResult>>({});

  useEffect(() => {
    getPicksRoiSeries(window)
      .then((data) => setSeries(data.series))
      .catch(() => setSeries([]));
  }, [window]);

  useEffect(() => {
    getBacktestSummary().then(setBacktest).catch(() => {});
  }, []);

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

  const liveModel = performance?.models.find((m) => m.is_live);

  const winRate    = liveModel?.accuracy ?? 0;
  const brierScore = liveModel?.brier_score ?? 0;
  const calibration = brierScore === 0 ? "ok" : brierScore < 0.21 ? "good" : brierScore < 0.24 ? "ok" : "poor";
  const calStyle = CALIBRATION_STYLES[calibration];

  // Map series to the selected metric
  const chartSeries = series.map((p) => ({
    value: chartMetric === "pnl" ? p.cumulative_pnl : p.win_rate,
  }));

  const lastVal  = chartSeries.length > 1 ? chartSeries[chartSeries.length - 1].value : null;
  const firstVal = chartSeries.length > 1 ? chartSeries[0].value : null;
  const chartAutoColor =
    lastVal === null || firstVal === null ? true :
    chartMetric === "pnl" ? lastVal >= 0 :          // PnL: green if net positive
    lastVal >= firstVal;                              // win rate: green if improving

  // Drill-down by sport: from model registry
  const drillBySport = (performance?.models ?? [])
    .filter((m) => m.accuracy != null || m.brier_score != null)
    .map((m) => ({
      label: m.sport,
      win:   m.accuracy ?? 0,
      brier: m.brier_score ?? 0,
      count: m.n_predictions ?? 0,
      roi:   backtest[m.sport]?.roi ?? undefined,
    }));

  const chartLabel =
    chartMetric === "pnl" ? "Cumulative PnL trend" : "Win rate trend";

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
          <p className="num text-xl font-semibold" style={{ color: "var(--text0)" }}>{formatPercent(winRate)}</p>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-1">
            <p className="label">Avg Brier</p>
            <button
              onClick={() => setShowBrierInfo((v) => !v)}
              className="transition-colors"
              style={{ color: "var(--text2)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text1)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text2)")}
              title="What is Brier score?"
            >
              <Info size={11} />
            </button>
          </div>
          <p
            className="num text-xl font-semibold"
            style={{ color: brierScore < 0.21 ? "var(--positive)" : brierScore < 0.24 ? "var(--warning)" : "var(--negative)" }}
          >
            {brierScore.toFixed(3)}
          </p>
        </div>
      </div>

      {/* Brier info */}
      {showBrierInfo && (
        <div
          className="mb-4 p-3 rounded-lg text-xs leading-relaxed"
          style={{
            background: "var(--bg2)",
            border: "1px solid var(--border0)",
            color: "var(--text1)",
          }}
        >
          <strong style={{ color: "var(--text0)" }}>Brier Score</strong> = mean squared error between predicted probabilities and outcomes.{" "}
          <span style={{ color: "var(--positive)" }}>Lower is better.</span> 0.0 = perfect, 0.25 = no skill, 1.0 = worst.
        </div>
      )}

      {/* Calibration badge */}
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium mb-4"
        style={{
          color: calStyle.color,
          background: calStyle.bgColor,
          border: `1px solid ${calStyle.borderColor}`,
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: calStyle.color }} />
        {calStyle.label}
      </div>

      {/* Calibration drift callout */}
      {calibration === "poor" && (
        <div
          className="flex items-start gap-2 mb-4 p-2.5 rounded-lg"
          style={{
            background: "var(--negative-dim)",
            border: "1px solid var(--negative)",
          }}
        >
          <AlertTriangle size={13} className="shrink-0 mt-0.5" style={{ color: "var(--negative)" }} />
          <p className="text-xs" style={{ color: "var(--negative)" }}>
            Calibration drift detected. Consider retraining or recalibrating model outputs.
          </p>
        </div>
      )}

      {/* Metric toggle + sparkline */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="label">{chartLabel}</p>
          <div className="flex items-center gap-1">
            {CHART_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setChartMetric(opt.value)}
                className="text-2xs px-2 py-0.5 rounded transition-colors"
                style={
                  chartMetric === opt.value
                    ? {
                        background: "var(--bg2)",
                        color: "var(--text0)",
                        border: "1px solid var(--border0)",
                      }
                    : { color: "var(--text1)", border: "1px solid transparent" }
                }
                onMouseEnter={(e) => {
                  if (chartMetric !== opt.value) e.currentTarget.style.color = "var(--text0)";
                }}
                onMouseLeave={(e) => {
                  if (chartMetric !== opt.value) e.currentTarget.style.color = "var(--text1)";
                }}
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
        className="flex items-center gap-1.5 text-xs transition-colors w-full"
        style={{ color: "var(--text1)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text0)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text1)")}
      >
        <ChevronDown size={12} className={cn("transition-transform", showDrill && "rotate-180")} />
        {showDrill ? "Hide breakdown" : "Breakdown by sport"}
      </button>

      {/* Drill-down table */}
      {showDrill && (
        <div className="mt-3">
          <DrillTable rows={drillBySport} />
        </div>
      )}
    </PanelCard>
  );
}
