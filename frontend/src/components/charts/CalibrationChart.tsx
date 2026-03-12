"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { chartDefaults, colors } from "@/lib/tokens";

interface CalibrationBin {
  bin: string;    // e.g. "0.1", "0.2" ... "1.0"
  predicted: number;
  actual: number;
}

interface CalibrationChartProps {
  data?: CalibrationBin[];
  title?: string;
}

export function CalibrationChart({ data = [], title }: CalibrationChartProps) {
  return (
    <div className="chart-container">
      {title && (
        <div className="chart-header">
          <span className="chart-title">{title}</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid
            stroke={chartDefaults.grid.stroke}
            strokeDasharray={chartDefaults.grid.strokeDasharray}
          />
          <XAxis
            dataKey="bin"
            {...chartDefaults.axis}
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            {...chartDefaults.axis}
            width={36}
          />
          <Tooltip
            contentStyle={chartDefaults.tooltip.contentStyle}
            labelStyle={chartDefaults.tooltip.labelStyle}
            itemStyle={chartDefaults.tooltip.itemStyle}
            formatter={(value: number, name: string) => [
              `${(value * 100).toFixed(1)}%`,
              name === "actual" ? "Actual" : "Perfect",
            ]}
          />
          {/* Perfect calibration line */}
          <Line
            type="linear"
            dataKey="predicted"
            stroke={colors.text2}
            strokeDasharray="4 4"
            dot={false}
            name="perfect"
          />
          {/* Actual calibration bars */}
          <Bar dataKey="actual" fill={colors.accent} fillOpacity={0.6} radius={[2, 2, 0, 0]} maxBarSize={20} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
