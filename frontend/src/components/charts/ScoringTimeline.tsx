"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { chartDefaults, colors } from "@/lib/tokens";

export interface ScoringPeriod {
  period: string;
  home: number | null;
  away: number | null;
}

interface ScoringTimelineProps {
  periods: ScoringPeriod[];
  homeLabel: string;
  awayLabel: string;
  showRunningTotal?: boolean;
  height?: number;
}

export function ScoringTimeline({
  periods,
  homeLabel,
  awayLabel,
  showRunningTotal = true,
  height = 180,
}: ScoringTimelineProps) {
  let homeCum = 0;
  let awayCum = 0;

  const data = periods.map((p) => {
    homeCum += p.home ?? 0;
    awayCum += p.away ?? 0;
    return {
      period: p.period,
      home: p.home,
      away: p.away,
      homeCum,
      awayCum,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...chartDefaults.grid} vertical={false} />
        <XAxis dataKey="period" {...chartDefaults.axis} />
        <YAxis {...chartDefaults.axis} width={chartDefaults.yAxisWidth} />
        <Tooltip
          contentStyle={chartDefaults.tooltip.contentStyle}
          labelStyle={chartDefaults.tooltip.labelStyle}
          itemStyle={chartDefaults.tooltip.itemStyle}
          cursor={chartDefaults.cursor}
        />
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: colors.text1 }} />
        <Bar dataKey="home" name={homeLabel} fill={colors.accentBlue} fillOpacity={0.75} radius={[2, 2, 0, 0]} maxBarSize={28} />
        <Bar dataKey="away" name={awayLabel} fill={colors.accentAmber} fillOpacity={0.75} radius={[2, 2, 0, 0]} maxBarSize={28} />
        {showRunningTotal && (
          <>
            <Line type="monotone" dataKey="homeCum" name={`${homeLabel} Cum`} stroke={colors.accentBlue} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="awayCum" name={`${awayLabel} Cum`} stroke={colors.accentAmber} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          </>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
