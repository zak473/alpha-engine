import type { ReactNode } from "react";
import { Activity, ArrowUpRight } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { SidebarProvider } from "./SidebarContext";

interface ShellStat {
  label: string;
  value: string;
  hint?: string;
  tone?: "accent" | "positive" | "warning" | "neutral" | (string & {});
}

interface AppShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  compact?: boolean;
  eyebrow?: string;
  stats?: ShellStat[];
  hideHero?: boolean;
}

function toneClass(tone?: ShellStat["tone"]) {
  switch (tone) {
    case "positive":
      return "shell-stat--positive";
    case "warning":
      return "shell-stat--warning";
    case "neutral":
      return "shell-stat--neutral";
    default:
      return "shell-stat--accent";
  }
}

export function AppShell({ children, title, subtitle, compact, eyebrow, stats, hideHero }: AppShellProps) {
  const hasStats = Boolean(stats?.length);

  return (
    <SidebarProvider>
      <div className="relative min-h-screen bg-surface-base text-text-primary">
        <div className="app-shell__ambient" aria-hidden="true" />
        <Sidebar />
        <div className={compact ? "app-shell__frame app-shell__frame--compact" : "app-shell__frame"}>
          <TopBar title={title} subtitle={subtitle} />
          <main className={compact ? "app-shell__main app-shell__main--compact" : "app-shell__main"}>
            <div className="app-shell__page">
              {!hideHero ? (
                <section className="shell-hero shell-panel">
                  <div className="shell-hero__copy">
                    <div className="shell-hero__kicker-row">
                      <span className="eyebrow">{eyebrow ?? "Workspace"}</span>
                      <span className="shell-indicator">
                        <Activity size={12} />
                        Live workspace
                      </span>
                    </div>

                    <div>
                      <h1 className="shell-hero__title">{title}</h1>
                      {subtitle ? <p className="shell-hero__subtitle">{subtitle}</p> : null}
                    </div>
                  </div>

                  <div className="shell-hero__status glass-card">
                    <div>
                      <div className="section-kicker">Focus</div>
                      <div className="shell-hero__status-title">Less noise. Faster decisions.</div>
                    </div>
                    <p className="shell-hero__status-copy">
                      The shell is tuned to surface the next action quickly: calmer cards, cleaner hierarchy, and shorter paths from overview to detail.
                    </p>
                    <div className="shell-hero__status-foot">
                      <span>Scan the board, open the detail, act with context</span>
                      <ArrowUpRight size={14} />
                    </div>
                  </div>

                  {hasStats ? (
                    <div className="shell-hero__stats">
                      {stats!.map((stat) => (
                        <div key={`${stat.label}-${stat.value}`} className={`shell-stat ${toneClass(stat.tone)}`}>
                          <div className="shell-stat__label">{stat.label}</div>
                          <div className="shell-stat__value">{stat.value}</div>
                          {stat.hint ? <div className="shell-stat__hint">{stat.hint}</div> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className={`app-shell__content ${compact ? "app-shell__content--compact" : ""}`.trim()}>
                {children}
              </section>
            </div>
          </main>
        </div>
        <BottomNav />
      </div>
    </SidebarProvider>
  );
}
