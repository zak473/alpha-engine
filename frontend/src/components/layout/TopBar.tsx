"use client";

import { Menu, Search } from "lucide-react";
import { useSidebar } from "./SidebarContext";

const ENV = process.env.NEXT_PUBLIC_ENV ?? "development";

const ENV_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  production:  { label: "PROD",  color: "var(--positive)", bg: "rgba(16,185,129,0.10)" },
  staging:     { label: "STAGE", color: "var(--info)",     bg: "rgba(129,140,248,0.10)" },
  development: { label: "DEV",   color: "var(--warning)",  bg: "rgba(245,158,11,0.10)"  },
};

const badge = ENV_BADGE[ENV] ?? ENV_BADGE.development;

interface TopBarProps {
  title:     string;
  subtitle?: string;
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const { setOpen } = useSidebar();

  return (
    <header
      style={{
        height:       "var(--topbar-height)",
        display:      "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems:   "center",
        padding:      "0 16px",
        borderBottom: "1px solid var(--border0)",
        background:   "var(--bg1)",
        position:     "sticky",
        top:          0,
        zIndex:       30,
        flexShrink:   0,
      }}
    >
      {/* Left — hamburger + breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <button
          className="lg:hidden"
          onClick={() => setOpen(true)}
          style={{
            padding:      "4px",
            borderRadius: "var(--radius-md)",
            color:        "var(--text1)",
            background:   "none",
            border:       "none",
            cursor:       "pointer",
            display:      "flex",
            alignItems:   "center",
          }}
          aria-label="Open sidebar"
        >
          <Menu size={15} />
        </button>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 13, fontWeight: 600, color: "var(--text0)", lineHeight: 1 }}>
              {title}
            </h1>
            <span
              className="hidden sm:inline-flex"
              style={{
                padding:      "1px 6px",
                borderRadius: "var(--radius-sm)",
                fontSize:     10,
                fontWeight:   700,
                letterSpacing: "0.06em",
                color:        badge.color,
                background:   badge.bg,
                border:       `1px solid ${badge.color}30`,
              }}
            >
              {badge.label}
            </span>
          </div>
          {subtitle && (
            <p style={{ fontSize: 11, color: "var(--text1)", marginTop: 1 }}>{subtitle}</p>
          )}
        </div>
      </div>

      {/* Center — global search */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", width: 200 }}>
          <Search
            size={12}
            style={{
              position:  "absolute",
              left:      8,
              top:       "50%",
              transform: "translateY(-50%)",
              color:     "var(--text2)",
              pointerEvents: "none",
            }}
          />
          <input
            type="search"
            placeholder="Search…"
            className="input-field"
            style={{ paddingLeft: 26, fontSize: 11 }}
          />
        </div>
      </div>

      {/* Right — user chip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
        <div
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          6,
            paddingLeft:  10,
            borderLeft:   "1px solid var(--border0)",
          }}
        >
          <div
            style={{
              width:        26,
              height:       26,
              borderRadius: "var(--radius-md)",
              background:   "var(--accent-muted)",
              border:       "1px solid rgba(0,212,255,0.2)",
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              fontSize:     10,
              fontWeight:   700,
              color:        "var(--accent)",
              fontFamily:   "'JetBrains Mono', monospace",
            }}
          >
            ZK
          </div>
          <span className="hidden sm:block" style={{ fontSize: 11, color: "var(--text1)" }}>
            zak473
          </span>
        </div>
      </div>
    </header>
  );
}
