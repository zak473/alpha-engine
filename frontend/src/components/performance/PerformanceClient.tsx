"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ROIChart } from "@/components/charts/ROIChart";
import type { RoiPoint } from "@/lib/types";
import type { PicksStatsOut, PickOut, BankrollStatsOut, PredictionAccuracy } from "@/lib/api";
import type { MvpModelMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";
import { depositBankroll, withdrawBankroll } from "@/lib/api";

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
};

interface PerformanceClientProps {
  overall: PicksStatsOut;
  roiSeries: RoiPoint[];
  sportStats: (PicksStatsOut & { sport: string })[];
  models: MvpModelMetrics[];
  recentPicks: PickOut[];
  bankroll: BankrollStatsOut;
  accuracy: PredictionAccuracy;
}

function fmt(n: number, decimals = 1) {
  return n.toFixed(decimals);
}

function pct(n: number) {
  return `${fmt(n * 100)}%`;
}

function OutcomePill({ outcome }: { outcome: PickOut["outcome"] }) {
  if (!outcome) return <span className="text-[11px] text-text-muted">Pending</span>;
  const map = {
    won:  "text-accent-green",
    lost: "text-accent-red",
    void: "text-text-muted",
  } as const;
  return (
    <span className={cn("text-[11px] font-semibold uppercase tracking-wide", map[outcome])}>
      {outcome}
    </span>
  );
}

export function PerformanceClient({
  overall,
  roiSeries,
  sportStats,
  models,
  recentPicks,
  bankroll,
  accuracy,
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

  const roiColour = overall.roi >= 0 ? "text-accent-green" : "text-accent-red";

  const kpis = [
    { label: "Total picks",    value: overall.total.toString() },
    { label: "Win rate",       value: pct(overall.win_rate),        colour: overall.win_rate >= 0.5 ? "text-accent-green" : "text-accent-red" },
    { label: "Flat ROI",       value: `${overall.roi >= 0 ? "+" : ""}${fmt(overall.roi * 100)}%`, colour: roiColour },
    ...(overall.kelly_roi != null ? [{
      label: "Kelly ROI",
      value: `${overall.kelly_roi >= 0 ? "+" : ""}${fmt(overall.kelly_roi * 100)}%`,
      colour: overall.kelly_roi >= 0 ? "text-accent-green" : "text-accent-red",
    }] : []),
    { label: "Avg odds",       value: fmt(overall.avg_odds, 2) },
    { label: "Avg edge",       value: `${fmt(overall.avg_edge * 100)}%` },
    ...(overall.avg_clv != null ? [{
      label: "Avg CLV",
      value: `${overall.avg_clv >= 0 ? "+" : ""}${fmt(overall.avg_clv * 100, 2)}%`,
      colour: overall.avg_clv >= 0 ? "text-accent-green" : "text-accent-red",
    }] : []),
    { label: "W / L / Void",   value: `${overall.won} / ${overall.lost} / ${overall.void}` },
    { label: "Settled",        value: overall.settled.toString() },
    { label: "Pending",        value: overall.pending.toString() },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">

      {/* KPI strip */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border p-3"
            style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)" }}
          >
            <p className="text-[11px] text-text-muted mb-1">{k.label}</p>
            <p className={cn("num text-lg font-bold text-text-primary leading-none", k.colour)}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* PnL chart */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--glass-border)" }}>
          <div>
            <p className="text-sm font-semibold text-text-primary">Cumulative PnL</p>
            <p className="text-[11px] text-text-muted mt-0.5">Units — 1 unit staked per pick</p>
          </div>
          <div className="flex items-center gap-1">
            {RANGE_ITEMS.map((item) => (
              <button
                key={item.value}
                onClick={() => setRange(item.value)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium transition-all",
                  range === item.value
                    ? "text-[var(--accent)] border"
                    : "text-text-muted border border-transparent hover:bg-white/5"
                )}
                style={range === item.value ? {
                  background: "var(--accent-dim)",
                  borderColor: "rgba(34,211,238,0.3)",
                } : {}}
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

      {/* Per-sport stats */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)" }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--glass-border)" }}>
          <p className="text-sm font-semibold text-text-primary">Performance by Sport</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--glass-border)" }}>
                {["Sport", "Picks", "Won", "Lost", "Win Rate", "ROI", "Avg Odds"].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "px-4 py-2 text-[11px] font-medium text-text-muted",
                      i === 0 ? "text-left" : "text-right"
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sportStats.map((row) => (
                <tr
                  key={row.sport}
                  className="border-b hover:bg-white/[0.02] transition-colors"
                  style={{ borderColor: "var(--glass-border)" }}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: SPORT_COLOURS[row.sport] ?? "#71717a" }}
                      />
                      <span className="text-text-primary font-medium capitalize">{row.sport}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right num text-text-muted">{row.total}</td>
                  <td className="px-4 py-2.5 text-right num text-accent-green">{row.won}</td>
                  <td className="px-4 py-2.5 text-right num text-accent-red">{row.lost}</td>
                  <td className="px-4 py-2.5 text-right num">
                    <span className={row.win_rate >= 0.5 ? "text-accent-green" : "text-text-muted"}>
                      {row.total === 0 ? "—" : pct(row.win_rate)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right num font-semibold">
                    <span className={row.roi >= 0 ? "text-accent-green" : "text-accent-red"}>
                      {row.total === 0 ? "—" : `${row.roi >= 0 ? "+" : ""}${fmt(row.roi * 100)}%`}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right num text-text-muted">
                    {row.total === 0 ? "—" : fmt(row.avg_odds, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sportStats.every((r) => r.total === 0) && (
            <p className="text-center text-text-muted text-sm py-8">
              No picks tracked yet. Queue picks from the matches page.
            </p>
          )}
        </div>
      </div>

      {/* Model registry */}
      {models.length > 0 && (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)" }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--glass-border)" }}>
            <p className="text-sm font-semibold text-text-primary">Model Registry</p>
            <p className="text-[11px] text-text-muted mt-0.5">Live prediction models</p>
          </div>
          <div className="grid gap-px" style={{ background: "var(--glass-border)" }}>
            {models.map((m) => (
              <div
                key={`${m.model_name}-${m.version}`}
                className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3"
                style={{ background: "var(--glass-bg)" }}
              >
                {/* Name + live pill */}
                <div className="flex items-center gap-2 min-w-[140px]">
                  <span className="font-mono text-xs text-text-primary">{m.model_name}</span>
                  {m.is_live && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25">
                      LIVE
                    </span>
                  )}
                </div>
                {/* Meta chips */}
                <span className="text-[11px] text-text-muted capitalize">{m.sport}</span>
                <span className="text-[11px] text-text-muted">{m.algorithm}</span>
                {m.n_train_samples != null && (
                  <span className="text-[11px] text-text-muted">{m.n_train_samples.toLocaleString()} samples</span>
                )}
                {/* Metrics */}
                {m.accuracy != null && (
                  <span className="text-[11px]">
                    <span className="text-text-muted mr-1">Acc</span>
                    <span className={cn("font-semibold num", m.accuracy >= 0.55 ? "text-accent-green" : "text-text-primary")}>
                      {pct(m.accuracy)}
                    </span>
                  </span>
                )}
                {m.brier_score != null && (
                  <span className="text-[11px]">
                    <span className="text-text-muted mr-1">Brier</span>
                    <span className="font-semibold num text-text-primary">{fmt(m.brier_score, 3)}</span>
                  </span>
                )}
                {m.trained_at && (
                  <span className="text-[11px] text-text-muted ml-auto">
                    {m.trained_at.slice(0, 10)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prediction accuracy */}
      {accuracy.overall.n > 0 && (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)" }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--glass-border)" }}>
            <p className="text-sm font-semibold text-text-primary">Prediction Accuracy</p>
            <p className="text-[11px] text-text-muted mt-0.5">
              Retroactive check — {accuracy.overall.n} finished matches · Overall{" "}
              <span className={cn("font-semibold", (accuracy.overall.accuracy ?? 0) >= 0.55 ? "text-accent-green" : "text-text-primary")}>
                {accuracy.overall.accuracy != null ? pct(accuracy.overall.accuracy) : "—"}
              </span>
              {" "}· Brier{" "}
              <span className="font-semibold text-text-primary">
                {accuracy.overall.avg_brier != null ? fmt(accuracy.overall.avg_brier, 3) : "—"}
              </span>
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--glass-border)" }}>
                  {["Sport", "Checked", "Correct", "Accuracy", "Avg Brier"].map((h, i) => (
                    <th key={h} className={cn("px-4 py-2 text-[11px] font-medium text-text-muted", i === 0 ? "text-left" : "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(accuracy.by_sport).map(([sport, stat]) => (
                  <tr key={sport} className="border-b hover:bg-white/[0.02]" style={{ borderColor: "var(--glass-border)" }}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: SPORT_COLOURS[sport] ?? "#71717a" }} />
                        <span className="text-text-primary font-medium capitalize">{sport}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right num text-text-muted">{stat.n}</td>
                    <td className="px-4 py-2.5 text-right num text-text-muted">{stat.accuracy != null ? Math.round(stat.accuracy * stat.n) : "—"}</td>
                    <td className="px-4 py-2.5 text-right num font-semibold">
                      <span className={stat.accuracy != null && stat.accuracy >= 0.55 ? "text-accent-green" : "text-text-muted"}>
                        {stat.accuracy != null ? pct(stat.accuracy) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right num text-text-muted">{stat.avg_brier != null ? fmt(stat.avg_brier, 3) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bankroll tracker */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--glass-border)" }}>
          <div>
            <p className="text-sm font-semibold text-text-primary">Bankroll</p>
            <p className="text-[11px] text-text-muted mt-0.5">Track your betting balance</p>
          </div>
          {bankroll.current_balance > 0 && (
            <p className="num text-2xl font-bold text-text-primary">
              {bankroll.current_balance.toFixed(2)}
              <span className="text-[11px] text-text-muted font-normal ml-1">units</span>
            </p>
          )}
        </div>

        {bankroll.total_deposited === 0 ? (
          /* Setup state */
          <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
            <p className="text-text-primary font-semibold">Set your starting bankroll</p>
            <p className="text-text-muted text-sm max-w-xs">
              Enter a unit amount (e.g. 100 = £100 or 100 units). Kelly stakes are expressed as a fraction of this.
            </p>
            <div className="flex gap-2 mt-1">
              <input
                type="number"
                min="1"
                placeholder="e.g. 100"
                value={depositAmt}
                onChange={(e) => setDepositAmt(e.target.value)}
                className="input-field w-28 text-sm text-center"
              />
              <button
                disabled={!depositAmt || txBusy}
                onClick={async () => {
                  if (!depositAmt) return;
                  setTxBusy(true); setTxError(null);
                  try { await depositBankroll(parseFloat(depositAmt), "Starting bankroll"); setDepositAmt(""); router.refresh(); }
                  catch { setTxError("Failed to set bankroll. Please try again."); }
                  finally { setTxBusy(false); }
                }}
                className="btn btn-md btn-primary"
              >
                {txBusy ? "Saving…" : "Set bankroll"}
              </button>
            </div>
            {txError && (
              <p className="text-xs text-accent-red mt-1">{txError}</p>
            )}
          </div>
        ) : (
          /* Stats grid + deposit/withdraw */
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Peak",       value: bankroll.peak_balance.toFixed(2) + "u" },
                { label: "Max DD",     value: "-" + fmt(bankroll.max_drawdown * 100, 1) + "%", colour: "text-accent-red" },
                { label: "Total P&L",  value: (bankroll.total_pnl >= 0 ? "+" : "") + bankroll.total_pnl.toFixed(2) + "u", colour: bankroll.total_pnl >= 0 ? "text-accent-green" : "text-accent-red" },
                { label: "Sharpe",     value: bankroll.sharpe != null ? fmt(bankroll.sharpe, 2) : "—" },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border p-3" style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)" }}>
                  <p className="text-[11px] text-text-muted mb-1">{k.label}</p>
                  <p className={cn("num text-base font-bold", k.colour ?? "text-text-primary")}>{k.value}</p>
                </div>
              ))}
            </div>

            {/* Deposit / Withdraw */}
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-1.5 items-center">
                <input
                  type="number" min="0.01" placeholder="Amount"
                  value={depositAmt}
                  onChange={(e) => setDepositAmt(e.target.value)}
                  className="input-field w-24 text-sm text-center"
                />
                <button
                  disabled={!depositAmt || txBusy}
                  onClick={async () => {
                    if (!depositAmt) return;
                    setTxBusy(true); setTxError(null);
                    try { await depositBankroll(parseFloat(depositAmt)); setDepositAmt(""); router.refresh(); }
                    catch { setTxError("Deposit failed. Please try again."); }
                    finally { setTxBusy(false); }
                  }}
                  className="btn btn-sm btn-primary"
                >
                  + Deposit
                </button>
              </div>
              <div className="flex gap-1.5 items-center">
                <input
                  type="number" min="0.01" placeholder="Amount"
                  value={withdrawAmt}
                  onChange={(e) => setWithdrawAmt(e.target.value)}
                  className="input-field w-24 text-sm text-center"
                />
                <button
                  disabled={!withdrawAmt || txBusy}
                  onClick={async () => {
                    if (!withdrawAmt) return;
                    setTxBusy(true); setTxError(null);
                    try { await withdrawBankroll(parseFloat(withdrawAmt)); setWithdrawAmt(""); router.refresh(); }
                    catch { setTxError("Withdrawal failed. Please try again."); }
                    finally { setTxBusy(false); }
                  }}
                  className="btn btn-sm btn-secondary"
                >
                  − Withdraw
                </button>
              </div>
            </div>
            {txError && (
              <p className="text-xs text-accent-red">{txError}</p>
            )}
          </div>
        )}
      </div>

      {/* Recent picks */}
      {recentPicks.length > 0 && (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)" }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--glass-border)" }}>
            <p className="text-sm font-semibold text-text-primary">Recent Picks</p>
            <p className="text-[11px] text-text-muted mt-0.5">Last 20 tracked</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--glass-border)" }}>
                  {["Match", "Sport", "Selection", "Odds", "Edge", "Kelly", "CLV", "Date", "Result"].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        "px-4 py-2 text-[11px] font-medium text-text-muted",
                        i <= 2 ? "text-left" : "text-right"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentPicks.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b hover:bg-white/[0.02] transition-colors"
                    style={{ borderColor: "var(--glass-border)" }}
                  >
                    <td className="px-4 py-2.5 max-w-[180px]">
                      <div className="flex items-center gap-1.5">
                        {p.auto_generated && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-accent-purple/20 text-accent-purple border border-accent-purple/30 flex-shrink-0">BOT</span>
                        )}
                        <span className="text-text-primary font-medium truncate">{p.match_label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] font-medium capitalize" style={{ color: SPORT_COLOURS[p.sport] ?? "#71717a" }}>
                        {p.sport}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-text-muted text-xs truncate max-w-[120px]">
                      {p.selection_label}
                    </td>
                    <td className="px-4 py-2.5 text-right num text-text-primary">{fmt(p.odds, 2)}</td>
                    <td className="px-4 py-2.5 text-right num">
                      {p.edge != null
                        ? <span className={p.edge >= 0 ? "text-accent-green" : "text-accent-red"}>{p.edge >= 0 ? "+" : ""}{fmt(p.edge * 100, 1)}%</span>
                        : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right num text-text-muted">
                      {p.stake_fraction != null ? `${fmt(p.stake_fraction * 100, 1)}%` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right num">
                      {p.clv != null
                        ? <span className={p.clv >= 0 ? "text-accent-green" : "text-accent-red"}>{p.clv >= 0 ? "+" : ""}{fmt(p.clv * 100, 1)}%</span>
                        : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[11px] text-text-muted">
                      {p.created_at.slice(0, 10)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <OutcomePill outcome={p.outcome} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recentPicks.length === 0 && overall.total === 0 && (
        <div
          className="rounded-xl border flex flex-col items-center gap-3 py-16 text-center"
          style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)" }}
        >
          <p className="text-text-primary font-semibold">No picks tracked yet</p>
          <p className="text-text-muted text-sm max-w-xs">
            Head to any sport's matches page, add picks to your queue, then hit "Track these picks".
          </p>
        </div>
      )}
    </div>
  );
}
