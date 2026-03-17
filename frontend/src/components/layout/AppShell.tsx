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
      <div className="brand-shell relative min-h-screen bg-[#09090b] text-text-primary">
        <Sidebar />
        <div className={compact ? "relative z-[1] flex h-screen flex-col overflow-hidden lg:pl-56" : "relative z-[1] flex min-h-screen flex-col lg:pl-56"}>
          <TopBar title={title} subtitle={subtitle} />
          <main className={compact ? "flex flex-1 flex-col overflow-y-auto pb-14 lg:pb-0" : "flex-1 px-4 pb-20 pt-4 lg:px-6 lg:pb-6 lg:pt-6"}>
            {!compact && (
              <div className="mb-6 flex flex-col gap-3 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] px-5 py-4 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-300">
                    <span className="inline-flex h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.8)]" />
                    Never In Doubt workspace
                  </div>
                  <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white sm:text-[2rem]">{title}</h1>
                  {subtitle && <p className="mt-1 max-w-3xl text-sm text-white/58">{subtitle}</p>}
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-white/60">
                  {['Premium board', 'Faster scanning', 'Live-first workflow'].map((item) => (
                    <span key={item} className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2">
                      {item}
                    </span>
                  ))}
                </div>
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
