"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BrainCircuit, Circle, ClipboardList, LayoutDashboard, MessageSquare, Radio, ShieldCheck, Swords, TrendingUp, Trophy, Users } from "lucide-react";
import { useSidebar } from "./SidebarContext";

const NAV = [
  { label: "Predictions", href: "/predictions", icon: BrainCircuit },
  { label: "Betting Board", href: "/dashboard", icon: LayoutDashboard },
  { label: "Live Now", href: "/live", icon: Radio },
  { label: "Matches", href: "/matches", icon: Swords },
  { label: "Tipsters", href: "/tipsters", icon: Users },
  { label: "Challenges", href: "/challenges", icon: Trophy },
  { label: "Record", href: "/record", icon: ClipboardList },
  { label: "Performance", href: "/performance", icon: TrendingUp },
  { label: "AI Advisor", href: "/advisor", icon: MessageSquare },
];

const SPORTS = [
  { label: "Soccer",       href: "/sports/soccer/matches",      color: "#60a5fa" },
  { label: "Tennis",       href: "/sports/tennis/matches",      color: "#2edb6c" },
  { label: "Esports",      href: "/sports/esports/matches",     color: "#a855f7" },
  { label: "Basketball",   href: "/sports/basketball/matches",  color: "#f59e0b" },
  { label: "Baseball",     href: "/sports/baseball/matches",    color: "#ef4444" },
  { label: "Hockey",       href: "/sports/hockey/matches",      color: "#06b6d4" },
  { label: "Horse Racing", href: "/sports/horseracing",         color: "#e879f9" },
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
      {open && <div className="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={open ? "" : "-translate-x-full lg:translate-x-0"}
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          height: "100vh",
          width: "var(--sidebar-width)",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(180deg,#08120e 0%,#0a1510 100%)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          zIndex: 40,
          transform: open ? "translateX(0)" : undefined,
          transition: "transform 200ms",
          boxShadow: "24px 0 60px rgba(0,0,0,0.28)",
        }}
      >
        <div className="px-4 pb-3 pt-4">
          <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.24)] backdrop-blur">
            <div className="rounded-[22px] border border-emerald-300/14 bg-[radial-gradient(circle_at_top,rgba(54,242,143,0.20),transparent_70%),rgba(255,255,255,0.04)] p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-emerald-200/70">Never In Doubt</div>
              <div className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">Premium betting board</div>
              <p className="mt-3 text-[12px] leading-5 text-white/58">
                A calmer shell, stronger hierarchy, and cleaner live workflow across the whole product.
              </p>
            </div>
            <div className="mt-4 flex justify-center">
              <Image src="/never-in-doubt-logo.png" alt="Never In Doubt" width={1264} height={848} className="w-full h-auto opacity-90" />
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <div className="mb-6">
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-white/32">Workspace</p>
            <div className="space-y-1.5">
              {NAV.map(({ label, href, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="nav-link"
                    style={active ? { background: "linear-gradient(135deg,rgba(54,242,143,0.18),rgba(54,242,143,0.08))", color: "#fff", border: "1px solid rgba(54,242,143,0.24)", boxShadow: "0 10px 24px rgba(54,242,143,0.08)" } : { border: "1px solid transparent" }}
                  >
                    <Icon size={15} style={{ flexShrink: 0, color: active ? "#7af7b7" : "rgba(255,255,255,0.54)" }} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div>
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-white/32">Sports hubs</p>
            <div className="space-y-1.5">
              {SPORTS.map(({ label, href, color }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="nav-link"
                    style={active ? { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", color: "#fff" } : { border: "1px solid transparent" }}
                  >
                    <Circle size={8} style={{ color, fill: color, flexShrink: 0 }} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-white/32">System</p>
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="nav-link"
              style={isActive("/admin") ? { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", color: "#fff" } : { border: "1px solid transparent" }}
            >
              <ShieldCheck size={15} style={{ flexShrink: 0, color: "rgba(255,255,255,0.54)" }} />
              Admin
            </Link>
          </div>
        </nav>

        <div className="border-t border-white/8 px-4 py-3 text-[11px] text-white/52">
          <div className="flex items-center gap-2">
            <Activity size={12} className="text-emerald-300" />
            Synced live board experience
          </div>
        </div>
      </aside>
    </>
  );
}
