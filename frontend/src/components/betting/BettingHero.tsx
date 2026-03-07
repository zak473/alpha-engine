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
    neutral:  { bg: "rgba(99,102,241,0.09)",  border: "rgba(99,102,241,0.22)",  color: "#4338ca", label: "rgba(67,56,202,0.65)" },
    positive: { bg: "rgba(48,224,106,0.10)",  border: "rgba(48,224,106,0.24)",  color: "#15803d", label: "rgba(21,128,61,0.65)" },
    accent:   { bg: "rgba(59,130,246,0.09)",  border: "rgba(59,130,246,0.22)",  color: "#1d4ed8", label: "rgba(29,78,216,0.65)" },
    warning:  { bg: "rgba(251,191,36,0.10)",  border: "rgba(214,162,61,0.28)",  color: "#b45309", label: "rgba(180,83,9,0.65)" },
  }[tone];

  return (
    <div className="rounded-[22px] px-4 py-3" style={{ background: styles.bg, border: `1px solid ${styles.border}` }}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em]">
        <Icon size={13} style={{ color: styles.color }} />
        <span style={{ color: styles.label }}>{label}</span>
      </div>
      <div className="mt-2 text-lg font-semibold" style={{ color: styles.color }}>{value}</div>
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
              <span className="inline-flex h-2 w-2 rounded-full animate-pulse bg-[var(--accent)]" />
              ELO-Powered
            </div>
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight lg:text-[3.05rem] lg:leading-[0.98] text-text-primary">
              Find your edge before the market does.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 lg:text-[15px] text-text-muted">
              Our models score every upcoming match using ELO ratings, form, and historical data — surfacing the bets where your probability estimate beats the book.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-xs text-text-muted">
              {[activeSportLabel, `${filteredCount} matches analysed`, "5 sports covered", "Updated every 30 min"].map((item) => (
                <span key={item} className="rounded-full px-3 py-1.5" style={{ border: "1px solid var(--border0)", background: "var(--bg2)" }}>{item}</span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StatChip icon={Activity}    label="Live now"          value={liveCount > 0 ? `${liveCount} matches` : "None right now"} tone="positive" />
            <StatChip icon={TrendingUp}  label="Best edge today"    value={topEdge > 0 ? `+${topEdge.toFixed(1)}%` : "—"} tone="accent" />
            <StatChip icon={ShieldCheck} label="Avg confidence"     value={`${avgConfidence}%`} tone="neutral" />
            <StatChip icon={Flame}       label="Matches analysed"   value={`${matches.length}`} tone="warning" />
          </div>
        </div>
      </div>
    </section>
  );
}
