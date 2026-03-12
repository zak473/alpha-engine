"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BrainCircuit,
  Circle,
  ClipboardList,
  LayoutDashboard,
  Radio,
  ShieldCheck,
  Swords,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
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
  { label: "Soccer", href: "/sports/soccer/matches", color: "var(--sport-soccer)" },
  { label: "Tennis", href: "/sports/tennis/matches", color: "var(--sport-tennis)" },
  { label: "Esports", href: "/sports/esports/matches", color: "var(--sport-esports)" },
  { label: "Basketball", href: "/sports/basketball/matches", color: "var(--sport-basketball)" },
  { label: "Baseball", href: "/sports/baseball/matches", color: "var(--sport-baseball)" },
  { label: "Hockey", href: "/sports/hockey/matches", color: "var(--sport-hockey)" },
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
          style={{ background: "rgba(2, 6, 23, 0.28)" }}
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
          background: "var(--bg1)",
          borderRight: "1px solid var(--border0)",
          zIndex: 40,
          transform: open ? "translateX(0)" : undefined,
          transition: "transform 200ms",
        }}
        className={open ? "" : "-translate-x-full lg:translate-x-0"}
      >
        <div className="px-4 pb-3 pt-4">
          <div className="card p-4">
            <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border0)", background: "var(--bg0)" }}>
              <div className="p-3">
                <Image
                  src="/never-in-doubt-logo.png"
                  alt="Never In Doubt logo"
                  width={900}
                  height={600}
                  className="h-auto w-full"
                  priority
                />
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-subtle">
                premium tipping platform
              </div>
              <div className="mt-1 text-base font-semibold text-text-primary">Never In Doubt</div>
            </div>

            <p className="mt-2 text-[12px] leading-5 text-text-muted">
              A cleaner board, clearer stats, and sharper green accents across every sport.
            </p>

            <div
              className="mt-4 flex items-center gap-2 rounded-2xl px-3 py-2 text-[11px] font-medium"
              style={{
                background: "var(--accent-muted)",
                border: "1px solid rgba(46,219,108,0.18)",
                color: "var(--positive)",
              }}
            >
              <span className="inline-flex h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
              Models synced and live
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: "0 10px 10px", overflowY: "auto" }}>
          <div className="mb-5">
            <p className="label px-3 pb-2">Workspace</p>
            {NAV.map(({ label, href, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`nav-link ${active ? "nav-link--active" : ""}`}
                >
                  <Icon
                    size={14}
                    style={{
                      flexShrink: 0,
                      color: active ? "var(--positive)" : "var(--text2)",
                    }}
                  />
                  {label}
                </Link>
              );
            })}
          </div>

          <div>
            <p className="label px-3 pb-2">Sports hubs</p>
            {SPORTS.map(({ label, href, color }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`nav-link ${active ? "nav-link--active" : ""}`}
                >
                  <Circle size={7} style={{ color, fill: color, flexShrink: 0 }} />
                  {label}
                </Link>
              );
            })}
          </div>

          <div className="mt-5">
            <p className="label px-3 pb-2">System</p>
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className={`nav-link ${isActive("/admin") ? "nav-link--active" : ""}`}
            >
              <ShieldCheck size={14} style={{ flexShrink: 0, color: "var(--text2)" }} />
              Admin
            </Link>
          </div>
        </nav>

        <div className="border-t px-4 py-3 text-[11px] text-text-muted" style={{ borderColor: "var(--border0)" }}>
          <div className="flex items-center gap-2">
            <Activity size={12} style={{ color: "var(--positive)" }} />
            Never In Doubt betting board
          </div>
        </div>
      </aside>
    </>
  );
}
