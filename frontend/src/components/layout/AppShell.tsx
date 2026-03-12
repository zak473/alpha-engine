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
      <div className="brand-shell relative min-h-screen bg-[linear-gradient(180deg,#f4f8f2_0%,#eef4ec_100%)] text-text-primary">
        <Sidebar />
        <div className={compact ? "relative z-[1] flex h-screen flex-col overflow-hidden lg:pl-56" : "relative z-[1] flex min-h-screen flex-col lg:pl-56"}>
          <TopBar title={title} subtitle={subtitle} />
          <main className={compact ? "flex flex-1 flex-col overflow-y-auto pb-14 lg:pb-0" : "flex-1 px-4 pb-20 pt-4 lg:px-6 lg:pb-6 lg:pt-6"}>
            {!compact && (
              <div className="mb-6 flex flex-col gap-3 rounded-[28px] border border-[#d9e2d7] bg-[linear-gradient(180deg,#ffffff,#f7faf5)] px-5 py-4 shadow-[0_12px_32px_rgba(17,19,21,0.06)] xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#c6e8d3] bg-[#f0faf4] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2d7f4f]">
                    <span className="inline-flex h-2 w-2 rounded-full bg-[#2edb6c]" />
                    Never In Doubt workspace
                  </div>
                  <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#111315] sm:text-[2rem]">{title}</h1>
                  {subtitle && <p className="mt-1 max-w-3xl text-sm text-[#667066]">{subtitle}</p>}
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-[#667066]">
                  {['Premium board', 'Cleaner hierarchy', 'Predictions palette'].map((item) => (
                    <span key={item} className="rounded-full border border-[#d9e2d7] bg-[#f7f8f5] px-3 py-2">
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
