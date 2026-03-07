"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import type { SimBucket } from "@/lib/types";
import { fmtPct } from "@/lib/utils";
import { chartDefaults, colors } from "@/lib/tokens";

interface SimulationDistributionChartProps {
  data: SimBucket[];
  homeLabel: string;
  awayLabel: string;
  title?: string;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as SimBucket;
  return (
    <div style={chartDefaults.tooltip.contentStyle} className="space-y-1 shadow-xl">
      <p className="font-medium" style={chartDefaults.tooltip.itemStyle}>{d.score}</p>
      <p className="num" style={chartDefaults.tooltip.labelStyle}>{fmtPct(d.probability)} probability</p>
    </div>
  );
};

function scoreColor(score: string): string {
  if (score === "Other") return colors.text2;
  const [h, a] = score.split("-").map(Number);
  if (h > a) return colors.positive;
  if (h < a) return colors.negative;
  return colors.warning;
}

export function SimulationDistributionChart({
  data,
  homeLabel,
  awayLabel,
  title,
}: SimulationDistributionChartProps) {
  return (
    <div className="chart-container">
      {title && (
        <div className="chart-header">
          <span className="chart-title">{title}</span>
        </div>
      )}
      <div className="space-y-3">
        {/* Legend */}
        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent-green" />
            <span className="text-text-muted">{homeLabel} win</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent-amber" />
            <span className="text-text-muted">Draw</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent-red" />
            <span className="text-text-muted">{awayLabel} win</span>
          </span>
        </div>

        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="score"
              {...chartDefaults.axis}
            />
            <YAxis
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              {...chartDefaults.axis}
              width={32}
            />
            <Tooltip content={<CustomTooltip />} cursor={chartDefaults.cursor} />
            <Bar dataKey="probability" radius={[2, 2, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.score} fill={scoreColor(entry.score)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
