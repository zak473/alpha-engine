"use client";

import { Bell, Menu, Search, Activity } from "lucide-react";
import { useSidebar } from "./SidebarContext";

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const { setOpen } = useSidebar();

  return (
    <header className="topbar-panel">
      <div className="topbar-panel__row">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="topbar-icon-btn lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <div className="section-kicker">Workspace</div>
            <div className="topbar-panel__title-row">
              <h1 className="topbar-panel__title">{title}</h1>
              {subtitle ? <p className="topbar-panel__subtitle hidden xl:block">{subtitle}</p> : null}
            </div>
          </div>
        </div>

        <div className="topbar-panel__actions">
          <div className="topbar-search hidden lg:flex">
            <Search className="h-4 w-4 text-nid-textMute" />
            <span>Search matches, picks, tipsters</span>
          </div>

          <div className="shell-indicator hidden sm:inline-flex">
            <Activity size={12} /> Models live
          </div>

          <button type="button" className="topbar-icon-btn" aria-label="Notifications">
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
