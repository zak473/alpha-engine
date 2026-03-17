/**
 * Alpha Engine — Dark Glass design tokens
 */

export const colors = {
  bg0:      "#08120e",
  bg1:      "rgba(255,255,255,0.04)",
  bg2:      "rgba(255,255,255,0.06)",
  text0:    "#ffffff",
  text1:    "rgba(255,255,255,0.60)",
  text2:    "rgba(255,255,255,0.38)",
  border0:  "rgba(255,255,255,0.08)",
  border1:  "rgba(255,255,255,0.12)",
  accent:   "#2edb6c",
  positive: "#36f28f",
  negative: "#ef4444",
  warning:  "#f59e0b",
  info:     "#64748b",
  soccer:      "#2edb6c",
  tennis:      "#22c55e",
  esports:     "#8b5cf6",
  basketball:  "#f59e0b",
  baseball:    "#ef4444",
  horseracing: "#e879f9",

  surfaceBase:    "#08120e",
  surfaceRaised:  "rgba(255,255,255,0.04)",
  surfaceOverlay: "rgba(255,255,255,0.06)",
  surfaceBorder:  "rgba(255,255,255,0.08)",
  textPrimary:    "#ffffff",
  textMuted:      "rgba(255,255,255,0.60)",
  textSubtle:     "rgba(255,255,255,0.38)",
  accentGreen:    "#36f28f",
  accentRed:      "#ef4444",
  accentBlue:     "#64748b",
  accentAmber:    "#f59e0b",
  accentPurple:   "#8b5cf6",
  accentTeal:     "#2edb6c",
  accentGold:     "#f59e0b",
} as const;

export type ColorToken = keyof typeof colors;
export const radius = { sm: 6, md: 10 } as const;

export const chartDefaults = {
  axis: {
    tick: {
      fill: "rgba(255,255,255,0.38)",
      fontSize: 10,
      fontFamily: "'JetBrains Mono', monospace",
    },
    axisLine: false,
    tickLine: false,
  },
  yAxisWidth: 38,
  cursor: { fill: "rgba(54,242,143,0.06)" },
  grid: {
    stroke: "rgba(255,255,255,0.08)",
    strokeDasharray: "2 4",
  },
  tooltip: {
    contentStyle: {
      background: "#0d1f17",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: radius.md,
      fontSize: 11,
      fontFamily: "'JetBrains Mono', monospace",
      padding: "6px 10px",
    },
    labelStyle:  { color: "rgba(255,255,255,0.60)", marginBottom: 4, fontSize: 10 },
    itemStyle:   { color: "#ffffff", padding: 0 },
    cursor:      { fill: "rgba(54,242,143,0.06)" },
  },
} as const;

export function sportColor(sport: string): string {
  const map: Record<string, string> = {
    soccer:      colors.soccer,
    tennis:      colors.tennis,
    esports:     colors.esports,
    basketball:  colors.basketball,
    baseball:    colors.baseball,
    horseracing: colors.horseracing,
  };
  return map[sport.toLowerCase()] ?? colors.text1;
}
