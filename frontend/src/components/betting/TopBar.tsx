"use client";

import { Bell, Menu, Search, LogIn } from "lucide-react";
import Link from "next/link";
import { useSidebar } from "@/components/layout/SidebarContext";
import { useAuth } from "@/lib/auth";

const ENV = process.env.NEXT_PUBLIC_ENV ?? "development";

const ENV_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  production: { label: "PROD", color: "#179447", bg: "rgba(23,148,71,0.10)" },
  staging: { label: "STAGE", color: "#4f7a61", bg: "rgba(79,122,97,0.10)" },
  development: { label: "DEV", color: "#d6a23d", bg: "rgba(214,162,61,0.12)" },
};

const badge = ENV_BADGE[ENV] ?? ENV_BADGE.development;

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const { setOpen } = useSidebar();
  const { user, isLoggedIn, logout } = useAuth();

  return (
    <header
      style={{
        height: "var(--topbar-height)",
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        borderBottom: "1px solid var(--border0)",
        background: "rgba(255,255,255,0.84)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        position: "sticky",
        top: 0,
        zIndex: 30,
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <button
          className="lg:hidden"
          onClick={() => setOpen(true)}
          style={{
            padding: "8px",
            borderRadius: 12,
            color: "var(--text1)",
            background: "var(--bg1)",
            border: "1px solid var(--border0)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
          aria-label="Open sidebar"
        >
          <Menu size={16} />
        </button>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 15, fontWeight: 700, color: "var(--text0)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              {title}
            </h1>
            <span
              className="hidden sm:inline-flex"
              style={{
                padding: "3px 8px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: badge.color,
                background: badge.bg,
                border: `1px solid ${badge.color}22`,
              }}
            >
              {badge.label}
            </span>
          </div>
          {subtitle && <p style={{ fontSize: 11, color: "var(--text1)", marginTop: 2 }}>{subtitle}</p>}
        </div>
      </div>

      <div className="hidden md:flex" style={{ justifyContent: "center" }}>
        <div className="relative w-[320px]">
          <Search
            size={13}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text1)",
            }}
          />
          <input
            value=""
            readOnly
            placeholder="Search matches, leagues, markets..."
            style={{
              width: "100%",
              height: 38,
              borderRadius: 999,
              border: "1px solid var(--border0)",
              background: "var(--bg1)",
              padding: "0 14px 0 34px",
              color: "var(--text0)",
              fontSize: 12,
              outline: "none",
              boxShadow: "var(--shadow-1)",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
        <button
          aria-label="Alerts"
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            border: "1px solid var(--border0)",
            background: "var(--bg1)",
            color: "var(--text1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Bell size={14} />
        </button>

        {isLoggedIn ? (
          <div className="flex items-center gap-2 rounded-full border px-2 py-1.5" style={{ borderColor: "var(--border0)", background: "var(--bg1)" }}>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[linear-gradient(135deg,#30e06a,#179447)] text-[11px] font-bold text-white">
              {(user?.displayName ?? "A").slice(0, 1).toUpperCase()}
            </div>
            <div className="hidden sm:block pr-1">
              <div className="text-[12px] font-semibold" style={{ color: "var(--text0)" }}>{user?.displayName ?? "Analyst"}</div>
              <button onClick={logout} className="text-[10px] text-text-muted" style={{ color: "var(--text1)" }}>
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[12px] font-semibold transition"
            style={{
              border: "1px solid rgba(23,148,71,0.2)",
              background: "rgba(48,224,106,0.10)",
              color: "#14532d",
            }}
          >
            <LogIn size={14} />
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}
