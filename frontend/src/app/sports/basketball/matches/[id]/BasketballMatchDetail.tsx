"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveRefresh } from "@/lib/hooks/useLiveRefresh";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";
import type {
  BasketballMatchDetail as TMatch,
  BasketballTeamBoxScore,
  BasketballPlayerOut,
  BasketballAdvancedStats,
  BasketballShotZone,
  BasketballInjury,
  BasketballTeamFormOut,
  BasketballEloPanelOut,
  BasketballClutchStatsOut,
  BasketballLineupUnitOut,
  BasketballScoringRunOut,
  BasketballRefereeOut,
  BasketballBettingOut,
} from "@/lib/types";
import { FormStreak } from "@/components/charts/FormStreak";
import { BasketballLivePanel } from "@/components/live/LiveMatchPanel";
import { TeamRadarChart, norm } from "@/components/charts/TeamRadarChart";
import { ScoringTimeline } from "@/components/charts/ScoringTimeline";
import { BasketballCourtSVG } from "@/components/charts/BasketballCourtSVG";

// ─── Utility ─────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, d = 1): string {
  if (n == null) return "—";
  return n.toFixed(d);
}
function fmtPct(n: number | null | undefined, d = 1): string {
  if (n == null) return "—";
  return (n * 100).toFixed(d) + "%";
}
function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return String(Math.round(n));
}
function shotLine(m: number | null | undefined, a: number | null | undefined): string {
  if (m == null || a == null) return "—";
  return `${m}/${a}`;
}

// ─── Primitive layout components ─────────────────────────────────────────────

function Panel({
  title,
  subtitle,
  children,
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-[#d9e2d7] bg-white shadow-[0_12px_30px_rgba(17,19,21,0.05)]">
      {title && (
        <div className="border-b border-[#edf2ea] px-5 py-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#667066]">
            {title}
          </span>
          {subtitle && <p className="mt-1 text-[12px] text-[#7b857b]">{subtitle}</p>}
        </div>
      )}
      <div className={padded ? "px-5 py-5" : ""}>{children}</div>
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center h-28 text-[#667066] text-xs text-center px-4">
      {msg}
    </div>
  );
}

function SideGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">{children}</div>
  );
}
function MainCol({ children }: { children: React.ReactNode }) {
  return <div className="lg:col-span-8 flex flex-col gap-4">{children}</div>;
}
function SideCol({ children }: { children: React.ReactNode }) {
  return <div className="lg:col-span-4 flex flex-col gap-4">{children}</div>;
}

function MetricRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: "positive" | "negative";
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#d9e2d7] last:border-0 gap-2">
      <span className="text-xs text-[#667066] shrink-0">{label}</span>
      <span
        className={cn(
          "text-xs font-mono tabular-nums",
          highlight === "positive"
            ? "text-[#2d7f4f] font-bold"
            : highlight === "negative"
            ? "text-[#dc2626]"
            : "text-[#111315]"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function StatBar({
  label,
  homeVal,
  awayVal,
  lowerBetter = false,
  fmtFn,
}: {
  label: string;
  homeVal: number | null | undefined;
  awayVal: number | null | undefined;
  lowerBetter?: boolean;
  fmtFn?: (v: number) => string;
}) {
  if (homeVal == null && awayVal == null) return null;
  const hv = homeVal ?? 0;
  const av = awayVal ?? 0;
  const total = hv + av;
  const homePct = total > 0 ? (hv / total) * 100 : 50;
  const formatV = fmtFn ?? ((v: number) => (v % 1 === 0 ? v.toString() : v.toFixed(1)));
  const homeBetter = lowerBetter
    ? (homeVal ?? Infinity) < (awayVal ?? -Infinity)
    : (homeVal ?? -Infinity) > (awayVal ?? Infinity);
  const awayBetter = lowerBetter
    ? (awayVal ?? Infinity) < (homeVal ?? -Infinity)
    : (awayVal ?? -Infinity) > (homeVal ?? Infinity);

  return (
    <div className="py-2 border-b border-[#d9e2d7] last:border-0">
      <div className="flex justify-between items-baseline mb-1.5">
        <span
          className={cn(
            "font-mono text-sm font-bold tabular-nums min-w-[2rem]",
            homeBetter ? "text-[#2d7f4f]" : "text-[#4f5950]"
          )}
        >
          {homeVal != null ? formatV(homeVal) : "—"}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-[#667066] text-center px-2">
          {label}
        </span>
        <span
          className={cn(
            "font-mono text-sm font-bold tabular-nums min-w-[2rem] text-right",
            awayBetter ? "text-[#b45309]" : "text-[#4f5950]"
          )}
        >
          {awayVal != null ? formatV(awayVal) : "—"}
        </span>
      </div>
      {total > 0 && (
        <div className="h-1 rounded-full overflow-hidden flex">
          <div className="h-full bg-[#2edb6c]" style={{ width: `${homePct}%` }} />
          <div className="h-full bg-[#f59e0b] flex-1" />
        </div>
      )}
    </div>
  );
}

function Delta({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-[#7b857b] font-mono text-[10px]">—</span>;
  return (
    <span
      className={cn(
        "flex items-center gap-0.5 font-mono text-[10px]",
        v >= 0 ? "text-[#2d7f4f]" : "text-[#dc2626]"
      )}
    >
      {v >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {v >= 0 ? "+" : ""}
      {v.toFixed(1)} ELO
    </span>
  );
}

// ─── KPI Cell ─────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "green" | "amber" | "red";
}) {
  const valCls =
    highlight === "green"
      ? "text-[#2d7f4f]"
      : highlight === "amber"
      ? "text-[#b45309]"
      : highlight === "red"
      ? "text-[#dc2626]"
      : "text-[#111315]";
  return (
    <div className="rounded-[20px] border border-[#d9e2d7] bg-[#f7f8f5] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-[#7b857b] mb-1">{label}</div>
      <div className={cn("font-mono text-[22px] font-bold leading-none", valCls)}>{value}</div>
      {sub && <div className="text-[10px] text-[#7b857b] mt-1">{sub}</div>}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; dot?: boolean }> = {
    live:      { cls: "bg-[#dcfce7] border-[#bbf7d0] text-[#15803d]", dot: true },
    scheduled: { cls: "bg-[#dbeafe] border-[#bfdbfe] text-[#1d4ed8]" },
    finished:  { cls: "bg-[#f7f8f5] border-[#d9e2d7] text-[#667066]" },
    cancelled: { cls: "bg-[#fee2e2] border-[#fecaca] text-[#dc2626]" },
  };
  const c = cfg[status] ?? cfg.scheduled;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
        c.cls
      )}
    >
      {c.dot && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
        </span>
      )}
      {status.toUpperCase()}
    </span>
  );
}

// ─── Countdown ───────────────────────────────────────────────────────────────

function Countdown({ kickoffUtc }: { kickoffUtc: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const diff = new Date(kickoffUtc).getTime() - now.getTime();
  if (diff <= 0) return <span className="text-[#2d7f4f] font-mono text-xs">Starting soon</span>;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return (
    <span className="font-mono text-sm font-bold text-[#2edb6c] tabular-nums">
      {d > 0 ? `${d}d ` : ""}
      {h > 0 ? `${h}h ` : ""}
      {m}m
    </span>
  );
}

// ─── Score by quarter ─────────────────────────────────────────────────────────

function ScoreByQuarter({ match }: { match: TMatch }) {
  const info = match.match_info;
  if (!info?.home_quarters && !info?.away_quarters) return null;
  const hq = info.home_quarters;
  const aq = info.away_quarters;
  const quarters = ["Q1", "Q2", "Q3", "Q4", ...(hq?.ot != null ? ["OT"] : [])];
  const hVals = [hq?.q1, hq?.q2, hq?.q3, hq?.q4, ...(hq?.ot != null ? [hq.ot] : [])];
  const aVals = [aq?.q1, aq?.q2, aq?.q3, aq?.q4, ...(aq?.ot != null ? [aq.ot] : [])];
  return (
    <div className="overflow-x-auto mt-4">
      <table className="text-xs font-mono tabular-nums text-right w-full border-collapse">
        <thead>
          <tr className="text-[#667066] border-b border-[#d9e2d7]">
            <th className="text-left font-normal pr-4 py-1.5 text-[#667066]">Team</th>
            {quarters.map((q) => (
              <th key={q} className="w-10 py-1.5 text-[#667066]">
                {q}
              </th>
            ))}
            <th className="pl-4 py-1.5 text-[#111315] font-semibold">T</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[#edf2ea]">
            <td className="text-left text-[#111315] pr-4 py-1.5 font-sans font-medium">
              {match.home.name}
            </td>
            {hVals.map((v, i) => (
              <td key={i} className="py-1.5 text-[#4f5950]">
                {v ?? "—"}
              </td>
            ))}
            <td className="pl-4 py-1.5 text-[#111315] font-bold">{match.home_score ?? "—"}</td>
          </tr>
          <tr>
            <td className="text-left text-[#111315] pr-4 py-1.5 font-sans font-medium">
              {match.away.name}
            </td>
            {aVals.map((v, i) => (
              <td key={i} className="py-1.5 text-[#4f5950]">
                {v ?? "—"}
              </td>
            ))}
            <td className="pl-4 py-1.5 text-[#111315] font-bold">{match.away_score ?? "—"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Hero Header ─────────────────────────────────────────────────────────────

function TeamBlock({
  elo,
  name,
  form,
  side,
}: {
  elo: BasketballEloPanelOut | null | undefined;
  name: string;
  form: BasketballTeamFormOut | null | undefined;
  side: "home" | "away";
}) {
  const isHome = side === "home";

  const formResults: Array<"W" | "L"> = form?.last_5
    ? (form.last_5.map((g) => g.result).filter((r): r is "W" | "L" =>
        r === "W" || r === "L"
      ))
    : [];

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", !isHome && "items-end text-right")}>
      <div className={cn("flex items-center gap-4", !isHome && "flex-row-reverse")}>
        <div className="flex h-16 w-16 items-center justify-center rounded-[18px] border border-white/10 bg-white/10 text-sm font-bold text-white shrink-0">
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[24px] font-semibold leading-tight text-white md:text-[28px]">
            {name}
          </p>
          {elo && (
            <div className={cn("mt-2 flex items-center gap-2", !isHome && "justify-end")}>
              <span className="font-mono text-[22px] font-bold tabular-nums text-[#2edb6c]">
                {fmtInt(elo.rating)}
              </span>
              {elo.rating_change != null && (
                <span className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1">
                  <Delta v={elo.rating_change} />
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {(formResults.length > 0 || form) && (
        <div className={cn("flex flex-wrap items-center gap-2", !isHome && "justify-end")}>
          {formResults.length > 0 && <FormStreak results={formResults} size="sm" />}
          {form?.days_rest != null && (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[10px] font-mono text-white/70">
              {form.days_rest}d rest
            </span>
          )}
          {form?.back_to_back && (
            <span className="inline-flex items-center rounded-full border border-[#fde68a]/30 bg-[#f59e0b]/15 px-3 py-1 text-[10px] font-mono text-[#fbbf24]">
              B2B
            </span>
          )}
          {form?.injury_count != null && form.injury_count > 0 && (
            <span className="inline-flex items-center rounded-full border border-[#fecaca]/30 bg-[#dc2626]/15 px-3 py-1 text-[10px] font-mono text-[#f87171]">
              {form.injury_count} inj
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function MatchHero({ match }: { match: TMatch }) {
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const isScheduled = match.status === "scheduled";
  const info = match.match_info;

  const homeProb = match.probabilities ? Math.round(match.probabilities.home_win * 100) : null;
  const awayProb = match.probabilities ? Math.round(match.probabilities.away_win * 100) : null;

  return (
    <div className="overflow-hidden rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,21,16,0.98),rgba(6,12,9,0.99))] shadow-[0_24px_60px_rgba(0,0,0,0.32)]">
      {/* Top bar */}
      <div className="border-b border-white/8 px-5 py-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link
            href="/sports/basketball/matches"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-white/75 transition hover:bg-white/[0.08] hover:text-white"
          >
            <ArrowLeft size={13} />
            Back to Basketball
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {match.league && (
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
                {match.league}
                {info?.season_phase ? ` · ${info.season_phase}` : ""}
              </span>
            )}
            <StatusBadge status={match.status} />
          </div>
        </div>
      </div>

      {/* 3-col grid */}
      <div className="grid gap-5 px-5 py-6 md:grid-cols-[1fr_280px_1fr] md:items-center md:px-6 md:py-8">
        <TeamBlock elo={match.elo_home} name={match.home.name} form={match.form_home} side="home" />

        {/* Score center */}
        <div className="flex flex-col items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.05] px-6 py-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          {isLive && (
            <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#bbf7d0]/40 bg-[#22c55e]/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#86efac]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22c55e]" />
              </span>
              Live
            </span>
          )}

          {isScheduled && match.kickoff_utc && (
            <div className="mb-3 text-[10px] text-white/50 font-mono">
              <Countdown kickoffUtc={match.kickoff_utc} />
            </div>
          )}

          <div className="flex items-center gap-3">
            {isScheduled ? (
              <span className="text-[42px] font-semibold tracking-[-0.05em] text-white/30">vs</span>
            ) : (
              <>
                <span
                  className={cn(
                    "text-[72px] font-semibold tracking-[-0.05em] leading-none tabular-nums",
                    isLive ? "text-[#2edb6c]" : "text-white"
                  )}
                >
                  {match.home_score ?? "—"}
                </span>
                <span className="text-white/30 text-3xl">–</span>
                <span
                  className={cn(
                    "text-[72px] font-semibold tracking-[-0.05em] leading-none tabular-nums",
                    isLive ? "text-[#2edb6c]" : "text-white"
                  )}
                >
                  {match.away_score ?? "—"}
                </span>
              </>
            )}
          </div>

          {isFinished && (
            <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-white/40 font-semibold">
              Final
            </div>
          )}

          {info?.overtime_periods != null && info.overtime_periods > 0 && (
            <div className="mt-1 text-[10px] text-[#f59e0b] font-mono font-semibold">
              OT×{info.overtime_periods}
            </div>
          )}

          {/* Win probability strip */}
          {homeProb != null && awayProb != null && (
            <div className="mt-5 w-full flex flex-col gap-1.5">
              <div className="flex h-2 w-full rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#2edb6c] transition-all duration-500"
                  style={{ width: `${homeProb}%` }}
                />
                <div className="h-full bg-[#f59e0b] flex-1" />
              </div>
              <div className="flex justify-between text-[10px] font-mono tabular-nums">
                <span className="text-[#2edb6c] font-semibold">{homeProb}%</span>
                <span className="text-white/40 text-[9px]">win prob</span>
                <span className="text-[#f59e0b] font-semibold">{awayProb}%</span>
              </div>
            </div>
          )}
        </div>

        <TeamBlock elo={match.elo_away} name={match.away.name} form={match.form_away} side="away" />
      </div>

      {/* Bottom info pills */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/8 px-5 py-3 md:px-6">
        {info?.arena && (
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] text-white/50">
            {info.arena}
          </span>
        )}
        {info?.city && (
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] text-white/50">
            {info.city}
          </span>
        )}
        {info?.season_phase && (
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] text-white/50 capitalize">
            {info.season_phase}
          </span>
        )}
        {info?.pace != null && (
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-mono text-white/50">
            Pace {fmt(info.pace, 1)}
          </span>
        )}
        {(info?.home_record || info?.away_record) && (
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-mono text-white/50">
            {info?.home_record ?? "—"} · {info?.away_record ?? "—"}
          </span>
        )}
      </div>

      {/* Score by quarter */}
      <div className="px-5 pb-5 md:px-6">
        <ScoreByQuarter match={match} />
      </div>
    </div>
  );
}

// ─── KPI strip ────────────────────────────────────────────────────────────────

function BasketballKpiStrip({ match }: { match: TMatch }) {
  const p = match.probabilities;
  const elo_h = match.elo_home;
  const elo_a = match.elo_away;
  const form_h = match.form_home;
  const form_a = match.form_away;
  const eloDiff = elo_h && elo_a ? Math.round(elo_h.rating - elo_a.rating) : null;

  const kpis: Array<{
    label: string;
    value: string;
    sub?: string;
    highlight?: "green" | "amber" | "red";
  }> = [];

  if (p) {
    kpis.push({
      label: `${match.home.name} Win`,
      value: fmtPct(p.home_win, 1),
      highlight: "green",
    });
    kpis.push({
      label: `${match.away.name} Win`,
      value: fmtPct(p.away_win, 1),
    });
  }
  if (elo_h && elo_a) {
    kpis.push({
      label: "ELO Home",
      value: fmtPct(elo_h.elo_win_prob),
      sub: fmtInt(elo_h.rating),
    });
    kpis.push({
      label: "ELO Away",
      value: fmtPct(elo_a.elo_win_prob),
      sub: fmtInt(elo_a.rating),
    });
  }
  if (match.confidence != null) {
    kpis.push({
      label: "Confidence",
      value: `${match.confidence}%`,
      highlight:
        match.confidence >= 70 ? "green" : match.confidence >= 55 ? "amber" : undefined,
    });
  }
  if (eloDiff != null) {
    kpis.push({
      label: "ELO Diff",
      value: eloDiff >= 0 ? `+${eloDiff}` : String(eloDiff),
      highlight: eloDiff > 0 ? "green" : eloDiff < 0 ? "red" : undefined,
    });
  }
  if (form_h) {
    kpis.push({
      label: `${match.home.name} Rest`,
      value: form_h.days_rest != null ? `${form_h.days_rest}d` : "—",
      sub: form_h.back_to_back ? "B2B" : undefined,
      highlight: form_h.back_to_back ? "amber" : undefined,
    });
  }
  if (form_a) {
    kpis.push({
      label: `${match.away.name} Rest`,
      value: form_a.days_rest != null ? `${form_a.days_rest}d` : "—",
      sub: form_a.back_to_back ? "B2B" : undefined,
      highlight: form_a.back_to_back ? "amber" : undefined,
    });
  }
  if (match.match_info?.pace != null) {
    kpis.push({ label: "Pace", value: fmt(match.match_info.pace, 1), sub: "poss/48" });
  }
  if (match.fair_odds) {
    if (match.fair_odds.home_win != null)
      kpis.push({ label: "Fair Odds H", value: match.fair_odds.home_win.toFixed(2) });
    if (match.fair_odds.away_win != null)
      kpis.push({ label: "Fair Odds A", value: match.fair_odds.away_win.toFixed(2) });
  }

  if (kpis.length === 0) return null;

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
      {kpis.slice(0, 8).map((k) => (
        <KpiCell key={k.label} label={k.label} value={k.value} sub={k.sub} highlight={k.highlight} />
      ))}
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  "Overview",
  "Lineups",
  "Box Score",
  "Team Stats",
  "Shot Profile",
  "H2H",
  "Elo",
  "Model",
  "Context",
] as const;
type Tab = (typeof TABS)[number];

// ─── Stat Duel row ────────────────────────────────────────────────────────────

function StatDuel({
  label,
  home,
  away,
  homeWins,
}: {
  label: string;
  home: string;
  away: string;
  homeWins?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#d9e2d7] last:border-0 gap-1">
      <span
        className={cn(
          "text-xs font-mono tabular-nums w-[38%] text-right pr-3",
          homeWins === true ? "text-[#2d7f4f] font-bold" : "text-[#4f5950]"
        )}
      >
        {home}
      </span>
      <span className="text-[10px] text-[#667066] w-[24%] text-center">{label}</span>
      <span
        className={cn(
          "text-xs font-mono tabular-nums w-[38%] text-left pl-3",
          homeWins === false ? "text-[#b45309] font-bold" : "text-[#4f5950]"
        )}
      >
        {away}
      </span>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ match }: { match: TMatch }) {
  const ah = match.adv_home;
  const aa = match.adv_away;
  const fh = match.form_home;
  const fa = match.form_away;

  const hq = match.match_info?.home_quarters;
  const aq = match.match_info?.away_quarters;
  const quarterPeriods =
    hq || aq
      ? (["Q1", "Q2", "Q3", "Q4"] as const)
          .map((p, i) => ({
            period: p,
            home: [hq?.q1, hq?.q2, hq?.q3, hq?.q4][i] ?? null,
            away: [aq?.q1, aq?.q2, aq?.q3, aq?.q4][i] ?? null,
          }))
          .filter((p) => p.home != null || p.away != null)
      : [];

  return (
    <SideGrid>
      <MainCol>
        {quarterPeriods.length > 0 && (
          <Panel title="Quarter Scoring">
            <ScoringTimeline
              periods={quarterPeriods}
              homeLabel={match.home.name}
              awayLabel={match.away.name}
              showRunningTotal={true}
              height={180}
            />
          </Panel>
        )}

        <Panel title="Team Comparison">
          {ah || aa ? (
            <div>
              <div className="flex text-[10px] text-[#667066] mb-1">
                <span className="w-[38%] text-right pr-3">{match.home.name}</span>
                <span className="w-[24%] text-center" />
                <span className="w-[38%] text-left pl-3">{match.away.name}</span>
              </div>
              <StatDuel
                label="ELO Rating"
                home={fmtInt(match.elo_home?.rating)}
                away={fmtInt(match.elo_away?.rating)}
                homeWins={(match.elo_home?.rating ?? 0) > (match.elo_away?.rating ?? 0)}
              />
              <StatDuel
                label="ELO Δ"
                home={
                  match.elo_home?.rating_change != null
                    ? (match.elo_home.rating_change >= 0 ? "+" : "") +
                      fmt(match.elo_home.rating_change)
                    : "—"
                }
                away={
                  match.elo_away?.rating_change != null
                    ? (match.elo_away.rating_change >= 0 ? "+" : "") +
                      fmt(match.elo_away.rating_change)
                    : "—"
                }
                homeWins={
                  (match.elo_home?.rating_change ?? 0) > (match.elo_away?.rating_change ?? 0)
                }
              />
              {ah && aa && (
                <>
                  <StatDuel
                    label="ORtg"
                    home={fmt(ah.ortg, 1)}
                    away={fmt(aa.ortg, 1)}
                    homeWins={(ah.ortg ?? 0) > (aa.ortg ?? 0)}
                  />
                  <StatDuel
                    label="DRtg"
                    home={fmt(ah.drtg, 1)}
                    away={fmt(aa.drtg, 1)}
                    homeWins={(ah.drtg ?? 999) < (aa.drtg ?? 999)}
                  />
                  <StatDuel
                    label="NetRtg"
                    home={fmt(ah.net_rtg, 1)}
                    away={fmt(aa.net_rtg, 1)}
                    homeWins={(ah.net_rtg ?? -99) > (aa.net_rtg ?? -99)}
                  />
                  <StatDuel
                    label="Pace"
                    home={fmt(ah.pace, 1)}
                    away={fmt(aa.pace, 1)}
                    homeWins={false}
                  />
                  <StatDuel
                    label="eFG%"
                    home={fmtPct(ah.efg_pct, 1)}
                    away={fmtPct(aa.efg_pct, 1)}
                    homeWins={(ah.efg_pct ?? 0) > (aa.efg_pct ?? 0)}
                  />
                  <StatDuel
                    label="TS%"
                    home={fmtPct(ah.ts_pct, 1)}
                    away={fmtPct(aa.ts_pct, 1)}
                    homeWins={(ah.ts_pct ?? 0) > (aa.ts_pct ?? 0)}
                  />
                  <StatDuel
                    label="TOV%"
                    home={fmt(ah.tov_pct, 1)}
                    away={fmt(aa.tov_pct, 1)}
                    homeWins={(ah.tov_pct ?? 99) < (aa.tov_pct ?? 99)}
                  />
                  <StatDuel
                    label="ORB%"
                    home={fmt(ah.orb_pct, 1)}
                    away={fmt(aa.orb_pct, 1)}
                    homeWins={(ah.orb_pct ?? 0) > (aa.orb_pct ?? 0)}
                  />
                  <StatDuel
                    label="FT Rate"
                    home={fmtPct(ah.ftr, 2)}
                    away={fmtPct(aa.ftr, 2)}
                    homeWins={(ah.ftr ?? 0) > (aa.ftr ?? 0)}
                  />
                  <StatDuel
                    label="3PAr"
                    home={fmtPct(ah.three_par, 1)}
                    away={fmtPct(aa.three_par, 1)}
                    homeWins={false}
                  />
                </>
              )}
            </div>
          ) : (
            <EmptyState msg="Advanced stats unavailable" />
          )}
        </Panel>

        <Panel title="Recent Form (Last 5)">
          {fh?.last_5 || fa?.last_5 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-[#667066] border-b border-[#d9e2d7]">
                    <th className="text-left font-normal py-1.5 pr-3">Team</th>
                    <th className="text-left font-normal py-1.5 pr-2">Opp</th>
                    <th className="text-right font-normal py-1.5 pr-2">Score</th>
                    <th className="text-center font-normal py-1.5 pr-2">H/A</th>
                    <th className="text-center font-normal py-1.5 pr-2">W/L</th>
                    <th className="text-right font-normal py-1.5 pr-2">Rest</th>
                    <th className="text-right font-normal py-1.5">NetRtg</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...(fh?.last_5 || []).map((e) => ({ ...e, team: match.home.name })),
                    ...(fa?.last_5 || []).map((e) => ({ ...e, team: match.away.name })),
                  ].map((e, i) => (
                    <tr key={i} className="border-b border-[#edf2ea] last:border-0">
                      <td className="py-1.5 pr-3 text-[#111315]">{e.team}</td>
                      <td className="py-1.5 pr-2 font-mono text-[#667066]">{e.opponent}</td>
                      <td className="py-1.5 pr-2 font-mono text-[#4f5950] text-right">{e.score}</td>
                      <td className="py-1.5 pr-2 text-center text-[#667066]">{e.home_away}</td>
                      <td
                        className={cn(
                          "py-1.5 pr-2 text-center font-bold",
                          e.result === "W" ? "text-[#2d7f4f]" : "text-[#dc2626]"
                        )}
                      >
                        {e.result}
                      </td>
                      <td className="py-1.5 pr-2 font-mono text-[#667066] text-right">
                        {e.days_rest ?? "—"}d
                      </td>
                      <td
                        className={cn(
                          "py-1.5 font-mono text-right",
                          (e.net_rtg ?? 0) >= 0 ? "text-[#2d7f4f]" : "text-[#dc2626]"
                        )}
                      >
                        {e.net_rtg != null
                          ? `${e.net_rtg >= 0 ? "+" : ""}${e.net_rtg.toFixed(1)}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState msg="No form data yet" />
          )}
        </Panel>
      </MainCol>

      <SideCol>
        <Panel title="Context">
          <div className="flex flex-col gap-0">
            {match.form_home && (
              <MetricRow
                label={`${match.home.name} Rest`}
                value={
                  (match.form_home.days_rest != null
                    ? `${match.form_home.days_rest}d`
                    : "—") + (match.form_home.back_to_back ? " (B2B)" : "")
                }
                highlight={match.form_home.back_to_back ? "negative" : undefined}
              />
            )}
            {match.form_away && (
              <MetricRow
                label={`${match.away.name} Rest`}
                value={
                  (match.form_away.days_rest != null
                    ? `${match.form_away.days_rest}d`
                    : "—") + (match.form_away.back_to_back ? " (B2B)" : "")
                }
                highlight={match.form_away.back_to_back ? "negative" : undefined}
              />
            )}
            {match.match_info?.arena && (
              <MetricRow label="Arena" value={match.match_info.arena} />
            )}
            {match.match_info?.attendance != null && (
              <MetricRow
                label="Attendance"
                value={match.match_info.attendance.toLocaleString()}
              />
            )}
            {match.match_info?.pace != null && (
              <MetricRow
                label="Pace"
                value={`${fmt(match.match_info.pace, 1)} poss/48`}
              />
            )}
          </div>
        </Panel>

        <Panel title="Key Edges">
          {match.key_drivers && match.key_drivers.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {match.key_drivers.slice(0, 5).map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="text-xs text-[#667066] w-28 truncate">{d.feature}</div>
                  <div className="flex-1 h-1.5 rounded-full bg-[#f7f8f5] border border-[#d9e2d7]">
                    <div
                      className="h-full rounded-full bg-[#2edb6c]/60"
                      style={{ width: `${d.importance * 100}%` }}
                    />
                  </div>
                  <div className="text-[10px] font-mono text-[#667066] w-8 text-right">
                    {Math.round(d.importance * 100)}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState msg="No edge analysis yet" />
          )}
        </Panel>

        {(match.match_info?.home_record || match.match_info?.away_record) && (
          <Panel title="Season Records">
            {match.match_info.home_record && (
              <div className="flex justify-between items-center py-1.5 border-b border-[#d9e2d7] text-xs">
                <span className="text-[#667066]">{match.home.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-[#111315]">
                    {match.match_info.home_record}
                  </span>
                  {match.match_info.home_streak && (
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-bold",
                        match.match_info.home_streak.startsWith("W")
                          ? "bg-[#dcfce7] text-[#15803d]"
                          : "bg-[#fee2e2] text-[#dc2626]"
                      )}
                    >
                      {match.match_info.home_streak}
                    </span>
                  )}
                </div>
              </div>
            )}
            {match.match_info.away_record && (
              <div className="flex justify-between items-center py-1.5 text-xs">
                <span className="text-[#667066]">{match.away.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-[#111315]">
                    {match.match_info.away_record}
                  </span>
                  {match.match_info.away_streak && (
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-bold",
                        match.match_info.away_streak.startsWith("W")
                          ? "bg-[#dcfce7] text-[#15803d]"
                          : "bg-[#fee2e2] text-[#dc2626]"
                      )}
                    >
                      {match.match_info.away_streak}
                    </span>
                  )}
                </div>
              </div>
            )}
          </Panel>
        )}

        {(match as any).scoring_runs &&
          ((match as any).scoring_runs as BasketballScoringRunOut[]).length > 0 && (
            <Panel title="Key Scoring Runs">
              <div className="flex flex-col gap-0">
                {((match as any).scoring_runs as BasketballScoringRunOut[]).map((run, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 border-b border-[#d9e2d7] last:border-0 text-xs"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full inline-block",
                          run.team === "home" ? "bg-[#2edb6c]" : "bg-[#f59e0b]"
                        )}
                      />
                      <span className="text-[#4f5950]">
                        {run.team === "home" ? match.home.name : match.away.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-bold text-[#111315]">{run.run_size}-0</span>
                      <span className="text-[#667066] text-[10px]">{run.period}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
      </SideCol>
    </SideGrid>
  );
}

// ─── Lineups tab ──────────────────────────────────────────────────────────────

function InjuryList({ injuries }: { injuries: BasketballInjury[] }) {
  if (!injuries.length)
    return <div className="text-xs text-[#667066] italic">No injuries reported</div>;
  return (
    <div className="flex flex-col gap-0">
      {injuries.map((inj, i) => (
        <div
          key={i}
          className="flex items-center gap-2 py-1.5 border-b border-[#d9e2d7] last:border-0"
        >
          <span
            className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded",
              inj.status === "Out"
                ? "bg-[#fee2e2] text-[#dc2626]"
                : inj.status === "Doubtful"
                ? "bg-[#fef3c7] text-[#b45309]"
                : inj.status === "Questionable"
                ? "bg-[#fef9c3] text-[#854d0e]"
                : "bg-[#dcfce7] text-[#15803d]"
            )}
          >
            {inj.status}
          </span>
          <span className="text-xs text-[#111315]">{inj.player_name}</span>
          {inj.position && (
            <span className="text-[10px] text-[#667066]">{inj.position}</span>
          )}
          {inj.reason && (
            <span className="text-[10px] text-[#667066] ml-auto">{inj.reason}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function LineupsTab({ match }: { match: TMatch }) {
  const boxH = match.box_home;
  const boxA = match.box_away;
  const injH = match.injuries_home ?? [];
  const injA = match.injuries_away ?? [];

  const renderLineup = (box: BasketballTeamBoxScore | null | undefined, teamName: string) => {
    if (!box?.players.length) return <EmptyState msg="No lineup data yet" />;
    const starters = box.players.filter((p) => p.is_starter);
    const bench = box.players.filter((p) => !p.is_starter);
    return (
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-[10px] text-[#2d7f4f] uppercase tracking-[0.14em] mb-2 font-semibold">
            Starters
          </div>
          {starters.map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 border-b border-[#d9e2d7] last:border-0 text-xs"
            >
              <span className="text-[#667066] w-8">{p.position}</span>
              <span className="text-[#111315] flex-1">{p.name}</span>
              <span className="font-mono text-[#667066] text-right">
                {p.minutes != null ? `${p.minutes.toFixed(0)}m` : ""}
              </span>
            </div>
          ))}
        </div>
        {bench.length > 0 && (
          <div>
            <div className="text-[10px] text-[#667066] uppercase tracking-[0.14em] mb-2 font-semibold">
              Bench
            </div>
            {bench.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1.5 border-b border-[#d9e2d7] last:border-0 text-xs"
              >
                <span className="text-[#667066] w-8">{p.position}</span>
                <span className="text-[#667066] flex-1">{p.name}</span>
                <span className="font-mono text-[#667066] text-right">
                  {p.minutes != null ? `${p.minutes.toFixed(0)}m` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <SideGrid>
      <MainCol>
        <div className="grid grid-cols-2 gap-4">
          <Panel title={match.home.name}>{renderLineup(boxH, match.home.name)}</Panel>
          <Panel title={match.away.name}>{renderLineup(boxA, match.away.name)}</Panel>
        </div>
      </MainCol>
      <SideCol>
        <Panel title={`${match.home.name} — Injuries`}>
          <InjuryList injuries={injH} />
        </Panel>
        <Panel title={`${match.away.name} — Injuries`}>
          <InjuryList injuries={injA} />
        </Panel>

        {(match as any).top_lineups_home && (
          <Panel title={`${match.home.name} — Top Lineups`}>
            {((match as any).top_lineups_home as BasketballLineupUnitOut[])
              .slice(0, 3)
              .map((lu, i) => (
                <div key={i} className="py-2 border-b border-[#d9e2d7] last:border-0">
                  <div className="text-[10px] text-[#667066] mb-1">{lu.players.join(" · ")}</div>
                  <div className="flex items-center gap-4 text-xs font-mono">
                    {lu.minutes != null && (
                      <span className="text-[#667066]">{fmt(lu.minutes, 0)}m</span>
                    )}
                    {lu.net_rating != null && (
                      <span
                        className={cn(
                          "font-bold",
                          lu.net_rating >= 0 ? "text-[#2d7f4f]" : "text-[#dc2626]"
                        )}
                      >
                        {lu.net_rating >= 0 ? "+" : ""}
                        {fmt(lu.net_rating, 1)} NetRtg
                      </span>
                    )}
                    {lu.plus_minus != null && (
                      <span
                        className={cn(
                          lu.plus_minus >= 0 ? "text-[#2d7f4f]" : "text-[#dc2626]"
                        )}
                      >
                        {lu.plus_minus >= 0 ? "+" : ""}
                        {lu.plus_minus} +/-
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </Panel>
        )}
        {(match as any).top_lineups_away && (
          <Panel title={`${match.away.name} — Top Lineups`}>
            {((match as any).top_lineups_away as BasketballLineupUnitOut[])
              .slice(0, 3)
              .map((lu, i) => (
                <div key={i} className="py-2 border-b border-[#d9e2d7] last:border-0">
                  <div className="text-[10px] text-[#667066] mb-1">{lu.players.join(" · ")}</div>
                  <div className="flex items-center gap-4 text-xs font-mono">
                    {lu.minutes != null && (
                      <span className="text-[#667066]">{fmt(lu.minutes, 0)}m</span>
                    )}
                    {lu.net_rating != null && (
                      <span
                        className={cn(
                          "font-bold",
                          lu.net_rating >= 0 ? "text-[#2d7f4f]" : "text-[#dc2626]"
                        )}
                      >
                        {lu.net_rating >= 0 ? "+" : ""}
                        {fmt(lu.net_rating, 1)} NetRtg
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </Panel>
        )}
      </SideCol>
    </SideGrid>
  );
}

// ─── Box Score tab ────────────────────────────────────────────────────────────

function PlayerBoxTable({ box, teamName }: { box: BasketballTeamBoxScore; teamName: string }) {
  const cols: Array<{ key: keyof BasketballPlayerOut; label: string; d?: number }> = [
    { key: "minutes",    label: "MIN",  d: 0 },
    { key: "points",     label: "PTS",  d: 0 },
    { key: "rebounds",   label: "REB",  d: 0 },
    { key: "assists",    label: "AST",  d: 0 },
    { key: "steals",     label: "STL",  d: 0 },
    { key: "blocks",     label: "BLK",  d: 0 },
    { key: "turnovers",  label: "TO",   d: 0 },
    { key: "fouls",      label: "PF",   d: 0 },
    { key: "plus_minus", label: "+/-",  d: 0 },
    { key: "fg_pct",     label: "FG%",  d: 1 },
    { key: "fg3_pct",    label: "3P%",  d: 1 },
    { key: "ft_pct",     label: "FT%",  d: 1 },
  ];
  return (
    <div>
      <div className="text-[10px] text-[#667066] uppercase tracking-[0.14em] font-semibold mb-3">
        {teamName}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse font-mono tabular-nums">
          <thead>
            <tr className="border-b border-[#d9e2d7] text-[#667066]">
              <th className="text-left font-normal py-1.5 pr-4 font-sans">Player</th>
              <th className="text-center font-normal py-1.5 px-1 w-6">Pos</th>
              {cols.map((c) => (
                <th key={c.key} className="text-right font-normal py-1.5 px-1.5">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {box.players.map((p, i) => (
              <tr
                key={i}
                className={cn(
                  "border-b border-[#edf2ea] last:border-0",
                  !p.is_starter && "opacity-60"
                )}
              >
                <td className="py-1.5 pr-4 font-sans text-[#111315] truncate max-w-[140px]">
                  {p.name}
                </td>
                <td className="py-1.5 px-1 text-center text-[#667066]">{p.position ?? ""}</td>
                {cols.map((c) => {
                  const val = p[c.key] as number | null | undefined;
                  const isShot =
                    c.key === "fg_pct" || c.key === "fg3_pct" || c.key === "ft_pct";
                  return (
                    <td
                      key={c.key}
                      className={cn(
                        "py-1.5 px-1.5 text-right",
                        c.key === "points" && (p.points ?? 0) >= 20
                          ? "text-[#b45309] font-bold"
                          : c.key === "plus_minus" && (p.plus_minus ?? 0) > 0
                          ? "text-[#2d7f4f]"
                          : c.key === "plus_minus" && (p.plus_minus ?? 0) < 0
                          ? "text-[#dc2626]"
                          : "text-[#4f5950]"
                      )}
                    >
                      {isShot ? fmtPct(val, 1) : fmtInt(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t border-[#d9e2d7] text-[#111315] font-bold bg-[#f7f8f5]">
              <td className="py-1.5 pr-4 font-sans">Team Totals</td>
              <td />
              <td className="py-1.5 px-1.5 text-right">
                {fmt(box.players.reduce((s, p) => s + (p.minutes ?? 0), 0), 0)}
              </td>
              <td className="py-1.5 px-1.5 text-right">{fmtInt(box.total_points)}</td>
              <td className="py-1.5 px-1.5 text-right">{fmtInt(box.total_rebounds)}</td>
              <td className="py-1.5 px-1.5 text-right">{fmtInt(box.total_assists)}</td>
              <td className="py-1.5 px-1.5 text-right">{fmtInt(box.total_steals)}</td>
              <td className="py-1.5 px-1.5 text-right">{fmtInt(box.total_blocks)}</td>
              <td className="py-1.5 px-1.5 text-right">{fmtInt(box.total_turnovers)}</td>
              <td className="py-1.5 px-1.5 text-right">{fmtInt(box.total_fouls)}</td>
              <td />
              <td className="py-1.5 px-1.5 text-right">{fmtPct(box.fg_pct, 1)}</td>
              <td className="py-1.5 px-1.5 text-right">{fmtPct(box.fg3_pct, 1)}</td>
              <td className="py-1.5 px-1.5 text-right">{fmtPct(box.ft_pct, 1)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamLeaders({ box, teamName }: { box: BasketballTeamBoxScore; teamName: string }) {
  if (!box.players.length) return <EmptyState msg="No player data" />;
  const topPts = [...box.players].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];
  const topReb = [...box.players].sort((a, b) => (b.rebounds ?? 0) - (a.rebounds ?? 0))[0];
  const topAst = [...box.players].sort((a, b) => (b.assists ?? 0) - (a.assists ?? 0))[0];
  const leaders = [
    { label: "PTS", player: topPts, val: topPts?.points },
    { label: "REB", player: topReb, val: topReb?.rebounds },
    { label: "AST", player: topAst, val: topAst?.assists },
  ];
  return (
    <div className="flex flex-col gap-0">
      <div className="text-[10px] text-[#667066] uppercase tracking-[0.14em] font-semibold mb-2">
        {teamName}
      </div>
      {leaders.map((l) => (
        <div
          key={l.label}
          className="flex items-center justify-between text-xs py-1.5 border-b border-[#d9e2d7] last:border-0"
        >
          <span className="text-[#667066] w-8">{l.label}</span>
          <span className="text-[#111315] flex-1 mx-2 truncate">{l.player?.name ?? "—"}</span>
          <span className="font-mono font-bold text-[#111315]">{fmtInt(l.val)}</span>
        </div>
      ))}
    </div>
  );
}

function BoxScoreTab({ match }: { match: TMatch }) {
  const boxH = match.box_home;
  const boxA = match.box_away;

  if (!boxH && !boxA) {
    return (
      <SideGrid>
        <MainCol>
          <Panel>
            <EmptyState msg="No box score data yet. Available after game completion." />
          </Panel>
        </MainCol>
        <SideCol>
          <Panel title="Leaders">
            <EmptyState msg="—" />
          </Panel>
        </SideCol>
      </SideGrid>
    );
  }

  const miscRows = [
    { label: "Fast Break Pts",    hv: fmtInt(boxH?.fast_break_pts),        av: fmtInt(boxA?.fast_break_pts) },
    { label: "Pts in Paint",      hv: fmtInt(boxH?.pts_in_paint),          av: fmtInt(boxA?.pts_in_paint) },
    { label: "2nd Chance Pts",    hv: fmtInt(boxH?.second_chance_pts),     av: fmtInt(boxA?.second_chance_pts) },
    { label: "Bench Pts",         hv: fmtInt(boxH?.bench_points),          av: fmtInt(boxA?.bench_points) },
    { label: "Pts off Turnovers", hv: fmtInt(boxH?.points_off_turnovers),  av: fmtInt(boxA?.points_off_turnovers) },
    { label: "Largest Lead",      hv: fmtInt(boxH?.largest_lead),          av: fmtInt(boxA?.largest_lead) },
    { label: "Lead Changes",      hv: fmtInt(boxH?.lead_changes),          av: fmtInt(boxA?.lead_changes) },
    { label: "Times Tied",        hv: fmtInt(boxH?.times_tied),            av: fmtInt(boxA?.times_tied) },
  ].filter((r) => r.hv !== "—" || r.av !== "—");

  return (
    <SideGrid>
      <MainCol>
        {boxH && (
          <Panel>
            <PlayerBoxTable box={boxH} teamName={match.home.name} />
          </Panel>
        )}
        {boxA && (
          <Panel>
            <PlayerBoxTable box={boxA} teamName={match.away.name} />
          </Panel>
        )}
        {miscRows.length > 0 && (
          <Panel title="Misc Team Stats">
            <div className="flex flex-col gap-0">
              {miscRows.map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between py-1.5 border-b border-[#d9e2d7] last:border-0 text-xs"
                >
                  <span className="text-[#667066]">{r.label}</span>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-[#2d7f4f] font-semibold">{r.hv}</span>
                    <span className="text-[#667066] text-[10px]">vs</span>
                    <span className="text-[#b45309] font-semibold">{r.av}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </MainCol>
      <SideCol>
        {boxH && (
          <Panel title="Team Leaders">
            <TeamLeaders box={boxH} teamName={match.home.name} />
          </Panel>
        )}
        {boxA && (
          <Panel title="Team Leaders">
            <TeamLeaders box={boxA} teamName={match.away.name} />
          </Panel>
        )}
        {(boxH || boxA) && (
          <Panel title="Shooting Splits">
            <div className="flex flex-col gap-0">
              {[
                { label: "FG%",   hv: fmtPct(boxH?.fg_pct, 1),  av: fmtPct(boxA?.fg_pct, 1) },
                { label: "3P%",   hv: fmtPct(boxH?.fg3_pct, 1), av: fmtPct(boxA?.fg3_pct, 1) },
                { label: "FT%",   hv: fmtPct(boxH?.ft_pct, 1),  av: fmtPct(boxA?.ft_pct, 1) },
                { label: "FGM-A", hv: shotLine(boxH?.fg_made, boxH?.fg_att), av: shotLine(boxA?.fg_made, boxA?.fg_att) },
                { label: "3PM-A", hv: shotLine(boxH?.fg3_made, boxH?.fg3_att), av: shotLine(boxA?.fg3_made, boxA?.fg3_att) },
                { label: "FTM-A", hv: shotLine(boxH?.ft_made, boxH?.ft_att), av: shotLine(boxA?.ft_made, boxA?.ft_att) },
              ].map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between py-1.5 border-b border-[#d9e2d7] last:border-0 text-xs"
                >
                  <span className="font-mono text-[#4f5950]">{r.hv}</span>
                  <span className="text-[#667066] text-center text-[10px]">{r.label}</span>
                  <span className="font-mono text-[#4f5950]">{r.av}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </SideCol>
    </SideGrid>
  );
}

// ─── Team Stats tab ───────────────────────────────────────────────────────────

function TeamStatsTab({ match }: { match: TMatch }) {
  const ah = match.adv_home;
  const aa = match.adv_away;

  const radarMetrics =
    ah && aa
      ? [
          { label: "ORtg",  home: norm(ah.ortg, 95, 120),                                    away: norm(aa.ortg, 95, 120) },
          { label: "DRtg",  home: norm(ah.drtg, 90, 120, true),                              away: norm(aa.drtg, 90, 120, true) },
          { label: "eFG%",  home: norm(ah.efg_pct != null ? ah.efg_pct * 100 : null, 45, 60), away: norm(aa.efg_pct != null ? aa.efg_pct * 100 : null, 45, 60) },
          { label: "TS%",   home: norm(ah.ts_pct  != null ? ah.ts_pct  * 100 : null, 50, 65), away: norm(aa.ts_pct  != null ? aa.ts_pct  * 100 : null, 50, 65) },
          { label: "TOV%",  home: norm(ah.tov_pct, 8, 20, true),                             away: norm(aa.tov_pct, 8, 20, true) },
          { label: "Pace",  home: norm(ah.pace, 90, 105),                                    away: norm(aa.pace, 90, 105) },
        ]
      : null;

  const fourFactors = [
    { factor: "eFG%",    desc: "Effective FG%",     hv: fmtPct(ah?.efg_pct, 1), av: fmtPct(aa?.efg_pct, 1), homeWins: (ah?.efg_pct ?? 0) > (aa?.efg_pct ?? 0) },
    { factor: "TOV%",    desc: "Turnover Rate",      hv: fmt(ah?.tov_pct, 1),   av: fmt(aa?.tov_pct, 1),    homeWins: (ah?.tov_pct ?? 99) < (aa?.tov_pct ?? 99) },
    { factor: "ORB%",    desc: "Offensive Reb Rate", hv: fmt(ah?.orb_pct, 1),   av: fmt(aa?.orb_pct, 1),    homeWins: (ah?.orb_pct ?? 0) > (aa?.orb_pct ?? 0) },
    { factor: "FT Rate", desc: "FTA/FGA",            hv: fmtPct(ah?.ftr, 2),    av: fmtPct(aa?.ftr, 2),     homeWins: (ah?.ftr ?? 0) > (aa?.ftr ?? 0) },
  ];

  return (
    <SideGrid>
      <MainCol>
        {radarMetrics && (
          <Panel title="Team Profile Radar — Normalised 0–100">
            <TeamRadarChart
              metrics={radarMetrics}
              homeLabel={match.home.name}
              awayLabel={match.away.name}
              homeColor="#2edb6c"
              awayColor="#f59e0b"
              height={220}
            />
          </Panel>
        )}
        <Panel title="Advanced Ratings">
          {ah && aa ? (
            <>
              <StatDuel label="ORtg"   home={fmt(ah.ortg, 1)}       away={fmt(aa.ortg, 1)}       homeWins={(ah.ortg ?? 0) > (aa.ortg ?? 0)} />
              <StatDuel label="DRtg"   home={fmt(ah.drtg, 1)}       away={fmt(aa.drtg, 1)}       homeWins={(ah.drtg ?? 999) < (aa.drtg ?? 999)} />
              <StatDuel label="NetRtg" home={fmt(ah.net_rtg, 1)}    away={fmt(aa.net_rtg, 1)}    homeWins={(ah.net_rtg ?? -99) > (aa.net_rtg ?? -99)} />
              <StatDuel label="Pace"   home={fmt(ah.pace, 1)}       away={fmt(aa.pace, 1)}       homeWins={false} />
              <StatDuel label="TS%"    home={fmtPct(ah.ts_pct, 1)}  away={fmtPct(aa.ts_pct, 1)} homeWins={(ah.ts_pct ?? 0) > (aa.ts_pct ?? 0)} />
              <StatDuel label="DRB%"   home={fmt(ah.drb_pct, 1)}    away={fmt(aa.drb_pct, 1)}   homeWins={(ah.drb_pct ?? 0) > (aa.drb_pct ?? 0)} />
              <StatDuel label="3PAr"   home={fmtPct(ah.three_par, 1)} away={fmtPct(aa.three_par, 1)} homeWins={false} />
            </>
          ) : (
            <EmptyState msg="Advanced stats unavailable" />
          )}
        </Panel>
      </MainCol>
      <SideCol>
        <Panel title="Four Factors">
          {ah && aa ? (
            <div className="flex flex-col gap-0">
              {fourFactors.map((ff) => (
                <div
                  key={ff.factor}
                  className="flex items-center justify-between py-2 border-b border-[#d9e2d7] last:border-0"
                >
                  <div className="flex flex-col">
                    <span className="text-xs text-[#111315] font-semibold">{ff.factor}</span>
                    <span className="text-[10px] text-[#667066]">{ff.desc}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span
                      className={cn(
                        ff.homeWins ? "text-[#2d7f4f] font-bold" : "text-[#4f5950]"
                      )}
                    >
                      {ff.hv}
                    </span>
                    <span className="text-[#667066]">vs</span>
                    <span
                      className={cn(
                        !ff.homeWins ? "text-[#b45309] font-bold" : "text-[#4f5950]"
                      )}
                    >
                      {ff.av}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState msg="Four factors unavailable" />
          )}
        </Panel>

        {((match as any).clutch_home || (match as any).clutch_away) && (
          <Panel title="Clutch Stats (< 5 min, ≤5 pts)">
            {[
              { c: (match as any).clutch_home as BasketballClutchStatsOut | null, name: match.home.name },
              { c: (match as any).clutch_away as BasketballClutchStatsOut | null, name: match.away.name },
            ].map(({ c, name }) =>
              c ? (
                <div key={name} className="mb-4 last:mb-0">
                  <div className="text-[10px] text-[#667066] uppercase tracking-[0.14em] font-semibold mb-2">
                    {name}
                  </div>
                  <div className="flex flex-col gap-0">
                    <MetricRow label="Points"  value={fmtInt(c.clutch_points)} />
                    <MetricRow label="FG%"     value={fmtPct(c.clutch_fg_pct, 1)} />
                    <MetricRow label="FT%"     value={fmtPct(c.clutch_ft_pct, 1)} />
                    <MetricRow label="TOV"     value={fmtInt(c.clutch_turnovers)} />
                    {c.clutch_net_rating != null && (
                      <MetricRow
                        label="Net Rating"
                        value={`${c.clutch_net_rating >= 0 ? "+" : ""}${fmt(c.clutch_net_rating, 1)}`}
                        highlight={c.clutch_net_rating >= 0 ? "positive" : "negative"}
                      />
                    )}
                    {(c.clutch_wins_season != null || c.clutch_losses_season != null) && (
                      <MetricRow
                        label="Season Clutch W-L"
                        value={`${c.clutch_wins_season ?? 0}–${c.clutch_losses_season ?? 0}`}
                      />
                    )}
                  </div>
                </div>
              ) : null
            )}
          </Panel>
        )}
      </SideCol>
    </SideGrid>
  );
}

// ─── Shot Profile tab ─────────────────────────────────────────────────────────

function ShotZoneTable({ zones, teamName }: { zones: BasketballShotZone[]; teamName: string }) {
  return (
    <div>
      <div className="text-[10px] text-[#667066] uppercase tracking-[0.14em] font-semibold mb-2">
        {teamName}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono tabular-nums border-collapse">
          <thead>
            <tr className="text-[#667066] border-b border-[#d9e2d7]">
              <th className="text-left font-normal py-1.5">Zone</th>
              <th className="text-right font-normal py-1.5 px-2">Att</th>
              <th className="text-right font-normal py-1.5 px-2">Made</th>
              <th className="text-right font-normal py-1.5 px-2">FG%</th>
              <th className="text-right font-normal py-1.5">Share</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z, i) => (
              <tr key={i} className="border-b border-[#edf2ea] last:border-0">
                <td className="py-1.5 font-sans text-[#111315]">{z.zone}</td>
                <td className="py-1.5 px-2 text-right text-[#4f5950]">{z.attempts}</td>
                <td className="py-1.5 px-2 text-right text-[#4f5950]">{z.made}</td>
                <td
                  className={cn(
                    "py-1.5 px-2 text-right font-semibold",
                    z.pct >= 0.45
                      ? "text-[#2d7f4f]"
                      : z.pct >= 0.35
                      ? "text-[#4f5950]"
                      : "text-[#dc2626]"
                  )}
                >
                  {fmtPct(z.pct, 1)}
                </td>
                <td className="py-1.5 text-right text-[#667066]">{fmtPct(z.attempts_pct, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShotProfileTab({ match }: { match: TMatch }) {
  const sh = match.shots_home;
  const sa = match.shots_away;
  return (
    <SideGrid>
      <MainCol>
        {sh || sa ? (
          <>
            <Panel title="Shot Zone Court" padded={false}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                {sh && <BasketballCourtSVG zones={sh} label={match.home.name} />}
                {sa && <BasketballCourtSVG zones={sa} label={match.away.name} />}
              </div>
            </Panel>
            {sh && (
              <Panel>
                <ShotZoneTable zones={sh} teamName={match.home.name} />
              </Panel>
            )}
            {sa && (
              <Panel>
                <ShotZoneTable zones={sa} teamName={match.away.name} />
              </Panel>
            )}
          </>
        ) : (
          <Panel>
            <EmptyState msg="No shot chart data yet" />
          </Panel>
        )}
      </MainCol>
      <SideCol>
        {match.match_info?.pace != null && (
          <Panel title="Pace & Possessions">
            <MetricRow label="Pace" value={`${fmt(match.match_info.pace, 1)} poss/48`} />
          </Panel>
        )}
      </SideCol>
    </SideGrid>
  );
}

// ─── H2H tab ──────────────────────────────────────────────────────────────────

function H2HTab({ match }: { match: TMatch }) {
  const h2h = match.h2h;
  if (!h2h || h2h.total_matches === 0)
    return (
      <Panel>
        <EmptyState msg="No head-to-head history found" />
      </Panel>
    );

  return (
    <SideGrid>
      <MainCol>
        <Panel title="All-Time Record">
          <div className="flex items-center justify-around mb-4">
            <div className="flex flex-col items-center gap-1">
              <div className="text-[48px] font-bold text-[#111315] leading-none tabular-nums">
                {h2h.home_wins}
              </div>
              <div className="text-[#667066] text-xs">{match.home.name}</div>
            </div>
            {h2h.draws != null && (
              <div className="flex flex-col items-center gap-1">
                <div className="text-[48px] font-bold text-[#667066] leading-none tabular-nums">
                  {h2h.draws}
                </div>
                <div className="text-[#667066] text-xs">Draws</div>
              </div>
            )}
            <div className="flex flex-col items-center gap-1">
              <div className="text-[48px] font-bold text-[#111315] leading-none tabular-nums">
                {h2h.away_wins}
              </div>
              <div className="text-[#667066] text-xs">{match.away.name}</div>
            </div>
          </div>
          {/* Win bar */}
          <div className="h-2 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-[#2edb6c]"
              style={{
                width: `${Math.round((h2h.home_wins / h2h.total_matches) * 100)}%`,
              }}
            />
            <div className="h-full bg-[#f59e0b] flex-1" />
          </div>
        </Panel>

        {h2h.recent_matches.length > 0 && (
          <Panel title="Recent Meetings">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-[#667066] border-b border-[#d9e2d7]">
                    <th className="text-left font-normal py-1.5">Date</th>
                    <th className="text-right font-normal py-1.5">Home</th>
                    <th className="text-center font-normal py-1.5 px-2">–</th>
                    <th className="text-left font-normal py-1.5">Away</th>
                    <th className="text-right font-normal py-1.5">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {h2h.recent_matches.map((m: any, i: number) => (
                    <tr key={i} className="border-b border-[#edf2ea] last:border-0">
                      <td className="py-1.5 text-[#667066]">
                        {m.date
                          ? new Date(m.date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="py-1.5 text-right font-mono text-[#4f5950]">
                        {m.home_score ?? "—"}
                      </td>
                      <td className="py-1.5 text-center text-[#667066] px-2">–</td>
                      <td className="py-1.5 font-mono text-[#4f5950]">{m.away_score ?? "—"}</td>
                      <td
                        className={cn(
                          "py-1.5 text-right capitalize",
                          m.winner === "home" ? "text-[#2d7f4f] font-semibold" : "text-[#4f5950]"
                        )}
                      >
                        {m.winner}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </MainCol>
      <SideCol>
        <Panel title="H2H Summary">
          <div className="flex flex-col gap-0">
            <MetricRow label="Total Matches"       value={String(h2h.total_matches)} />
            <MetricRow label={`${match.home.name} Wins`} value={String(h2h.home_wins)} highlight="positive" />
            <MetricRow label={`${match.away.name} Wins`} value={String(h2h.away_wins)} />
            <MetricRow
              label="Home Win%"
              value={
                h2h.total_matches > 0
                  ? fmtPct(h2h.home_wins / h2h.total_matches)
                  : "—"
              }
            />
          </div>
        </Panel>
      </SideCol>
    </SideGrid>
  );
}

// ─── ELO tab ──────────────────────────────────────────────────────────────────

function EloTab({
  match,
  eloHomeHistory,
  eloAwayHistory,
}: {
  match: TMatch;
  eloHomeHistory: Array<{ date: string; rating: number }>;
  eloAwayHistory: Array<{ date: string; rating: number }>;
}) {
  const elo_h = match.elo_home;
  const elo_a = match.elo_away;

  const chartData = eloHomeHistory.map((pt, i) => ({
    date: pt.date.slice(0, 10),
    home: pt.rating,
    away: eloAwayHistory[i]?.rating ?? null,
  }));

  return (
    <SideGrid>
      <MainCol>
        <Panel title="ELO Rating History">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#edf2ea" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#667066", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: "#667066", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    background: "#fff",
                    border: "1px solid #d9e2d7",
                    borderRadius: 12,
                    fontSize: 11,
                  }}
                  labelStyle={{ color: "#4f5950" }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "#667066" }} />
                <Line
                  type="monotone"
                  dataKey="home"
                  name={match.home.name}
                  stroke="#2edb6c"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="away"
                  name={match.away.name}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState msg="No ELO history available" />
          )}
        </Panel>

        {(elo_h || elo_a) && (
          <Panel title="ELO Breakdown">
            <div className="grid grid-cols-2 gap-x-8">
              {[
                { elo: elo_h, name: match.home.name },
                { elo: elo_a, name: match.away.name },
              ].map(
                ({ elo, name }) =>
                  elo && (
                    <div key={name} className="flex flex-col gap-0">
                      <div className="text-[#111315] font-semibold text-xs mb-2">{name}</div>
                      <MetricRow label="Rating"    value={fmtInt(elo.rating)} />
                      <MetricRow
                        label="Δ last"
                        value={`${(elo.rating_change ?? 0) >= 0 ? "+" : ""}${fmt(elo.rating_change)}`}
                        highlight={(elo.rating_change ?? 0) >= 0 ? "positive" : "negative"}
                      />
                      {elo.k_used != null && (
                        <MetricRow label="K used"    value={fmt(elo.k_used, 1)} />
                      )}
                      {elo.home_advantage_applied != null && (
                        <MetricRow label="Home adv"  value={`+${fmtInt(elo.home_advantage_applied)}`} highlight="positive" />
                      )}
                      {elo.mov_modifier != null && (
                        <MetricRow label="MoV mod"   value={fmt(elo.mov_modifier, 2)} />
                      )}
                      {elo.rest_modifier != null && (
                        <MetricRow
                          label="Rest mod"
                          value={fmt(elo.rest_modifier, 0)}
                          highlight={elo.rest_modifier < 0 ? "negative" : undefined}
                        />
                      )}
                      {elo.implied_win_prob != null && (
                        <MetricRow label="Win prob"  value={fmtPct(elo.implied_win_prob, 1)} highlight="positive" />
                      )}
                    </div>
                  )
              )}
            </div>
          </Panel>
        )}
      </MainCol>

      <SideCol>
        <Panel title="ELO Last 10 — Home">
          {elo_h?.last_10_ratings && elo_h.last_10_ratings.length > 0 ? (
            <div className="flex flex-col gap-2">
              {elo_h.last_10_ratings.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-[#667066] w-3">{i + 1}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#f7f8f5] border border-[#d9e2d7]">
                    <div
                      className="h-full rounded-full bg-[#2edb6c]/70"
                      style={{ width: `${Math.min(100, Math.max(0, (r - 1300) / 4))}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-[#4f5950] w-12 text-right">{r}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState msg="—" />
          )}
        </Panel>
        <Panel title="ELO Last 10 — Away">
          {elo_a?.last_10_ratings && elo_a.last_10_ratings.length > 0 ? (
            <div className="flex flex-col gap-2">
              {elo_a.last_10_ratings.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-[#667066] w-3">{i + 1}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#f7f8f5] border border-[#d9e2d7]">
                    <div
                      className="h-full rounded-full bg-[#f59e0b]/70"
                      style={{ width: `${Math.min(100, Math.max(0, (r - 1300) / 4))}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-[#4f5950] w-12 text-right">{r}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState msg="—" />
          )}
        </Panel>
      </SideCol>
    </SideGrid>
  );
}

// ─── Model tab ────────────────────────────────────────────────────────────────

function ModelTab({ match }: { match: TMatch }) {
  const p = match.probabilities;
  const m = match.model;
  return (
    <SideGrid>
      <MainCol>
        <Panel title="Win Probabilities">
          {p ? (
            <div className="flex flex-col gap-4">
              {[
                { label: match.home.name, prob: p.home_win, color: "#2edb6c" },
                { label: match.away.name, prob: p.away_win, color: "#f59e0b" },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-4">
                  <div className="w-32 text-xs text-[#667066]">{row.label}</div>
                  <div className="flex-1 h-2 rounded-full bg-[#f7f8f5] border border-[#d9e2d7]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${row.prob * 100}%`, backgroundColor: row.color }}
                    />
                  </div>
                  <div className="w-14 text-right font-mono font-bold text-[#111315] text-sm tabular-nums">
                    {fmtPct(row.prob, 1)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState msg="No model probabilities" />
          )}
        </Panel>

        {match.key_drivers && match.key_drivers.length > 0 && (
          <Panel title="Feature Drivers">
            <div className="flex flex-col gap-2.5">
              {match.key_drivers.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-36 text-xs text-[#667066] truncate">{d.feature}</div>
                  <div className="flex-1 h-1.5 rounded-full bg-[#f7f8f5] border border-[#d9e2d7]">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        d.direction === "home"
                          ? "bg-[#2edb6c]/70"
                          : d.direction === "away"
                          ? "bg-[#f59e0b]/70"
                          : "bg-[#667066]/40"
                      )}
                      style={{ width: `${d.importance * 100}%` }}
                    />
                  </div>
                  <div className="text-[10px] font-mono text-[#667066] w-8 text-right">
                    {Math.round(d.importance * 100)}%
                  </div>
                  {d.value != null && (
                    <div className="text-[10px] font-mono text-[#667066] w-12 text-right">
                      {fmt(d.value, 1)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}
      </MainCol>
      <SideCol>
        {m && (
          <Panel title="Model Metadata">
            <div className="flex flex-col gap-0">
              <MetricRow label="Version"       value={m.version} />
              {m.algorithm && <MetricRow label="Algorithm"     value={m.algorithm} />}
              {m.n_train_samples && (
                <MetricRow label="Train samples" value={m.n_train_samples.toLocaleString()} />
              )}
              {m.accuracy != null && (
                <MetricRow label="Accuracy"     value={fmtPct(m.accuracy, 1)} highlight="positive" />
              )}
              {m.brier_score != null && (
                <MetricRow label="Brier"        value={m.brier_score.toFixed(4)} />
              )}
            </div>
          </Panel>
        )}
        {match.fair_odds && (
          <Panel title="Fair Odds">
            <div className="flex flex-col gap-0">
              <MetricRow
                label={match.home.name}
                value={match.fair_odds.home_win?.toFixed(2) ?? "—"}
                highlight="positive"
              />
              <MetricRow
                label={match.away.name}
                value={match.fair_odds.away_win?.toFixed(2) ?? "—"}
              />
            </div>
          </Panel>
        )}
        {match.betting && (
          <Panel title="Market Odds">
            <div className="flex flex-col gap-3">
              {[
                { label: "Home", val: match.betting.home_ml, prob: match.probabilities?.home_win },
                { label: "Away", val: match.betting.away_ml, prob: match.probabilities?.away_win },
              ].map(({ label, val, prob }) => {
                if (val == null) return null;
                const edge = prob != null ? (prob - 1 / Number(val)) * 100 : null;
                return (
                  <div
                    key={label}
                    className="rounded-[16px] border border-[#d9e2d7] bg-[#f7f8f5] p-3 flex flex-col items-center gap-1"
                  >
                    <span className="text-[10px] text-[#667066]">{label}</span>
                    <span className="text-lg font-bold font-mono text-[#111315]">
                      {Number(val).toFixed(2)}
                    </span>
                    {edge != null && (
                      <span
                        className={cn(
                          "text-[10px] font-semibold font-mono",
                          edge > 0 ? "text-[#2d7f4f]" : "text-[#dc2626]"
                        )}
                      >
                        {edge > 0 ? "+" : ""}
                        {edge.toFixed(1)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
      </SideCol>
    </SideGrid>
  );
}

// ─── Context tab ──────────────────────────────────────────────────────────────

function ContextTab({ match }: { match: TMatch }) {
  const dc = match.data_completeness;
  const info = match.match_info;
  return (
    <SideGrid>
      <MainCol>
        {(match.injuries_home?.length || match.injuries_away?.length) ? (
          <Panel title="Injury Report">
            {match.injuries_home?.length ? (
              <div className="mb-4">
                <div className="text-[10px] text-[#2d7f4f] uppercase tracking-[0.14em] font-semibold mb-2">
                  {match.home.name}
                </div>
                <InjuryList injuries={match.injuries_home} />
              </div>
            ) : null}
            {match.injuries_away?.length ? (
              <div>
                <div className="text-[10px] text-[#b45309] uppercase tracking-[0.14em] font-semibold mb-2">
                  {match.away.name}
                </div>
                <InjuryList injuries={match.injuries_away} />
              </div>
            ) : null}
          </Panel>
        ) : null}

        <Panel title="Schedule / Rest">
          <div className="flex flex-col gap-0">
            {match.form_home && (
              <MetricRow
                label={`${match.home.name} rest`}
                value={
                  (match.form_home.days_rest != null
                    ? `${match.form_home.days_rest}d`
                    : "—") + (match.form_home.back_to_back ? " (B2B)" : "")
                }
                highlight={match.form_home.back_to_back ? "negative" : undefined}
              />
            )}
            {match.form_away && (
              <MetricRow
                label={`${match.away.name} rest`}
                value={
                  (match.form_away.days_rest != null
                    ? `${match.form_away.days_rest}d`
                    : "—") + (match.form_away.back_to_back ? " (B2B)" : "")
                }
                highlight={match.form_away.back_to_back ? "negative" : undefined}
              />
            )}
            {info?.arena && <MetricRow label="Arena"    value={info.arena} />}
            {info?.city  && <MetricRow label="City"     value={info.city} />}
            {info?.attendance != null && (
              <MetricRow label="Attendance" value={info.attendance.toLocaleString()} />
            )}
            {info?.season_phase && (
              <MetricRow label="Phase" value={info.season_phase} />
            )}
            {info?.home_record && (
              <MetricRow label={`${match.home.name} record`} value={info.home_record} />
            )}
            {info?.away_record && (
              <MetricRow label={`${match.away.name} record`} value={info.away_record} />
            )}
            {info?.overtime_periods != null && info.overtime_periods > 0 && (
              <MetricRow
                label="Overtime periods"
                value={String(info.overtime_periods)}
                highlight="negative"
              />
            )}
          </div>
        </Panel>

        {(match as any).referee && (
          <Panel title="Officiating Crew">
            {(() => {
              const ref = (match as any).referee as BasketballRefereeOut;
              return (
                <div className="flex flex-col gap-0">
                  {ref.names.length > 0 && (
                    <div className="text-xs text-[#111315] mb-2">{ref.names.join(", ")}</div>
                  )}
                  {ref.avg_fouls_per_game != null && (
                    <MetricRow label="Fouls / game"        value={fmt(ref.avg_fouls_per_game, 1)} />
                  )}
                  {ref.avg_fta_per_game != null && (
                    <MetricRow label="FTA / game"          value={fmt(ref.avg_fta_per_game, 1)} />
                  )}
                  {ref.technicals_per_game != null && (
                    <MetricRow label="Technicals / game"   value={fmt(ref.technicals_per_game, 2)} />
                  )}
                  {ref.home_win_pct != null && (
                    <MetricRow label="Home team win%"      value={fmtPct(ref.home_win_pct, 1)} />
                  )}
                  {ref.avg_total_points != null && (
                    <MetricRow label="Avg total pts"       value={fmt(ref.avg_total_points, 1)} />
                  )}
                </div>
              );
            })()}
          </Panel>
        )}

        {(match as any).betting && (
          <Panel title="Betting Lines">
            {(() => {
              const bet = (match as any).betting as BasketballBettingOut;
              return (
                <div className="flex flex-col gap-0">
                  {bet.spread != null && (
                    <MetricRow
                      label="Spread (home)"
                      value={`${bet.spread >= 0 ? "+" : ""}${bet.spread}`}
                    />
                  )}
                  {bet.total != null && (
                    <MetricRow label="Total (O/U)" value={String(bet.total)} />
                  )}
                  {bet.home_ml != null && (
                    <MetricRow
                      label={`${match.home.name} ML`}
                      value={`${bet.home_ml >= 0 ? "+" : ""}${bet.home_ml}`}
                    />
                  )}
                  {bet.away_ml != null && (
                    <MetricRow
                      label={`${match.away.name} ML`}
                      value={`${bet.away_ml >= 0 ? "+" : ""}${bet.away_ml}`}
                    />
                  )}
                  {bet.implied_home_total != null && (
                    <MetricRow
                      label="Implied home total"
                      value={fmt(bet.implied_home_total, 1)}
                      highlight="positive"
                    />
                  )}
                  {bet.implied_away_total != null && (
                    <MetricRow label="Implied away total" value={fmt(bet.implied_away_total, 1)} />
                  )}
                  {bet.sharp_side_spread && (
                    <MetricRow label="Sharp side (spread)" value={bet.sharp_side_spread} />
                  )}
                  {bet.spread_line_move != null && (
                    <MetricRow
                      label="Spread line move"
                      value={`${bet.spread_line_move > 0 ? "+" : ""}${fmt(bet.spread_line_move, 1)}`}
                      highlight={bet.spread_line_move > 0 ? "positive" : "negative"}
                    />
                  )}
                </div>
              );
            })()}
          </Panel>
        )}
      </MainCol>

      <SideCol>
        <Panel title="Data Completeness">
          {dc ? (
            <div className="flex flex-col gap-0">
              {Object.entries(dc).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-1.5 border-b border-[#d9e2d7] last:border-0">
                  <span className="text-xs text-[#667066] capitalize">{k.replace(/_/g, " ")}</span>
                  <span className={cn("text-xs font-semibold", v ? "text-[#2d7f4f]" : "text-[#d9e2d7]")}>
                    {v ? "✓" : "○"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState msg="—" />
          )}
        </Panel>
      </SideCol>
    </SideGrid>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface Props {
  match: TMatch;
  eloHomeHistory: Array<{ date: string; rating: number }>;
  eloAwayHistory: Array<{ date: string; rating: number }>;
}

export function BasketballMatchDetail({ match, eloHomeHistory, eloAwayHistory }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const router = useRouter();
  const isLive = match.status === "live";
  const tick = useLiveRefresh(isLive);
  useEffect(() => {
    if (tick > 0) router.refresh();
  }, [tick, router]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-screen-2xl flex-col gap-4 bg-[#f3f7f2] px-3 py-4 md:px-4 md:py-5">
      {/* Hero */}
      <MatchHero match={match} />

      {/* KPI strip */}
      <BasketballKpiStrip match={match} />

      {/* Live panel */}
      {isLive && <BasketballLivePanel match={match} />}

      {/* Tab bar */}
      <div className="sticky top-2 z-20">
        <div className="overflow-x-auto rounded-[24px] border border-[#d9e2d7] bg-white p-2 shadow-[0_10px_24px_rgba(17,19,21,0.06)] no-scrollbar">
          <div className="flex min-w-max items-center gap-2">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2.5 text-[12px] font-semibold transition-all",
                  activeTab === t
                    ? "bg-[#111315] text-white shadow-sm"
                    : "border border-transparent bg-[#f7f8f5] text-[#667066] hover:border-[#d9e2d7] hover:bg-white hover:text-[#111315]"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "Overview"     && <OverviewTab match={match} />}
        {activeTab === "Lineups"      && <LineupsTab match={match} />}
        {activeTab === "Box Score"    && <BoxScoreTab match={match} />}
        {activeTab === "Team Stats"   && <TeamStatsTab match={match} />}
        {activeTab === "Shot Profile" && <ShotProfileTab match={match} />}
        {activeTab === "H2H"          && <H2HTab match={match} />}
        {activeTab === "Elo"          && (
          <EloTab
            match={match}
            eloHomeHistory={eloHomeHistory}
            eloAwayHistory={eloAwayHistory}
          />
        )}
        {activeTab === "Model"        && <ModelTab match={match} />}
        {activeTab === "Context"      && <ContextTab match={match} />}
      </div>
    </div>
  );
}
