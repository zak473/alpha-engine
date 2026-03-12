"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Circle, ClipboardList, LayoutDashboard, Radio, ShieldCheck, Swords, TrendingUp, Trophy, Users, BrainCircuit } from "lucide-react";
import { useSidebar } from "./SidebarContext";

const NAV = [
  { label: "Betting Board", href: "/dashboard", icon: LayoutDashboard },
  { label: "Live Now", href: "/live", icon: Radio },
  { label: "Matches", href: "/matches", icon: Swords },
  { label: "Tipsters", href: "/tipsters", icon: Users },
  { label: "Predictions", href: "/predictions", icon: BrainCircuit },
  { label: "Challenges", href: "/challenges", icon: Trophy },
  { label: "Record", href: "/record", icon: ClipboardList },
  { label: "Performance", href: "/performance", icon: TrendingUp },
];

const SPORTS = [
  { label: "Soccer", href: "/sports/soccer/matches", color: "#60a5fa" },
  { label: "Tennis", href: "/sports/tennis/matches", color: "#2edb6c" },
  { label: "Esports", href: "/sports/esports/matches", color: "#a855f7" },
  { label: "Basketball", href: "/sports/basketball/matches", color: "#f59e0b" },
  { label: "Baseball", href: "/sports/baseball/matches", color: "#ef4444" },
  { label: "Hockey", href: "/sports/hockey/matches", color: "#06b6d4" },
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
      {open && <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)} />}

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
          background: "linear-gradient(180deg,#f8fbf6 0%,#eef4ec 100%)",
          borderRight: "1px solid #d9e2d7",
          zIndex: 40,
          transform: open ? "translateX(0)" : undefined,
          transition: "transform 200ms",
          boxShadow: "18px 0 40px rgba(17,19,21,0.05)",
        }}
      >
        <div className="px-4 pb-3 pt-4">
          <div className="rounded-[28px] border border-[#d9e2d7] bg-[linear-gradient(180deg,#ffffff,#f7faf5)] p-4 shadow-[0_12px_28px_rgba(17,19,21,0.05)]">
            <div className="rounded-[22px] border border-[#c6e8d3] bg-[linear-gradient(180deg,#fbfffc,#f2fbf4)] p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-[#2d7f4f]/80">Never In Doubt</div>
              <div className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#111315]">Premium betting board</div>
              <p className="mt-3 text-[12px] leading-5 text-[#667066]">
                Predictions-page palette, cleaner hierarchy, and one consistent visual system across the product.
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[["Markets", "Live ranked"], ["Signals", "Model-led"]].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-[#d9e2d7] bg-[#f7f8f5] px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[#8a9488]">{label}</div>
                  <div className="mt-1 text-sm font-semibold text-[#111315]">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <div className="mb-6">
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#8a9488]">Workspace</p>
            <div className="space-y-1.5">
              {NAV.map(({ label, href, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="nav-link"
                    style={active ? { background: "#111315", color: "#fff", border: "1px solid #111315", boxShadow: "0 8px 20px rgba(17,19,21,0.08)" } : { border: "1px solid transparent" }}
                  >
                    <Icon size={15} style={{ flexShrink: 0, color: active ? "#2edb6c" : "#667066" }} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div>
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#8a9488]">Sports hubs</p>
            <div className="space-y-1.5">
              {SPORTS.map(({ label, href, color }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="nav-link"
                    style={active ? { background: "#f7f8f5", border: "1px solid #d9e2d7", color: "#111315" } : { border: "1px solid transparent" }}
                  >
                    <Circle size={8} style={{ color, fill: color, flexShrink: 0 }} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#8a9488]">System</p>
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="nav-link"
              style={isActive("/admin") ? { background: "#f7f8f5", border: "1px solid #d9e2d7", color: "#111315" } : { border: "1px solid transparent" }}
            >
              <ShieldCheck size={15} style={{ flexShrink: 0, color: "#667066" }} />
              Admin
            </Link>
          </div>
        </nav>

        <div className="border-t border-[#d9e2d7] px-4 py-3 text-[11px] text-[#667066]">
          <div className="flex items-center gap-2">
            <Activity size={12} className="text-[#2d7f4f]" />
            Synced live board experience
          </div>
        </div>
      </aside>
    </>
  );
}
