"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ROIChart } from "@/components/charts/ROIChart";
import type { RoiPoint } from "@/lib/types";
import type { PicksStatsOut, PickOut, BankrollStatsOut, PredictionAccuracy, BacktestRunResult } from "@/lib/api";
import type { MvpModelMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";
import { depositBankroll, withdrawBankroll } from "@/lib/api";
import { TrendingUp, TrendingDown, Zap, Target, BarChart3, Clock, Wallet, ChevronRight, ChevronLeft } from "lucide-react";

type Range = "7d" | "30d" | "90d" | "all";

const RANGE_ITEMS: { label: string; value: Range }[] = [
  { label: "7D",  value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "All", value: "all" },
];

const RANGE_DAYS: Record<Range, number> = {
  "7d": 7, "30d": 30, "90d": 90, "all": Infinity,
};

const SPORT_COLOURS: Record<string, string> = {
  soccer:     "#3b82f6",
  tennis:     "#22c55e",
  esports:    "#a855f7",
  basketball: "#f59e0b",
  baseball:   "#ef4444",
  hockey:     "#06b6d4",
};

const SPORT_ICONS: Record<string, string> = {
  soccer: "⚽", tennis: "🎾", esports: "🎮",
  basketball: "🏀", baseball: "⚾", hockey: "🏒",
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

function fmt(n: number, decimals = 1) { return n.toFixed(decimals); }
function pct(n: number) { return `${fmt(n * 100)}%`; }

function SectionLabel({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/50">{children}</h2>
      {sub && <p className="text-[11px] text-white/28 mt-0.5">{sub}</p>}
    </div>
  );
}

function OutcomePill({ outcome }: { outcome: PickOut["outcome"] }) {
  if (!outcome) return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/40">
      Pending
    </span>
  );
  const styles = {
    won:  "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    lost: "border-red-400/30 bg-red-400/10 text-red-400",
    void: "border-white/10 bg-white/[0.04] text-white/40",
  } as const;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", styles[outcome])}>
      {outcome}
    </span>
  );
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface DayData { pnl: number; wins: number; losses: number; }

function MonthlyCalendar({ picks }: { picks: PickOut[] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  const dayMap = useMemo(() => {
    const map: Record<string, DayData> = {};
    for (const p of picks) {
      if (!p.outcome || p.outcome === "void") continue;
      const date = (p.settled_at ?? p.created_at).slice(0, 10);
      if (!map[date]) map[date] = { pnl: 0, wins: 0, losses: 0 };
      const stake = 1;
      map[date].pnl += p.outcome === "won" ? stake * (p.odds - 1) : -stake;
      if (p.outcome === "won") map[date].wins++;
      else map[date].losses++;
    }
    // round pnl
    for (const k of Object.keys(map)) map[k].pnl = Math.round(map[k].pnl * 100) / 100;
    return map;
  }, [picks]);

  // First day of month (0=Sun..6=Sat), convert to Mon-first (0=Mon..6=Sun)
  const firstDow = new Date(year, month, 1).getDay();
  const startOffset = (firstDow + 6) % 7; // shift so Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const todayStr = today.toISOString().slice(0, 10);

  const monthPnl = useMemo(() => {
    let total = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      total += dayMap[key]?.pnl ?? 0;
    }
    return Math.round(total * 100) / 100;
  }, [year, month, daysInMonth, dayMap]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const day = i - startOffset + 1;
    if (day < 1 || day > daysInMonth) return null;
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const data = dayMap[dateStr];
    return { day, dateStr, data };
  });

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.03]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors">
            <ChevronLeft size={13} />
          </button>
          <span className="text-[13px] font-bold text-white min-w-[120px] text-center">{monthName} {year}</span>
          <button
            onClick={nextMonth}
            disabled={year === today.getFullYear() && month === today.getMonth()}
            className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronRight size={13} />
          </button>
        </div>
        <div className={cn("font-mono text-[13px] font-bold tabular-nums", monthPnl > 0 ? "text-emerald-300" : monthPnl < 0 ? "text-red-400" : "text-white/40")}>
          {monthPnl > 0 ? "+" : ""}{monthPnl === 0 ? "—" : monthPnl.toFixed(2) + "u"}
        </div>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 border-b border-white/[0.05]">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-1.5 text-center text-[8px] font-bold uppercase tracking-widest text-white/25">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 divide-x divide-y divide-white/[0.04]">
        {cells.map((cell, i) => {
          if (!cell) return (
            <div key={`empty-${i}`} className="h-[56px]" />
          );
          const { day, dateStr, data } = cell;
          const isToday = dateStr === todayStr;
          const pos = data && data.pnl > 0;
          const neg = data && data.pnl < 0;

          return (
            <div
              key={dateStr}
              className={cn(
                "h-[56px] flex flex-col items-center justify-center gap-[1px] overflow-hidden transition-colors",
                pos && "bg-emerald-400/[0.07]",
                neg && "bg-red-400/[0.07]",
                isToday && "ring-1 ring-inset ring-white/20",
              )}
            >
              <span className={cn(
                "text-[10px] font-semibold leading-none",
                isToday ? "text-white" : "text-white/45",
              )}>
                {day}
              </span>
              {data ? (
                <>
                  <span className={cn(
                    "text-[9px] font-mono font-bold leading-none tabular-nums",
                    pos ? "text-emerald-300" : "text-red-400",
                  )}>
                    {pos ? "+" : ""}{data.pnl.toFixed(1)}u
                  </span>
                  <span className="text-[8px] leading-none tabular-nums">
                    {data.wins > 0 && <span className="text-emerald-400">{data.wins}W</span>}
                    {data.wins > 0 && data.losses > 0 && <span className="text-white/20"> </span>}
                    {data.losses > 0 && <span className="text-red-400">{data.losses}L</span>}
                  </span>
                </>
              ) : (
                <span className="text-[8px] text-white/10">·</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PerformanceClient({
  overall, roiSeries, sportStats, models, recentPicks, allPicks, bankroll, accuracy, backtestSummary,
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
    return roiSeries.filter((p) => p.date >= cutoff);
  }, [roiSeries, range]);

  const roiPos = overall.roi >= 0;
  const winPos = overall.win_rate >= 0.5;

  if (recentPicks.length === 0 && overall.total === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03]">
          <BarChart3 size={28} className="text-white/25" />
        </div>
        <div>
          <p className="text-[17px] font-semibold text-white">No picks tracked yet</p>
          <p className="mt-1 text-[13px] text-white/38 max-w-xs">
            Head to any sport&apos;s matches page, add picks to your queue, then hit &quot;Track these picks&quot;.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 lg:p-6 pb-12">

      {/* ── Hero KPI strip ─────────────────────────────────────────────────── */}
      <div>
        <div className="mb-2">
          <h1 className="text-[22px] font-bold tracking-[-0.03em] text-white">Performance</h1>
          <p className="text-[12px] text-white/35 mt-0.5">{overall.settled} settled picks · {overall.pending} pending</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Win rate */}
          <div className={cn(
            "relative overflow-hidden rounded-[20px] border p-4",
            winPos
              ? "border-emerald-400/20 bg-[linear-gradient(135deg,rgba(52,211,153,0.10),rgba(52,211,153,0.03))]"
              : "border-white/[0.08] bg-white/[0.03]"
          )}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Win Rate</p>
            <p className={cn("mt-2 font-mono text-[32px] font-bold tabular-nums leading-none", winPos ? "text-emerald-300" : "text-white/60")}>
              {overall.total === 0 ? "—" : pct(overall.win_rate)}
            </p>
            <p className="mt-1 text-[10px] text-white/28">{overall.won}W · {overall.lost}L · {overall.void}V</p>
            {winPos && <div className="pointer-events-none absolute right-3 top-3 text-emerald-300/20"><TrendingUp size={32} /></div>}
          </div>

          {/* Flat ROI */}
          <div className={cn(
            "relative overflow-hidden rounded-[20px] border p-4",
            roiPos
              ? "border-emerald-400/20 bg-[linear-gradient(135deg,rgba(52,211,153,0.10),rgba(52,211,153,0.03))]"
              : "border-red-400/20 bg-[linear-gradient(135deg,rgba(248,113,113,0.08),rgba(248,113,113,0.02))]"
          )}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Flat ROI</p>
            <p className={cn("mt-2 font-mono text-[32px] font-bold tabular-nums leading-none", roiPos ? "text-emerald-300" : "text-red-400")}>
              {overall.total === 0 ? "—" : `${roiPos ? "+" : ""}${fmt(overall.roi * 100)}%`}
            </p>
            <p className="mt-1 text-[10px] text-white/28">Avg odds {fmt(overall.avg_odds, 2)}</p>
            <div className={cn("pointer-events-none absolute right-3 top-3", roiPos ? "text-emerald-300/20" : "text-red-400/20")}>
              {roiPos ? <TrendingUp size={32} /> : <TrendingDown size={32} />}
            </div>
          </div>

          {/* Avg edge */}
          <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Avg Edge</p>
            <p className="mt-2 font-mono text-[32px] font-bold tabular-nums leading-none text-white">
              {fmt(overall.avg_edge * 100)}%
            </p>
            <p className="mt-1 text-[10px] text-white/28">{overall.total} total picks</p>
          </div>

          {/* Kelly ROI or CLV */}
          {overall.kelly_roi != null ? (
            <div className={cn(
              "relative overflow-hidden rounded-[20px] border p-4",
              overall.kelly_roi >= 0
                ? "border-emerald-400/20 bg-[linear-gradient(135deg,rgba(52,211,153,0.08),rgba(52,211,153,0.02))]"
                : "border-white/[0.08] bg-white/[0.03]"
            )}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Kelly ROI</p>
              <p className={cn("mt-2 font-mono text-[32px] font-bold tabular-nums leading-none", overall.kelly_roi >= 0 ? "text-emerald-300" : "text-red-400")}>
                {overall.kelly_roi >= 0 ? "+" : ""}{fmt(overall.kelly_roi * 100)}%
              </p>
              {overall.avg_clv != null && (
                <p className="mt-1 text-[10px] text-white/28">CLV {overall.avg_clv >= 0 ? "+" : ""}{fmt(overall.avg_clv * 100, 2)}%</p>
              )}
            </div>
          ) : (
            <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Settled</p>
              <p className="mt-2 font-mono text-[32px] font-bold tabular-nums leading-none text-white">{overall.settled}</p>
              <p className="mt-1 text-[10px] text-white/28">{overall.pending} pending</p>
            </div>
          )}
        </div>
      </div>

      {/* ── PnL chart ──────────────────────────────────────────────────────── */}
      <div>
        <SectionLabel sub="Units — 1 unit staked per pick">Cumulative PnL</SectionLabel>
        <div className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.03]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <div className={cn("font-mono text-[22px] font-bold tabular-nums", roiPos ? "text-emerald-300" : "text-red-400")}>
              {roiPos ? "+" : ""}{fmt(overall.roi * 100)}% ROI
            </div>
            <div className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
              {RANGE_ITEMS.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setRange(item.value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-semibold transition-all",
                    range === item.value
                      ? "bg-[#2edb6c] text-[#07110d]"
                      : "text-white/40 hover:text-white/70"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 pb-4 pt-2">
            <ROIChart data={filteredRoi} />
          </div>
        </div>
      </div>

      {/* ── Monthly calendar ───────────────────────────────────────────────── */}
      <div>
        <SectionLabel sub="Daily P&L — units staked flat">Monthly Tracker</SectionLabel>
        <MonthlyCalendar picks={allPicks} />
      </div>

      {/* ── Per-sport ──────────────────────────────────────────────────────── */}
      {sportStats.some((r) => r.total > 0) && (
        <div>
          <SectionLabel>Performance by Sport</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sportStats.filter((r) => r.total > 0).map((row) => {
              const col = SPORT_COLOURS[row.sport] ?? "#71717a";
              const rPos = row.roi >= 0;
              return (
                <div
                  key={row.sport}
                  className="rounded-[20px] border border-white/[0.08] bg-white/[0.02] p-4"
                  style={{ borderLeftColor: col, borderLeftWidth: 3 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{SPORT_ICONS[row.sport] ?? "🏆"}</span>
                      <span className="text-[13px] font-semibold capitalize text-white">{row.sport}</span>
                    </div>
                    <span className={cn("font-mono text-[18px] font-bold tabular-nums", rPos ? "text-emerald-300" : "text-red-400")}>
                      {rPos ? "+" : ""}{fmt(row.roi * 100)}%
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-white/40 mb-1">
                      <span>Win rate</span>
                      <span className={row.win_rate >= 0.5 ? "text-emerald-300" : "text-white/50"}>{pct(row.win_rate)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${row.win_rate * 100}%`,
                          background: row.win_rate >= 0.5
                            ? "linear-gradient(90deg, #34d399, #10b981)"
                            : "linear-gradient(90deg, #f97316, #fb923c)",
                        }}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-[10px] text-white/40">
                    <span><span className="text-white/70 font-semibold">{row.total}</span> picks</span>
                    <span><span className="text-emerald-300 font-semibold">{row.won}</span>W</span>
                    <span><span className="text-red-400 font-semibold">{row.lost}</span>L</span>
                    <span className="ml-auto">Avg {fmt(row.avg_odds, 2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Model accuracy ─────────────────────────────────────────────────── */}
      {accuracy.overall.n > 0 && (
        <div>
          <SectionLabel sub={`${accuracy.overall.n} finished matches checked`}>Model Accuracy</SectionLabel>
          <div className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.03]">
            {/* Overall row */}
            <div className="flex items-center gap-6 px-5 py-4 border-b border-white/[0.06]">
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/38">Overall accuracy</p>
                <p className={cn("mt-1 font-mono text-[28px] font-bold tabular-nums leading-none",
                  (accuracy.overall.accuracy ?? 0) >= 0.55 ? "text-emerald-300" : "text-white/70"
                )}>
                  {accuracy.overall.accuracy != null ? pct(accuracy.overall.accuracy) : "—"}
                </p>
              </div>
              {accuracy.overall.avg_brier != null && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/38">Brier score</p>
                  <p className="mt-1 font-mono text-[28px] font-bold tabular-nums leading-none text-white/70">
                    {fmt(accuracy.overall.avg_brier, 3)}
                  </p>
                </div>
              )}
            </div>
            {/* Per-sport rows */}
            <div className="divide-y divide-white/[0.05]">
              {Object.entries(accuracy.by_sport).map(([sport, stat]) => {
                const acc = stat.accuracy ?? 0;
                return (
                  <div key={sport} className="flex items-center gap-4 px-5 py-3">
                    <span className="text-base w-6 text-center">{SPORT_ICONS[sport] ?? "🏆"}</span>
                    <span className="min-w-[90px] text-[12px] font-medium capitalize text-white/70">{sport}</span>
                    <div className="flex-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${acc * 100}%`,
                            background: acc >= 0.55
                              ? "linear-gradient(90deg, #34d399, #10b981)"
                              : "linear-gradient(90deg, #f97316, #fb923c)",
                          }}
                        />
                      </div>
                    </div>
                    <span className={cn("w-12 text-right font-mono text-[12px] font-bold tabular-nums", acc >= 0.55 ? "text-emerald-300" : "text-white/50")}>
                      {stat.accuracy != null ? pct(acc) : "—"}
                    </span>
                    <span className="w-10 text-right text-[11px] text-white/30">{stat.n}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Model registry — hidden from UI ────────────────────────────────── */}
      {false && models.length > 0 && (
        <div>
          <SectionLabel sub="Live prediction models">Model Registry</SectionLabel>
          <div className="space-y-2">
            {models.map((m) => (
              <div
                key={`${m.model_name}-${m.version}`}
                className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[20px] border border-white/[0.08] bg-white/[0.02] px-5 py-3.5"
              >
                <div className="flex items-center gap-2.5 min-w-[160px]">
                  <span className="font-mono text-[12px] font-semibold text-white">{m.model_name}</span>
                  {m.is_live && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live
                    </span>
                  )}
                </div>
                <span className="text-[11px] capitalize text-white/40">{m.sport}</span>
                <span className="text-[11px] text-white/40">{m.algorithm}</span>
                {m.n_train_samples != null && (
                  <span className="text-[11px] text-white/30">{m.n_train_samples.toLocaleString()} samples</span>
                )}
                {m.accuracy != null && (
                  <span className={cn("font-mono text-[13px] font-bold tabular-nums", m.accuracy >= 0.55 ? "text-emerald-300" : "text-white/60")}>
                    {pct(m.accuracy)}
                  </span>
                )}
                {m.brier_score != null && (
                  <span className="text-[11px] text-white/40">Brier <span className="text-white/70 font-semibold">{fmt(m.brier_score, 3)}</span></span>
                )}
                {m.trained_at && (
                  <span className="ml-auto text-[10px] text-white/28">{m.trained_at.slice(0, 10)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bankroll ───────────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Bankroll</SectionLabel>
        <div className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.03]">
          {bankroll.total_deposited === 0 ? (
            <div className="flex flex-col items-center gap-4 py-12 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                <Wallet size={22} className="text-white/40" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-white">Set your starting bankroll</p>
                <p className="mt-1 text-[12px] text-white/38 max-w-xs">
                  Enter a unit amount (e.g. 100). Kelly stakes are expressed as a fraction of this.
                </p>
              </div>
              <div className="flex gap-2 mt-1">
                <input
                  type="number" min="1" placeholder="e.g. 100"
                  value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)}
                  className="w-28 rounded-xl border border-white/[0.10] bg-white/[0.05] px-3 py-2 text-center text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/40"
                />
                <button
                  disabled={!depositAmt || txBusy}
                  onClick={async () => {
                    if (!depositAmt) return;
                    setTxBusy(true); setTxError(null);
                    try { await depositBankroll(parseFloat(depositAmt), "Starting bankroll"); setDepositAmt(""); router.refresh(); }
                    catch { setTxError("Failed to set bankroll."); }
                    finally { setTxBusy(false); }
                  }}
                  className="rounded-xl bg-[#2edb6c] px-4 py-2 text-[13px] font-semibold text-[#07110d] disabled:opacity-40 transition-opacity hover:opacity-90"
                >
                  {txBusy ? "Saving…" : "Set bankroll"}
                </button>
              </div>
              {txError && <p className="text-[11px] text-red-400">{txError}</p>}
            </div>
          ) : (
            <>
              {/* Balance header */}
              <div className="flex items-center justify-between px-5 py-5 border-b border-white/[0.06]">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/38">Current Balance</p>
                  <p className="mt-1 font-mono text-[34px] font-bold tabular-nums leading-none text-white">
                    {bankroll.current_balance.toFixed(2)}
                    <span className="text-[14px] font-normal text-white/35 ml-1.5">units</span>
                  </p>
                </div>
                <div className={cn(
                  "text-right",
                  bankroll.total_pnl >= 0 ? "text-emerald-300" : "text-red-400"
                )}>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/38">Total P&amp;L</p>
                  <p className="mt-1 font-mono text-[22px] font-bold tabular-nums">
                    {bankroll.total_pnl >= 0 ? "+" : ""}{bankroll.total_pnl.toFixed(2)}u
                  </p>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 divide-x divide-white/[0.06] border-b border-white/[0.06]">
                {[
                  { label: "Peak",   value: bankroll.peak_balance.toFixed(2) + "u" },
                  { label: "Max DD", value: "-" + fmt(bankroll.max_drawdown * 100, 1) + "%", danger: true },
                  { label: "Sharpe", value: bankroll.sharpe != null ? fmt(bankroll.sharpe, 2) : "—" },
                ].map((k) => (
                  <div key={k.label} className="px-5 py-3 text-center">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-white/30">{k.label}</p>
                    <p className={cn("mt-1 font-mono text-[16px] font-bold tabular-nums", k.danger ? "text-red-400" : "text-white/80")}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Deposit / Withdraw */}
              <div className="flex flex-wrap gap-3 px-5 py-4">
                <div className="flex gap-2 items-center">
                  <input
                    type="number" min="0.01" placeholder="Amount"
                    value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)}
                    className="w-24 rounded-xl border border-white/[0.10] bg-white/[0.05] px-3 py-2 text-center text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/40"
                  />
                  <button
                    disabled={!depositAmt || txBusy}
                    onClick={async () => {
                      if (!depositAmt) return;
                      setTxBusy(true); setTxError(null);
                      try { await depositBankroll(parseFloat(depositAmt)); setDepositAmt(""); router.refresh(); }
                      catch { setTxError("Deposit failed."); }
                      finally { setTxBusy(false); }
                    }}
                    className="rounded-xl bg-emerald-400/15 border border-emerald-400/25 px-4 py-2 text-[12px] font-semibold text-emerald-300 disabled:opacity-40 hover:bg-emerald-400/20 transition-colors"
                  >
                    + Deposit
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="number" min="0.01" placeholder="Amount"
                    value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)}
                    className="w-24 rounded-xl border border-white/[0.10] bg-white/[0.05] px-3 py-2 text-center text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-red-400/40"
                  />
                  <button
                    disabled={!withdrawAmt || txBusy}
                    onClick={async () => {
                      if (!withdrawAmt) return;
                      setTxBusy(true); setTxError(null);
                      try { await withdrawBankroll(parseFloat(withdrawAmt)); setWithdrawAmt(""); router.refresh(); }
                      catch { setTxError("Withdrawal failed."); }
                      finally { setTxBusy(false); }
                    }}
                    className="rounded-xl bg-red-400/10 border border-red-400/20 px-4 py-2 text-[12px] font-semibold text-red-400 disabled:opacity-40 hover:bg-red-400/15 transition-colors"
                  >
                    − Withdraw
                  </button>
                </div>
                {txError && <p className="w-full text-[11px] text-red-400">{txError}</p>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Backtest summary ───────────────────────────────────────────────── */}
      {Object.keys(backtestSummary).length > 0 && (
        <div>
          <SectionLabel sub="Historical predictions vs outcomes — flat staking">Model Backtest</SectionLabel>
          <div className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.03]">
            <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr] gap-0 text-[10px] font-bold uppercase tracking-wider text-white/30 px-5 py-2.5 border-b border-white/[0.06]">
              <span>Sport</span>
              <span className="text-right">Matches</span>
              <span className="text-right">Accuracy</span>
              <span className="text-right">ROI</span>
              <span className="text-right">Sharpe</span>
              <span className="text-right">P&L</span>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {Object.entries(backtestSummary).map(([sport, r]) => {
                const roiPct = (r.roi * 100).toFixed(1);
                const roiPos = r.roi >= 0;
                return (
                  <div key={sport} className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr] gap-0 items-center px-5 py-3">
                    <div className="flex items-center gap-2 min-w-[100px]">
                      <span className="text-base">{SPORT_ICONS[sport] ?? "🏟"}</span>
                      <span className="text-[12px] font-semibold text-white capitalize">{sport}</span>
                    </div>
                    <span className="font-mono text-[12px] text-white/50 text-right">{r.n_predictions}</span>
                    <span className="font-mono text-[12px] text-white text-right">{(r.accuracy * 100).toFixed(1)}%</span>
                    <span className={`font-mono text-[12px] text-right font-semibold ${roiPos ? "text-emerald-400" : "text-red-400"}`}>
                      {roiPos ? "+" : ""}{roiPct}%
                    </span>
                    <span className={`font-mono text-[12px] text-right ${r.sharpe_ratio >= 0 ? "text-white/70" : "text-red-400"}`}>
                      {r.sharpe_ratio.toFixed(2)}
                    </span>
                    <span className={`font-mono text-[12px] text-right ${r.pnl_units >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {r.pnl_units >= 0 ? "+" : ""}{r.pnl_units.toFixed(1)}u
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Recent picks ───────────────────────────────────────────────────── */}
      {recentPicks.length > 0 && (
        <div>
          <SectionLabel sub="Last 20 tracked">Recent Picks</SectionLabel>
          <div className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.03]">
            <div className="divide-y divide-white/[0.05]">
              {recentPicks.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                  {/* Match label */}
                  <div className="flex items-center gap-1.5 min-w-[160px] flex-1">
                    {p.auto_generated && (
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded border border-purple-400/30 bg-purple-400/10 text-purple-300 flex-shrink-0">BOT</span>
                    )}
                    <span className="text-[13px] font-medium text-white truncate">{p.match_label}</span>
                  </div>

                  {/* Sport */}
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: SPORT_COLOURS[p.sport] ?? "#71717a" }}
                  >
                    {p.sport}
                  </span>

                  {/* Selection */}
                  <span className="text-[11px] text-white/40 truncate max-w-[110px]">{p.selection_label}</span>

                  {/* Odds */}
                  <span className="font-mono text-[13px] font-bold text-white tabular-nums">{fmt(p.odds, 2)}</span>

                  {/* Edge */}
                  {p.edge != null && (
                    <span className={cn("font-mono text-[11px] font-semibold tabular-nums", p.edge >= 0 ? "text-emerald-300" : "text-red-400")}>
                      {p.edge >= 0 ? "+" : ""}{fmt(p.edge * 100, 1)}%
                    </span>
                  )}

                  {/* Date */}
                  <span className="text-[10px] text-white/28 ml-auto flex items-center gap-1">
                    <Clock size={10} />
                    {p.created_at.slice(0, 10)}
                  </span>

                  {/* Outcome */}
                  <OutcomePill outcome={p.outcome} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
