"use client";

import { ResponsiveContainer, LineChart, Line, ReferenceLine } from "recharts";
import { colors } from "@/lib/tokens";

interface SparklinePoint {
  value: number;
}

interface SparklineChartProps {
  data: SparklinePoint[];
  color?: string;
  height?: number;
  /** If true, color auto-switches green/red based on last vs first value */
  autoColor?: boolean;
  title?: string;
}

export function SparklineChart({
  data,
  color,
  height = 40,
  autoColor = false,
  title,
}: SparklineChartProps) {
  if (!data || data.length === 0) return null;

  const resolvedColor = (() => {
    if (color) return color;
    if (autoColor) {
      const first = data[0]?.value ?? 0;
      const last = data[data.length - 1]?.value ?? 0;
      return last >= first ? colors.positive : colors.negative;
    }
    return colors.accent;
  })();

  return (
    <div className="chart-container">
      {title && (
        <div className="chart-header">
          <span className="chart-title">{title}</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={resolvedColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceLine y={0} stroke={colors.border0} strokeDasharray="2 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
