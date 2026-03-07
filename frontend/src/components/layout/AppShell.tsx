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
        <div
          className={compact ? "lg:pl-56 h-screen overflow-hidden flex flex-col relative z-[1]" : "lg:pl-56 flex min-h-screen flex-col relative z-[1]"}
        >
          <TopBar title={title} subtitle={subtitle} />
          <main
            className={compact ? "flex-1 overflow-hidden h-full flex flex-col pb-14 lg:pb-0" : "flex-1 p-4 lg:p-6 pb-20 lg:pb-6"}
          >
            {!compact && (
              <section className="page-intro mb-5 lg:mb-6">
                <div className="page-intro__copy">
                  <div className="page-intro__eyebrow">Never In Doubt</div>
                  <div>
                    <h1 className="page-intro__title">{title}</h1>
                    {subtitle && <p className="page-intro__subtitle">{subtitle}</p>}
                  </div>
                  <div className="page-intro__tags">
                    <span className="page-chip">Blackout premium theme</span>
                    <span className="page-chip">Logo-led identity</span>
                    <span className="page-chip">High-conviction picks</span>
                  </div>
                </div>

                <div className="page-intro__brand">
                  <div className="page-intro__logoWrap">
                    <Image
                      src="/never-in-doubt-logo.png"
                      alt="Never In Doubt logo"
                      width={900}
                      height={600}
                      className="h-auto w-full"
                      priority
                    />
                  </div>
                  <div className="page-intro__meta">
                    <span className="page-intro__dot" />
                    Never In Doubt premium theme live
                  </div>
                </div>
              </section>
            )}
            {children}
          </main>
        </div>
        <BottomNav />
      </div>
    </SidebarProvider>
  );
}
