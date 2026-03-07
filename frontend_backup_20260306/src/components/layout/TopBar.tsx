"use client";

import { Menu, Search, LogIn } from "lucide-react";
import Link from "next/link";
import { useSidebar } from "./SidebarContext";
import { useAuth } from "@/lib/auth";

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
  const { user, isLoggedIn, logout } = useAuth();

  return (
    <header
      style={{
        height:       "var(--topbar-height)",
        display:      "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems:   "center",
        padding:      "0 16px",
        borderBottom: "1px solid var(--border0)",
        background:   "rgba(6,6,18,0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
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
            <h1 style={{ fontSize: 14, fontWeight: 600, color: "var(--text0)", lineHeight: 1, letterSpacing: "-0.01em" }}>
              {title}
            </h1>
            <span
              className="hidden sm:inline-flex"
              style={{
                padding:      "2px 7px",
                borderRadius: 20,
                fontSize:     10,
                fontWeight:   700,
                letterSpacing: "0.07em",
                color:        badge.color,
                background:   badge.bg,
                border:       `1px solid ${badge.color}35`,
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

      {/* Center — global search (hidden on mobile) */}
      <div className="hidden sm:flex" style={{ justifyContent: "center" }}>
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
            display:    "flex",
            alignItems: "center",
            gap:        6,
            paddingLeft: 10,
            borderLeft: "1px solid var(--border0)",
          }}
        >
          {isLoggedIn && user ? (
            <>
              <div
                onClick={logout}
                title="Click to log out"
                style={{
                  width:        30,
                  height:       30,
                  borderRadius: "var(--radius-md)",
                  background:   "linear-gradient(135deg, var(--accent-dim) 0%, rgba(99,102,241,0.15) 100%)",
                  border:       "1px solid rgba(34,211,238,0.25)",
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "center",
                  fontSize:     11,
                  fontWeight:   700,
                  color:        "var(--accent)",
                  fontFamily:   "'JetBrains Mono', monospace",
                  cursor:       "pointer",
                }}
              >
                {(user.displayName ?? user.email).slice(0, 2).toUpperCase()}
              </div>
              <span className="hidden sm:block" style={{ fontSize: 11, color: "var(--text1)" }}>
                {user.displayName ?? user.email}
              </span>
            </>
          ) : (
            <Link
              href="/login"
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          5,
                fontSize:     11,
                color:        "var(--accent)",
                textDecoration: "none",
              }}
            >
              <LogIn size={13} />
              <span className="hidden sm:inline">Log in</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
