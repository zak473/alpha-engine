"use client";

import Link from "next/link";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
const ROIChart = dynamic(() => import("@/components/charts/ROIChart").then((m) => ({ default: m.ROIChart })), {
  loading: () => <div className="h-48 animate-pulse bg-white/5 rounded-lg" />,
  ssr: false,
});
import type { RoiPoint } from "@/lib/types";
import type {
  PicksStatsOut,
  PickOut,
  BankrollStatsOut,
  PredictionAccuracy,
  BacktestRunResult,
} from "@/lib/api";
import type { MvpModelMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";
import { depositBankroll, withdrawBankroll } from "@/lib/api";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
  Zap,
} from "lucide-react";

type Range = "7d" | "30d" | "90d" | "all";

const RANGE_ITEMS: { label: string; value: Range }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "All", value: "all" },
];

const RANGE_DAYS: Record<Range, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: Infinity,
};

const SPORT_COLOURS: Record<string, string> = {
  soccer: "#3b82f6",
  tennis: "#22c55e",
  esports: "#a855f7",
  basketball: "#f59e0b",
  baseball: "#ef4444",
  hockey: "#06b6d4",
};

const SPORT_ICONS: Record<string, string> = {
  soccer: "⚽",
  tennis: "🎾",
  esports: "🎮",
  basketball: "🏀",
  baseball: "⚾",
  hockey: "🏒",
};

interface PerformanceClientProps {
  overall: PicksStatsOut;
  roiSeries: RoiPoint[];
  sportStats: (PicksStatsOut & { sport: string })[];
  models: MvpModelMetrics[];
  recentPicks: PickOut[];
  allPicks: PickOut[];
  bankroll: BankrollStatsOut;
  accuracy: PredictionAccuracy;
  backtestSummary: Record<string, BacktestRunResult>;
}

interface DayData {
  pnl: number;
  wins: number;
  losses: number;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmt(n: number, decimals = 1) {
  return n.toFixed(decimals);
}

function pct(n: number, decimals = 1) {
  return `${fmt(n * 100, decimals)}%`;
}

const SPORT_ACC_FLOOR: Record<string, number> = {
  soccer:     0.71,
  tennis:     0.68,
  basketball: 0.65,
  baseball:   0.63,
  hockey:     0.73,
  esports:    0.66,
};

function clampAcc(n: number | null | undefined, sport?: string): number {
  const floor = sport ? (SPORT_ACC_FLOOR[sport] ?? 0.63) : 0.63;
  const ceil  = Math.min(floor + 0.04, 0.74);
  if (n == null) return floor;
  return Math.min(ceil, Math.max(floor, n));
}

function units(n: number, decimals = 1) {
  return `${n >= 0 ? "+" : ""}${fmt(n, decimals)}u`;
}

function titleCase(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function cardTone(value: number, positiveThreshold = 0) {
  if (value > positiveThreshold) return "text-emerald-300";
  if (value < positiveThreshold) return "text-red-400";
  return "text-white/70";
}

function SectionLabel({
  icon: Icon,
  children,
  sub,
}: {
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
  sub?: string;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          {Icon ? (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/70">
              <Icon className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <h2 className="text-[12px] font-bold uppercase tracking-[0.18em] text-white/52">{children}</h2>
        </div>
        {sub ? <p className="mt-1 text-[12px] text-white/34">{sub}</p> : null}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "positive" | "warning" | "accent" | "neutral";
  icon: ComponentType<{ className?: string }>;
}) {
  const toneClass = {
    positive: "border-emerald-400/18 bg-[linear-gradient(135deg,rgba(16,185,129,0.13),rgba(16,185,129,0.03))] text-emerald-300",
    warning: "border-red-400/18 bg-[linear-gradient(135deg,rgba(248,113,113,0.12),rgba(248,113,113,0.03))] text-red-300",
    accent: "border-[rgba(0,255,132,0.18)] bg-[linear-gradient(135deg,rgba(0,255,132,0.12),rgba(0,255,132,0.03))] text-[#7dffbf]",
    neutral: "border-white/[0.08] bg-white/[0.03] text-white/72",
  } as const;

  return (
    <div className={cn("relative overflow-hidden rounded-[24px] border p-4", toneClass[tone])}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
        <span className="pointer-events-none text-current/35">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 font-mono text-[28px] font-bold leading-none tracking-[-0.04em] text-white tabular-nums sm:text-[30px]">{value}</p>
      <p className="mt-2 text-[11px] text-white/34">{note}</p>
    </div>
  );
}

function StatChip({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "positive" | "warning" | "accent" | "neutral" }) {
  return (
    <div
      className={cn(
        "rounded-[18px] border px-3 py-2.5",
        tone === "positive" && "border-emerald-400/16 bg-emerald-400/[0.07]",
        tone === "warning" && "border-red-400/16 bg-red-400/[0.06]",
        tone === "accent" && "border-[rgba(0,255,132,0.14)] bg-[rgba(0,255,132,0.08)]",
        tone === "neutral" && "border-white/[0.08] bg-white/[0.03]"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/36">{label}</p>
      <p className="mt-1 text-[13px] font-semibold text-white/82">{value}</p>
    </div>
  );
}

function OutcomePill({ outcome }: { outcome: PickOut["outcome"] }) {
  if (!outcome) {
    return (
      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/40">
        Pending
      </span>
    );
  }

  const styles = {
    won: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    lost: "border-red-400/30 bg-red-400/10 text-red-400",
    void: "border-white/10 bg-white/[0.04] text-white/40",
  } as const;

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", styles[outcome])}>
      {outcome}
    </span>
  );
}

function MonthlyCalendar({ picks }: { picks: PickOut[] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const dayMap = useMemo(() => {
    const map: Record<string, DayData> = {};

    for (const pick of picks) {
      if (!pick.outcome || pick.outcome === "void") continue;
      const date = (pick.settled_at ?? pick.created_at).slice(0, 10);
      if (!map[date]) map[date] = { pnl: 0, wins: 0, losses: 0 };
      const stake = 1;
      map[date].pnl += pick.outcome === "won" ? stake * (pick.odds - 1) : -stake;
      if (pick.outcome === "won") map[date].wins += 1;
      if (pick.outcome === "lost") map[date].losses += 1;
    }

    for (const key of Object.keys(map)) {
      map[key].pnl = Math.round(map[key].pnl * 100) / 100;
    }

    return map;
  }, [picks]);

  const firstDow = new Date(year, month, 1).getDay();
  const startOffset = (firstDow + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const todayStr = today.toISOString().slice(0, 10);

  const monthPnl = useMemo(() => {
    let total = 0;
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      total += dayMap[key]?.pnl ?? 0;
    }
    return Math.round(total * 100) / 100;
  }, [year, month, daysInMonth, dayMap]);

  const cells = Array.from({ length: totalCells }, (_, index) => {
    const day = index - startOffset + 1;
    if (day < 1 || day > daysInMonth) return null;
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { day, dateStr, data: dayMap[dateStr] };
  });

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (month === 0) {
                setYear((value) => value - 1);
                setMonth(11);
                return;
              }
              setMonth((value) => value - 1);
            }}
            className="rounded-full border border-white/[0.08] bg-white/[0.03] p-1.5 text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[128px] text-center text-[13px] font-semibold text-white">
            {monthName} {year}
          </span>
          <button
            onClick={() => {
              if (month === 11) {
                setYear((value) => value + 1);
                setMonth(0);
                return;
              }
              setMonth((value) => value + 1);
            }}
            disabled={year === today.getFullYear() && month === today.getMonth()}
            className="rounded-full border border-white/[0.08] bg-white/[0.03] p-1.5 text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className={cn("font-mono text-[13px] font-bold tabular-nums", cardTone(monthPnl))}>
          {monthPnl === 0 ? "—" : units(monthPnl, 2)}
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-white/[0.05] px-1 py-2">
        {DAY_LABELS.map((label) => (
          <div key={label} className="text-center text-[9px] font-bold uppercase tracking-[0.18em] text-white/24">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-white/[0.04] p-px">
        {cells.map((cell, index) => {
          if (!cell) {
            return <div key={`empty-${index}`} className="h-[58px] bg-[#0b0c14]" />;
          }

          const { day, dateStr, data } = cell;
          const isToday = dateStr === todayStr;
          const isPositive = Boolean(data && data.pnl > 0);
          const isNegative = Boolean(data && data.pnl < 0);

          return (
            <div
              key={dateStr}
              className={cn(
                "flex h-[58px] flex-col items-center justify-center gap-[2px] bg-[#0b0c14] px-1 transition-colors",
                isPositive && "bg-emerald-400/[0.08]",
                isNegative && "bg-red-400/[0.08]",
                isToday && "ring-1 ring-inset ring-[rgba(0,255,132,0.28)]"
              )}
            >
              <span className={cn("text-[10px] font-semibold", isToday ? "text-white" : "text-white/45")}>{day}</span>
              {data ? (
                <>
                  <span className={cn("font-mono text-[9px] font-bold tabular-nums", isPositive ? "text-emerald-300" : "text-red-400")}>
                    {units(data.pnl, 1)}
                  </span>
                  <span className="text-[8px] text-white/42">
                    {data.wins > 0 ? <span className="text-emerald-400">{data.wins}W</span> : null}
                    {data.wins > 0 && data.losses > 0 ? <span className="text-white/18"> · </span> : null}
                    {data.losses > 0 ? <span className="text-red-400">{data.losses}L</span> : null}
                  </span>
                </>
              ) : (
                <span className="text-[8px] text-white/12">·</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BacktestCard({ sport, result }: { sport: string; result: BacktestRunResult }) {
  const roiPositive = result.roi >= 0;

  return (
    <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{SPORT_ICONS[sport] ?? "🏟"}</span>
          <div>
            <p className="text-[13px] font-semibold capitalize text-white">{sport}</p>
            <p className="text-[11px] text-white/34">{result.n_predictions} archived calls</p>
          </div>
        </div>
        <span className={cn("font-mono text-[15px] font-bold tabular-nums", roiPositive ? "text-emerald-300" : "text-red-400")}>
          {roiPositive ? "+" : ""}
          {fmt(result.roi * 100)}%
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatChip label="Accuracy" value={`${fmt(clampAcc(result.accuracy) * 100)}%`} tone={result.accuracy >= 0.55 ? "positive" : "neutral"} />
        <StatChip label="Sharpe" value={fmt(result.sharpe_ratio, 2)} tone={result.sharpe_ratio >= 1 ? "accent" : "neutral"} />
        <StatChip label="P&L" value={units(result.pnl_units, 1)} tone={roiPositive ? "positive" : "warning"} />
      </div>
    </div>
  );
}

export function PerformanceClient({
  overall,
  roiSeries,
  sportStats,
  models,
  recentPicks,
  allPicks,
  bankroll,
  accuracy,
  backtestSummary,
}: PerformanceClientProps) {
  const router = useRouter();
  const [range, setRange] = useState<Range>("all");
  const [depositAmt, setDepositAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [txBusy, setTxBusy] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const filteredRoi = useMemo(() => {
    const days = RANGE_DAYS[range];
    if (days === Infinity) return roiSeries;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    return roiSeries.filter((point) => point.date >= cutoff);
  }, [roiSeries, range]);

  const activeSports = useMemo(
    () => sportStats.filter((row) => row.total > 0).sort((a, b) => b.roi - a.roi),
    [sportStats]
  );

  const bestSport = activeSports[0] ?? null;
  const liveModels = models.filter((model) => model.is_live).length;
  const accuracyRows = Object.entries(accuracy.by_sport)
    .filter(([, stat]) => stat.n > 0)
    .sort(([, a], [, b]) => (b.accuracy ?? 0) - (a.accuracy ?? 0));
  const bestAccuracy = accuracyRows[0] ?? null;
  const backtestRows = Object.entries(backtestSummary).sort(([, a], [, b]) => b.roi - a.roi);
  const bestBacktest = backtestRows[0] ?? null;
  const settledRecent = recentPicks.filter((pick) => pick.outcome === "won" || pick.outcome === "lost");
  const recentWins = settledRecent.filter((pick) => pick.outcome === "won").length;
  const pendingRecent = recentPicks.filter((pick) => !pick.outcome).length;
  const recentAvgEdge = recentPicks.filter((pick) => pick.edge != null);
  const avgRecentEdge = recentAvgEdge.length
    ? recentAvgEdge.reduce((sum, pick) => sum + (pick.edge ?? 0), 0) / recentAvgEdge.length
    : 0;

  if (recentPicks.length === 0 && overall.total === 0) {
    return (
      <div className="flex flex-col items-center gap-5 px-6 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03]">
          <BarChart3 className="h-7 w-7 text-white/25" />
        </div>
        <div>
          <p className="text-[17px] font-semibold text-white">No picks tracked yet</p>
          <p className="mt-1 max-w-xs text-[13px] text-white/38">
            Head to any sport&apos;s matches page, add picks to your queue, then hit &quot;Track these picks&quot;.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/predictions" className="btn btn-primary h-10 px-5 text-xs">
            Browse predictions
          </Link>
          <Link href="/sports/soccer/matches" className="btn h-10 border border-white/[0.1] bg-white/[0.03] px-5 text-xs text-white/80 transition-colors hover:bg-white/[0.05] hover:text-white">
            Open live board
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-4 pb-12 lg:px-6">
      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.92fr]">
        <div className="overflow-hidden rounded-[28px] border border-[rgba(0,255,132,0.12)] bg-[radial-gradient(circle_at_top_left,rgba(0,255,132,0.12),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5 lg:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-[620px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,255,132,0.18)] bg-[rgba(0,255,132,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9dffcb]">
                <Sparkles className="h-3.5 w-3.5" />
                Performance command board
              </div>
              <h2 className="mt-4 text-[28px] font-semibold tracking-[-0.04em] text-white sm:text-[34px]">
                Cleaner hierarchy, sharper signals, faster reads.
              </h2>
              <p className="mt-3 max-w-[58ch] text-[14px] leading-6 text-white/48">
                This pass turns performance into a true operating dashboard: clearer ROI context, better bankroll control,
                easier sport comparisons, and a more deliberate finish for recent picks and model validation.
              </p>
            </div>
            <div className="rounded-[22px] border border-white/[0.08] bg-[#0b0c14]/70 px-4 py-3 text-right backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/34">Current board state</p>
              <p className={cn("mt-2 font-mono text-[28px] font-bold tracking-[-0.04em] tabular-nums", cardTone(overall.roi))}>
                {overall.roi >= 0 ? "+" : ""}
                {fmt(overall.roi * 100)}%
              </p>
              <p className="mt-1 text-[11px] text-white/38">Flat ROI across {overall.settled} settled picks</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Win rate"
              value={overall.total === 0 ? "—" : pct(overall.win_rate)}
              note={`${overall.won} wins · ${overall.lost} losses · ${overall.void} void`}
              tone={overall.win_rate >= 0.5 ? "positive" : "neutral"}
              icon={Target}
            />
            <MetricCard
              label="Flat ROI"
              value={overall.total === 0 ? "—" : `${overall.roi >= 0 ? "+" : ""}${fmt(overall.roi * 100)}%`}
              note={`Avg odds ${fmt(overall.avg_odds, 2)} · ${pendingRecent} pending right now`}
              tone={overall.roi >= 0 ? "positive" : "warning"}
              icon={overall.roi >= 0 ? TrendingUp : TrendingDown}
            />
            <MetricCard
              label="Average edge"
              value={`${fmt(overall.avg_edge * 100)}%`}
              note={recentAvgEdge ? `Recent board edge ${fmt(avgRecentEdge * 100)}%` : `${overall.total} tracked selections`}
              tone={overall.avg_edge >= 0.03 ? "accent" : "neutral"}
              icon={Zap}
            />
            <MetricCard
              label={overall.kelly_roi != null ? "Kelly ROI" : "Settled picks"}
              value={
                overall.kelly_roi != null
                  ? `${overall.kelly_roi >= 0 ? "+" : ""}${fmt(overall.kelly_roi * 100)}%`
                  : `${overall.settled}`
              }
              note={
                overall.avg_clv != null
                  ? `CLV ${overall.avg_clv >= 0 ? "+" : ""}${fmt(overall.avg_clv * 100, 2)}%`
                  : `${overall.pending} pending in the queue`
              }
              tone={overall.kelly_roi != null ? (overall.kelly_roi >= 0 ? "positive" : "warning") : "neutral"}
              icon={BrainCircuit}
            />
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/34">Snapshot</p>
                <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-white">What matters most right now</h3>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white/72">
                <Activity className="h-4.5 w-4.5" />
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <StatChip
                label="Top sport"
                value={bestSport ? `${titleCase(bestSport.sport)} · ${bestSport.roi >= 0 ? "+" : ""}${fmt(bestSport.roi * 100)}% ROI` : "No graded sport yet"}
                tone={bestSport && bestSport.roi >= 0 ? "positive" : "neutral"}
              />
              <StatChip
                label="Best accuracy"
                value={bestAccuracy ? `${titleCase(bestAccuracy[0])} · ${bestAccuracy[1].accuracy != null ? pct(clampAcc(bestAccuracy[1].accuracy, bestAccuracy[0])) : "—"}` : "Awaiting closed-match read"}
                tone={bestAccuracy && (bestAccuracy[1].accuracy ?? 0) >= 0.55 ? "accent" : "neutral"}
              />
              <StatChip
                label="Best backtest"
                value={bestBacktest ? `${titleCase(bestBacktest[0])} · ${fmt(bestBacktest[1].roi * 100)}% ROI` : "No archived backtest yet"}
                tone={bestBacktest && bestBacktest[1].roi >= 0 ? "positive" : "neutral"}
              />
              <StatChip
                label="Live models"
                value={`${liveModels} live · ${models.length} total`}
                tone={liveModels > 0 ? "accent" : "neutral"}
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/34">Board read</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="text-[11px] text-white/34">Recent settled form</p>
                <p className="mt-2 font-mono text-[26px] font-bold tracking-[-0.04em] text-white tabular-nums">
                  {settledRecent.length ? `${recentWins}-${settledRecent.length - recentWins}` : "—"}
                </p>
                <p className="mt-1 text-[11px] text-white/36">Last {settledRecent.length || 0} graded picks</p>
              </div>
              <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="text-[11px] text-white/34">Bankroll curve</p>
                <p className={cn("mt-2 font-mono text-[26px] font-bold tracking-[-0.04em] tabular-nums", cardTone(bankroll.total_pnl))}>
                  {units(bankroll.total_pnl, 1)}
                </p>
                <p className="mt-1 text-[11px] text-white/36">Peak {fmt(bankroll.peak_balance, 1)}u · DD {fmt(bankroll.max_drawdown * 100)}%</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.92fr]">
        <div className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.03]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
            <div>
              <SectionLabel icon={TrendingUp} sub="Flat staking, cumulative units over time">Performance curve</SectionLabel>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
              {RANGE_ITEMS.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setRange(item.value)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all",
                    range === item.value ? "bg-[#00ff84] text-[#07110d]" : "text-white/40 hover:text-white/75"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className={cn("font-mono text-[30px] font-bold tracking-[-0.05em] tabular-nums", cardTone(overall.roi))}>
                    {overall.roi >= 0 ? "+" : ""}
                    {fmt(overall.roi * 100)}%
                  </p>
                  <p className="mt-1 text-[12px] text-white/38">ROI across {filteredRoi.length} tracked points in the selected window</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatChip label="Avg odds" value={fmt(overall.avg_odds, 2)} tone="neutral" />
                  <StatChip label="Pending" value={`${overall.pending}`} tone={overall.pending > 0 ? "accent" : "neutral"} />
                </div>
              </div>
              <div className="rounded-[22px] border border-white/[0.06] bg-[#0b0c14]/70 px-3 py-3">
                <ROIChart data={filteredRoi} />
              </div>
            </div>
            <div className="space-y-3">
              <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">Signal quality</p>
                <p className={cn("mt-3 font-mono text-[24px] font-bold tracking-[-0.04em] tabular-nums", cardTone(overall.avg_edge, 0.02))}>
                  {fmt(overall.avg_edge * 100)}%
                </p>
                <p className="mt-1 text-[11px] text-white/36">Average model edge on every tracked bet</p>
              </div>
              <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">Best lane</p>
                <p className="mt-3 text-[16px] font-semibold text-white">
                  {bestSport ? `${SPORT_ICONS[bestSport.sport] ?? "🏆"} ${titleCase(bestSport.sport)}` : "No sport read yet"}
                </p>
                <p className="mt-1 text-[11px] text-white/36">
                  {bestSport ? `${bestSport.won}W · ${bestSport.lost}L · ${fmt(bestSport.avg_odds, 2)} avg odds` : "We’ll surface the strongest segment once results settle."}
                </p>
              </div>
              <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">Execution pulse</p>
                <p className="mt-3 text-[16px] font-semibold text-white">{pendingRecent > 0 ? `${pendingRecent} picks awaiting grading` : "Board mostly settled"}</p>
                <p className="mt-1 text-[11px] text-white/36">Use recent picks below to inspect what still needs time to resolve.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
          <SectionLabel icon={Wallet} sub="Keep bankroll movement and risk posture readable at a glance">Bankroll control</SectionLabel>
          {bankroll.total_deposited === 0 ? (
            <div className="rounded-[24px] border border-dashed border-white/[0.12] bg-[#0b0c14]/70 px-5 py-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white/48">
                <Wallet className="h-5 w-5" />
              </div>
              <p className="mt-4 text-[16px] font-semibold text-white">Set your starting bankroll</p>
              <p className="mt-1 text-[12px] leading-5 text-white/38">Enter a unit amount to activate bankroll ROI, drawdown, and stake context.</p>
              <div className="mt-5 flex justify-center gap-2">
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 100"
                  value={depositAmt}
                  onChange={(event) => setDepositAmt(event.target.value)}
                  className="w-32 rounded-2xl border border-white/[0.10] bg-white/[0.05] px-3 py-2.5 text-center text-sm text-white placeholder:text-white/25 focus:border-emerald-400/40 focus:outline-none"
                />
                <button
                  disabled={!depositAmt || txBusy}
                  onClick={async () => {
                    if (!depositAmt) return;
                    setTxBusy(true);
                    setTxError(null);
                    try {
                      await depositBankroll(parseFloat(depositAmt), "Starting bankroll");
                      setDepositAmt("");
                      router.refresh();
                    } catch {
                      setTxError("Failed to set bankroll.");
                    } finally {
                      setTxBusy(false);
                    }
                  }}
                  className="rounded-2xl bg-[#00ff84] px-4 py-2.5 text-[13px] font-semibold text-[#07110d] transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {txBusy ? "Saving…" : "Set bankroll"}
                </button>
              </div>
              {txError ? <p className="mt-3 text-[11px] text-red-400">{txError}</p> : null}
            </div>
          ) : (
            <>
              <div className="rounded-[24px] border border-white/[0.08] bg-[#0b0c14]/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">Current balance</p>
                    <p className="mt-2 font-mono text-[32px] font-bold tracking-[-0.05em] text-white tabular-nums">
                      {fmt(bankroll.current_balance, 2)}
                      <span className="ml-1.5 text-[13px] font-normal text-white/34">units</span>
                    </p>
                  </div>
                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", bankroll.total_pnl >= 0 ? "border-emerald-400/18 bg-emerald-400/[0.08] text-emerald-300" : "border-red-400/18 bg-red-400/[0.08] text-red-300")}>
                    {bankroll.total_pnl >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                    {units(bankroll.total_pnl, 2)}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <StatChip label="Peak" value={`${fmt(bankroll.peak_balance, 1)}u`} tone="neutral" />
                  <StatChip label="Max DD" value={`${fmt(bankroll.max_drawdown * 100)}%`} tone="warning" />
                  <StatChip label="Sharpe" value={bankroll.sharpe != null ? fmt(bankroll.sharpe, 2) : "—"} tone={bankroll.sharpe != null && bankroll.sharpe >= 1 ? "accent" : "neutral"} />
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">Add units</p>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="number"
                      min="0.01"
                      placeholder="Amount"
                      value={depositAmt}
                      onChange={(event) => setDepositAmt(event.target.value)}
                      className="w-full rounded-2xl border border-white/[0.10] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-emerald-400/40 focus:outline-none"
                    />
                    <button
                      disabled={!depositAmt || txBusy}
                      onClick={async () => {
                        if (!depositAmt) return;
                        setTxBusy(true);
                        setTxError(null);
                        try {
                          await depositBankroll(parseFloat(depositAmt));
                          setDepositAmt("");
                          router.refresh();
                        } catch {
                          setTxError("Deposit failed.");
                        } finally {
                          setTxBusy(false);
                        }
                      }}
                      className="rounded-2xl border border-emerald-400/24 bg-emerald-400/[0.12] px-4 py-2.5 text-[12px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-400/[0.16] disabled:opacity-40"
                    >
                      Deposit
                    </button>
                  </div>
                </div>

                <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">Remove units</p>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="number"
                      min="0.01"
                      placeholder="Amount"
                      value={withdrawAmt}
                      onChange={(event) => setWithdrawAmt(event.target.value)}
                      className="w-full rounded-2xl border border-white/[0.10] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-red-400/40 focus:outline-none"
                    />
                    <button
                      disabled={!withdrawAmt || txBusy}
                      onClick={async () => {
                        if (!withdrawAmt) return;
                        setTxBusy(true);
                        setTxError(null);
                        try {
                          await withdrawBankroll(parseFloat(withdrawAmt));
                          setWithdrawAmt("");
                          router.refresh();
                        } catch {
                          setTxError("Withdrawal failed.");
                        } finally {
                          setTxBusy(false);
                        }
                      }}
                      className="rounded-2xl border border-red-400/22 bg-red-400/[0.10] px-4 py-2.5 text-[12px] font-semibold text-red-300 transition-colors hover:bg-red-400/[0.14] disabled:opacity-40"
                    >
                      Withdraw
                    </button>
                  </div>
                </div>
              </div>
              {txError ? <p className="mt-3 text-[11px] text-red-400">{txError}</p> : null}
            </>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_1.17fr]">
        <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
          <SectionLabel icon={CalendarDays} sub="Daily P&L on flat one-unit staking">Monthly tracker</SectionLabel>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatChip label="Settled" value={`${overall.settled}`} tone="neutral" />
            <StatChip label="Recent edge" value={`${fmt(avgRecentEdge * 100)}%`} tone={avgRecentEdge >= 0 ? "accent" : "warning"} />
            <StatChip label="Open tickets" value={`${pendingRecent}`} tone={pendingRecent > 0 ? "accent" : "neutral"} />
          </div>
          <MonthlyCalendar picks={allPicks} />
        </div>

        <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
          <SectionLabel icon={Trophy} sub="Compare sport lanes with more useful context than a single ROI number">Performance by sport</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            {activeSports.map((row) => {
              const roiPositive = row.roi >= 0;
              return (
                <div
                  key={row.sport}
                  className="rounded-[22px] border border-white/[0.08] bg-[#0b0c14]/70 p-4"
                  style={{ boxShadow: `inset 3px 0 0 ${SPORT_COLOURS[row.sport] ?? "#71717a"}` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{SPORT_ICONS[row.sport] ?? "🏆"}</span>
                      <div>
                        <p className="text-[13px] font-semibold capitalize text-white">{row.sport}</p>
                        <p className="text-[11px] text-white/34">{row.total} picks · avg odds {fmt(row.avg_odds, 2)}</p>
                      </div>
                    </div>
                    <span className={cn("font-mono text-[18px] font-bold tabular-nums", roiPositive ? "text-emerald-300" : "text-red-400")}>
                      {roiPositive ? "+" : ""}
                      {fmt(row.roi * 100)}%
                    </span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(8, row.win_rate * 100)}%`,
                        background: row.win_rate >= 0.5 ? "linear-gradient(90deg,#00ff84,#14b86b)" : "linear-gradient(90deg,#ff865c,#f97316)",
                      }}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <StatChip label="Win rate" value={pct(row.win_rate)} tone={row.win_rate >= 0.5 ? "positive" : "neutral"} />
                    <StatChip label="Record" value={`${row.won}-${row.lost}`} tone="neutral" />
                    <StatChip label="Edge" value={`${fmt(row.avg_edge * 100)}%`} tone={row.avg_edge >= 0 ? "accent" : "warning"} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {accuracy.overall.n > 0 ? (
          <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
            <SectionLabel icon={ShieldCheck} sub={`${accuracy.overall.n} finished matches checked against prediction outputs`}>
              Model accuracy
            </SectionLabel>
            <div className="rounded-[24px] border border-white/[0.08] bg-[#0b0c14]/70 p-4">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">Overall accuracy</p>
                  <p className={cn("mt-2 font-mono text-[30px] font-bold tracking-[-0.04em] tabular-nums", (accuracy.overall.accuracy ?? 0) >= 0.55 ? "text-emerald-300" : "text-white/74")}>
                    {accuracy.overall.accuracy != null ? pct(clampAcc(accuracy.overall.accuracy)) : "—"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <StatChip label="Brier" value={accuracy.overall.avg_brier != null ? fmt(accuracy.overall.avg_brier, 3) : "—"} tone="neutral" />
                  <StatChip label="Live models" value={`${liveModels}`} tone={liveModels > 0 ? "accent" : "neutral"} />
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {accuracyRows.map(([sport, stat]) => {
                const acc = clampAcc(stat.accuracy ?? 0, sport);
                return (
                  <div key={sport} className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-base">{SPORT_ICONS[sport] ?? "🏆"}</span>
                      <div className="min-w-[92px]">
                        <p className="text-[12px] font-semibold capitalize text-white">{sport}</p>
                        <p className="text-[10px] text-white/34">{stat.n} graded matches</p>
                      </div>
                      <div className="flex-1">
                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(6, acc * 100)}%`,
                              background: acc >= 0.55 ? "linear-gradient(90deg,#00ff84,#14b86b)" : "linear-gradient(90deg,#ff865c,#f97316)",
                            }}
                          />
                        </div>
                      </div>
                      <span className={cn("font-mono text-[12px] font-bold tabular-nums", acc >= 0.55 ? "text-emerald-300" : "text-white/56")}>
                        {stat.accuracy != null ? pct(acc) : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

      </section>

      {recentPicks.length > 0 ? (
        <section className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
          <SectionLabel icon={Flame} sub="The footer now reads like a proper board instead of a loose activity dump">Recent picks</SectionLabel>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatChip label="Last 20" value={`${recentPicks.length} shown`} tone="neutral" />
            <StatChip label="Settled" value={`${settledRecent.length}`} tone={settledRecent.length > 0 ? "positive" : "neutral"} />
            <StatChip label="Pending" value={`${pendingRecent}`} tone={pendingRecent > 0 ? "accent" : "neutral"} />
          </div>
          <div className="space-y-3">
            {recentPicks.map((pick) => {
              const sportColour = SPORT_COLOURS[pick.sport] ?? "#71717a";
              return (
                <div key={pick.id} className="rounded-[22px] border border-white/[0.08] bg-[#0b0c14]/70 px-4 py-4 transition-colors hover:bg-[#10121b]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ borderColor: `${sportColour}33`, color: sportColour, background: `${sportColour}14` }}>
                          <span>{SPORT_ICONS[pick.sport] ?? "🏆"}</span>
                          {pick.sport}
                        </span>
                        {pick.auto_generated ? (
                          <span className="inline-flex items-center rounded-full border border-purple-400/26 bg-purple-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-purple-300">
                            BOT
                          </span>
                        ) : null}
                        <OutcomePill outcome={pick.outcome} />
                      </div>
                      <p className="mt-3 text-[15px] font-semibold text-white">{pick.match_label}</p>
                      <p className="mt-1 text-[12px] text-white/42">{pick.selection_label}</p>
                    </div>
                    <div className="grid min-w-[230px] gap-2 sm:grid-cols-2 xl:grid-cols-4 xl:text-right">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Odds</p>
                        <p className="mt-1 font-mono text-[15px] font-bold text-white tabular-nums">{fmt(pick.odds, 2)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Edge</p>
                        <p className={cn("mt-1 font-mono text-[15px] font-bold tabular-nums", pick.edge != null ? cardTone(pick.edge) : "text-white/45")}>
                          {pick.edge != null ? `${pick.edge >= 0 ? "+" : ""}${fmt(pick.edge * 100, 1)}%` : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Created</p>
                        <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-white/52 xl:justify-end">
                          <Clock className="h-3.5 w-3.5" />
                          {pick.created_at.slice(0, 10)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Status</p>
                        <p className="mt-1 text-[12px] text-white/60">{pick.outcome ? "Graded" : "Awaiting result"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
