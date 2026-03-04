"use client";

import { Bell, Menu, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";

const ENV = process.env.NEXT_PUBLIC_ENV ?? "development";

const ENV_BADGE: Record<string, { label: string; className: string }> = {
  production: { label: "PROD", className: "bg-accent-green/10 text-accent-green border-accent-green/20" },
  staging:    { label: "STAGE", className: "bg-accent-blue/10 text-accent-blue border-accent-blue/20" },
  development:{ label: "DEV",  className: "bg-accent-amber/10 text-accent-amber border-accent-amber/20" },
};

const envBadge = ENV_BADGE[ENV] ?? ENV_BADGE.development;

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const { setOpen } = useSidebar();

  return (
    <header className="h-12 grid grid-cols-3 items-center px-4 border-b border-surface-border bg-surface-base sticky top-0 z-30">
      {/* Left — hamburger (mobile) + title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          className="lg:hidden p-1.5 rounded-md hover:bg-white/[0.06] text-text-muted hover:text-text-primary transition-colors shrink-0"
          onClick={() => setOpen(true)}
          aria-label="Open sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-text-primary leading-none truncate">
              {title}
            </h1>
            <span
              className={cn(
                "hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0",
                envBadge.className
              )}
            >
              {envBadge.label}
            </span>
          </div>
          {subtitle && (
            <p className="text-xs text-text-muted mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Center — search */}
      <div className="flex justify-center">
        <div className="relative w-full max-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-subtle pointer-events-none" />
          <input
            type="search"
            placeholder="Search..."
            className={cn(
              "w-full pl-8 pr-3 py-1.5 text-sm rounded-md",
              "bg-surface-overlay border border-surface-border",
              "text-text-primary placeholder:text-text-subtle",
              "focus:outline-none focus:border-accent-blue/50 transition-colors"
            )}
          />
        </div>
      </div>

      {/* Right — bell + user */}
      <div className="flex items-center gap-3 justify-end">
        <button className="p-1.5 rounded-md hover:bg-white/[0.06] text-text-muted hover:text-text-primary transition-colors">
          <Bell className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 pl-3 border-l border-surface-border">
          <div className="h-7 w-7 rounded-full bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center">
            <User className="h-3.5 w-3.5 text-accent-blue" />
          </div>
          <span className="hidden sm:block text-xs text-text-muted">Admin</span>
        </div>
      </div>
    </header>
  );
}
