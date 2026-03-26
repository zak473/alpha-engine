"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ClipboardList, TrendingUp, MoreHorizontal,
  Trophy, ShieldCheck, BrainCircuit, Users, MessageSquare,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { label: "Dashboard",   href: "/dashboard",    icon: LayoutDashboard },
  { label: "Predictions", href: "/predictions",   icon: BrainCircuit    },
  { label: "Tipsters",    href: "/tipsters",      icon: Users           },
  { label: "Record",      href: "/record",        icon: ClipboardList   },
];

const MORE_NAV = [
  { label: "Challenges",  href: "/challenges",  icon: Trophy      },
  { label: "Performance", href: "/performance", icon: TrendingUp  },
  { label: "Admin",       href: "/admin",        icon: ShieldCheck },
  { label: "AI Advisor",  href: "/advisor",      icon: MessageSquare },
];

const SPORTS = [
  { label: "Soccer",     href: "/sports/soccer/matches",     color: "#3b82f6" },
  { label: "Tennis",     href: "/sports/tennis/matches",     color: "#10b981" },
  { label: "Basketball", href: "/sports/basketball/matches", color: "#f59e0b" },
  { label: "Baseball",   href: "/sports/baseball/matches",   color: "#ef4444" },
  { label: "Hockey",     href: "/sports/hockey/matches",     color: "#06b6d4" },
  { label: "Esports",    href: "/sports/esports/matches",    color: "#a855f7" },
];

export function BottomNav() {
  const path = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  function isActive(href: string) {
    const base = href.split("?")[0];
    return path === base || (base !== "/" && path.startsWith(base));
  }

  const isSport = SPORTS.some((s) => path.startsWith(s.href.split("/matches")[0]));

  return (
    <>
      {/* More drawer backdrop */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More drawer — slides up from bottom */}
      <div
        className={cn(
          "fixed bottom-[56px] left-0 right-0 z-50 lg:hidden rounded-t-2xl border-t transition-transform duration-200",
          moreOpen ? "translate-y-0" : "translate-y-full"
        )}
        style={{
          background:  "rgba(10,10,28,0.97)",
          borderColor: "var(--border0)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="p-4 pb-2">
          <div className="w-8 h-1 rounded-full bg-white/20 mx-auto mb-4" />

          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-2 px-1">Sports</p>
          <div className="grid grid-cols-6 gap-2 mb-4">
            {SPORTS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                onClick={() => setMoreOpen(false)}
                className="flex flex-col items-center gap-1 py-2 rounded-xl transition-colors"
                style={{
                  background: isActive(s.href) ? `${s.color}18` : "transparent",
                  border: `1px solid ${isActive(s.href) ? s.color + "40" : "transparent"}`,
                }}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                <span className="text-[10px] text-text-muted capitalize">{s.label}</span>
              </Link>
            ))}
          </div>

          <div className="border-t mb-3" style={{ borderColor: "var(--border0)" }} />

          <div className="flex gap-2 pb-2">
            {MORE_NAV.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-colors",
                  isActive(href)
                    ? "text-[var(--accent)] border-[rgba(34,211,238,0.3)]"
                    : "text-text-muted border-transparent hover:bg-white/5"
                )}
                style={isActive(href) ? { background: "var(--accent-dim)" } : {}}
              >
                <Icon size={18} />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t flex items-stretch"
        style={{
          height:      56,
          background:  "rgba(6,6,18,0.95)",
          borderColor: "var(--border0)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {PRIMARY_NAV.map(({ label, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
              style={{ color: active ? "var(--accent)" : "var(--text2)" }}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[9px] font-medium">{label}</span>
            </Link>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
          style={{ color: moreOpen ? "var(--accent)" : "var(--text2)" }}
        >
          <MoreHorizontal size={20} strokeWidth={moreOpen ? 2.5 : 1.8} />
          <span className="text-[9px] font-medium">More</span>
        </button>
      </nav>
    </>
  );
}
