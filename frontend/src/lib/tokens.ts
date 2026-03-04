/**
 * Design tokens — TypeScript mirror of CSS custom properties in globals.css.
 * Use these in JS contexts: Recharts stroke/fill colors, inline styles.
 * In JSX use Tailwind classes or CSS vars directly.
 */

export const colors = {
  surfaceBase:    "#06060a",
  surfaceRaised:  "#0a0a0e",
  surfaceOverlay: "#0f0f15",
  surfaceBorder:  "#1c1c26",
  textPrimary:    "#f0f0f6",
  textMuted:      "#8888a0",
  textSubtle:     "#3a3a4a",
  accentGreen:    "#22c55e",
  accentRed:      "#ef4444",
  accentBlue:     "#3b82f6",
  accentAmber:    "#f59e0b",
  accentPurple:   "#a855f7",
  accentTeal:     "#0d9488",
  accentGold:     "#b45309",
} as const;

export type ColorToken = keyof typeof colors;

export const border1 = "#2a2a38";

export const chartDefaults = {
  axis: {
    tick: { fill: colors.textMuted, fontSize: 11, fontFamily: "JetBrains Mono, monospace" },
    axisLine: false,
    tickLine: false,
  },
  yAxisWidth: 40,
  cursor: { fill: "rgba(255,255,255,0.025)" },
  grid: { stroke: colors.surfaceBorder, strokeDasharray: "3 3" },
  tooltip: {
    contentStyle: {
      background: colors.surfaceOverlay,
      border: `1px solid ${colors.surfaceBorder}`,
      borderRadius: "5px",
      fontSize: 11,
      padding: "6px 10px",
    },
    labelStyle: { color: colors.textMuted, marginBottom: 4 },
    itemStyle:  { color: colors.textPrimary },
  },
} as const;
