"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Activity,
  BrainCircuit,
  Circle,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  Trophy,
  Users,
  UserCircle2,
} from "lucide-react";
import { useSidebar } from "./SidebarContext";
import { useAuth } from "@/lib/auth";

const NAV = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Predictions", href: "/predictions", icon: BrainCircuit },
  { label: "Performance", href: "/performance", icon: TrendingUp },
  { label: "Tipsters", href: "/tipsters", icon: Users },
  { label: "Challenges", href: "/challenges", icon: Trophy },
  { label: "Advisor", href: "/advisor", icon: MessageSquare },
  { label: "Profile", href: "/profile", icon: UserCircle2 },
];

const SPORTS = [
  { label: "Soccer", href: "/sports/soccer/matches", color: "#2edb6c" },
  { label: "Tennis", href: "/sports/tennis/matches", color: "#22c55e" },
  { label: "Esports", href: "/sports/esports/matches", color: "#8b5cf6" },
  { label: "Basketball", href: "/sports/basketball/matches", color: "#f59e0b" },
  { label: "Baseball", href: "/sports/baseball/matches", color: "#ef4444" },
  { label: "Hockey", href: "/sports/hockey/matches", color: "#06b6d4" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { open, setOpen } = useSidebar();
  const { logout } = useAuth();

  function handleLogout() {
    logout();
    window.location.href = "/login";
  }

  function isActive(href: string) {
    const base = href.split("?")[0];
    return pathname === base || (base !== "/" && pathname.startsWith(base));
  }

  return (
    <>
      {open ? <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} /> : null}

      <aside className={`shell-sidebar transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="shell-sidebar__brand">
          <div className="flex items-center gap-3">
            <Image src="/nidmainlogo.png" alt="Never In Doubt" width={132} height={36} className="h-12 w-auto [filter:invert(1)_hue-rotate(180deg)]" priority />
          </div>
          <p className="shell-sidebar__tag">AI betting intelligence · cleaner decision desk</p>
        </div>

        <nav className="flex-1 overflow-y-auto pb-4">
          <div className="shell-sidebar__section">
            <div className="shell-sidebar__label">Workspace</div>
            <div className="space-y-1">
              {NAV.map(({ label, href, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`shell-link ${active ? "shell-link--active" : ""}`}
                  >
                    <Icon size={16} className="shell-link__icon" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="shell-sidebar__section">
            <div className="shell-sidebar__label">Sports hubs</div>
            <div className="space-y-1">
              {SPORTS.map(({ label, href, color }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`shell-link ${active ? "shell-link--active" : ""}`}
                  >
                    <Circle size={9} style={{ color, fill: color }} className="shrink-0" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="shell-sidebar__section">
            <div className="shell-sidebar__label">System</div>
            <Link href="/admin" onClick={() => setOpen(false)} className={`shell-link ${isActive("/admin") ? "shell-link--active" : ""}`}>
              <ShieldCheck size={16} className="shell-link__icon" />
              <span>Admin</span>
            </Link>
          </div>
        </nav>

        <div className="shell-sidebar__footer">
          <div className="flex flex-col gap-3">
            <div className="shell-indicator">
              <Activity size={12} /> Models live
            </div>
            <button onClick={handleLogout} className="shell-link w-full text-nid-textMute hover:text-red-400">
              <LogOut size={16} className="shell-link__icon" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
