"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { RoiPoint } from "@/lib/types";
import { chartDefaults, colors } from "@/lib/tokens";

interface ROIChartProps {
  data: RoiPoint[];
  title?: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as RoiPoint;
  return (
    <div style={chartDefaults.tooltip.contentStyle} className="space-y-1 shadow-xl">
      <p style={chartDefaults.tooltip.labelStyle}>{label}</p>
      <div className="flex gap-4">
        <div>
          <p style={chartDefaults.tooltip.labelStyle}>Cum. PnL</p>
          <p className={`num font-medium ${d.cumulative_pnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
            {d.cumulative_pnl >= 0 ? "+" : ""}{d.cumulative_pnl.toFixed(2)}u
          </p>
        </div>
        <div>
          <p style={chartDefaults.tooltip.labelStyle}>Daily</p>
          <p className={`num font-medium ${d.pnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
            {d.pnl >= 0 ? "+" : ""}{d.pnl.toFixed(2)}u
          </p>
        </div>
      </div>
    </div>
  );
};

export function ROIChart({ data, title }: ROIChartProps) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-text-muted text-sm">
        No performance data yet
      </div>
    );
  }

  const isPositive = data[data.length - 1]?.cumulative_pnl >= 0;
  const color = isPositive ? colors.positive : colors.negative;

  return (
    <div className="chart-container">
      {title && (
        <div className="chart-header">
          <span className="chart-title">{title}</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="roi-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.15} />
              <stop offset="95%" stopColor={color} stopOpacity={0.0}  />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            {...chartDefaults.axis}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            {...chartDefaults.axis}
            width={chartDefaults.yAxisWidth}
            tickFormatter={(v: number) => `${v.toFixed(1)}`}
          />
          <Tooltip content={<CustomTooltip />} cursor={chartDefaults.cursor} />
          <ReferenceLine y={0} stroke={colors.border1} strokeDasharray="4 4" />
          <Area
            type="monotone"
            dataKey="cumulative_pnl"
            stroke={color}
            strokeWidth={1.5}
            fill="url(#roi-gradient)"
            dot={false}
            activeDot={{ r: 3, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
