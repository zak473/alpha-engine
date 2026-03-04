"use client";

import { useMemo, useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { StateTabs } from "@/components/ui/Tabs";
import { PanelCard } from "@/components/ui/PanelCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { ROIChart } from "@/components/charts/ROIChart";
import { CalibrationChart } from "@/components/charts/CalibrationChart";
import type { RoiPoint } from "@/lib/types";

type Range = "7d" | "30d" | "90d" | "all";

const RANGE_ITEMS: { label: string; value: Range }[] = [
  { label: "7d",  value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
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
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} compact />
        ))}
      </div>

      {/* Time range + chart */}
      <PanelCard
        title="Cumulative PnL"
        subtitle="Units"
        action={<StateTabs items={RANGE_ITEMS} value={range} onChange={setRange} />}
      >
        <ROIChart data={filteredRoi} />
      </PanelCard>

      {/* Calibration */}
      <PanelCard title="Calibration Curve" subtitle="Predicted vs actual win rate">
        <CalibrationChart />
      </PanelCard>

      {/* Per-sport table */}
      <PanelCard title="Performance by Sport" padding="flush">
        <Table>
          <TableHead>
            <tr>
              <TableHeader>Sport</TableHeader>
              <TableHeader numeric>Predictions</TableHeader>
              <TableHeader numeric>Accuracy</TableHeader>
              <TableHeader numeric>ROI</TableHeader>
              <TableHeader numeric>Sharpe</TableHeader>
            </tr>
          </TableHead>
          <TableBody>
            {sportStats.map((row) => (
              <TableRow key={row.sport}>
                <TableCell className="font-medium">{row.sport}</TableCell>
                <TableCell numeric>{row.n}</TableCell>
                <TableCell numeric>{row.accuracy}</TableCell>
                <TableCell
                  numeric
                  className={row.roi.startsWith("+") ? "text-accent-green font-medium" : "text-accent-red font-medium"}
                >
                  {row.roi}
                </TableCell>
                <TableCell numeric>{row.sharpe}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PanelCard>
    </div>
  );
}
