/**
 * Never In Doubt — design tokens
 * Single source of truth: mirrors the CSS variables in globals.css exactly.
 * Use these for inline styles and chart configuration.
 */

export const colors = {
  // Surfaces
  bg0: "#08120e",
  bg1: "rgba(255,255,255,0.04)",
  bg2: "rgba(255,255,255,0.06)",
  bg3: "rgba(255,255,255,0.08)",

  // Text
  text0: "#edf7f0",
  text1: "rgba(237,247,240,0.70)",
  text2: "rgba(237,247,240,0.42)",

  // Borders
  border0: "rgba(255,255,255,0.08)",
  border1: "rgba(255,255,255,0.12)",

  // Brand accent (CTA, active states, focus rings)
  accent:      "#36f28f",
  accentDim:   "rgba(54,242,143,0.12)",
  accentMuted: "rgba(54,242,143,0.08)",
  accentRing:  "rgba(54,242,143,0.24)",

  // Semantic colours
  positive: "#4ade80",
  positiveDim: "rgba(74,222,128,0.14)",
  negative: "#fb7185",
  negativeDim: "rgba(251,113,133,0.14)",
  warning:  "#fbbf24",
  warningDim: "rgba(251,191,36,0.14)",
  info:     "#93c5fd",
  infoDim:  "rgba(147,197,253,0.14)",

  // Sport-specific colours
  soccer:      "#2edb6c",
  tennis:      "#22c55e",
  esports:     "#8b5cf6",
  basketball:  "#f59e0b",
  baseball:    "#ef4444",
  hockey:      "#06b6d4",
  horseracing: "#e879f9",

  // Legacy aliases (kept for backwards compat)
  surfaceBase:    "#08120e",
  surfaceRaised:  "rgba(255,255,255,0.04)",
  surfaceOverlay: "rgba(255,255,255,0.06)",
  surfaceBorder:  "rgba(255,255,255,0.08)",
  textPrimary:    "#edf7f0",
  textMuted:      "rgba(237,247,240,0.70)",
  textSubtle:     "rgba(237,247,240,0.42)",
  accentGreen:    "#4ade80",
  accentRed:      "#fb7185",
  accentBlue:     "#93c5fd",
  accentAmber:    "#fbbf24",
  accentPurple:   "#8b5cf6",
  accentTeal:     "#36f28f",
  accentGold:     "#d6a23d",
} as const;

export type ColorToken = keyof typeof colors;

export const radius = { sm: 8, md: 12, lg: 20, xl: 28 } as const;

export const chartDefaults = {
  axis: {
    tick: {
      fill: "rgba(237,247,240,0.42)",
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
    labelStyle:  { color: "rgba(237,247,240,0.70)", marginBottom: 4, fontSize: 10 },
    itemStyle:   { color: "#edf7f0", padding: 0 },
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
    hockey:      colors.hockey,
    horseracing: colors.horseracing,
  };
  return map[sport.toLowerCase()] ?? colors.text1;
}
