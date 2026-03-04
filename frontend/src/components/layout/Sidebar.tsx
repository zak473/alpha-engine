"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Swords,
  TrendingUp,
  ShieldCheck,
  Trophy,
  Zap,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";

const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { label: "Dashboard",   href: "/dashboard",   icon: LayoutDashboard },
      { label: "Matches",     href: "/matches",      icon: Swords },
      { label: "Challenges",  href: "/challenges",   icon: Trophy },
      { label: "Performance", href: "/performance",  icon: TrendingUp },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "System",  href: "/admin",  icon: ShieldCheck },
    ],
  },
];

const SPORTS = [
  { label: "Soccer",  href: "/matches?sport=soccer",  color: "#3b82f6" },
  { label: "Tennis",  href: "/matches?sport=tennis",  color: "#22c55e" },
  { label: "Esports", href: "/matches?sport=esports", color: "#a855f7" },
];

export function Sidebar() {
  const path = usePathname();
  const { open, setOpen } = useSidebar();

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 h-screen w-56 flex flex-col",
          "border-r border-surface-border bg-surface-raised z-40",
          "transition-transform duration-200",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 h-12 border-b border-surface-border shrink-0">
          <Zap className="h-4 w-4 text-accent-blue" strokeWidth={2.5} />
          <span className="text-sm font-semibold tracking-tight text-text-primary">
            Alpha Engine
          </span>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {NAV_SECTIONS.map((section, i) => (
            <div key={i}>
              {section.label && (
                <p className="label px-3 mb-1">{section.label}</p>
              )}
              <div className="space-y-0.5">
                {section.items.map(({ label, href, icon: Icon }) => {
                  const active = path === href || (href !== "/" && path.startsWith(href + "/"));
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors",
                        active
                          ? "bg-accent-blue/[0.08] text-text-primary border-l-2 border-accent-blue -ml-px pl-[11px]"
                          : "text-text-muted hover:bg-surface-border/40 hover:text-text-primary"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Sports sub-section */}
          <div>
            <p className="label px-3 mb-1">Sports</p>
            <div className="space-y-0.5">
              {SPORTS.map(({ label, href, color }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors rounded-md hover:bg-white/[0.04]"
                >
                  <Circle className="h-2 w-2 shrink-0 fill-current" style={{ color }} />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </nav>

        {/* Footer — model status */}
        <div className="px-4 py-3 border-t border-surface-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green" />
            </span>
            <span className="text-xs text-text-muted">Models live</span>
          </div>
        </div>
      </aside>
    </>
  );
}
