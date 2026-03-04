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
}

// Deterministic mock calibration bins (no Math.random)
const MOCK_BINS: CalibrationBin[] = [
  { bin: "0.1", predicted: 0.1, actual: 0.08 },
  { bin: "0.2", predicted: 0.2, actual: 0.19 },
  { bin: "0.3", predicted: 0.3, actual: 0.28 },
  { bin: "0.4", predicted: 0.4, actual: 0.38 },
  { bin: "0.5", predicted: 0.5, actual: 0.47 },
  { bin: "0.6", predicted: 0.6, actual: 0.58 },
  { bin: "0.7", predicted: 0.7, actual: 0.69 },
  { bin: "0.8", predicted: 0.8, actual: 0.79 },
  { bin: "0.9", predicted: 0.9, actual: 0.88 },
  { bin: "1.0", predicted: 1.0, actual: 0.96 },
];

export function CalibrationChart({ data = MOCK_BINS }: CalibrationChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={chartDefaults.grid.stroke} strokeDasharray={chartDefaults.grid.strokeDasharray} />
        <XAxis
          dataKey="bin"
          tick={chartDefaults.axis.tick}
          axisLine={chartDefaults.axis.axisLine}
          tickLine={chartDefaults.axis.tickLine}
        />
        <YAxis
          domain={[0, 1]}
          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
          tick={chartDefaults.axis.tick}
          axisLine={chartDefaults.axis.axisLine}
          tickLine={chartDefaults.axis.tickLine}
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
          stroke={colors.textSubtle}
          strokeDasharray="4 4"
          dot={false}
          name="perfect"
        />
        {/* Actual calibration bars */}
        <Bar dataKey="actual" fill={colors.accentBlue} fillOpacity={0.6} radius={[2, 2, 0, 0]} maxBarSize={20} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
