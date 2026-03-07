"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Swords, TrendingUp, ShieldCheck, Trophy,
  Activity, Circle, ClipboardList, BrainCircuit,
} from "lucide-react";
import { useSidebar } from "./SidebarContext";

const NAV = [
  { label: "Dashboard",   href: "/dashboard",   icon: LayoutDashboard },
  { label: "Matches",     href: "/matches",      icon: Swords          },
  { label: "Predictions", href: "/predictions",  icon: BrainCircuit    },
  { label: "Challenges",  href: "/challenges",   icon: Trophy          },
  { label: "Record",      href: "/record",       icon: ClipboardList   },
  { label: "Performance", href: "/performance",  icon: TrendingUp      },
];

const SPORTS = [
  { label: "Soccer",     href: "/sports/soccer/matches",     color: "#3b82f6" },
  { label: "Tennis",     href: "/sports/tennis/matches",     color: "#10b981" },
  { label: "Esports",    href: "/sports/esports/matches",    color: "#a855f7" },
  { label: "Basketball", href: "/sports/basketball/matches", color: "#f59e0b" },
  { label: "Baseball",   href: "/sports/baseball/matches",   color: "#ef4444" },
];

export function Sidebar() {
  const path     = usePathname();
  const { open, setOpen } = useSidebar();

  function isActive(href: string) {
    const base = href.split("?")[0];
    return path === base || (base !== "/" && path.startsWith(base));
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        style={{
          position:        "fixed",
          left:            0,
          top:             0,
          height:          "100vh",
          width:           "var(--sidebar-width)",
          display:         "flex",
          flexDirection:   "column",
          background:      "linear-gradient(180deg, rgba(10,10,28,0.97) 0%, rgba(6,6,18,0.99) 100%)",
          borderRight:     "1px solid var(--border0)",
          backdropFilter:  "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          zIndex:          40,
          transform:       open ? "translateX(0)" : undefined,
          transition:      "transform 200ms",
        }}
        className={open ? "" : "-translate-x-full lg:translate-x-0"}
      >
        {/* Logo */}
        <div
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          10,
            padding:      "0 16px",
            height:       "var(--topbar-height)",
            borderBottom: "1px solid var(--border0)",
            flexShrink:   0,
          }}
        >
          <div style={{
            width: 26, height: 26, borderRadius: 8,
            background: "linear-gradient(135deg, var(--accent) 0%, #6366f1 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 12px rgba(34,211,238,0.3)",
          }}>
            <Activity size={14} color="#000" strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text0)", letterSpacing: "-0.02em" }}>
            Alpha Engine
          </span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "8px 8px", overflowY: "auto" }}>
          {/* Main nav */}
          <div style={{ marginBottom: 16 }}>
            {NAV.map(({ label, href, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="nav-link"
                  style={active ? {
                    background:   "var(--accent-muted)",
                    color:        "var(--accent)",
                    borderLeft:   "2px solid var(--accent)",
                  } : {}}
                >
                  <Icon size={13} style={{ flexShrink: 0 }} />
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Sports */}
          <div>
            <p className="label" style={{ padding: "0 10px", marginBottom: 4 }}>Markets</p>
            {SPORTS.map(({ label, href, color }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="nav-link"
                  style={{ gap: 8, ...(active ? { background: "var(--accent-muted)", borderLeft: "2px solid var(--accent)" } : {}) }}
                >
                  <Circle size={6} style={{ color, fill: color, flexShrink: 0 }} />
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Admin */}
          <div style={{ marginTop: 16 }}>
            <p className="label" style={{ padding: "0 10px", marginBottom: 4 }}>System</p>
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="nav-link"
              style={isActive("/admin") ? {
                background: "var(--accent-muted)",
                color:      "var(--accent)",
                borderLeft: "2px solid var(--accent)",
              } : {}}
            >
              <ShieldCheck size={13} style={{ flexShrink: 0 }} />
              Admin
            </Link>
          </div>
        </nav>

        {/* Footer */}
        <div
          style={{
            padding:     "8px 16px",
            borderTop:   "1px solid var(--border0)",
            flexShrink:  0,
            display:     "flex",
            alignItems:  "center",
            gap:         8,
          }}
        >
          <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
            <span
              style={{
                position:        "absolute",
                inset:           0,
                borderRadius:    "50%",
                background:      "var(--positive)",
                opacity:         0.6,
                animation:       "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
              }}
            />
            <span style={{ position: "relative", width: 8, height: 8, borderRadius: "50%", background: "var(--positive)" }} />
          </span>
          <span style={{ fontSize: 11, color: "var(--text1)" }}>Models live</span>
        </div>
      </aside>
    </>
  );
}
