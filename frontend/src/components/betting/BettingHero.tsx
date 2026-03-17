"use client";

import type { BettingMatch } from "@/lib/betting-types";

interface BettingHeroProps {
  matches: BettingMatch[];
  filteredCount: number;
  activeSportLabel: string;
}

type KpiVariant = "live" | "edge" | "neutral";

function KpiChip({
  value,
  sub,
  variant = "neutral",
}: {
  value: string;
  sub?: string;
  variant?: KpiVariant;
}) {
  const style: React.CSSProperties =
    variant === "live"
      ? { borderColor: "rgba(52,211,153,0.28)", background: "rgba(52,211,153,0.09)", color: "#6ee7b7" }
      : variant === "edge"
      ? { borderColor: "rgba(251,191,36,0.22)", background: "rgba(251,191,36,0.08)", color: "#fcd34d" }
      : { borderColor: "var(--border0)", background: "var(--bg2)", color: "var(--text2)" };

  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] tabular-nums"
      style={style}
    >
      {variant === "live" && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      )}
      <span className="font-semibold">{value}</span>
      {sub && <span className="ml-px text-[9px] opacity-55">{sub}</span>}
    </span>
  );
}

export function BettingHero({ matches, filteredCount, activeSportLabel }: BettingHeroProps) {
  const liveCount = matches.filter((m) => m.status === "live").length;
  const topEdge = matches.reduce((max, m) => Math.max(max, m.edgePercent ?? 0), 0);
  const predictedMatches = matches.filter((m) => m.modelConfidence != null);
  const avgConfidence = predictedMatches.length
    ? Math.round(
        predictedMatches.reduce((sum, m) => sum + m.modelConfidence! * 100, 0) /
          predictedMatches.length
      )
    : null;

  return (
    <div className="flex items-start justify-between gap-4 px-4 pb-2.5 pt-3 lg:px-6">
      <div>
        <h1 className="text-[14px] font-bold tracking-[-0.02em] text-white">Betting Board</h1>
        <p className="mt-0.5 text-[11px] text-white/32">
          {activeSportLabel} · AI-ranked predictions · sorted by edge
        </p>
      </div>
      <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
        {liveCount > 0 && <KpiChip value={`${liveCount} live`} variant="live" />}
        {topEdge > 0 && <KpiChip value={`+${topEdge.toFixed(1)}%`} sub="edge" variant="edge" />}
        {avgConfidence != null && <KpiChip value={`${avgConfidence}%`} sub="conf" />}
        <KpiChip value={`${filteredCount}`} sub={filteredCount === 1 ? "match" : "matches"} />
      </div>
    </div>
  );
}
