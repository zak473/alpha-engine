import type { Config } from "tailwindcss";

/**
 * QUANT TERMINAL — Tailwind config
 * All color utilities map to CSS vars defined in globals.css.
 * Never use raw Tailwind color classes (blue-500, etc.) in components.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ── Surface layers ──────────────────────────────────────────
        bg0: "var(--bg0)",
        bg1: "var(--bg1)",
        bg2: "var(--bg2)",

        // ── Text ────────────────────────────────────────────────────
        t0: "var(--text0)",
        t1: "var(--text1)",
        t2: "var(--text2)",

        // ── Borders ─────────────────────────────────────────────────
        b0: "var(--border0)",
        b1: "var(--border1)",

        // ── Accent & status ─────────────────────────────────────────
        positive: "var(--positive)",
        negative: "var(--negative)",
        warning:  "var(--warning)",
        info:     "var(--info)",

        // ── Legacy aliases (for existing components) ─────────────────
        surface: {
          base:    "var(--bg0)",
          raised:  "var(--bg1)",
          overlay: "var(--bg2)",
          border:  "var(--border0)",
          border1: "var(--border1)",
        },
        text: {
          primary: "var(--text0)",
          muted:   "var(--text1)",
          subtle:  "var(--text2)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          green:   "var(--positive)",
          red:     "var(--negative)",
          amber:   "var(--warning)",
          blue:    "var(--info)",
          teal:    "var(--accent)",
          purple:  "#a855f7",
          gold:    "#b45309",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1rem" }],   // 10px
        "3xs": ["0.5625rem", { lineHeight: "0.875rem" }], // 9px
      },
      borderRadius: {
        sm: "var(--radius-sm)",   // 8px
        md: "var(--radius-md)",   // 12px
        lg: "var(--radius-lg)",   // 20px
        xl: "var(--radius-xl)",   // 28px
      },
      spacing: {
        "8":  "8px",
        "12": "12px",
        "16": "16px",
        "24": "24px",
        "32": "32px",
      },
      boxShadow: {
        "0": "none",
        "1": "0 1px 3px rgba(0,0,0,0.4)",
      },
      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
