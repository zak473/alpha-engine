"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { EloPoint } from "@/lib/types";
import { fmtRating } from "@/lib/utils";
import { chartDefaults, colors } from "@/lib/tokens";

interface EloComparisonChartProps {
  data: EloPoint[];
  homeLabel: string;
  awayLabel: string;
  homeColor?: string;
  awayColor?: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={chartDefaults.tooltip.contentStyle} className="space-y-1 shadow-xl">
      <p style={chartDefaults.tooltip.labelStyle}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span style={chartDefaults.tooltip.labelStyle}>{p.name}</span>
          <span className="num font-medium" style={chartDefaults.tooltip.itemStyle}>{fmtRating(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export function EloComparisonChart({
  data,
  homeLabel,
  awayLabel,
  homeColor = colors.accentGreen,
  awayColor = colors.accentRed,
}: EloComparisonChartProps) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-text-muted text-sm">
        No rating history available
      </div>
    );
  }

  const allRatings = data.flatMap((d) => [d.home, d.away]);
  const minR = Math.min(...allRatings) - 30;
  const maxR = Math.max(...allRatings) + 30;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="date"
          tick={chartDefaults.axis.tick}
          tickLine={chartDefaults.axis.tickLine}
          axisLine={chartDefaults.axis.axisLine}
          tickFormatter={(v) => v.slice(5)}
        />
        <YAxis
          domain={[minR, maxR]}
          tick={chartDefaults.axis.tick}
          tickLine={chartDefaults.axis.tickLine}
          axisLine={chartDefaults.axis.axisLine}
          width={chartDefaults.yAxisWidth}
          tickFormatter={(v) => String(Math.round(v))}
        />
        <Tooltip content={<CustomTooltip />} cursor={chartDefaults.cursor} />
        <ReferenceLine y={1500} stroke={colors.surfaceBorder} strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="home"
          name={homeLabel}
          stroke={homeColor}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, fill: homeColor }}
        />
        <Line
          type="monotone"
          dataKey="away"
          name={awayLabel}
          stroke={awayColor}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, fill: awayColor }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
