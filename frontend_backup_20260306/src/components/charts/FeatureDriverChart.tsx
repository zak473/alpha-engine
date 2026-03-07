"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { chartDefaults, colors } from "@/lib/tokens";

interface FeatureDriver {
  feature: string;
  importance: number;
  value?: number | null;
}

interface FeatureDriverChartProps {
  drivers: FeatureDriver[];
  title?: string;
}

interface TooltipPayload {
  value: number;
  payload: FeatureDriver;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={chartDefaults.tooltip.contentStyle}>
      <p style={chartDefaults.tooltip.labelStyle}>{d.feature}</p>
      <p style={chartDefaults.tooltip.itemStyle}>
        Importance:{" "}
        <span style={{ color: colors.accent, fontVariantNumeric: "tabular-nums" }}>
          {(d.importance * 100).toFixed(1)}%
        </span>
      </p>
    </div>
  );
}

export function FeatureDriverChart({ drivers, title }: FeatureDriverChartProps) {
  // Sort descending by importance
  const data = [...drivers]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 8)
    .map((d) => ({ ...d, pct: parseFloat((d.importance * 100).toFixed(1)) }));

  return (
    <div className="chart-container">
      {title && (
        <div className="chart-header">
          <span className="chart-title">{title}</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 36)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            horizontal={false}
            stroke={chartDefaults.grid.stroke}
            strokeDasharray={chartDefaults.grid.strokeDasharray}
          />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            {...chartDefaults.axis}
          />
          <YAxis
            type="category"
            dataKey="feature"
            width={130}
            {...chartDefaults.axis}
          />
          <Tooltip content={<CustomTooltip />} cursor={chartDefaults.cursor} />
          <Bar dataKey="pct" radius={[0, 3, 3, 0]} maxBarSize={14}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={colors.accent}
                fillOpacity={0.75 - i * 0.05}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
