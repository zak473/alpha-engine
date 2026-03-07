"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Swords, TrendingUp, ShieldCheck, Trophy, Activity, Circle, ClipboardList, BrainCircuit, Users } from "lucide-react";
import { useSidebar } from "./SidebarContext";

const NAV = [
  { label: "Betting Board", href: "/dashboard", icon: LayoutDashboard },
  { label: "Matches", href: "/matches", icon: Swords },
  { label: "Predictions", href: "/predictions", icon: BrainCircuit },
  { label: "Challenges", href: "/challenges", icon: Trophy },
  { label: "Record", href: "/record", icon: ClipboardList },
  { label: "Tipsters", href: "/tipsters", icon: Users },
  { label: "Performance", href: "/performance", icon: TrendingUp },
];

const SPORTS = [
  { label: "Soccer", href: "/sports/soccer/matches", color: "#60a5fa" },
  { label: "Tennis", href: "/sports/tennis/matches", color: "#2edb6c" },
  { label: "Esports", href: "/sports/esports/matches", color: "#a855f7" },
  { label: "Basketball", href: "/sports/basketball/matches", color: "#f59e0b" },
  { label: "Baseball", href: "/sports/baseball/matches", color: "#ef4444" },
];

export function Sidebar() {
  const path = usePathname();
  const { open, setOpen } = useSidebar();

  function isActive(href: string) {
    const base = href.split("?")[0];
    return path === base || (base !== "/" && path.startsWith(base));
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-30 lg:hidden" style={{ background: "rgba(2,6,23,0.4)" }} onClick={() => setOpen(false)} />}

      <aside
        style={{
          position: "fixed", left: 0, top: 0, height: "100vh", width: "var(--sidebar-width)", display: "flex", flexDirection: "column",
          background: "#111315", borderRight: "1px solid rgba(255,255,255,0.08)", zIndex: 40,
          transform: open ? "translateX(0)" : undefined, transition: "transform 200ms",
        }}
        className={open ? "" : "-translate-x-full lg:translate-x-0"}
      >
        <div className="px-4 pb-4 pt-4">
          <div className="rounded-[22px] border border-white/10 bg-[#171a18] p-4 shadow-[0_16px_34px_rgba(0,0,0,0.18)]">
            <div className="overflow-hidden rounded-[18px] border border-white/10 bg-black/80 p-3">
              <Image src="/never-in-doubt-logo.png" alt="Never In Doubt logo" width={900} height={600} className="h-auto w-full" priority />
            </div>
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-[rgba(226,232,240,0.56)]">premium tipping platform</div>
              <div className="mt-1 text-base font-semibold text-white">Never In Doubt</div>
            </div>
            <p className="mt-3 text-[12px] leading-5 text-[rgba(226,232,240,0.7)]">A cleaner hybrid layout with a brighter board, clearer stats, and sharper green accents.</p>
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[rgba(46,219,108,0.18)] bg-[rgba(46,219,108,0.10)] px-3 py-2 text-[11px] text-[var(--accent)]">
              <span className="inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" /> Models synced and live
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: "0 10px 10px", overflowY: "auto" }}>
          <div className="mb-5">
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[rgba(148,163,184,0.5)]">Workspace</p>
            {NAV.map(({ label, href, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link key={href} href={href} onClick={() => setOpen(false)} className="nav-link" style={active ? { background: "rgba(46,219,108,0.10)", color: "#fff", border: "1px solid rgba(46,219,108,0.20)" } : { border: "1px solid transparent" }}>
                  <Icon size={14} style={{ flexShrink: 0, color: active ? "var(--accent)" : "rgba(148,163,184,0.9)" }} />
                  {label}
                </Link>
              );
            })}
          </div>

          <div>
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[rgba(148,163,184,0.5)]">Sports hubs</p>
            {SPORTS.map(({ label, href, color }) => {
              const active = isActive(href);
              return (
                <Link key={href} href={href} onClick={() => setOpen(false)} className="nav-link" style={active ? { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" } : { border: "1px solid transparent" }}>
                  <Circle size={7} style={{ color, fill: color, flexShrink: 0 }} />
                  {label}
                </Link>
              );
            })}
          </div>

          <div className="mt-5">
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[rgba(148,163,184,0.5)]">System</p>
            <Link href="/admin" onClick={() => setOpen(false)} className="nav-link" style={isActive("/admin") ? { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" } : { border: "1px solid transparent" }}>
              <ShieldCheck size={14} style={{ flexShrink: 0, color: "rgba(148,163,184,0.9)" }} /> Admin
            </Link>
          </div>
        </nav>

        <div className="border-t border-white/8 px-4 py-3 text-[11px] text-[rgba(148,163,184,0.72)]">
          <div className="flex items-center gap-2"><Activity size={12} className="text-[var(--accent)]" /> Never In Doubt betting board</div>
        </div>
      </aside>
    </>
  );
}
