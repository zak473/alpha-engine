/**
 * Alpha Engine — Dark Glass design tokens
 */

export const colors = {
  bg0:      "#09090b",
  bg1:      "#111113",
  bg2:      "#18181b",
  text0:    "#f4f4f5",
  text1:    "#71717a",
  text2:    "#3f3f46",
  border0:  "#27272a",
  border1:  "#323236",
  accent:   "#3b82f6",
  positive: "#22c55e",
  negative: "#ef4444",
  warning:  "#f59e0b",
  info:     "#3b82f6",
  soccer:      "#22c55e",
  tennis:      "#22c55e",
  esports:     "#a855f7",
  basketball:  "#f59e0b",
  baseball:    "#ef4444",
  hockey:      "#06b6d4",
  horseracing: "#e879f9",

  surfaceBase:    "#09090b",
  surfaceRaised:  "#111113",
  surfaceOverlay: "#18181b",
  surfaceBorder:  "#27272a",
  textPrimary:    "#f4f4f5",
  textMuted:      "#71717a",
  textSubtle:     "#3f3f46",
  accentGreen:    "#22c55e",
  accentRed:      "#ef4444",
  accentBlue:     "#3b82f6",
  accentAmber:    "#f59e0b",
  accentPurple:   "#a855f7",
  accentTeal:     "#3b82f6",
  accentGold:     "#d97706",
} as const;

export type ColorToken = keyof typeof colors;
export const radius = { sm: 6, md: 10 } as const;

export const chartDefaults = {
  axis: {
    tick: {
      fill: "#3f3f46",
      fontSize: 10,
      fontFamily: "'JetBrains Mono', monospace",
    },
    axisLine: false,
    tickLine: false,
  },
  yAxisWidth: 38,
  cursor: { fill: "rgba(59,130,246,0.06)" },
  grid: {
    stroke: "#27272a",
    strokeDasharray: "2 4",
  },
  tooltip: {
    contentStyle: {
      background: "#18181b",
      border: "1px solid #27272a",
      borderRadius: radius.md,
      fontSize: 11,
      fontFamily: "'JetBrains Mono', monospace",
      padding: "6px 10px",
    },
    labelStyle:  { color: "#71717a", marginBottom: 4, fontSize: 10 },
    itemStyle:   { color: "#f4f4f5", padding: 0 },
    cursor:      { fill: "rgba(59,130,246,0.06)" },
  },
} as const;

export function sportColor(sport: string): string {
  const map: Record<string, string> = {
    soccer:      colors.soccer,
    tennis:      colors.tennis,
    esports:     colors.esports,
    basketball:  colors.basketball,
    baseball:    colors.baseball,
    hockey:      colors.hockey,
    horseracing: colors.horseracing,
  };
  return map[sport.toLowerCase()] ?? colors.text1;
}
