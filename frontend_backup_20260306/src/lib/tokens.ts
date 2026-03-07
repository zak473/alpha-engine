/**
 * QUANT TERMINAL — Design Tokens (JS mirror of globals.css vars)
 * Used for Recharts props that can't receive CSS classes.
 */

export const colors = {
  // Surfaces
  bg0:      "#0c0c10",
  bg1:      "#111116",
  bg2:      "#16161d",
  // Text
  text0:    "#e2e2ea",
  text1:    "#72728a",
  text2:    "#36364a",
  // Borders
  border0:  "#1e1e2c",
  border1:  "#2c2c3f",
  // Accent
  accent:   "#00d4ff",
  // Status
  positive: "#10b981",
  negative: "#f43f5e",
  warning:  "#f59e0b",
  info:     "#818cf8",
  // Sport
  soccer:   "#3b82f6",
  tennis:   "#10b981",
  esports:  "#a855f7",

  // Legacy aliases (keep for backward compat with existing chart code)
  surfaceBase:    "#0c0c10",
  surfaceRaised:  "#111116",
  surfaceOverlay: "#16161d",
  surfaceBorder:  "#1e1e2c",
  textPrimary:    "#e2e2ea",
  textMuted:      "#72728a",
  textSubtle:     "#36364a",
  accentGreen:    "#10b981",
  accentRed:      "#f43f5e",
  accentBlue:     "#3b82f6",
  accentAmber:    "#f59e0b",
  accentPurple:   "#a855f7",
  accentTeal:     "#00d4ff",
  accentGold:     "#b45309",
} as const;

export type ColorToken = keyof typeof colors;

export const radius = { sm: 2, md: 4 } as const;

/**
 * Recharts defaults — import this in every chart component.
 */
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
  cursor: { fill: "rgba(255,255,255,0.02)" },
  grid: {
    stroke: colors.border0,
    strokeDasharray: "2 4",
  },
  tooltip: {
    contentStyle: {
      background: colors.bg2,
      border: `1px solid ${colors.border1}`,
      borderRadius: radius.md,
      fontSize: 11,
      fontFamily: "'JetBrains Mono', monospace",
      padding: "6px 10px",
    },
    labelStyle:  { color: colors.text1, marginBottom: 4, fontSize: 10 },
    itemStyle:   { color: colors.text0, padding: 0 },
    cursor:      { fill: "rgba(255,255,255,0.02)" },
  },
} as const;

/** Map sport string → brand color hex */
export function sportColor(sport: string): string {
  const map: Record<string, string> = {
    soccer:  colors.soccer,
    tennis:  colors.tennis,
    esports: colors.esports,
  };
  return map[sport.toLowerCase()] ?? colors.text1;
}
