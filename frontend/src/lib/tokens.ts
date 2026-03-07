/**
 * Never In Doubt — Flat White Hybrid design tokens
 */

export const colors = {
  bg0:      "#f6f8f4",
  bg1:      "#ffffff",
  bg2:      "#eef2eb",
  text0:    "#111315",
  text1:    "#667066",
  text2:    "#95a093",
  border0:  "#d8e0d4",
  border1:  "#c6d3c1",
  accent:   "#2edb6c",
  positive: "#1d9a4d",
  negative: "#d94b61",
  warning:  "#d6a23d",
  info:     "#64748b",
  soccer:   "#2edb6c",
  tennis:   "#22c55e",
  esports:  "#8b5cf6",

  surfaceBase:    "#f6f8f4",
  surfaceRaised:  "#ffffff",
  surfaceOverlay: "#eef2eb",
  surfaceBorder:  "#d8e0d4",
  textPrimary:    "#111315",
  textMuted:      "#667066",
  textSubtle:     "#95a093",
  accentGreen:    "#1d9a4d",
  accentRed:      "#d94b61",
  accentBlue:     "#64748b",
  accentAmber:    "#d6a23d",
  accentPurple:   "#8b5cf6",
  accentTeal:     "#2edb6c",
  accentGold:     "#d6a23d",
} as const;

export type ColorToken = keyof typeof colors;
export const radius = { sm: 6, md: 10 } as const;

export const chartDefaults = {
  axis: {
    tick: {
      fill: colors.text1,
      fontSize: 10,
      fontFamily: "'JetBrains Mono', monospace",
    },
    axisLine: false,
    tickLine: false,
  },
  yAxisWidth: 38,
  cursor: { fill: "rgba(29,154,77,0.06)" },
  grid: {
    stroke: colors.border0,
    strokeDasharray: "2 4",
  },
  tooltip: {
    contentStyle: {
      background: colors.bg1,
      border: `1px solid ${colors.border1}`,
      borderRadius: radius.md,
      fontSize: 11,
      fontFamily: "'JetBrains Mono', monospace",
      padding: "6px 10px",
    },
    labelStyle:  { color: colors.text1, marginBottom: 4, fontSize: 10 },
    itemStyle:   { color: colors.text0, padding: 0 },
    cursor:      { fill: "rgba(29,154,77,0.06)" },
  },
} as const;

export function sportColor(sport: string): string {
  const map: Record<string, string> = {
    soccer: colors.soccer,
    tennis: colors.tennis,
    esports: colors.esports,
  };
  return map[sport.toLowerCase()] ?? colors.text1;
}
