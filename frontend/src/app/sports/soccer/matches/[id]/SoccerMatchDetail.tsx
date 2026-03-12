"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveRefresh } from "@/lib/hooks/useLiveRefresh";
import {
  ArrowLeft, MapPin, Calendar, Clock, Activity, TrendingUp, TrendingDown,
  BarChart2, Users, Zap, Shield, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronUp, Info, Wind, Thermometer, Target, Eye,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RechartTooltip,
  CartesianGrid, ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";
import type { SportMatchDetail, StandingsResponse } from "@/lib/types";
import { getStandingsForMatch } from "@/lib/api";
import { SoccerLivePanel } from "@/components/live/LiveMatchPanel";
import { cn } from "@/lib/utils";
import { chartDefaults } from "@/lib/tokens";

const colors = {
  info:    "#34d399",
  warning: "#f59e0b",
  border1: "#27272a",
  text1:   "rgba(255,255,255,0.5)",
} as const;
import { FormStreak } from "@/components/charts/FormStreak";
import { TeamRadarChart, norm } from "@/components/charts/TeamRadarChart";
import { SoccerPitchSVG } from "@/components/charts/SoccerPitchSVG";
import HighlightsSection from "@/components/match/HighlightsSection";
import StandingsTable from "@/components/match/StandingsTable";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EloPoint { date: string; rating: number }
interface MatchProps {
  match: SportMatchDetail & {
    simulation?: {
      n_simulations: number;
      distribution: Array<{ score: string; probability: number }>;
      mean_home_goals?: number | null;
      mean_away_goals?: number | null;
    } | null;
  };
  eloHome: EloPoint[];
  eloAway: EloPoint[];
}

type TabId = "overview" | "lineups" | "stats" | "timeline" | "h2h" | "elo" | "model" | "context";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview",  label: "Overview"  },
  { id: "lineups",   label: "Lineups"   },
  { id: "stats",     label: "Stats"     },
  { id: "timeline",  label: "Timeline"  },
  { id: "h2h",       label: "H2H"       },
  { id: "elo",       label: "ELO"       },
  { id: "model",     label: "Model"     },
  { id: "context",   label: "Context"   },
];

// ─── Utility ─────────────────────────────────────────────────────────────────

const n  = (v: number | null | undefined, d = 1) => v == null ? "—" : v.toFixed(d);
const pct = (v: number | null | undefined) => v == null ? "—" : `${Math.round(v * 100)}%`;

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " UTC";
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function normaliseOutcome(raw: string | null | undefined): "home_win" | "draw" | "away_win" | null {
  if (!raw) return null;
  const map: Record<string, "home_win" | "draw" | "away_win"> = {
    H: "home_win", D: "draw", A: "away_win",
    home_win: "home_win", draw: "draw", away_win: "away_win",
  };
  return map[raw] ?? null;
}
function eloWinProb(rHome: number, rAway: number) {
  return 1 / (1 + Math.pow(10, (rAway - (rHome + 65)) / 400));
}
function eloThreeOutcome(rHome: number, rAway: number) {
  const E = eloWinProb(rHome, rAway);
  const pDraw = Math.max(0.08, 0.30 * (1 - Math.abs(2 * E - 1) * 0.9));
  return {
    home: Math.max(0, E - pDraw / 2),
    draw: pDraw,
    away: Math.max(0, (1 - E) - pDraw / 2),
  };
}

// ─── Shared Micro-Components ─────────────────────────────────────────────────

function Panel({
  title, subtitle, badge, action, padded = true, children,
}: {
  title: string; subtitle?: string; badge?: React.ReactNode; action?: React.ReactNode;
  padded?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-[#27272a] bg-[#18181b]">
      <div className="flex items-start justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
              {title}
            </span>
            {badge}
          </div>
          {subtitle && <p className="mt-1 text-[12px] text-white/40">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={padded ? "px-5 py-5" : ""}>{children}</div>
    </div>
  );
}

function MetricRow({
  label, value, sub, mono = true, highlight,
}: {
  label: string; value: React.ReactNode; sub?: string; mono?: boolean; highlight?: "positive" | "negative" | "warning" | "info";
}) {
  const valCls = highlight === "positive" ? "text-emerald-400"
    : highlight === "negative" ? "text-red-400"
    : highlight === "warning" ? "text-amber-500"
    : highlight === "info" ? "text-emerald-400"
    : "text-white";
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#27272a] last:border-0 gap-2">
      <span className="text-xs text-white/50 shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        {sub && <span className="text-[10px] text-white/40 font-mono">{sub}</span>}
        <span className={cn("text-xs truncate", mono && "font-mono tabular-nums", valCls)}>{value}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; dot?: boolean }> = {
    live:      { cls: "bg-emerald-500/20 border-emerald-500/30 text-emerald-400", dot: true },
    scheduled: { cls: "bg-blue-500/20 border-blue-500/30 text-blue-400" },
    finished:  { cls: "bg-white/5 border-white/10 text-white/50" },
    cancelled: { cls: "bg-red-500/20 border-red-500/30 text-red-400" },
  };
  const c = cfg[status] ?? cfg.scheduled;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", c.cls)}>
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

function Delta({ v, suffix = "" }: { v: number | null | undefined; suffix?: string }) {
  if (v == null) return <span className="text-white/40 font-mono text-[10px]">—</span>;
  return (
    <span className={cn("flex items-center gap-0.5 font-mono text-[10px]", v >= 0 ? "text-emerald-400" : "text-red-400")}>
      {v >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {v >= 0 ? "+" : ""}{v.toFixed(1)}{suffix && ` ${suffix}`}
    </span>
  );
}

function FormPills({ wins, draws, losses }: { wins?: number | null; draws?: number | null; losses?: number | null }) {
  const items = [
    ...Array(wins ?? 0).fill("W"),
    ...Array(draws ?? 0).fill("D"),
    ...Array(losses ?? 0).fill("L"),
  ].slice(0, 5);
  const cls: Record<string, string> = {
    W: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    D: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    L: "bg-red-500/20 text-red-400 border border-red-500/30",
  };
  if (items.length === 0) return <span className="text-[10px] text-white/40">—</span>;
  return (
    <div className="flex gap-0.5">
      {items.map((r, i) => (
        <span key={i} className={cn("text-[10px] font-mono font-bold w-4 h-4 flex items-center justify-center rounded", cls[r])}>
          {r}
        </span>
      ))}
    </div>
  );
}

function ProbBar({ label, pct: p, color, size = "sm" }: { label: string; pct: number; color: string; size?: "sm" | "md" }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-white/50">{label}</span>
        <span className="font-mono font-bold text-white tabular-nums">{Math.round(p)}%</span>
      </div>
      <div className={cn("rounded-full bg-white/10 overflow-hidden", size === "md" ? "h-2" : "h-1.5")}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function StatBar({ label, homeVal, awayVal, lowerBetter = false, fmt }: {
  label: string; homeVal: number | null | undefined; awayVal: number | null | undefined;
  lowerBetter?: boolean; fmt?: (v: number) => string;
}) {
  if (homeVal == null && awayVal == null) return null;
  const hv = homeVal ?? 0; const av = awayVal ?? 0; const total = hv + av;
  const homePct = total > 0 ? (hv / total) * 100 : 50;
  const fmtFn = fmt ?? ((v: number) => v % 1 === 0 ? v.toString() : v.toFixed(1));
  const homeBetter = lowerBetter ? (homeVal ?? Infinity) < (awayVal ?? -Infinity) : (homeVal ?? -Infinity) > (awayVal ?? Infinity);
  const awayBetter = lowerBetter ? (awayVal ?? Infinity) < (homeVal ?? -Infinity) : (awayVal ?? -Infinity) > (homeVal ?? Infinity);
  return (
    <div className="py-2 border-b border-[#27272a] last:border-0">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className={cn("font-mono text-sm font-bold tabular-nums min-w-[2rem]", homeBetter ? "text-emerald-400" : "text-white/40")}>
          {homeVal != null ? fmtFn(homeVal) : "—"}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-white/50 text-center px-2">{label}</span>
        <span className={cn("font-mono text-sm font-bold tabular-nums min-w-[2rem] text-right", awayBetter ? "text-amber-400" : "text-white/40")}>
          {awayVal != null ? fmtFn(awayVal) : "—"}
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

function EmptyState({ icon: Icon = Info, title, desc }: { icon?: React.ElementType; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Icon size={28} className="text-white/20" />
      <p className="text-xs font-medium text-white/50">{title}</p>
      {desc && <p className="text-[10px] text-white/40 max-w-xs">{desc}</p>}
    </div>
  );
}

function Countdown({ kickoffUtc }: { kickoffUtc: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  const diff = new Date(kickoffUtc).getTime() - now.getTime();
  if (diff <= 0) return <span className="text-emerald-400 font-mono text-xs">Starting soon</span>;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return <span className="font-mono text-sm font-bold text-emerald-400 tabular-nums">{d > 0 ? `${d}d ` : ""}{h > 0 ? `${h}h ` : ""}{m}m</span>;
}

function SideGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">{children}</div>;
}
function MainCol({ children }: { children: React.ReactNode }) {
  return <div className="lg:col-span-8 flex flex-col gap-4">{children}</div>;
}
function SideCol({ children }: { children: React.ReactNode }) {
  return <div className="lg:col-span-4 flex flex-col gap-4">{children}</div>;
}

// ─── Match Header 3-Column ───────────────────────────────────────────────────

function TeamBlock({ name, elo, form, side, logoUrl }: {
  name: string;
  elo: { rating: number; rating_change: number | null } | null | undefined;
  form: { wins?: number | null; draws?: number | null; losses?: number | null; days_rest?: number | null; form_pts?: number | null } | null | undefined;
  side: "home" | "away";
  logoUrl?: string | null;
}) {
  const isHome = side === "home";

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", !isHome && "items-end text-right")}>
      <div className={cn("flex items-center gap-4", !isHome && "flex-row-reverse")}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={name}
            className="h-16 w-16 rounded-[18px] border border-white/10 bg-[#18181b] p-2 object-contain shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-[18px] border border-white/10 bg-white/10 text-sm font-bold text-white">
            {name.slice(0, 2).toUpperCase()}
          </div>
        )}

        <div className="min-w-0">
          <p className="truncate text-[24px] font-semibold leading-tight text-white md:text-[32px]">
            {name}
          </p>
          {elo && (
            <div className={cn("mt-2 flex items-center gap-2", !isHome && "justify-end")}>
              <span className="font-mono text-[22px] font-bold tabular-nums text-emerald-400 md:text-[28px]">
                {Math.round(elo.rating)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1">
                <Delta v={elo.rating_change} suffix="ELO" />
              </span>
            </div>
          )}
        </div>
      </div>

      {form && (
        <div className={cn("flex flex-wrap items-center gap-2", !isHome && "justify-end")}>
          <FormStreak
            results={[
              ...Array(form.wins ?? 0).fill("W" as const),
              ...Array(form.draws ?? 0).fill("D" as const),
              ...Array(form.losses ?? 0).fill("L" as const),
            ].slice(0, 5)}
            size="sm"
          />
          {form.form_pts != null && (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[10px] font-mono text-white/70">
              {form.form_pts.toFixed(0)} pts last 5
            </span>
          )}
          {form.days_rest != null && (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[10px] font-mono text-white/70">
              {Math.round(form.days_rest)}d rest
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function MatchHeader({ match }: { match: MatchProps["match"] }) {
  const ctx = match.context;
  const isScheduled = match.status === "scheduled";
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";

  const homeProb = match.probabilities ? Math.round(match.probabilities.home_win * 100) : null;
  const drawProb =
    match.probabilities?.draw != null ? Math.round(match.probabilities.draw * 100) : null;
  const awayProb = match.probabilities ? Math.round(match.probabilities.away_win * 100) : null;

  return (
    <div className="overflow-hidden rounded-[34px] border border-[#27272a] bg-[#18181b] text-white shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
      <div className="border-b border-white/8 px-5 py-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link
            href="/sports/soccer/matches"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-white/75 transition hover:bg-white/[0.08] hover:text-white"
          >
            <ArrowLeft size={13} />
            Back to Soccer
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
              {match.league}
              {match.season ? ` · ${match.season}` : ""}
            </span>
            <StatusBadge status={match.status} />
          </div>
        </div>
      </div>

      <div className="grid gap-5 px-5 py-6 md:grid-cols-[1fr_340px_1fr] md:items-center md:px-6 md:py-7">
        <TeamBlock
          name={match.home.name}
          elo={match.elo_home}
          form={match.form_home}
          side="home"
          logoUrl={match.home.logo_url}
        />

        <div className="flex flex-col items-center justify-center rounded-[30px] border border-white/10 bg-white/[0.05] px-6 py-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          {isLive && (
            <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          )}

          <div className="flex items-center gap-3">
            <span className="font-mono text-5xl font-bold tabular-nums text-white md:text-6xl">
              {match.home_score ?? (isLive ? "0" : "—")}
            </span>
            <span className="font-mono text-2xl text-white/25">:</span>
            <span className="font-mono text-5xl font-bold tabular-nums text-white md:text-6xl">
              {match.away_score ?? (isLive ? "0" : "—")}
            </span>
          </div>

          {isScheduled && (
            <div className="mt-4 flex flex-col items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                Kickoff in
              </span>
              <Countdown kickoffUtc={match.kickoff_utc} />
            </div>
          )}

          {isFinished && match.outcome && (
            <span className="mt-4 inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
              {match.outcome === "home_win" || match.outcome === "H"
                ? `${match.home.name.split(" ")[0]} Win`
                : match.outcome === "away_win" || match.outcome === "A"
                ? `${match.away.name.split(" ")[0]} Win`
                : "Draw"}
            </span>
          )}

          {match.probabilities && (
            <div className="mt-5 w-full max-w-[230px]">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                Win probabilities
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-[#2edb6c]" style={{ width: `${homeProb ?? 0}%` }} />
                {drawProb != null && drawProb > 0 && (
                  <div className="h-full bg-white/25" style={{ width: `${drawProb}%` }} />
                )}
                <div className="h-full bg-[#f59e0b]" style={{ width: `${awayProb ?? 0}%` }} />
              </div>
              <div className="mt-2 flex justify-between font-mono text-[11px] font-semibold tabular-nums">
                <span className="text-emerald-400">{homeProb ?? "—"}%</span>
                {drawProb != null && <span className="text-white/45">{drawProb}%</span>}
                <span className="text-amber-400">{awayProb ?? "—"}%</span>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-col items-center gap-1 text-center">
            <span className="flex items-center gap-1 text-[11px] text-white/55">
              <Calendar size={12} />
              {fmtDate(match.kickoff_utc)}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-white/55">
              <Clock size={12} />
              {fmtTime(match.kickoff_utc)}
            </span>
            {ctx?.venue_name && (
              <span className="flex items-center gap-1 text-[11px] text-white/55">
                <MapPin size={12} />
                {ctx.venue_name}
              </span>
            )}
          </div>
        </div>

        <TeamBlock
          name={match.away.name}
          elo={match.elo_away}
          form={match.form_away}
          side="away"
          logoUrl={match.away.logo_url}
        />
      </div>
    </div>
  );
}

// ─── KPI Strip (2 rows) ──────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  sub,
  col,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  col?: string;
}) {
  return (
    <div className="rounded-[22px] border border-[#27272a] bg-[#27272a] px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
        {label}
      </p>
      <p className={cn("mt-2 font-mono text-[22px] font-bold leading-none tabular-nums", col ?? "text-white")}>
        {value}
      </p>
      {sub && <p className="mt-2 text-[10px] font-mono text-white/40">{sub}</p>}
    </div>
  );
}

function KpiStrip2Row({ match }: { match: MatchProps["match"] }) {
  const p = match.probabilities;
  const fo = match.fair_odds;
  const eh = match.elo_home;
  const ea = match.elo_away;
  const fh = match.form_home;
  const fa = match.form_away;
  const h2h = match.h2h;
  const ep = eh && ea ? eloThreeOutcome(eh.rating, ea.rating) : null;

  const restDiff =
    fh?.days_rest != null && fa?.days_rest != null ? fh.days_rest - fa.days_rest : null;

  return (
    <div className="rounded-[30px] border border-[#27272a] bg-[#18181b] p-5">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {p && (
          <>
            <KpiCell label="Model Home" value={`${Math.round(p.home_win * 100)}%`} col="text-emerald-400" />
            {p.draw != null && p.draw > 0 && <KpiCell label="Model Draw" value={`${Math.round(p.draw * 100)}%`} />}
            <KpiCell label="Model Away" value={`${Math.round(p.away_win * 100)}%`} col="text-amber-500" />
          </>
        )}

        {fo && (
          <>
            <KpiCell label="Fair Home" value={fo.home_win?.toFixed(2) ?? "—"} col="text-emerald-400" />
            {fo.draw != null && fo.draw > 0 && <KpiCell label="Fair Draw" value={fo.draw.toFixed(2)} />}
            <KpiCell label="Fair Away" value={fo.away_win?.toFixed(2) ?? "—"} col="text-amber-500" />
          </>
        )}

        {match.confidence != null && (
          <KpiCell
            label="Confidence"
            value={`${match.confidence}%`}
            col={
              match.confidence >= 60
                ? "text-emerald-400"
                : match.confidence >= 40
                ? "text-amber-500"
                : "text-white/50"
            }
          />
        )}

        {ep && (
          <>
            <KpiCell label="ELO Home" value={`${Math.round(ep.home * 100)}%`} col="text-emerald-400" />
            <KpiCell label="ELO Draw" value={`${Math.round(ep.draw * 100)}%`} />
            <KpiCell label="ELO Away" value={`${Math.round(ep.away * 100)}%`} col="text-amber-500" />
          </>
        )}

        {eh && ea && (
          <KpiCell
            label="ELO Delta"
            value={`${eh.rating - ea.rating >= 0 ? "+" : ""}${(eh.rating - ea.rating).toFixed(0)}`}
            sub="home − away"
            col={eh.rating - ea.rating >= 0 ? "text-emerald-400" : "text-red-400"}
          />
        )}

        {restDiff != null && (
          <KpiCell
            label="Rest Delta"
            value={`${restDiff >= 0 ? "+" : ""}${Math.round(restDiff)}d`}
            sub="home advantage"
            col={
              restDiff >= 2
                ? "text-emerald-400"
                : restDiff <= -2
                ? "text-red-400"
                : "text-white/50"
            }
          />
        )}

        {h2h && h2h.total_matches > 0 && (
          <KpiCell
            label="H2H"
            value={`${h2h.home_wins ?? 0}-${h2h.draws ?? 0}-${h2h.away_wins ?? 0}`}
            sub={`${h2h.total_matches} meetings`}
          />
        )}

        {eh && (
          <KpiCell
            label="Home ELO"
            value={Math.round(eh.rating)}
            sub={
              eh.rating_change != null
                ? `${eh.rating_change >= 0 ? "+" : ""}${eh.rating_change.toFixed(1)} last`
                : undefined
            }
            col="text-emerald-400"
          />
        )}

        {ea && (
          <KpiCell
            label="Away ELO"
            value={Math.round(ea.rating)}
            sub={
              ea.rating_change != null
                ? `${ea.rating_change >= 0 ? "+" : ""}${ea.rating_change.toFixed(1)} last`
                : undefined
            }
            col="text-amber-500"
          />
        )}
      </div>
    </div>
  );
}
// ─── Overview Tab ────────────────────────────────────────────────────────────

function KeyEdges({ match }: { match: MatchProps["match"] }) {
  const edges: { label: string; val: string; col: string }[] = [];
  const eh = match.elo_home; const ea = match.elo_away;
  const fh = match.form_home; const fa = match.form_away;

  if (eh && ea) {
    const diff = eh.rating - ea.rating;
    if (Math.abs(diff) > 50)
      edges.push({ label: "ELO edge", val: `${diff > 0 ? match.home.name : match.away.name} +${Math.abs(diff).toFixed(0)} pts`, col: diff > 0 ? "text-emerald-400" : "text-amber-500" });
  }
  if (fh && fa) {
    const formDiff = (fh.form_pts ?? 0) - (fa.form_pts ?? 0);
    if (Math.abs(formDiff) >= 3)
      edges.push({ label: "Form edge", val: `${formDiff > 0 ? match.home.name : match.away.name} +${Math.abs(formDiff).toFixed(0)} pts`, col: formDiff > 0 ? "text-emerald-400" : "text-amber-500" });
    const restDiff = (fh.days_rest ?? 0) - (fa.days_rest ?? 0);
    if (Math.abs(restDiff) >= 2)
      edges.push({ label: "Rest edge", val: `${restDiff > 0 ? match.home.name : match.away.name} +${Math.abs(restDiff).toFixed(0)}d`, col: "text-white/50" });
  }
  if (match.confidence != null && match.confidence >= 65)
    edges.push({ label: "High confidence", val: `${match.confidence}% model certainty`, col: "text-emerald-400" });
  if (match.confidence != null && match.confidence < 40)
    edges.push({ label: "Low confidence", val: `Only ${match.confidence}% — uncertain match`, col: "text-amber-500" });
  if (edges.length === 0)
    edges.push({ label: "No strong edges", val: "Insufficient data for edge identification", col: "text-white/50" });

  return (
    <div className="flex flex-col divide-y divide-[#27272a]">
      {edges.map((e, i) => (
        <div key={i} className="flex items-center justify-between py-1.5 gap-2">
          <span className="text-[10px] text-white/50 uppercase tracking-widest">{e.label}</span>
          <span className={cn("text-xs font-mono", e.col)}>{e.val}</span>
        </div>
      ))}
    </div>
  );
}

function TeamComparisonTable({ match }: { match: MatchProps["match"] }) {
  const [advanced, setAdvanced] = useState(false);
  const eh = match.elo_home; const ea = match.elo_away;
  const fh = match.form_home; const fa = match.form_away;
  const sh = match.stats_home as Record<string, number | null> | null;
  const sa = match.stats_away as Record<string, number | null> | null;
  const p  = match.probabilities;
  const ep = eh && ea ? eloThreeOutcome(eh.rating, ea.rating) : null;

  type Row = { label: string; hVal: React.ReactNode; aVal: React.ReactNode; hRaw?: number | null; aRaw?: number | null; higherBetter?: boolean; adv?: boolean };
  const rows: Row[] = [
    { label: "Win probability", hVal: pct(p?.home_win), aVal: pct(p?.away_win), hRaw: p?.home_win, aRaw: p?.away_win },
    { label: "ELO-implied H/A", hVal: ep ? `${Math.round(ep.home * 100)}%` : "—", aVal: ep ? `${Math.round(ep.away * 100)}%` : "—", hRaw: ep?.home, aRaw: ep?.away },
    { label: "ELO rating", hVal: eh ? Math.round(eh.rating) : "—", aVal: ea ? Math.round(ea.rating) : "—", hRaw: eh?.rating, aRaw: ea?.rating },
    { label: "ELO Δ last match", hVal: <Delta v={eh?.rating_change} />, aVal: <Delta v={ea?.rating_change} />, hRaw: eh?.rating_change, aRaw: ea?.rating_change },
    { label: "Form pts (last 5)", hVal: n(fh?.form_pts, 0), aVal: n(fa?.form_pts, 0), hRaw: fh?.form_pts, aRaw: fa?.form_pts },
    { label: "W / D / L", hVal: fh ? `${fh.wins ?? 0}W ${fh.draws ?? 0}D ${fh.losses ?? 0}L` : "—", aVal: fa ? `${fa.wins ?? 0}W ${fa.draws ?? 0}D ${fa.losses ?? 0}L` : "—", hRaw: fh?.form_pts, aRaw: fa?.form_pts },
    { label: "Goals for avg", hVal: n(fh?.goals_scored_avg), aVal: n(fa?.goals_scored_avg), hRaw: fh?.goals_scored_avg, aRaw: fa?.goals_scored_avg },
    { label: "Goals ag avg", hVal: n(fh?.goals_conceded_avg), aVal: n(fa?.goals_conceded_avg), hRaw: fh?.goals_conceded_avg, aRaw: fa?.goals_conceded_avg, higherBetter: false },
    { label: "xG avg", hVal: n(fh?.xg_avg, 2), aVal: n(fa?.xg_avg, 2), hRaw: fh?.xg_avg, aRaw: fa?.xg_avg, adv: true },
    { label: "xGA avg", hVal: n(fh?.xga_avg, 2), aVal: n(fa?.xga_avg, 2), hRaw: fh?.xga_avg, aRaw: fa?.xga_avg, higherBetter: false, adv: true },
    { label: "Days rest", hVal: fh?.days_rest != null ? `${Math.round(fh.days_rest)}d` : "—", aVal: fa?.days_rest != null ? `${Math.round(fa.days_rest)}d` : "—", hRaw: fh?.days_rest, aRaw: fa?.days_rest },
    { label: "Shots (match)", hVal: sh?.shots_total ?? "—", aVal: sa?.shots_total ?? "—", hRaw: sh?.shots_total, aRaw: sa?.shots_total, adv: true },
    { label: "Shots on target", hVal: sh?.shots_on_target ?? "—", aVal: sa?.shots_on_target ?? "—", hRaw: sh?.shots_on_target, aRaw: sa?.shots_on_target, adv: true },
    { label: "Fouls (match)", hVal: sh?.fouls ?? "—", aVal: sa?.fouls ?? "—", hRaw: sh?.fouls, aRaw: sa?.fouls, higherBetter: false, adv: true },
  ].filter(r => !r.adv || advanced);

  const getCol = (a?: number | null, b?: number | null, hb = true) => {
    if (a == null || b == null) return "text-white/50";
    return (hb ? a > b : a < b) ? "text-emerald-400" : a === b ? "text-white/50" : "text-amber-500";
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto] md:items-center">
        <div className="rounded-[18px] border border-[#27272a] bg-[#27272a] px-4 py-3 text-center md:text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Home</p>
          <p className="mt-1 text-sm font-semibold text-emerald-400">{match.home.name}</p>
        </div>
        <div className="hidden md:block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">vs</div>
        <div className="rounded-[18px] border border-[#27272a] bg-[#27272a] px-4 py-3 text-center md:text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Away</p>
          <p className="mt-1 text-sm font-semibold text-amber-500">{match.away.name}</p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-1 rounded-full border border-[#27272a] bg-[#27272a] px-3 py-2 text-[11px] font-medium text-white/50 transition hover:text-white"
          onClick={() => setAdvanced(v => !v)}
        >
          {advanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {advanced ? "Basic view" : "Advanced view"}
        </button>
      </div>

      <div className="overflow-hidden rounded-[22px] border border-[#27272a] bg-[#18181b]">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-[#27272a] px-4 py-3 last:border-b-0"
          >
            <div className={cn("text-right font-mono text-sm font-semibold tabular-nums", getCol(row.hRaw, row.aRaw, row.higherBetter !== false))}>
              {row.hVal}
            </div>
            <div className="rounded-full bg-[#27272a] px-3 py-1 text-center text-[11px] font-medium text-white/50 shadow-sm">
              {row.label}
            </div>
            <div className={cn("text-left font-mono text-sm font-semibold tabular-nums", getCol(row.aRaw, row.hRaw, row.higherBetter !== false))}>
              {row.aVal}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentFormMiniTable({ match }: { match: MatchProps["match"] }) {
  const fh = match.form_home;
  const fa = match.form_away;

  const block = (name: string, form: typeof fh, col: string, tint: string) => (
    <div className={cn("rounded-[22px] border px-4 py-4", tint)}>
      <p className={cn("text-sm font-semibold", col)}>{name}</p>
      {form ? (
        <>
          <div className="mt-3 flex items-center justify-between gap-3">
            <FormPills wins={form.wins} draws={form.draws} losses={form.losses} />
            <span className="rounded-full border border-[#27272a] bg-[#27272a] px-2.5 py-1 text-[10px] font-mono text-white/50">
              {form.form_pts != null ? `${form.form_pts.toFixed(0)} pts` : "—"}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[16px] bg-[#27272a] px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">Goals for</p>
              <p className="mt-1 font-mono text-lg font-bold text-white">{n(form.goals_scored_avg)}</p>
            </div>
            <div className="rounded-[16px] bg-[#27272a] px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">Goals against</p>
              <p className="mt-1 font-mono text-lg font-bold text-white">{n(form.goals_conceded_avg)}</p>
            </div>
            <div className="rounded-[16px] bg-[#27272a] px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">xG avg</p>
              <p className="mt-1 font-mono text-lg font-bold text-white">{form.xg_avg != null ? n(form.xg_avg, 2) : "—"}</p>
            </div>
            <div className="rounded-[16px] bg-[#27272a] px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">Days rest</p>
              <p className="mt-1 font-mono text-lg font-bold text-white">{form.days_rest != null ? `${Math.round(form.days_rest)}d` : "—"}</p>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-[16px] bg-[#27272a] px-4 py-4 text-sm text-white/50">No form data</div>
      )}
    </div>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {block(match.home.name, fh, "text-emerald-400", "border-[#27272a] bg-[#27272a]")}
      {block(match.away.name, fa, "text-amber-500", "border-[#27272a] bg-[#27272a]")}
    </div>
  );
}

function QuickContext({ match }: { match: MatchProps["match"] }) {
  const fh = match.form_home; const fa = match.form_away;
  const ctx = match.context;
  return (
    <div className="grid gap-3">
      <div className="rounded-[18px] border border-[#27272a] bg-[#27272a] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Home rest</p>
        <p className="mt-1 font-mono text-lg font-bold text-white">{fh?.days_rest != null ? `${Math.round(fh.days_rest)}d` : "—"}</p>
      </div>
      <div className="rounded-[18px] border border-[#27272a] bg-[#27272a] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Away rest</p>
        <p className="mt-1 font-mono text-lg font-bold text-white">{fa?.days_rest != null ? `${Math.round(fa.days_rest)}d` : "—"}</p>
      </div>
      {ctx?.venue_name && (
        <div className="rounded-[18px] border border-[#27272a] bg-[#27272a] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Venue</p>
          <p className="mt-1 text-sm font-medium text-white">{ctx.venue_name}</p>
        </div>
      )}
      <div className="rounded-[18px] border border-[#27272a] bg-[#27272a] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Injuries data</p>
        <p className="mt-1 text-sm font-medium text-amber-500">Not available</p>
      </div>
    </div>
  );
}

function ModelSnapshot({ match }: { match: MatchProps["match"] }) {
  const p = match.probabilities;
  const sim = match.simulation;
  const topScorelines = sim?.distribution.slice(0, 3) ?? [];
  return (
    <div className="flex flex-col gap-3">
      {p ? (
        <div className="flex flex-col gap-1.5">
          <ProbBar label={`${match.home.name.split(" ")[0]} Win`} pct={p.home_win * 100} color={colors.info} />
          {p.draw != null && p.draw > 0 && <ProbBar label="Draw" pct={p.draw * 100} color={colors.border1} />}
          <ProbBar label={`${match.away.name.split(" ")[0]} Win`} pct={p.away_win * 100} color={colors.warning} />
        </div>
      ) : <EmptyState title="No prediction" desc="Run model pipeline." />}

      {topScorelines.length > 0 && (
        <div className="border-t border-[#27272a] pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50 mb-1.5">Top scorelines</p>
          {topScorelines.map(s => {
            const [h, a] = s.score.split("-").map(Number);
            const col = h > a ? "text-emerald-400" : h < a ? "text-amber-500" : "text-white/50";
            return (
              <div key={s.score} className="flex items-center justify-between py-1 border-b border-[#27272a] last:border-0">
                <span className={cn("font-mono text-xs font-bold", col)}>{s.score}</span>
                <span className="font-mono text-[10px] text-white/50 tabular-nums">{(s.probability * 100).toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      )}

      {match.confidence != null && (
        <div className="border-t border-[#27272a] pt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-white/50">Confidence</span>
            <span className={cn("font-mono text-xs font-bold", match.confidence >= 60 ? "text-emerald-400" : match.confidence >= 40 ? "text-amber-500" : "text-white/50")}>
              {match.confidence}%
            </span>
          </div>
          <div className="h-1 rounded-full bg-[#27272a] overflow-hidden">
            <div className={cn("h-full rounded-full", match.confidence >= 60 ? "bg-emerald-400" : match.confidence >= 40 ? "bg-amber-400" : "bg-white/20")} style={{ width: `${match.confidence}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewTab({ match }: { match: MatchProps["match"] }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sh = match.stats_home as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sa = match.stats_away as any;
  const fh = match.form_home;
  const fa = match.form_away;
  const xgHome = sh?.xg ?? fh?.xg_avg ?? null;
  const xgAway = sa?.xg ?? fa?.xg_avg ?? null;
  const shotsHome = sh?.shots_total ?? null;
  const shotsAway = sa?.shots_total ?? null;

  return (
    <SideGrid>
      <MainCol>
        <Panel title="Match Summary" subtitle="AI-generated edge analysis">
          <KeyEdges match={match} />
        </Panel>

        <Panel title="Head-to-Head Matchup" subtitle="Key numbers side by side">
          <TeamComparisonTable match={match} />
        </Panel>

        <Panel title="Recent Form" subtitle="Last 5 games for each team">
          <RecentFormMiniTable match={match} />
        </Panel>
      </MainCol>
      <SideCol>
        <Panel title="Quick Context">
          <QuickContext match={match} />
        </Panel>

        {(() => {
          const lc = (match as any).league_context as Record<string, any> | null;
          if (!lc) return null;
          return (
            <Panel title="League Table" subtitle="Positioning before kickoff">
              <div className="flex flex-col gap-0">
                {lc.home_position != null && (
                  <MetricRow label={`${match.home.name.split(" ")[0]} position`} value={`#${lc.home_position}`} highlight={lc.home_position <= 4 ? "positive" : lc.home_position >= 18 ? "negative" : undefined} />
                )}
                {lc.away_position != null && (
                  <MetricRow label={`${match.away.name.split(" ")[0]} position`} value={`#${lc.away_position}`} highlight={lc.away_position <= 4 ? "positive" : lc.away_position >= 18 ? "negative" : undefined} />
                )}
                {lc.home_points != null && <MetricRow label={`${match.home.name.split(" ")[0]} pts`} value={lc.home_points} />}
                {lc.away_points != null && <MetricRow label={`${match.away.name.split(" ")[0]} pts`} value={lc.away_points} />}
                {lc.points_gap != null && <MetricRow label="Points gap" value={lc.points_gap} />}
                {lc.top_4_gap_home != null && (
                  <MetricRow label="Top 4 gap (home)" value={lc.top_4_gap_home > 0 ? `+${lc.top_4_gap_home}` : lc.top_4_gap_home.toString()} highlight={lc.top_4_gap_home <= 0 ? "positive" : "warning"} />
                )}
                {lc.relegation_gap_away != null && (
                  <MetricRow label="Relegation gap (away)" value={lc.relegation_gap_away} highlight={lc.relegation_gap_away < 3 ? "negative" : "positive"} />
                )}
              </div>
            </Panel>
          );
        })()}

        <Panel title="Model Snapshot" subtitle="Win probabilities and scorelines">
          <ModelSnapshot match={match} />
        </Panel>

        {(xgHome != null || xgAway != null) && (
          <Panel title="Expected Goals">
            <SoccerPitchSVG
              xgHome={xgHome}
              xgAway={xgAway}
              shotsHome={shotsHome}
              shotsAway={shotsAway}
              homeLabel={match.home.name}
              awayLabel={match.away.name}
            />
          </Panel>
        )}
      </SideCol>
    </SideGrid>
  );
}

// ─── Lineups Tab ─────────────────────────────────────────────────────────────

function PlayerRow({ p, col }: { p: { name: string; jersey?: number | null; position?: string | null; rating?: number | null; goals?: number | null; assists?: number | null; minutes?: number | null; yellow_cards?: number | null; red_cards?: number | null }; col: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-[#27272a] last:border-0">
      {p.jersey != null && (
        <span className="font-mono text-[10px] text-white/40 w-5 text-right shrink-0 tabular-nums">{p.jersey}</span>
      )}
      <div className="flex-1 min-w-0">
        <span className="text-xs text-white truncate">{p.name}</span>
        {p.position && <span className="text-[10px] text-white/50 ml-1.5">{p.position}</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {p.goals != null && p.goals > 0 && <span className="text-[10px] font-mono text-emerald-400" title="Goals">⚽ {p.goals}</span>}
        {p.assists != null && p.assists > 0 && <span className="text-[10px] font-mono text-emerald-400" title="Assists">🅐 {p.assists}</span>}
        {p.yellow_cards != null && p.yellow_cards > 0 && <span className="w-2 h-3 bg-amber-500 rounded-sm inline-block" title="Yellow card" />}
        {p.red_cards != null && p.red_cards > 0 && <span className="w-2 h-3 bg-red-500 rounded-sm inline-block" title="Red card" />}
        {p.minutes != null && <span className="text-[10px] text-white/50 font-mono">{p.minutes}&apos;</span>}
        {p.rating != null && (
          <span className={cn("font-mono text-xs font-bold tabular-nums", p.rating >= 7.5 ? "text-emerald-400" : p.rating >= 6.5 ? "text-white" : "text-white/50")}>{p.rating.toFixed(1)}</span>
        )}
      </div>
    </div>
  );
}

function TeamLineup({ lineup, col, injuryCount }: { lineup: { team_name: string; formation?: string | null; players: any[] } | null; col: string; injuryCount?: number }) {
  if (!lineup) return <EmptyState icon={Users} title="No lineup data" />;
  const starters = lineup.players.filter((p: any) => p.is_starter !== false).slice(0, 11);
  const bench = lineup.players.filter((p: any) => p.is_starter === false);
  const avgRating = starters.length > 0 ? starters.reduce((s: number, p: any) => s + (p.rating ?? 7.0), 0) / starters.length : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-semibold", col)}>{lineup.team_name}</span>
        <div className="flex items-center gap-2">
          {lineup.formation && <span className="inline-flex items-center rounded-full border border-[#27272a] bg-[#27272a] px-2 py-0.5 text-[10px] font-mono text-white/50">{lineup.formation}</span>}
          {avgRating != null && (
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono", avgRating >= 7.5 ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" : "bg-white/5 border-white/10 text-white/50")}>
              avg {avgRating.toFixed(1)}
            </span>
          )}
          {injuryCount != null && injuryCount > 0 && (
            <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-[10px] font-mono text-amber-400">{injuryCount} out</span>
          )}
        </div>
      </div>
      <div className="flex flex-col">
        {starters.map((p: any, i: number) => <PlayerRow key={i} p={p} col={col} />)}
      </div>
      {bench.length > 0 && (
        <div className="border-t border-[#27272a] pt-2">
          <p className="text-[10px] text-white/50 uppercase tracking-widest mb-1">Bench</p>
          {bench.map((p: any, i: number) => <PlayerRow key={i} p={p} col={col} />)}
        </div>
      )}
    </div>
  );
}

function InjuriesPanel({ injuries, col, teamName }: { injuries: any[] | null | undefined; col: string; teamName: string }) {
  if (!injuries || injuries.length === 0) return null;
  return (
    <div className="flex flex-col gap-0">
      <p className={cn("text-xs font-semibold mb-2", col)}>{teamName}</p>
      {injuries.map((inj: any, i: number) => (
        <div key={i} className="py-1.5 border-b border-[#27272a] last:border-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-white">{inj.player_name}</span>
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono",
              inj.status === "Out" ? "bg-red-500/20 border-red-500/30 text-red-400"
              : inj.status === "Doubtful" ? "bg-amber-500/20 border-amber-500/30 text-amber-500"
              : "bg-white/5 border-white/10 text-white/50")}>{inj.status}</span>
          </div>
          {inj.reason && <p className="text-[10px] text-white/50 mt-0.5">{inj.reason}</p>}
          {inj.expected_return && <p className="text-[10px] text-white/50">Return: {inj.expected_return}</p>}
        </div>
      ))}
    </div>
  );
}

function LineupsTab({ match }: { match: MatchProps["match"] }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = match as any;
  const lineupHome = m.lineup_home;
  const lineupAway = m.lineup_away;
  const injHome: any[] | undefined = m.injuries_home;
  const injAway: any[] | undefined = m.injuries_away;
  const hasLineups = lineupHome || lineupAway;
  const hasInjuries = (injHome && injHome.length > 0) || (injAway && injAway.length > 0);

  return (
    <SideGrid>
      <MainCol>
        {hasLineups ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#18181b] border border-[#27272a] rounded-[24px] overflow-hidden">
              <div className="flex items-center px-5 py-3.5 border-b border-[#27272a]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">Home XI</span>
              </div>
              <div className="px-5 py-4">
                <TeamLineup lineup={lineupHome} col="text-emerald-400" injuryCount={injHome?.filter((i: any) => i.status === "Out").length} />
              </div>
            </div>
            <div className="bg-[#18181b] border border-[#27272a] rounded-[24px] overflow-hidden">
              <div className="flex items-center px-5 py-3.5 border-b border-[#27272a]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">Away XI</span>
              </div>
              <div className="px-5 py-4">
                <TeamLineup lineup={lineupAway} col="text-amber-500" injuryCount={injAway?.filter((i: any) => i.status === "Out").length} />
              </div>
            </div>
          </div>
        ) : (
          <Panel title="Starting XI" subtitle="Not available">
            <EmptyState icon={Users} title="Lineups not available"
              desc="Official lineups are published ~1 hour before kickoff. Connect a lineups provider to enable this tab." />
          </Panel>
        )}
      </MainCol>
      <SideCol>
        <Panel title="Absences & Injuries">
          {hasInjuries ? (
            <div className="flex flex-col gap-4">
              {injHome && injHome.length > 0 && <InjuriesPanel injuries={injHome} col="text-emerald-400" teamName={match.home.name} />}
              {injAway && injAway.length > 0 && <div className="border-t border-[#27272a] pt-3"><InjuriesPanel injuries={injAway} col="text-amber-500" teamName={match.away.name} /></div>}
            </div>
          ) : (
            <EmptyState icon={Shield} title="No injury data" desc="All players available." />
          )}
        </Panel>
        {hasLineups && (
          <Panel title="Lineup Strength">
            {[
              { label: match.home.name, lineup: lineupHome, col: "text-emerald-400", bgCol: "bg-[#2edb6c]" },
              { label: match.away.name, lineup: lineupAway, col: "text-amber-500", bgCol: "bg-[#f59e0b]" },
            ].map(({ label, lineup, col, bgCol }) => {
              if (!lineup) return null;
              const starters = lineup.players.filter((p: any) => p.is_starter !== false).slice(0, 11);
              const avg = starters.length > 0 ? starters.reduce((s: number, p: any) => s + (p.rating ?? 7.0), 0) / starters.length : null;
              return (
                <div key={label} className="mb-3 last:mb-0">
                  <div className="flex justify-between text-2xs mb-1">
                    <span className={col}>{label.split(" ")[0]}</span>
                    <span className="font-mono font-bold text-white tabular-nums">{avg != null ? avg.toFixed(2) : "—"}</span>
                  </div>
                  {avg != null && (
                    <div className="h-1.5 rounded-full bg-[#27272a] overflow-hidden">
                      <div className={cn("h-full rounded-full", bgCol)} style={{ width: `${((avg - 6) / 4) * 100}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-[10px] text-white/50 mt-3 pt-2 border-t border-[#27272a]">Based on avg player ratings. Scale: 6.0 → 10.0</p>
          </Panel>
        )}
      </SideCol>
    </SideGrid>
  );
}

// ─── Stats Tab ───────────────────────────────────────────────────────────────

function StatsTab({ match }: { match: MatchProps["match"] }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sh = (match.stats_home ?? match.stats_home_live) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sa = (match.stats_away ?? match.stats_away_live) as any;
  const fh = match.form_home; const fa = match.form_away;
  const hasMatchStats = sh || sa;

  const radarMetrics = (sh || fh) && (sa || fa) ? [
    { label: "xG",        home: norm(sh?.xg ?? fh?.xg_avg, 0, 3),          away: norm(sa?.xg ?? fa?.xg_avg, 0, 3) },
    { label: "Shots",     home: norm(sh?.shots_total, 0, 25),               away: norm(sa?.shots_total, 0, 25) },
    { label: "Possession",home: norm(sh?.possession_pct, 0, 100),            away: norm(sa?.possession_pct, 0, 100) },
    { label: "Key Passes",home: norm(sh?.key_passes, 0, 10),                away: norm(sa?.key_passes, 0, 10) },
    { label: "Tackles",   home: norm(sh?.tackles, 0, 25),                   away: norm(sa?.tackles, 0, 25) },
    { label: "Corners",   home: norm(sh?.corners, 0, 15),                   away: norm(sa?.corners, 0, 15) },
  ] : null;

  return (
    <SideGrid>
      <MainCol>
        {radarMetrics && (
          <Panel title="Team Profile Radar" subtitle="Normalised 0–100">
            <TeamRadarChart
              metrics={radarMetrics}
              homeLabel={match.home.name}
              awayLabel={match.away.name}
              homeColor={colors.info}
              awayColor={colors.warning}
              height={220}
            />
          </Panel>
        )}
        <Panel title="Team Statistics" subtitle={match.status === "finished" ? "Full-time" : "Pre-match"} padded={false}>
          <div className="px-5 py-4">
            <div className="flex justify-between pb-2 mb-1 border-b border-[#27272a]">
              <span className="text-xs font-semibold text-emerald-400">{match.home.name}</span>
              <span className="text-xs font-semibold text-amber-500">{match.away.name}</span>
            </div>

            {hasMatchStats ? (
              <>
                {(sh?.possession_pct != null || sa?.possession_pct != null) && (
                  <div className="py-2.5 border-b border-[#27272a]">
                    <div className="flex justify-between items-baseline mb-1.5">
                      <span className="font-mono text-sm font-bold text-emerald-400 tabular-nums">{sh?.possession_pct != null ? `${Math.round(sh.possession_pct)}%` : "—"}</span>
                      <span className="text-[10px] uppercase tracking-widest text-white/50">Possession</span>
                      <span className="font-mono text-sm font-bold text-amber-500 tabular-nums">{sa?.possession_pct != null ? `${Math.round(sa.possession_pct)}%` : "—"}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden flex">
                      <div className="h-full bg-[#2edb6c]" style={{ width: `${sh?.possession_pct ?? 50}%` }} />
                      <div className="h-full bg-[#f59e0b] flex-1" />
                    </div>
                  </div>
                )}
                <StatBar label="Shots" homeVal={sh?.shots_total} awayVal={sa?.shots_total} />
                <StatBar label="On Target" homeVal={sh?.shots_on_target} awayVal={sa?.shots_on_target} />
                {(sh?.shots_total > 0 || sa?.shots_total > 0) && (sh?.shots_on_target != null || sa?.shots_on_target != null) && (
                  <StatBar label="Shot Acc. %"
                    homeVal={sh?.shots_total > 0 ? (sh.shots_on_target / sh.shots_total) * 100 : null}
                    awayVal={sa?.shots_total > 0 ? (sa.shots_on_target / sa.shots_total) * 100 : null}
                    fmt={v => `${v.toFixed(0)}%`}
                  />
                )}
                {(sh?.xg != null || sa?.xg != null) && <StatBar label="xG" homeVal={sh?.xg} awayVal={sa?.xg} fmt={v => v.toFixed(2)} />}
                <StatBar label="Fouls" homeVal={sh?.fouls} awayVal={sa?.fouls} lowerBetter />
                <StatBar label="Yellow Cards" homeVal={sh?.yellow_cards} awayVal={sa?.yellow_cards} lowerBetter />
                {(sh?.red_cards != null || sa?.red_cards != null) && <StatBar label="Red Cards" homeVal={sh?.red_cards} awayVal={sa?.red_cards} lowerBetter />}
              </>
            ) : (
              <EmptyState icon={BarChart2} title="No match stats" desc="Stats available after match completion or with a live data provider." />
            )}
          </div>
        </Panel>

        <Panel title="Pre-Match Form Averages" subtitle="Last 5 games" padded={false}>
          <div className="px-5 py-4">
            {(fh || fa) ? (
              <>
                <StatBar label="Goals scored avg" homeVal={fh?.goals_scored_avg} awayVal={fa?.goals_scored_avg} />
                <StatBar label="Goals conceded avg" homeVal={fh?.goals_conceded_avg} awayVal={fa?.goals_conceded_avg} lowerBetter />
                {(fh?.xg_avg != null || fa?.xg_avg != null) && <StatBar label="xG avg" homeVal={fh?.xg_avg} awayVal={fa?.xg_avg} fmt={v => v.toFixed(2)} />}
                {(fh?.xga_avg != null || fa?.xga_avg != null) && <StatBar label="xGA avg" homeVal={fh?.xga_avg} awayVal={fa?.xga_avg} fmt={v => v.toFixed(2)} lowerBetter />}
                <StatBar label="Form pts" homeVal={fh?.form_pts} awayVal={fa?.form_pts} fmt={v => v.toFixed(0)} />
              </>
            ) : (
              <EmptyState icon={BarChart2} title="No form data" />
            )}
          </div>
        </Panel>

        {/* Advanced metrics from adv_home/adv_away */}
        {(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const advH = (match as any).adv_home as Record<string, any> | null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const advA = (match as any).adv_away as Record<string, any> | null;
          const fh2 = (match as any).form_home as Record<string, any> | null;
          const fa2 = (match as any).form_away as Record<string, any> | null;
          if (!advH && !advA && !fh2 && !fa2) return null;
          return (
            <Panel title="Advanced Metrics" subtitle="Pressing · Big Chances · Set Pieces" padded={false}>
              <div className="px-5 py-4">
                <div className="flex justify-between pb-2 mb-1 border-b border-[#27272a]">
                  <span className="text-xs font-semibold text-emerald-400">{match.home.name}</span>
                  <span className="text-xs font-semibold text-amber-500">{match.away.name}</span>
                </div>
                <StatBar label="PPDA (lower = more press)" homeVal={advH?.ppda} awayVal={advA?.ppda} lowerBetter fmt={v => v.toFixed(2)} />
                <StatBar label="Big Chances Created" homeVal={advH?.big_chances_created} awayVal={advA?.big_chances_created} />
                <StatBar label="Big Chances Missed" homeVal={advH?.big_chances_missed} awayVal={advA?.big_chances_missed} lowerBetter />
                <StatBar label="Big Chance Conv. %" homeVal={advH?.big_chance_conversion_pct != null ? advH.big_chance_conversion_pct * 100 : null} awayVal={advA?.big_chance_conversion_pct != null ? advA.big_chance_conversion_pct * 100 : null} fmt={v => `${v.toFixed(0)}%`} />
                <StatBar label="Set Piece Goals" homeVal={advH?.set_piece_goals} awayVal={advA?.set_piece_goals} />
                <StatBar label="Progressive Passes" homeVal={advH?.progressive_passes} awayVal={advA?.progressive_passes} />
                <StatBar label="Progressive Carries" homeVal={advH?.progressive_carries} awayVal={advA?.progressive_carries} />
                <StatBar label="Final Third Entries" homeVal={advH?.final_third_entries} awayVal={advA?.final_third_entries} />
                <StatBar label="Penalty Box Touches" homeVal={advH?.penalty_box_touches} awayVal={advA?.penalty_box_touches} />
                <StatBar label="Aerial Duel Win %" homeVal={advH?.aerial_duel_win_pct != null ? advH.aerial_duel_win_pct * 100 : null} awayVal={advA?.aerial_duel_win_pct != null ? advA.aerial_duel_win_pct * 100 : null} fmt={v => `${v.toFixed(0)}%`} />
                <StatBar label="Cross Accuracy %" homeVal={advH?.cross_accuracy_pct != null ? advH.cross_accuracy_pct * 100 : null} awayVal={advA?.cross_accuracy_pct != null ? advA.cross_accuracy_pct * 100 : null} fmt={v => `${v.toFixed(0)}%`} />
                <StatBar label="xPts" homeVal={advH?.xpts} awayVal={advA?.xpts} fmt={v => v.toFixed(2)} />
                {/* Form averages */}
                {(fh2?.ppda_avg != null || fa2?.ppda_avg != null) && (
                  <StatBar label="PPDA avg (form)" homeVal={fh2?.ppda_avg} awayVal={fa2?.ppda_avg} lowerBetter fmt={v => v.toFixed(2)} />
                )}
                {(fh2?.clean_sheets != null || fa2?.clean_sheets != null) && (
                  <StatBar label="Clean sheets (L5)" homeVal={fh2?.clean_sheets} awayVal={fa2?.clean_sheets} />
                )}
                {(fh2?.btts != null || fa2?.btts != null) && (
                  <StatBar label="BTTS (L5)" homeVal={fh2?.btts} awayVal={fa2?.btts} />
                )}
                {(fh2?.corners_avg != null || fa2?.corners_avg != null) && (
                  <StatBar label="Corners avg (L5)" homeVal={fh2?.corners_avg} awayVal={fa2?.corners_avg} fmt={v => v.toFixed(1)} />
                )}
              </div>
            </Panel>
          );
        })()}
      </MainCol>

      <SideCol>
        {/* Key Leaders from lineup player data */}
        {(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lh = (match as any).lineup_home as { players: any[] } | null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const la = (match as any).lineup_away as { players: any[] } | null;
          const topH = lh?.players.filter((p: any) => p.is_starter !== false).sort((a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 3) ?? [];
          const topA = la?.players.filter((p: any) => p.is_starter !== false).sort((a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 3) ?? [];
          if (topH.length === 0 && topA.length === 0) return (
            <Panel title="Key Leaders">
              <EmptyState icon={Users} title="Player data not available" desc="Lineup data not yet available." />
            </Panel>
          );
          return (
            <Panel title="Key Leaders" subtitle="Top rated per team">
              {topH.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-emerald-400 mb-1">{match.home.name}</p>
                  {topH.map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-[#27272a] last:border-0">
                      <div className="min-w-0">
                        <span className="text-xs text-white truncate">{p.name}</span>
                        {p.position && <span className="text-[10px] text-white/50 ml-1">{p.position}</span>}
                      </div>
                      <span className={cn("font-mono text-xs font-bold tabular-nums shrink-0", (p.rating ?? 0) >= 7.5 ? "text-emerald-400" : "text-white/50")}>
                        {p.rating?.toFixed(1) ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {topA.length > 0 && (
                <div className="border-t border-[#27272a] pt-3">
                  <p className="text-xs font-semibold text-amber-500 mb-1">{match.away.name}</p>
                  {topA.map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-[#27272a] last:border-0">
                      <div className="min-w-0">
                        <span className="text-xs text-white truncate">{p.name}</span>
                        {p.position && <span className="text-[10px] text-white/50 ml-1">{p.position}</span>}
                      </div>
                      <span className={cn("font-mono text-xs font-bold tabular-nums shrink-0", (p.rating ?? 0) >= 7.5 ? "text-emerald-400" : "text-white/50")}>
                        {p.rating?.toFixed(1) ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          );
        })()}

        {/* Player Stats Table */}
        {(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lh = (match as any).lineup_home as { players: any[] } | null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const la = (match as any).lineup_away as { players: any[] } | null;
          const all = [
            ...(lh?.players.filter((p: any) => p.is_starter !== false) ?? []).map((p: any) => ({ ...p, side: "home" })),
            ...(la?.players.filter((p: any) => p.is_starter !== false) ?? []).map((p: any) => ({ ...p, side: "away" })),
          ];
          if (all.length === 0) return null;
          return (
            <Panel title="Player Stats" padded={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#27272a]">
                      <th className="text-left px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">Player</th>
                      <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">G</th>
                      <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">A</th>
                      <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">xG</th>
                      <th className="text-right px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">Rtg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {all.slice(0, 10).map((p: any, i: number) => (
                      <tr key={i} className="border-b border-[#27272a] last:border-0">
                        <td className={cn("px-5 py-2", p.side === "home" ? "text-emerald-400" : "text-amber-500")}>{p.name}</td>
                        <td className="text-center px-3 py-2 font-mono tabular-nums text-white/50">{p.goals ?? "—"}</td>
                        <td className="text-center px-3 py-2 font-mono tabular-nums text-white/50">{p.assists ?? "—"}</td>
                        <td className="text-center px-3 py-2 font-mono tabular-nums text-white/50">{p.xg != null ? p.xg.toFixed(2) : "—"}</td>
                        <td className={cn("text-right px-5 py-2 font-mono font-bold tabular-nums", (p.rating ?? 0) >= 7.5 ? "text-emerald-400" : "text-white/50")}>{p.rating?.toFixed(1) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          );
        })()}
      </SideCol>
    </SideGrid>
  );
}

// ─── Timeline Tab ─────────────────────────────────────────────────────────────

function eventBorderColor(type: string | null | undefined): string {
  const t = (type ?? "").toLowerCase();
  if (t.includes("goal")) return "border-l-emerald-400";
  if (t.includes("yellow")) return "border-l-amber-400";
  if (t.includes("red")) return "border-l-red-400";
  if (t.includes("sub")) return "border-l-emerald-400";
  return "border-l-[#27272a]";
}

function eventIcon(type: string): string {
  const t = type.toLowerCase();
  if (t === "goal") return "⚽";
  if (t === "yellow_card") return "🟨";
  if (t === "red_card") return "🟥";
  if (t === "substitution") return "🔄";
  if (t === "penalty_missed") return "❌";
  if (t === "var") return "📺";
  return "•";
}

function TimelineTab({ match }: { match: MatchProps["match"] }) {
  const events = match.events;
  const hasEvents = events && events.length > 0;

  return (
    <SideGrid>
      <MainCol>
        <Panel title="Event Feed" subtitle="Goals · Cards · Subs">
          {match.status === "scheduled" ? (
            <EmptyState icon={Clock} title="Match hasn't started" desc="Events will stream once the match is underway." />
          ) : hasEvents ? (
            <div className="flex flex-col gap-1">
              {events.map((ev, i) => {
                const minuteStr = ev.minute != null
                  ? ev.minute_extra != null ? `${ev.minute}+${ev.minute_extra}` : `${ev.minute}`
                  : "—";
                const isHome = ev.team === "home";
                const label = ev.player_name ?? ev.description ?? ev.type ?? "Event";
                const scoreStr = ev.score_home != null && ev.score_away != null
                  ? `${ev.score_home}–${ev.score_away}`
                  : null;
                return (
                  <div key={i} className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 py-2 border-b border-[#27272a] last:border-b-0">
                    {/* Home side */}
                    <div className={cn("flex flex-col items-start gap-0.5", !isHome && "opacity-0")}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-base leading-none">{eventIcon(ev.type)}</span>
                        <span className="text-xs text-white font-medium">{label}</span>
                        {ev.is_own_goal && <span className="text-[10px] text-red-400">(OG)</span>}
                        {ev.is_penalty && <span className="text-[10px] text-white/50">(P)</span>}
                      </div>
                      {ev.player_out && <span className="text-[10px] text-white/50 pl-6">↑ {ev.player_out}</span>}
                    </div>
                    {/* Center minute + score */}
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                      <span className="font-mono text-xs font-bold tabular-nums px-2 py-0.5 rounded-full bg-[#27272a] border border-[#27272a] text-white/50">{minuteStr}&apos;</span>
                      {scoreStr && <span className="font-mono text-[10px] text-white/50 tabular-nums">{scoreStr}</span>}
                    </div>
                    {/* Away side */}
                    <div className={cn("flex flex-col items-end gap-0.5", isHome && "opacity-0")}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-white font-medium">{label}</span>
                        <span className="text-base leading-none">{eventIcon(ev.type)}</span>
                        {ev.is_own_goal && <span className="text-[10px] text-red-400">(OG)</span>}
                        {ev.is_penalty && <span className="text-[10px] text-white/50">(P)</span>}
                      </div>
                      {ev.player_out && <span className="text-[10px] text-white/50 pr-6">↑ {ev.player_out}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={Activity} title="No event data" desc="Events will appear for live and finished matches." />
          )}
        </Panel>
      </MainCol>
      <SideCol>
        <Panel title="Match Momentum">
          <EmptyState icon={TrendingUp} title="Momentum chart" desc="xG by minute will appear when event data is connected." />
        </Panel>
      </SideCol>
    </SideGrid>
  );
}

// ─── H2H Tab ─────────────────────────────────────────────────────────────────

function H2HTab({ match }: { match: MatchProps["match"] }) {
  const h2h = match.h2h;
  const homeWins = h2h?.home_wins ?? 0;
  const draws    = h2h?.draws ?? 0;
  const awayWins = h2h?.away_wins ?? 0;
  const total    = h2h?.total_matches ?? 0;
  const avgGoals = h2h?.recent_matches?.length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? h2h.recent_matches.reduce((a: number, m: any) => a + (m.home_score ?? 0) + (m.away_score ?? 0), 0) / h2h.recent_matches.length
    : null;

  return (
    <SideGrid>
      <MainCol>
        <Panel title="H2H Summary" subtitle={total ? `${total} meetings` : "No data"}>
          {total > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: `${match.home.name.split(" ")[0]} wins`, v: homeWins, pct: total ? Math.round(homeWins / total * 100) : 0, col: "text-emerald-400" },
                  { label: "Draws", v: draws, pct: total ? Math.round(draws / total * 100) : 0, col: "text-white/50" },
                  { label: `${match.away.name.split(" ")[0]} wins`, v: awayWins, pct: total ? Math.round(awayWins / total * 100) : 0, col: "text-amber-500" },
                ].map(k => (
                  <div key={k.label} className="flex flex-col gap-0.5">
                    <p className="text-[10px] text-white/50">{k.label}</p>
                    <p className={cn("font-mono text-2xl font-bold tabular-nums", k.col)}>{k.v}</p>
                    <p className="text-[10px] text-white/50 font-mono">{k.pct}%</p>
                  </div>
                ))}
              </div>
              <div className="h-1.5 rounded-full bg-[#27272a] overflow-hidden flex mb-3">
                <div className="h-full bg-[#2edb6c]" style={{ width: `${total ? homeWins / total * 100 : 33}%` }} />
                <div className="h-full bg-white/20" style={{ width: `${total ? draws / total * 100 : 34}%` }} />
                <div className="h-full bg-[#f59e0b] flex-1" />
              </div>
              {avgGoals != null && <p className="text-[10px] text-white/50 font-mono">Avg goals/game: {avgGoals.toFixed(1)}</p>}
            </>
          ) : (
            <EmptyState icon={Users} title="No H2H history" desc="These teams haven't met in our database." />
          )}
        </Panel>

        <Panel title="Recent Meetings" subtitle={`Last ${h2h?.recent_matches?.length ?? 0}`} padded={false}>
          {h2h?.recent_matches && h2h.recent_matches.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#27272a]">
                    <th className="text-left px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">Date</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">Home</th>
                    <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">Score</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">Away</th>
                    <th className="text-right px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {h2h.recent_matches.map((m: any, i: number) => {
                    const rm = m as any;
                    const norm = normaliseOutcome(rm.outcome ?? rm.winner);
                    const homeName = rm.home_name || match.home.name;
                    const awayName = rm.away_name || match.away.name;
                    const winnerName = norm === "home_win" ? homeName : norm === "away_win" ? awayName : norm === "draw" ? "Draw" : "—";
                    const winCol = norm === "home_win" ? "text-emerald-400" : norm === "away_win" ? "text-amber-500" : "text-white/50";
                    return (
                      <tr key={i} className="border-b border-[#27272a] last:border-0">
                        <td className="text-white/50 font-mono text-[10px] whitespace-nowrap px-5 py-2">{fmtDateShort(rm.date)}</td>
                        <td className="text-right text-white truncate max-w-[80px] px-3 py-2">{homeName}</td>
                        <td className="text-center font-mono font-bold text-white whitespace-nowrap px-3 py-2">{rm.home_score ?? "—"} – {rm.away_score ?? "—"}</td>
                        <td className="text-left text-white truncate max-w-[80px] px-3 py-2">{awayName}</td>
                        <td className={cn("text-right text-[10px] font-mono font-bold whitespace-nowrap px-5 py-2", winCol)}>{winnerName}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={Users} title="No meeting data" />
          )}
        </Panel>
      </MainCol>

      <SideCol>
        <Panel title="Avg per Meeting">
          <div className="flex flex-col gap-0">
            <MetricRow label="Avg goals" value={avgGoals != null ? avgGoals.toFixed(1) : "—"} />
            <MetricRow label="Home win rate" value={total ? `${Math.round(homeWins / total * 100)}%` : "—"} highlight={homeWins > awayWins ? "positive" : undefined} />
            <MetricRow label="Draw rate" value={total ? `${Math.round(draws / total * 100)}%` : "—"} />
            <MetricRow label="Away win rate" value={total ? `${Math.round(awayWins / total * 100)}%` : "—"} />
            <MetricRow label="Total meetings" value={total.toString()} />
          </div>
        </Panel>
        <Panel title="Similar Matchups">
          <EmptyState icon={Target} title="Coming soon"
            desc="Closest historical matchups by ELO differential and context will appear here." />
        </Panel>
      </SideCol>
    </SideGrid>
  );
}

// ─── ELO Tab ──────────────────────────────────────────────────────────────────

function EloTab({ match, eloHome, eloAway }: MatchProps) {
  const eh = match.elo_home; const ea = match.elo_away;
  const ep = eh && ea ? eloThreeOutcome(eh.rating, ea.rating) : null;
  const eloWin = eh && ea ? Math.round(eloWinProb(eh.rating, ea.rating) * 100) : null;

  const allDates = Array.from(new Set([
    ...eloHome.map(p => p.date.slice(0, 10)),
    ...eloAway.map(p => p.date.slice(0, 10)),
  ])).sort();
  const homeMap = Object.fromEntries(eloHome.map(p => [p.date.slice(0, 10), p.rating]));
  const awayMap = Object.fromEntries(eloAway.map(p => [p.date.slice(0, 10), p.rating]));
  const chartData = allDates.map(d => ({ date: d, home: homeMap[d] ?? null, away: awayMap[d] ?? null }));
  const hasChart = eloHome.length > 1 || eloAway.length > 1;

  return (
    <SideGrid>
      <MainCol>
        {/* ELO ratings */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { elo: eh, name: match.home.name, col: "text-emerald-400", bgCol: "bg-[#27272a] border-[#27272a]" },
            { elo: ea, name: match.away.name, col: "text-amber-500", bgCol: "bg-[#27272a] border-[#27272a]" },
          ].map(({ elo, name, col, bgCol }) => (
            <div key={name} className="bg-[#18181b] border border-[#27272a] rounded-[24px] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#27272a]">
                <span className={cn("text-[11px] font-semibold uppercase tracking-[0.16em]", col)}>{name.split(" ")[0]}</span>
                <span className="text-[10px] text-white/40 truncate ml-2 max-w-[120px]">{name}</span>
              </div>
              <div className="px-5 py-4">
                {elo ? (
                  <>
                    <div className={cn("inline-flex items-center justify-center rounded-[14px] px-4 py-2 mb-2 border", bgCol)}>
                      <span className={cn("font-mono text-3xl font-bold tabular-nums", col)}>{Math.round(elo.rating)}</span>
                    </div>
                    <Delta v={elo.rating_change} suffix="last match" />
                    <p className="text-[10px] text-white/40 mt-1">Global ELO rating</p>
                  </>
                ) : <EmptyState title="No ELO data" />}
              </div>
            </div>
          ))}
        </div>

        {/* ELO-implied probs */}
        {ep && eh && ea && (
          <Panel title="ELO-Implied Probabilities" subtitle="K=32 · home adv +65">
            <div className="flex flex-col gap-2 mb-3">
              <ProbBar label={`Home Win — ${match.home.name}`} pct={ep.home * 100} color={colors.info} size="md" />
              <ProbBar label="Draw" pct={ep.draw * 100} color={colors.border1} size="md" />
              <ProbBar label={`Away Win — ${match.away.name}`} pct={ep.away * 100} color={colors.warning} size="md" />
            </div>
            <div className="flex gap-4 pt-2 border-t border-[#27272a]">
              <div>
                <p className="text-[10px] text-white/50">Δ ELO (Home − Away)</p>
                <p className={cn("font-mono text-lg font-bold tabular-nums", (eh.rating - ea.rating) >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {(eh.rating - ea.rating) >= 0 ? "+" : ""}{(eh.rating - ea.rating).toFixed(1)}
                </p>
              </div>
              {eloWin != null && (
                <div>
                  <p className="text-[10px] text-white/50">Home win % (ELO model)</p>
                  <p className="font-mono text-lg font-bold text-white tabular-nums">{eloWin}%</p>
                </div>
              )}
            </div>
            <p className="text-[10px] text-white/40 mt-2 pt-2 border-t border-[#27272a]">
              Formula: P(home) = 1 / (1 + 10^((elo_away − (elo_home + 65)) / 400)). Draw estimated from ELO divergence.
            </p>
          </Panel>
        )}

        {/* ELO history chart */}
        {hasChart && (
          <Panel title={`Rating History`} subtitle={`Last ${Math.max(eloHome.length, eloAway.length)} matches`}>
            <div className="flex gap-4 mb-3">
              <span className="flex items-center gap-1.5 text-[10px] text-white/50">
                <span className="w-6 h-0.5 bg-[#2edb6c] inline-block" />{match.home.name}
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-white/50">
                <span className="w-6 h-0.5 bg-[#f59e0b] inline-block" />{match.away.name}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid {...chartDefaults.grid} />
                <XAxis dataKey="date" tickFormatter={d => d.slice(5)} tick={{ fill: colors.text1, fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: colors.text1, fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} width={40} />
                <RechartTooltip {...chartDefaults.tooltip} formatter={(v: unknown, name: string) => [`${typeof v === "number" ? Math.round(v) : v}`, name === "home" ? match.home.name : match.away.name]} />
                <Line type="monotone" dataKey="home" stroke={colors.info} dot={false} strokeWidth={1.5} connectNulls />
                <Line type="monotone" dataKey="away" stroke={colors.warning} dot={false} strokeWidth={1.5} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        )}
      </MainCol>

      <SideCol>
        <Panel title="ELO Summary">
          <div className="flex flex-col gap-0">
            <MetricRow label="Home ELO" value={eh ? Math.round(eh.rating) : "—"} highlight="info" />
            <MetricRow label="Away ELO" value={ea ? Math.round(ea.rating) : "—"} highlight="warning" />
            <MetricRow label="Home ELO Δ" value={eh?.rating_change != null ? `${eh.rating_change >= 0 ? "+" : ""}${eh.rating_change.toFixed(1)}` : "—"} />
            <MetricRow label="Away ELO Δ" value={ea?.rating_change != null ? `${ea.rating_change >= 0 ? "+" : ""}${ea.rating_change.toFixed(1)}` : "—"} />
            {eloWin != null && <MetricRow label="Home win % (ELO)" value={`${eloWin}%`} />}
            {ep && <MetricRow label="Draw % (ELO)" value={`${Math.round(ep.draw * 100)}%`} />}
          </div>
        </Panel>
        <Panel title="Rating Methodology">
          <div className="flex flex-col gap-0">
            <MetricRow label="K-factor" value="32" />
            <MetricRow label="Home advantage" value="+65 pts" />
            <MetricRow label="Context" value="global" />
            <MetricRow label="Draw handling" value="0.5 win" />
            <MetricRow label="History" value={`${Math.max(eloHome.length, eloAway.length)} pts`} />
          </div>
        </Panel>
        <Panel title="ELO History Notes">
          <p className="text-xs text-white/50">
            ELO ratings update after every match. Home advantage of 65 ELO points is applied before computing expected score. Draw is treated as 0.5 win for both teams.
          </p>
        </Panel>
      </SideCol>
    </SideGrid>
  );
}

// ─── Model Tab ────────────────────────────────────────────────────────────────

function ModelTab({ match }: { match: MatchProps["match"] }) {
  const p    = match.probabilities;
  const fo   = match.fair_odds;
  const sim  = match.simulation;
  const drv  = match.key_drivers ?? [];
  const mdl  = match.model;
  const maxD = drv.length > 0 ? Math.max(...drv.map(d => d.importance)) : 1;

  const barData = sim?.distribution.slice(0, 10).map(s => {
    const [h, a] = s.score.split("-").map(Number);
    return { score: s.score, pct: +(s.probability * 100).toFixed(1), isHome: h > a, isDraw: h === a };
  }) ?? [];

  return (
    <SideGrid>
      <MainCol>
        {/* Probabilities */}
        <Panel title="Prediction" subtitle={mdl ? `v${mdl.version}` : undefined}
          badge={match.confidence != null ? (
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              match.confidence >= 60 ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
              : match.confidence >= 40 ? "bg-amber-500/20 border-amber-500/30 text-amber-500"
              : "bg-white/5 border-white/10 text-white/50")}>
              {match.confidence}% conf
            </span>
          ) : undefined}>
          {p ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <ProbBar label={`Home Win — ${match.home.name}`} pct={p.home_win * 100} color={colors.info} size="md" />
                {p.draw != null && p.draw > 0 && <ProbBar label="Draw" pct={p.draw * 100} color={colors.border1} size="md" />}
                <ProbBar label={`Away Win — ${match.away.name}`} pct={p.away_win * 100} color={colors.warning} size="md" />
              </div>

              {fo && (
                <div className="border-t border-[#27272a] pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50 mb-2">Fair Odds</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Home", prob: p.home_win, odds: fo.home_win, col: "text-emerald-400" },
                      ...(fo.draw != null && fo.draw > 0 ? [{ label: "Draw", prob: p.draw, odds: fo.draw, col: "text-white/50" }] : []),
                      { label: "Away", prob: p.away_win, odds: fo.away_win, col: "text-amber-500" },
                    ].map(row => (
                      <div key={row.label} className="bg-[#27272a] rounded-[14px] border border-[#27272a] p-3">
                        <p className="text-[10px] text-white/50 mb-0.5">{row.label}</p>
                        <p className={cn("font-mono text-lg font-bold tabular-nums", row.col)}>{row.odds?.toFixed(2) ?? "—"}</p>
                        <p className="text-[10px] text-white/40 font-mono">{row.prob != null ? `${Math.round(row.prob * 100)}%` : "—"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : <EmptyState icon={Zap} title="No prediction available" desc="Run the prediction pipeline to generate probabilities." />}
        </Panel>

        {/* Score distribution */}
        {sim && sim.distribution.length > 0 && (
          <Panel title="Score Distribution" subtitle={`${sim.n_simulations.toLocaleString()} simulations`}>
            {sim.mean_home_goals != null && sim.mean_away_goals != null && (
              <div className="flex gap-6 mb-3">
                <div><p className="text-[10px] text-white/50">Exp home goals</p><p className="font-mono text-xl font-bold text-emerald-400 tabular-nums">{sim.mean_home_goals.toFixed(2)}</p></div>
                <div><p className="text-[10px] text-white/50">Exp away goals</p><p className="font-mono text-xl font-bold text-amber-500 tabular-nums">{sim.mean_away_goals.toFixed(2)}</p></div>
              </div>
            )}
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={barData} margin={{ top: 4, right: 4, bottom: 4, left: -16 }}>
                <XAxis dataKey="score" tick={{ fill: colors.text1, fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: colors.text1, fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <RechartTooltip {...chartDefaults.tooltip} formatter={(v: unknown) => [`${v}%`, "Probability"]} />
                <Bar dataKey="pct" radius={[2, 2, 0, 0]}>
                  {barData.map((d, i) => (
                    <Cell key={i} fill={d.isHome ? colors.info : d.isDraw ? colors.border1 : colors.warning} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-5 gap-1">
              {sim.distribution.slice(0, 10).map(s => {
                const [h, a] = s.score.split("-").map(Number);
                return (
                  <div key={s.score} className="flex flex-col items-center py-1.5 bg-[#27272a] rounded-[10px] border border-[#27272a]">
                    <span className={cn("font-mono text-xs font-bold", h > a ? "text-emerald-400" : h < a ? "text-amber-500" : "text-white/50")}>{s.score}</span>
                    <span className="font-mono text-[10px] text-white/50 tabular-nums">{(s.probability * 100).toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {/* Feature drivers */}
        {drv.length > 0 && (
          <Panel title="Feature Drivers" subtitle={`${drv.length} factors`}>
            <div className="flex flex-col gap-2.5">
              {drv.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-32 shrink-0">
                    <p className="text-[10px] text-white/50 font-mono truncate">{d.feature}</p>
                    {d.value != null && <p className="text-[10px] text-white/50 font-mono tabular-nums">{d.value.toFixed(2)}</p>}
                  </div>
                  <div className="flex-1 h-1.5 rounded-full bg-[#27272a]">
                    <div className="h-full rounded-full bg-[#2edb6c]" style={{ width: `${(d.importance / maxD) * 100}%`, opacity: Math.max(0.3, 0.85 - i * 0.07) }} />
                  </div>
                  <span className="font-mono text-[10px] text-white/50 tabular-nums w-8 text-right shrink-0">{(d.importance * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </MainCol>

      <SideCol>
        {/* Model info */}
        <Panel title="Model Info" badge={<span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400">Live</span>}>
          {mdl ? (
            <div className="flex flex-col gap-0">
              <MetricRow label="Version" value={mdl.version} mono={false} />
              <MetricRow label="Algorithm" value={mdl.algorithm ?? "—"} mono={false} />
              <MetricRow label="Trained" value={mdl.trained_at ? fmtDate(mdl.trained_at) : "—"} />
              <MetricRow label="Samples" value={mdl.n_train_samples?.toLocaleString() ?? "—"} />
              <MetricRow label="Accuracy" value={mdl.accuracy != null ? `${(mdl.accuracy * 100).toFixed(1)}%` : "—"} highlight={mdl.accuracy != null && mdl.accuracy > 0.5 ? "positive" : "warning"} />
              <MetricRow label="Brier score" value={mdl.brier_score?.toFixed(4) ?? "—"} />
            </div>
          ) : <EmptyState title="No model metadata" />}
        </Panel>

        <Panel title="Calibration / Trust">
          <div className="flex flex-col gap-2">
            {match.confidence != null ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-white/50">Model confidence</span>
                  <span className={cn("font-mono font-bold", match.confidence >= 60 ? "text-emerald-400" : match.confidence >= 40 ? "text-amber-500" : "text-red-400")}>{match.confidence}%</span>
                </div>
                <div className="h-2 rounded-full bg-[#27272a]">
                  <div className={cn("h-full rounded-full", match.confidence >= 60 ? "bg-emerald-400" : match.confidence >= 40 ? "bg-amber-400" : "bg-red-400")} style={{ width: `${match.confidence}%` }} />
                </div>
                <p className="text-[10px] text-white/50 mt-1">
                  {match.confidence >= 65 ? "High confidence pick — model has strong signal."
                    : match.confidence >= 45 ? "Moderate confidence — bet sizing suggested at half-unit."
                    : "Low confidence — minimal edge detected. Consider skipping."}
                </p>
              </div>
            ) : <EmptyState title="No confidence score" />}
          </div>
        </Panel>

        <Panel title="Sensitivity Notes">
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] text-white/50">Factors that would shift the prediction:</p>
            <ul className="space-y-1">
              {[
                "Missing key striker → home prob −5–8%",
                "Wet pitch → fewer goals, draw prob +3%",
                "Away rotation → away prob −10%",
              ].map((note, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[10px] text-white/50">
                  <AlertTriangle size={10} className="text-amber-400 shrink-0 mt-0.5" />
                  {note}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-white/40 mt-1 italic">Sensitivity analysis requires lineup data.</p>
          </div>
        </Panel>

        {match.betting && (match.betting.home_ml != null || match.betting.away_ml != null) && (
          <Panel title="Market Odds">
            <div className="flex gap-3">
              {(['home_ml', 'draw_ml', 'away_ml'] as const).map((key) => {
                const val = match.betting![key as keyof typeof match.betting];
                if (val == null) return null;
                const label = key === 'home_ml' ? 'Home' : key === 'draw_ml' ? 'Draw' : 'Away';
                const prob = match.probabilities ? (key === 'home_ml' ? match.probabilities.home_win : key === 'draw_ml' ? (match.probabilities as any).draw ?? 0 : match.probabilities.away_win) : null;
                const edge = prob != null && val != null ? (prob - 1 / Number(val)) * 100 : null;
                return (
                  <div key={key} className="flex-1 bg-[#27272a] border border-[#27272a] rounded-[14px] p-3 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-white/50">{label}</span>
                    <span className="text-lg font-bold font-mono text-white">{Number(val).toFixed(2)}</span>
                    {edge != null && (
                      <span className={cn("text-[10px] font-semibold font-mono", edge > 0 ? "text-emerald-400" : "text-red-400")}>
                        {edge > 0 ? "+" : ""}{edge.toFixed(1)}%
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

// ─── Context Tab ──────────────────────────────────────────────────────────────

function DataCompletenessPanel({ match, eloHome, eloAway }: MatchProps) {
  const checks = [
    { label: "Prediction / Probabilities", ok: match.probabilities != null },
    { label: "ELO Ratings", ok: match.elo_home != null && match.elo_away != null },
    { label: "ELO History (chart)", ok: eloHome.length > 1 || eloAway.length > 1 },
    { label: "Match Stats", ok: match.stats_home != null },
    { label: "Form Data (5g)", ok: match.form_home != null },
    { label: "H2H History", ok: (match.h2h?.total_matches ?? 0) > 0 },
    { label: "Simulation", ok: match.simulation != null },
    { label: "Key Drivers", ok: (match.key_drivers?.length ?? 0) > 0 },
    { label: "Venue / Context", ok: match.context?.venue_name != null },
    { label: "xG Data", ok: match.form_home?.xg_avg != null },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { label: "Lineups", ok: !!(match as any).lineup_home },
    { label: "Live Events", ok: false },
  ];
  const score = checks.filter(c => c.ok).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-white/50">Data coverage</span>
        <span className="font-mono text-xs font-bold text-white tabular-nums">{score}/{checks.length}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#27272a] mb-2 overflow-hidden">
        <div className="h-full rounded-full bg-[#2edb6c]" style={{ width: `${score / checks.length * 100}%` }} />
      </div>
      <div className="flex flex-col gap-0">
        {checks.map(c => (
          <div key={c.label} className="flex items-center gap-2 py-1 border-b border-[#27272a] last:border-0">
            {c.ok
              ? <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
              : <XCircle size={11} className="text-white/20 shrink-0" />}
            <span className={cn("text-[10px]", c.ok ? "text-white/50" : "text-white/50")}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContextTab(props: MatchProps) {
  const { match } = props;
  const ctx = match.context;
  const fh = match.form_home; const fa = match.form_away;
  const restDiff = fh?.days_rest != null && fa?.days_rest != null ? fh.days_rest - fa.days_rest : null;

  return (
    <SideGrid>
      <MainCol>
        <Panel title="Scheduling & Rest">
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[{ label: match.home.name, f: fh, col: "text-emerald-400" }, { label: match.away.name, f: fa, col: "text-amber-500" }].map(({ label, f, col }) => (
              <div key={label}>
                <p className={cn("text-[10px] uppercase tracking-widest mb-1", col)}>{label.split(" ")[0]}</p>
                <p className="font-mono text-2xl font-bold text-white tabular-nums">{f?.days_rest != null ? `${Math.round(f.days_rest)}d` : "—"}</p>
                <p className="text-[10px] text-white/50">days since last game</p>
              </div>
            ))}
          </div>
          {restDiff != null && (
            <div className="border-t border-[#27272a] pt-3">
              <MetricRow label="Rest advantage" value={`${restDiff >= 0 ? match.home.name.split(" ")[0] : match.away.name.split(" ")[0]} +${Math.abs(restDiff).toFixed(1)}d`} highlight={Math.abs(restDiff) >= 2 ? "positive" : undefined} />
            </div>
          )}
        </Panel>

        <Panel title="Venue & Weather">
          {ctx?.venue_name ? (
            <div className="flex flex-col gap-0">
              <MetricRow label="Venue" value={ctx.venue_name} mono={false} />
              {ctx.venue_city && <MetricRow label="City" value={ctx.venue_city} mono={false} />}
              {ctx.attendance != null && <MetricRow label="Attendance" value={ctx.attendance.toLocaleString()} />}
              <MetricRow label="Neutral site" value={ctx.neutral_site ? "Yes" : "No"} />
              {ctx.temperature_c != null && (
                <div className="flex items-center gap-1.5 py-1.5 border-b border-[#27272a]">
                  <Thermometer size={12} className="text-white/50" />
                  <MetricRow label="Temperature" value={`${ctx.temperature_c}°C`} />
                </div>
              )}
              {ctx.weather_desc && (
                <div className="flex items-center gap-1.5 py-1.5">
                  <Wind size={12} className="text-white/50" />
                  <span className="text-xs text-white">{ctx.weather_desc}</span>
                </div>
              )}
            </div>
          ) : (
            <EmptyState icon={MapPin} title="No venue data" desc="Venue data is populated from the backfill pipeline." />
          )}
        </Panel>

        {(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ref = (match as any).referee as Record<string, any> | null;
          if (!ref) return (
            <Panel title="Referee Tendencies">
              <EmptyState icon={Eye} title="No referee data" desc="Cards/game and foul rates will appear when referee data is connected." />
            </Panel>
          );
          return (
            <Panel title="Referee Tendencies" subtitle={ref.name}>
              <div className="flex flex-col gap-0">
                <MetricRow label="Name" value={ref.name} mono={false} />
                {ref.nationality && <MetricRow label="Nationality" value={ref.nationality} mono={false} />}
                {ref.yellow_cards_per_game != null && <MetricRow label="Yellow cards/game" value={ref.yellow_cards_per_game.toFixed(2)} highlight="warning" />}
                {ref.red_cards_per_game != null && <MetricRow label="Red cards/game" value={ref.red_cards_per_game.toFixed(2)} highlight={ref.red_cards_per_game > 0.2 ? "negative" : undefined} />}
                {ref.fouls_per_game != null && <MetricRow label="Fouls/game" value={ref.fouls_per_game.toFixed(1)} />}
                {ref.penalties_per_game != null && <MetricRow label="Penalties/game" value={ref.penalties_per_game.toFixed(2)} />}
                {ref.home_win_pct != null && <MetricRow label="Home win %" value={`${Math.round(ref.home_win_pct * 100)}%`} />}
              </div>
            </Panel>
          );
        })()}
      </MainCol>

      <SideCol>
        <Panel title="Data Completeness">
          <DataCompletenessPanel {...props} />
        </Panel>
        <Panel title="Flags & Notes">
          <div className="flex flex-col gap-1.5">
            {[
              !match.form_home && { type: "warning", msg: "No form data — low feature quality" },
              !match.probabilities && { type: "negative", msg: "No prediction — model pipeline not run" },
              !match.elo_home && { type: "warning", msg: "No ELO data — rating engine not run" },
              (match.h2h?.total_matches ?? 0) < 3 && { type: "info", msg: "Limited H2H history — low H2H signal" },
              match.status === "scheduled" && { type: "info", msg: "Lineups not yet confirmed" },
            ].filter(Boolean).map((flag, i) => flag && (
              <div key={i} className={cn("flex items-start gap-1.5 p-2.5 rounded-[12px] border text-[10px]",
                flag.type === "warning" ? "bg-amber-500/20 border-amber-500/30 text-amber-500"
                  : flag.type === "negative" ? "bg-red-500/20 border-red-500/30 text-red-400"
                  : "bg-blue-500/20 border-blue-500/30 text-blue-400")}>
                <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                {flag.msg}
              </div>
            ))}
            {match.probabilities && match.elo_home && (
              <div className="flex items-start gap-1.5 p-2.5 rounded-[12px] border text-[10px] bg-emerald-500/20 border-emerald-500/30 text-emerald-400">
                <CheckCircle2 size={10} className="shrink-0 mt-0.5" />
                Core analytics data loaded — page ready
              </div>
            )}
          </div>
        </Panel>
      </SideCol>
    </SideGrid>
  );
}

// ─── Main Shell ──────────────────────────────────────────────────────────────

export function SoccerMatchDetail({ match, eloHome, eloAway }: MatchProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [standings, setStandings] = useState<StandingsResponse | null>(null);
  const router = useRouter();
  const isLive = match.status === "live";
  const tick = useLiveRefresh(isLive);
  useEffect(() => { if (tick > 0) router.refresh(); }, [tick, router]);

  useEffect(() => {
    getStandingsForMatch(match.id).then(setStandings).catch(() => {});
  }, [match.id]);

  const highlights = match.highlights ?? [];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-screen-2xl flex-col gap-4 bg-[#09090b] px-3 py-4 md:px-4 md:py-5">
      <MatchHeader match={match} />
      <KpiStrip2Row match={match} />
      {match.status === "live" && (
        <div className="rounded-[28px] border border-[#27272a] bg-[#18181b] p-2">
          <SoccerLivePanel match={match} />
        </div>
      )}
      <div className="sticky top-2 z-20">
        <div className="overflow-x-auto no-scrollbar rounded-[24px] border border-[#27272a] bg-[#18181b] p-2">
          <div className="flex min-w-max items-center gap-2">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={cn("shrink-0 rounded-full px-4 py-2.5 text-[12px] font-semibold transition-all",
                  activeTab === t.id
                    ? "bg-[#111315] text-white shadow-sm"
                    : "border border-transparent bg-[#27272a] text-white/50 hover:border-[#27272a] hover:bg-[#18181b] hover:text-white"
                )}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="w-full">
        {activeTab === "overview" && (
          <div className="flex flex-col gap-6">
            <OverviewTab match={match} />
            {standings && (
              <div className="overflow-hidden rounded-[28px] border border-[#27272a] bg-[#18181b] p-5">
                <StandingsTable standings={standings} homeTeamId={match.home.id} awayTeamId={match.away.id} />
              </div>
            )}
            {highlights.length > 0 && (
              <div className="overflow-hidden rounded-[28px] border border-[#27272a] bg-[#18181b] p-5">
                <HighlightsSection highlights={highlights} />
              </div>
            )}
          </div>
        )}
        {activeTab === "lineups" && <LineupsTab match={match} />}
        {activeTab === "stats" && <StatsTab match={match} />}
        {activeTab === "timeline" && <TimelineTab match={match} />}
        {activeTab === "h2h" && <H2HTab match={match} />}
        {activeTab === "elo" && <EloTab match={match} eloHome={eloHome} eloAway={eloAway} />}
        {activeTab === "model" && <ModelTab match={match} />}
        {activeTab === "context" && <ContextTab match={match} eloHome={eloHome} eloAway={eloAway} />}
      </div>
    </div>
  );
}
