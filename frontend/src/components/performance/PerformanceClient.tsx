"use client";

import { useMemo, useState } from "react";
import { ROIChart } from "@/components/charts/ROIChart";
import { CalibrationChart } from "@/components/charts/CalibrationChart";
import type { RoiPoint } from "@/lib/types";

type Range = "7d" | "30d" | "90d" | "all";

const RANGE_ITEMS: { label: string; value: Range }[] = [
  { label: "7D",  value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "All", value: "all" },
];

const RANGE_DAYS: Record<Range, number> = {
  "7d": 7, "30d": 30, "90d": 90, "all": Infinity,
};

interface SportStat {
  sport: string;
  n: number;
  accuracy: string;
  roi: string;
  sharpe: string;
}

interface Kpi {
  label: string;
  value: string | number;
  delta?: number;
}

interface PerformanceClientProps {
  roiData: RoiPoint[];
  kpis: Kpi[];
  sportStats: SportStat[];
}

export function PerformanceClient({ roiData, kpis, sportStats }: PerformanceClientProps) {
  const [range, setRange] = useState<Range>("90d");

  const filteredRoi = useMemo(() => {
    const days = RANGE_DAYS[range];
    if (days === Infinity) return roiData;
    return roiData.slice(-days);
  }, [roiData, range]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* KPI strip */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 12,
      }}>
        {kpis.map((k) => {
          const isPositive = typeof k.delta === "number" && k.delta > 0;
          const isNegative = typeof k.delta === "number" && k.delta < 0;
          return (
            <div key={k.label} className="stat-card">
              <div className="label" style={{ marginBottom: 6 }}>{k.label}</div>
              <div className="num" style={{ fontSize: 22, fontWeight: 700, color: "var(--text0)", lineHeight: 1 }}>
                {k.value}
              </div>
              {typeof k.delta === "number" && (
                <div className="num" style={{
                  fontSize: 11,
                  marginTop: 4,
                  color: isPositive ? "var(--positive)" : isNegative ? "var(--negative)" : "var(--text2)",
                }}>
                  {k.delta > 0 ? "+" : ""}{k.delta}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Time range selector + ROI chart */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="panel-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="panel-title">Cumulative PnL</div>
            <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>Units</div>
          </div>
          {/* Segmented range tabs */}
          <div className="tabs-segmented">
            {RANGE_ITEMS.map((item) => (
              <button
                key={item.value}
                className={`tab-seg-item${range === item.value ? " active" : ""}`}
                onClick={() => setRange(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: "0 20px 20px" }}>
          <ROIChart data={filteredRoi} />
        </div>
      </div>

      {/* Calibration chart */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="panel-header">
          <div className="panel-title">Calibration Curve</div>
          <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>Predicted vs actual win rate</div>
        </div>
        <div style={{ padding: "0 20px 20px" }}>
          <CalibrationChart />
        </div>
      </div>

      {/* Per-sport table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="panel-header">
          <div className="panel-title">Performance by Sport</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Sport</th>
                <th className="col-right">Predictions</th>
                <th className="col-right">Accuracy</th>
                <th className="col-right">ROI</th>
                <th className="col-right">Sharpe</th>
              </tr>
            </thead>
            <tbody>
              {sportStats.map((row) => {
                const roiPositive = row.roi.startsWith("+");
                return (
                  <tr key={row.sport} className="tr-hover">
                    <td style={{ color: "var(--text0)", fontWeight: 500 }}>{row.sport}</td>
                    <td className="col-right num">{row.n}</td>
                    <td className="col-right num">{row.accuracy}</td>
                    <td className="col-right num" style={{
                      color: roiPositive ? "var(--positive)" : "var(--negative)",
                      fontWeight: 600,
                    }}>
                      {row.roi}
                    </td>
                    <td className="col-right num">{row.sharpe}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
