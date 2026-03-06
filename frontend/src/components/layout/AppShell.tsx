import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { SidebarProvider } from "./SidebarContext";

interface AppShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  /** compact=true → full-bleed main (no padding), fixed height columns for 3-col layouts */
  compact?: boolean;
}

export function AppShell({ children, title, subtitle, compact }: AppShellProps) {
  return (
    <SidebarProvider>
      <div className="bg-surface-base">
        <Sidebar />
        <div className={compact
          ? "lg:pl-56 h-screen overflow-hidden flex flex-col"
          : "lg:pl-56 flex flex-col min-h-screen"
        }>
          <TopBar title={title} subtitle={subtitle} />
          <main className={compact
            ? "flex-1 overflow-hidden h-full flex flex-col pb-14 lg:pb-0"
            : "flex-1 p-4 lg:p-6 pb-20 lg:pb-6"
          }>
            {children}
          </main>
        </div>
        {/* Bottom nav — mobile only */}
        <BottomNav />
      </div>
    </SidebarProvider>
  );
}
