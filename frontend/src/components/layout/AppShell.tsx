import Image from "next/image";
import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { SidebarProvider } from "./SidebarContext";

interface AppShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  compact?: boolean;
}

export function AppShell({ children, title, subtitle, compact }: AppShellProps) {
  return (
    <SidebarProvider>
      <div className="brand-shell relative bg-surface-base">
        <Sidebar />
        <div className={compact ? "lg:pl-56 h-screen overflow-hidden flex flex-col relative z-[1]" : "lg:pl-56 flex min-h-screen flex-col relative z-[1]"}>
          <TopBar title={title} subtitle={subtitle} />
          <main className={compact ? "flex-1 overflow-y-auto flex flex-col pb-14 lg:pb-0" : "flex-1 p-4 lg:p-6 pb-20 lg:pb-6"}>
            {!compact && (
              <div className="mx-4 mt-3 mb-5 lg:mx-6 flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: "rgba(48,224,106,0.07)", border: "1px solid rgba(48,224,106,0.15)" }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="inline-flex h-2 w-2 rounded-full flex-shrink-0" style={{ background: "var(--accent)" }} />
                  <span className="text-sm font-semibold truncate" style={{ color: "var(--positive)" }}>Never In Doubt</span>
                  {subtitle && <span className="hidden text-xs text-text-muted sm:inline truncate">— {subtitle}</span>}
                </div>
                <span className="text-xs text-text-muted shrink-0 pl-3 hidden sm:block">{title}</span>
              </div>
            )}
            {children}
          </main>
        </div>
        <BottomNav />
      </div>
    </SidebarProvider>
  );
}
