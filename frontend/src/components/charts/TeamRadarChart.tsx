"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { chartDefaults, colors } from "@/lib/tokens";

export interface RadarMetric {
  label: string;
  home: number;
  away: number;
}

interface TeamRadarChartProps {
  metrics: RadarMetric[];
  homeLabel: string;
  awayLabel: string;
  homeColor?: string;
  awayColor?: string;
  height?: number;
}

export function TeamRadarChart({
  metrics,
  homeLabel,
  awayLabel,
  homeColor = colors.accentBlue,
  awayColor = colors.accentAmber,
  height = 220,
}: TeamRadarChartProps) {
  const data = metrics.map((m) => ({
    subject: m.label,
    A: Math.min(100, Math.max(0, m.home)),
    B: Math.min(100, Math.max(0, m.away)),
    fullMark: 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
        <PolarGrid stroke={colors.border0} />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fill: colors.text1, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
        />
        <Tooltip
          contentStyle={chartDefaults.tooltip.contentStyle}
          labelStyle={chartDefaults.tooltip.labelStyle}
          itemStyle={chartDefaults.tooltip.itemStyle}
        />
        <Legend
          wrapperStyle={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: colors.text1 }}
        />
        <Radar
          name={homeLabel}
          dataKey="A"
          stroke={homeColor}
          fill={homeColor}
          fillOpacity={0.15}
          strokeWidth={1.5}
        />
        <Radar
          name={awayLabel}
          dataKey="B"
          stroke={awayColor}
          fill={awayColor}
          fillOpacity={0.15}
          strokeWidth={1.5}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/** Normalise a value from [min, max] → [0, 100]. If invert=true, higher raw = lower score. */
export function norm(value: number | null | undefined, min: number, max: number, invert = false): number {
  if (value == null) return 50;
  const clamped = Math.min(max, Math.max(min, value));
  const raw = ((clamped - min) / (max - min)) * 100;
  return invert ? 100 - raw : raw;
}
