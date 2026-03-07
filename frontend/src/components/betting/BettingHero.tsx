"use client";

import { Activity, Flame, ShieldCheck, TrendingUp } from "lucide-react";
import type { BettingMatch } from "@/lib/betting-types";

interface BettingHeroProps {
  matches: BettingMatch[];
  filteredCount: number;
  activeSportLabel: string;
}

function StatChip({ icon: Icon, label, value, tone = "neutral" }: { icon: typeof Activity; label: string; value: string; tone?: "neutral" | "positive" | "accent" | "warning"; }) {
  const styles = {
    neutral: { bg: "#1dd67a", border: "#16c66f", color: "#0f3d26" },
    positive: { bg: "#18d77a", border: "#15c46f", color: "#0f3d26" },
    accent: { bg: "#22e283", border: "#18ce74", color: "#0f3d26" },
    warning: { bg: "#20dc7f", border: "#18c972", color: "#0f3d26" },
  }[tone];

  return (
    <div className="rounded-[22px] px-4 py-3" style={{ background: styles.bg, border: `1px solid ${styles.border}` }}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em]">
        <Icon size={13} style={{ color: styles.color }} />
        <span style={{ color: "rgba(15,61,38,0.72)" }}>{label}</span>
      </div>
      <div className="mt-2 text-lg font-semibold" style={{ color: "#0b2216" }}>{value}</div>
    </div>
  );
}

export function BettingHero({ matches, filteredCount, activeSportLabel }: BettingHeroProps) {
  const liveCount = matches.filter((m) => m.status === "live").length;
  const topEdge = matches.reduce((max, m) => Math.max(max, m.edgePercent ?? 0), 0);
  const avgConfidence = matches.length ? Math.round(matches.reduce((sum, m) => sum + ((m.modelConfidence ?? 0.5) * 100), 0) / matches.length) : 0;

  return (
    <section className="px-4 pt-4 pb-3 lg:px-6 lg:pt-6 lg:pb-4">
      <div className="sportsbook-hero rounded-[30px] p-5 lg:p-7">
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.95fr] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ border: "1px solid rgba(46,219,108,0.18)", background: "rgba(46,219,108,0.08)", color: "var(--positive)" }}>
              <span className="inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              Never In Doubt
            </div>
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight lg:text-[3.05rem] lg:leading-[0.98] text-text-primary">
              A cleaner board built for faster scanning, sharper bets, and a stronger premium feel.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 lg:text-[15px] text-text-muted">
              Flat white surfaces, a darker shell, and controlled green accents make the board feel calmer, clearer, and more like a serious betting product.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-xs text-text-muted">
              {[activeSportLabel, `${filteredCount} active markets`, "Flat white hybrid", "Cleaner live workflow"].map((item) => (
                <span key={item} className="rounded-full px-3 py-1.5" style={{ border: "1px solid var(--border0)", background: "var(--bg2)" }}>{item}</span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StatChip icon={Activity} label="Live now" value={`${liveCount} matches`} tone="accent" />
            <StatChip icon={TrendingUp} label="Top edge" value={`+${topEdge.toFixed(1)}%`} tone="positive" />
            <StatChip icon={ShieldCheck} label="Model confidence" value={`${avgConfidence}% avg`} tone="neutral" />
            <StatChip icon={Flame} label="Board focus" value="Best bets first" tone="warning" />
          </div>
        </div>
      </div>
    </section>
  );
}
