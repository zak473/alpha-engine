"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, TrendingUp, ShieldCheck, Trophy,
  Activity, Circle, ClipboardList, BrainCircuit,
} from "lucide-react";
import { useSidebar } from "@/components/layout/SidebarContext";

const NAV = [
  { label: "Betting Board", href: "/dashboard", icon: LayoutDashboard },
  { label: "Predictions", href: "/predictions", icon: BrainCircuit },
  { label: "Challenges", href: "/challenges", icon: Trophy },
  { label: "Record", href: "/record", icon: ClipboardList },
  { label: "Performance", href: "/performance", icon: TrendingUp },
];

const SPORTS = [
  { label: "Soccer", href: "/sports/soccer/matches", color: "#22c55e" },
  { label: "Tennis", href: "/sports/tennis/matches", color: "#22c55e" },
  { label: "Esports", href: "/sports/esports/matches", color: "#8b5cf6" },
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
      {open && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: "rgba(0,0,0,0.20)" }}
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          height: "100vh",
          width: "var(--sidebar-width)",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(180deg,#09090b 0%,#111113 100%)",
          borderRight: "1px solid #27272a",
          zIndex: 40,
          transform: open ? "translateX(0)" : undefined,
          transition: "transform 200ms",
          boxShadow: "24px 0 48px rgba(15,23,15,0.10)",
        }}
        className={open ? "" : "-translate-x-full lg:translate-x-0"}
      >
        <div className="px-4 pb-4 pt-4">
          <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.22)]">
            <div className="overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.06] p-3">
              <Image
                src="/never-in-doubt-logo.png"
                alt="Never In Doubt logo"
                width={900}
                height={600}
                className="h-auto w-full"
                priority
              />
            </div>
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Premium tipping platform</div>
              <div className="mt-1 text-base font-semibold text-white">Never In Doubt</div>
            </div>
            <p className="mt-3 text-[12px] leading-5 text-white/70">
              Cleaner white-and-green board styling with stronger readability across markets, stats, and live picks.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-blue-500/25 bg-blue-500/10 px-3 py-2 text-[11px] text-blue-300">
              <span className="inline-flex h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.45)]" />
              Models synced and live
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: "0 10px 10px", overflowY: "auto" }}>
          <div className="mb-5">
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Workspace</p>
            {NAV.map(({ label, href, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="nav-link"
                  style={active ? {
                    background: "rgba(59,130,246,0.12)",
                    color: "#fff",
                    border: "1px solid rgba(59,130,246,0.25)",
                    boxShadow: "0 10px 24px rgba(59,130,246,0.08)",
                  } : {
                    border: "1px solid transparent",
                    color: "rgba(255,255,255,0.86)",
                  }}
                >
                  <Icon size={14} style={{ flexShrink: 0, color: active ? "#93c5fd" : "rgba(255,255,255,0.55)" }} />
                  {label}
                </Link>
              );
            })}
          </div>

          <div>
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Sports hubs</p>
            {SPORTS.map(({ label, href, color }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="nav-link"
                  style={active ? {
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "#fff",
                  } : {
                    border: "1px solid transparent",
                    color: "rgba(255,255,255,0.78)",
                  }}
                >
                  <Circle size={7} style={{ color, fill: color, flexShrink: 0 }} />
                  {label}
                </Link>
              );
            })}
          </div>

          <div className="mt-5">
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">System</p>
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="nav-link"
              style={isActive("/admin") ? {
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "#fff",
              } : {
                border: "1px solid transparent",
                color: "rgba(255,255,255,0.78)",
              }}
            >
              <ShieldCheck size={14} style={{ flexShrink: 0, color: "rgba(255,255,255,0.55)" }} />
              Admin
            </Link>
          </div>
        </nav>

        <div className="border-t border-white/8 px-4 py-3 text-[11px] text-white/60">
          <div className="flex items-center gap-2">
            <Activity size={12} className="text-blue-400" />
            Never In Doubt live board
          </div>
        </div>
      </aside>
    </>
  );
}
