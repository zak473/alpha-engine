import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Design system — sportsbook-grade dark
        surface: {
          base:    "#06060a",   // page bg — near-void (was #09090b)
          raised:  "#0a0a0e",   // sidebar, rails (was #111113)
          overlay: "#0f0f15",   // cards, panels (was #18181b)
          border:  "#1c1c26",   // default dividers (was #27272a)
          border1: "#2a2a38",   // hover/active border elevation
        },
        text: {
          primary: "#f0f0f6",   // slightly cooler white (was #f4f4f5)
          muted:   "#8888a0",   // blue-grey tint (was #71717a)
          subtle:  "#3a3a4a",   // (was #3f3f46)
        },
        accent: {
          green:  "#22c55e",
          red:    "#ef4444",
          blue:   "#3b82f6",
          amber:  "#f59e0b",
          purple: "#a855f7",
          teal:   "#0d9488",   // Alpha Engine primary CTA
          gold:   "#b45309",   // highlights — use sparingly
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1rem" }],
        "3xs": ["0.5625rem", { lineHeight: "0.875rem" }],
      },
      borderRadius: {
        sm: "3px",
        md: "5px",
        lg: "7px",
        xl: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
