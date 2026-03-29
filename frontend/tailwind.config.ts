import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1440px",
      },
      colors: {
        nid: {
          bg: "#050811",
          surface1: "#09111c",
          surface2: "#0e1725",
          surface3: "#132033",
          text: "#f6f8ff",
          textSoft: "rgba(246,248,255,0.84)",
          textMute: "rgba(246,248,255,0.62)",
          border: "rgba(255,255,255,0.08)",
          borderStrong: "rgba(255,255,255,0.14)",
          accent: "#00e57a",
          accentDim: "rgba(0,229,122,0.14)",
          accentMute: "rgba(0,229,122,0.08)",
          accentRing: "rgba(0,229,122,0.24)",
          positive: "#2fe38d",
          negative: "#ff627d",
          warning: "#ffbc57",
          info: "#72adff",
        },
        bg0: "var(--bg0)",
        bg1: "var(--bg1)",
        bg2: "var(--bg2)",
        t0: "var(--text0)",
        t1: "var(--text1)",
        t2: "var(--text2)",
        b0: "var(--border0)",
        b1: "var(--border1)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-barlow-condensed)", "Arial Narrow", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "Menlo", "monospace"],
      },
      boxShadow: {
        "nid-1": "0 16px 38px rgba(0,0,0,0.28)",
        "nid-2": "0 28px 80px rgba(0,0,0,0.42)",
        "nid-3": "0 42px 110px rgba(0,0,0,0.54)",
        "nid-glow": "0 18px 56px rgba(0,229,122,0.14)",
      },
      backgroundImage: {
        "hero-glow": "radial-gradient(1100px 700px at 8% 0%, rgba(0,229,122,0.08), transparent 54%)",
        "cta-glow": "radial-gradient(720px 420px at 50% 36%, rgba(0,229,122,0.12), transparent 62%)",
      },
      keyframes: {
        pulseGlow: {
          "0%,100%": { boxShadow: "0 0 0 4px rgba(0,229,122,0.10), 0 0 14px rgba(0,229,122,0.24)" },
          "50%": { boxShadow: "0 0 0 6px rgba(0,229,122,0.12), 0 0 24px rgba(0,229,122,0.42)" },
        },
        floatSoft: {
          "0%,100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "pulse-glow": "pulseGlow 2.4s ease-in-out infinite",
        "float-soft": "floatSoft 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
