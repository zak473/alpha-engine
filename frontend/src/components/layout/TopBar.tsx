"use client";

import Image from "next/image";
import { Bell, Menu, Search, LogIn } from "lucide-react";
import Link from "next/link";
import { useSidebar } from "./SidebarContext";
import { useAuth } from "@/lib/auth";

const ENV = process.env.NEXT_PUBLIC_ENV ?? "development";
const ENV_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  production: { label: "PROD", color: "#16a34a", bg: "rgba(22,163,74,0.10)" },
  staging: { label: "STAGE", color: "#2563eb", bg: "rgba(37,99,235,0.10)" },
  development: { label: "DEV", color: "#1d9a4d", bg: "rgba(29,154,77,0.10)" },
};
const badge = ENV_BADGE[ENV] ?? ENV_BADGE.development;

interface TopBarProps { title: string; subtitle?: string; }

export function TopBar({ title, subtitle }: TopBarProps) {
  const { setOpen } = useSidebar();
  const { user, isLoggedIn, logout } = useAuth();

  return (
    <header style={{ height: "64px", display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1px solid var(--border0)", background: "rgba(246,248,244,0.94)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", position: "sticky", top: 0, zIndex: 30, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <button className="lg:hidden" onClick={() => setOpen(true)} style={{ padding: "6px", borderRadius: 12, color: "var(--text1)", background: "#fff", border: "1px solid var(--border0)", cursor: "pointer", display: "flex", alignItems: "center" }} aria-label="Open sidebar">
          <Menu size={16} />
        </button>

        <div className="hidden sm:flex items-center gap-3 rounded-2xl border px-3 py-2" style={{ borderColor: "var(--border0)", background: "#fff" }}>
          <div className="overflow-hidden rounded-xl border p-1.5" style={{ borderColor: "var(--border0)", background: "#111315" }}>
            <Image src="/never-in-doubt-logo.png" alt="Never In Doubt logo" width={96} height={48} className="h-8 w-auto" />
          </div>
          <div className="hidden md:block">
            <div className="text-[10px] uppercase tracking-[0.22em] text-text-subtle">Never In Doubt</div>
            <div className="text-xs font-medium text-text-primary">Premium board</div>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 15, fontWeight: 700, color: "var(--text0)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>{title}</h1>
            <span className="hidden sm:inline-flex" style={{ padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: badge.color, background: badge.bg, border: `1px solid ${badge.color}25` }}>{badge.label}</span>
          </div>
          {subtitle && <p style={{ fontSize: 11, color: "var(--text1)", marginTop: 2 }}>{subtitle}</p>}
        </div>
      </div>

      <div className="hidden md:flex" style={{ justifyContent: "center" }}>
        <div className="relative w-[280px]">
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text2)", pointerEvents: "none" }} />
          <input type="search" placeholder="Search matches, leagues, markets…" className="input-field" style={{ paddingLeft: 30, fontSize: 12 }} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
        <button className="hidden sm:inline-flex" style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 14, border: "1px solid var(--border0)", background: "#fff", color: "var(--text1)" }} aria-label="Notifications">
          <Bell size={15} />
        </button>

        {isLoggedIn && user ? (
          <div className="flex items-center gap-2 rounded-2xl border px-2 py-1.5" style={{ borderColor: "var(--border0)", background: "#fff" }}>
            <div onClick={logout} title="Click to log out" style={{ width: 32, height: 32, borderRadius: 12, background: "rgba(46,219,108,0.10)", border: "1px solid rgba(46,219,108,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--positive)", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>
              {user.username?.slice(0, 2).toUpperCase() ?? "ND"}
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="text-[11px] font-semibold text-text-primary">{user.username ?? "Member"}</div>
              <div className="text-[10px] text-text-subtle">Signed in</div>
            </div>
          </div>
        ) : (
          <Link href="/login" className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-[12px] font-semibold transition-colors hover:opacity-90" style={{ borderColor: "rgba(46,219,108,0.18)", background: "rgba(46,219,108,0.10)", color: "var(--positive)" }}>
            <LogIn size={14} /> Log in
          </Link>
        )}
      </div>
    </header>
  );
}
