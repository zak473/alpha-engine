"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Users, Plus, X, Search, ChevronRight, Trophy, Zap, Activity,
  BarChart3, Flame, Clock3, Timer, Share2, Cpu, TrendingUp, Star,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { SPORT_CONFIG } from "@/lib/betting-types";
import type { SportSlug } from "@/lib/betting-types";
import { cn } from "@/lib/utils";
import type { TipsterProfile, TipsterTip, BacktestRunResult } from "@/lib/api";
import { getTipsters, getTipsterTips, getBacktestSummary } from "@/lib/api";
import { useBetting } from "@/components/betting/BettingContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

function avatarColor(username: string): string {
  const colors = ["#22e283", "#60a5fa", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#f97316"];
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function initials(username: string) {
  return username.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
}

const AI_SPORT_EMOJI: Record<string, string> = {
  soccer:     "⚽",
  tennis:     "🎾",
  basketball: "🏀",
  baseball:   "⚾",
  hockey:     "🏒",
  esports:    "🎮",
};

function aiSportEmoji(displayName: string): string {
  const lower = displayName.toLowerCase();
  for (const [sport, emoji] of Object.entries(AI_SPORT_EMOJI)) {
    if (lower.includes(sport)) return emoji;
  }
  return "🤖";
}

function AiAvatar({ displayName, size = "md" }: { displayName: string; size?: "sm" | "md" | "lg" }) {
  const emoji = aiSportEmoji(displayName);
  const sizeClass = size === "lg" ? "w-14 h-14 text-2xl" : size === "sm" ? "w-8 h-8 text-base" : "w-11 h-11 text-xl";
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center flex-shrink-0`}
      style={{ background: "rgba(245,158,11,0.12)", border: "1.5px solid rgba(245,158,11,0.25)" }}
    >
      {emoji}
    </div>
  );
}

function ResultBadge({ result }: { result: "W" | "L" }) {
  return (
    <span
      className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0"
      style={result === "W"
        ? { background: "rgba(34,226,131,0.15)", color: "var(--positive)" }
        : { background: "rgba(239,68,68,0.12)", color: "var(--negative)" }
      }
    >
      {result}
    </span>
  );
}

function formatCountdown(startTime: string | null | undefined, outcome: string | null | undefined): { text: string; live: boolean; past: boolean } {
  if (!startTime) return { text: "", live: false, past: false };
  const ms = new Date(startTime).getTime() - Date.now();
  const isPending = !outcome || outcome === "pending";

  if (ms <= 0) {
    if (isPending) return { text: "Live now", live: true, past: false };
    const d = new Date(startTime);
    return { text: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), live: false, past: true };
  }

  const totalMins = Math.floor(ms / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const days = Math.floor(hrs / 24);

  if (days >= 2) {
    const d = new Date(startTime);
    return { text: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), live: false, past: false };
  }
  if (days === 1) return { text: `Tomorrow · ${String(new Date(startTime).getHours()).padStart(2, "0")}:${String(new Date(startTime).getMinutes()).padStart(2, "0")}`, live: false, past: false };
  if (hrs >= 1) return { text: `Starts in ${hrs}h ${mins}m`, live: false, past: false };
  if (totalMins >= 1) return { text: `Starts in ${totalMins}m`, live: false, past: false };
  return { text: "Starting soon", live: false, past: false };
}

function useCountdown(startTime: string | null | undefined, outcome: string | null | undefined) {
  const [display, setDisplay] = useState(() => formatCountdown(startTime, outcome));
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDisplay(formatCountdown(startTime, outcome));
    if (!startTime) return;
    ref.current = setInterval(() => setDisplay(formatCountdown(startTime, outcome)), 30000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [startTime, outcome]);

  return display;
}

// ── Sport detection ───────────────────────────────────────────────────────────

const SPORT_SLUGS = ["soccer", "tennis", "basketball", "baseball", "hockey", "esports"] as const;
type DetectedSport = typeof SPORT_SLUGS[number];

function detectTipsterSport(tipster: Pick<TipsterProfile, "display_name" | "username" | "bio">) {
  const haystack = `${tipster.display_name ?? ""} ${tipster.username} ${tipster.bio ?? ""}`.toLowerCase();
  const match = SPORT_SLUGS.find((sport) => haystack.includes(sport));
  if (!match) {
    return { slug: undefined as DetectedSport | undefined, label: "Multi-sport", emoji: "📡", color: "var(--accent)" };
  }
  const cfg = SPORT_CONFIG[match as SportSlug];
  return {
    slug: match as DetectedSport,
    label: cfg?.label ?? match[0].toUpperCase() + match.slice(1),
    emoji: AI_SPORT_EMOJI[match] ?? "🤖",
    color: cfg?.color ?? "var(--accent)",
  };
}

// ── P/L computation ───────────────────────────────────────────────────────────

type PLResult = { curve: number[]; wins: number; losses: number; units: number; pct: number; total: number };

function computePLCurve(tips: TipsterTip[], daysCutoff?: number): PLResult {
  const cutoff = daysCutoff ? Date.now() - daysCutoff * 86_400_000 : 0;
  const settled = tips
    .filter((t) =>
      (t.outcome === "won" || t.outcome === "lost") &&
      (!cutoff || new Date(t.start_time).getTime() > cutoff)
    )
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  let cumulative = 0;
  let wins = 0;
  let losses = 0;
  const curve: number[] = [0];
  for (const tip of settled) {
    if (tip.outcome === "won") { cumulative += tip.odds - 1; wins++; }
    else { cumulative -= 1; losses++; }
    curve.push(Number(cumulative.toFixed(2)));
  }
  const total = wins + losses;
  return { curve, wins, losses, units: Number(cumulative.toFixed(1)), pct: total > 0 ? Math.round((wins / total) * 100) : 0, total };
}

// ── Mini P/L sparkline ────────────────────────────────────────────────────────

function MiniPLChart({ curve, sportSlug, height = 44 }: { curve: number[]; sportSlug: string; height?: number }) {
  if (curve.length < 3) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <span className="text-[10px] text-text-muted">Calculating…</span>
      </div>
    );
  }

  const min = Math.min(...curve);
  const max = Math.max(...curve);
  const range = max - min || 1;
  const W = 200;
  const H = height;
  const pad = 3;

  const pts = curve.map((v, i) => {
    const x = pad + (i / (curve.length - 1)) * (W - 2 * pad);
    const y = H - pad - ((v - min) / range) * (H - 2 * pad);
    return [x, y] as [number, number];
  });

  const isPositive = curve[curve.length - 1] >= 0;
  const lineColor = isPositive ? "var(--positive)" : "var(--negative)";
  const gradId = `plg-${sportSlug}-${isPositive ? "p" : "n"}`;
  const polyPoints = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const fillPath = `M ${pts[0][0]},${H} ${pts.map(([x, y]) => `L ${x},${y}`).join(" ")} L ${pts[pts.length - 1][0]},${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ height, width: "100%" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} />
      <polyline points={polyPoints} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={lineColor} />
    </svg>
  );
}

// ── Period toggle ─────────────────────────────────────────────────────────────

type Period = "7d" | "30d" | "all";

function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-[14px] p-1"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border0)" }}
    >
      {(["7d", "30d", "all"] as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className="px-3.5 py-1.5 rounded-[10px] text-[11px] font-bold transition-all"
          style={value === p
            ? { background: "var(--accent)", color: "#0f2418" }
            : { color: "var(--text2)" }
          }
        >
          {p === "7d" ? "7D" : p === "30d" ? "30D" : "All"}
        </button>
      ))}
    </div>
  );
}

// ── Spotlight card (AI tipster) ───────────────────────────────────────────────

function SpotlightCard({
  tipster,
  backtest,
  tips,
  period,
  loading,
  onOpen,
}: {
  tipster: TipsterProfile;
  backtest?: BacktestRunResult | null;
  tips: TipsterTip[];
  period: Period;
  loading: boolean;
  onOpen: () => void;
}) {
  const sport = detectTipsterSport(tipster);
  const days = period === "7d" ? 7 : period === "30d" ? 30 : undefined;

  const pl = useMemo(() => computePLCurve(tips, days), [tips, period]);

  // Show live computed stats when we have enough data, else backtest fallback
  const hasLive = pl.total >= 5;
  const accuracy = hasLive ? pl.pct : (backtest ? Math.round((backtest.accuracy ?? 0) * 100) : 0);
  const unitsVal = hasLive ? pl.units : (backtest?.pnl_units ?? 0);
  const sharpe = backtest?.sharpe_ratio ?? 0;
  const sampleSize = hasLive ? pl.total : (backtest?.n_predictions ?? 0);
  const isPositive = unitsVal >= 0;
  const accColor = accuracy >= 58 ? "var(--positive)" : accuracy >= 52 ? "var(--warning)" : "var(--text1)";

  return (
    <article
      className="group relative flex flex-col cursor-pointer overflow-hidden rounded-[22px] border transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_28px_56px_rgba(0,0,0,0.32)]"
      style={{
        background: `linear-gradient(155deg, ${sport.color}12 0%, rgba(6,10,18,0.96) 55%)`,
        borderColor: `${sport.color}35`,
      }}
      onClick={onOpen}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20"
        style={{ background: `radial-gradient(circle, ${sport.color}55 0%, transparent 70%)` }}
      />

      <div className="relative flex flex-col gap-3.5 p-4">
        {/* Sport badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[26px] leading-none">{sport.emoji}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: sport.color }}>
              {sport.label}
            </span>
          </div>
          <span
            className="text-[9px] font-black uppercase tracking-[0.18em] px-2 py-1 rounded-full"
            style={{ background: `${sport.color}1a`, color: sport.color, border: `1px solid ${sport.color}30` }}
          >
            AI
          </span>
        </div>

        {/* Main stat pair */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-[14px] px-3 py-2.5" style={{ background: "rgba(255,255,255,0.05)" }}>
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-text-subtle">Accuracy</div>
            <div
              className="mt-1 text-[22px] font-black tracking-[-0.04em] tabular-nums"
              style={{ color: accColor }}
            >
              {loading ? <span className="text-text-muted text-sm">…</span> : accuracy > 0 ? `${accuracy}%` : "—"}
            </div>
          </div>
          <div className="rounded-[14px] px-3 py-2.5" style={{ background: "rgba(255,255,255,0.05)" }}>
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-text-subtle">Units</div>
            <div
              className="mt-1 text-[22px] font-black tracking-[-0.04em] tabular-nums"
              style={{ color: isPositive ? "var(--positive)" : "var(--negative)" }}
            >
              {loading ? <span className="text-text-muted text-sm">…</span> : `${unitsVal >= 0 ? "+" : ""}${unitsVal.toFixed(1)}u`}
            </div>
          </div>
        </div>

        {/* Secondary stats */}
        <div className="flex items-center justify-between text-[10px] text-text-muted px-0.5">
          <span>
            Sharpe:{" "}
            <span className="font-bold" style={{ color: sharpe >= 2 ? "var(--positive)" : "var(--text1)" }}>
              {sharpe.toFixed(2)}
            </span>
          </span>
          <span className="font-mono">{sampleSize.toLocaleString()} picks</span>
        </div>

        {/* Sparkline */}
        <div className="rounded-[12px] overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
          <MiniPLChart curve={pl.curve} sportSlug={sport.slug ?? "unknown"} height={44} />
        </div>

        {/* Recent form + link */}
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-1">
            {(tipster.recent_results ?? []).slice(-6).map((r, i) => (
              <span
                key={i}
                className="w-[18px] h-[18px] rounded text-[8px] font-black flex items-center justify-center"
                style={r === "W"
                  ? { background: "rgba(34,226,131,0.2)", color: "var(--positive)" }
                  : { background: "rgba(239,68,68,0.15)", color: "var(--negative)" }
                }
              >
                {r}
              </span>
            ))}
          </div>
          <span
            className="text-[10px] font-bold flex items-center gap-0.5 transition-colors group-hover:opacity-100"
            style={{ color: sport.color, opacity: 0.75 }}
          >
            View <ChevronRight size={11} />
          </span>
        </div>
      </div>
    </article>
  );
}

// ── Spotlight Boards section ──────────────────────────────────────────────────

function SpotlightBoards({
  aiTipsters,
  backtestSummary,
  onOpen,
  onFollow,
}: {
  aiTipsters: TipsterProfile[];
  backtestSummary: Record<string, BacktestRunResult>;
  onOpen: (t: TipsterProfile) => void;
  onFollow: (id: string) => void;
}) {
  const [period, setPeriod] = useState<Period>("30d");
  const [tipHistory, setTipHistory] = useState<Record<string, TipsterTip[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (aiTipsters.length === 0) { setLoading(false); return; }
    let done = 0;
    aiTipsters.forEach((t) => {
      getTipsterTips(t.id, true)
        .then((tips) => setTipHistory((prev) => ({ ...prev, [t.id]: tips })))
        .catch(() => {})
        .finally(() => { done++; if (done === aiTipsters.length) setLoading(false); });
    });
  }, [aiTipsters.length]);

  const days = period === "7d" ? 7 : period === "30d" ? 30 : undefined;

  const agg = useMemo(() => {
    let totalWins = 0, totalLosses = 0, totalUnits = 0;
    aiTipsters.forEach((t) => {
      const { wins, losses, units } = computePLCurve(tipHistory[t.id] ?? [], days);
      totalWins += wins;
      totalLosses += losses;
      totalUnits += units;
    });
    const total = totalWins + totalLosses;
    return {
      picks: total,
      accuracy: total > 0 ? Math.round((totalWins / total) * 100) : 0,
      units: Number(totalUnits.toFixed(1)),
    };
  }, [tipHistory, period, aiTipsters]);

  if (aiTipsters.length === 0) return null;

  // Sort cards: most picks first (descending settled_picks)
  const sortedAi = [...aiTipsters].sort((a, b) => (b.settled_picks ?? 0) - (a.settled_picks ?? 0));

  return (
    <section
      className="px-4 pt-6 pb-7 lg:px-6"
      style={{ borderBottom: "1px solid var(--border0)", background: "linear-gradient(180deg, rgba(245,158,11,0.04) 0%, transparent 60%)" }}
    >
      {/* Section header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.22em] px-2.5 py-1 rounded-full"
              style={{ background: "rgba(245,158,11,0.14)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.22)" }}
            >
              <Cpu size={9} /> Spotlight Boards
            </span>
          </div>
          <h2 className="text-[28px] font-black tracking-[-0.04em] leading-none text-text-primary">
            AI Model Boards
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            {aiTipsters.length} sport-specific models. Verified predictions, settled outcomes, real edge.
          </p>
        </div>
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: period === "7d" ? "Picks (7D)" : period === "30d" ? "Picks (30D)" : "Total picks",
            value: loading ? "…" : agg.picks > 0 ? agg.picks.toLocaleString() : "—",
            color: "var(--text0)",
          },
          {
            label: "Combined accuracy",
            value: loading ? "…" : agg.accuracy > 0 ? `${agg.accuracy}%` : "—",
            color: agg.accuracy >= 55 ? "var(--positive)" : agg.accuracy >= 50 ? "var(--warning)" : "var(--text1)",
          },
          {
            label: "Combined units",
            value: loading ? "…" : `${agg.units >= 0 ? "+" : ""}${agg.units}u`,
            color: agg.units >= 0 ? "var(--positive)" : "var(--negative)",
          },
          {
            label: "Active sports",
            value: String(aiTipsters.length),
            color: "var(--accent)",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[18px] border px-4 py-3.5"
            style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.035)" }}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-subtle">{item.label}</div>
            <div className="mt-1.5 text-[26px] font-black tracking-[-0.04em] tabular-nums" style={{ color: item.color }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Sport cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {sortedAi.map((t) => {
          const sport = detectTipsterSport(t);
          return (
            <SpotlightCard
              key={t.id}
              tipster={t}
              backtest={backtestSummary[sport.slug ?? ""] ?? null}
              tips={tipHistory[t.id] ?? []}
              period={period}
              loading={loading && !(t.id in tipHistory)}
              onOpen={() => onOpen(t)}
            />
          );
        })}
      </div>

      {/* Disclaimer */}
      <p className="mt-4 text-[11px] text-text-muted text-center">
        Stats computed from settled tips in the selected window · Model accuracy ≠ guaranteed future returns
      </p>
    </section>
  );
}

// ── Tip row (inside tipster modal) ────────────────────────────────────────────

function TipRow({ tip, tipsterUsername }: { tip: TipsterTip; tipsterUsername: string }) {
  const cfg = SPORT_CONFIG[tip.sport as SportSlug];
  const isPending = !tip.outcome || tip.outcome === "pending";
  const { addToQueue, isInQueue } = useBetting();
  const { toast } = useToast();
  const queueId = `tipster:${tip.id}`;
  const tailed = isInQueue(queueId);
  const countdown = useCountdown(tip.start_time, tip.outcome);

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    const text = `📊 ${tip.selection_label} @ ${tip.odds.toFixed(2)} (${tip.sport})\n${tip.match_label}\nFollow the AI tipsters at neverindoubt.app`;
    try {
      if (navigator.share) {
        await navigator.share({ text, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard!");
      }
    } catch {
      // user dismissed share sheet — no-op
    }
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center"
      style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.03)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ background: `${cfg?.color ?? "var(--accent)"}22`, color: cfg?.color ?? "var(--accent)" }}
          >
            {tip.sport}
          </span>
          <span className="text-[11px] font-mono font-semibold tabular-nums text-text-primary">{tip.odds.toFixed(2)}</span>
          <span className="text-[11px] text-text-muted">{tip.market_name}</span>
        </div>

        <p className="mt-2 text-sm font-semibold leading-6 text-text-primary">{tip.selection_label}</p>

        {tip.match_id ? (
          <a
            href={`/sports/${tip.sport}/matches/${tip.match_id}`}
            className="mt-1 block truncate text-[12px] text-text-muted transition-colors hover:text-text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {tip.match_label}
          </a>
        ) : (
          <p className="mt-1 truncate text-[12px] text-text-muted">{tip.match_label}</p>
        )}

        {countdown.text ? (
          <div className="mt-2 inline-flex items-center gap-1.5">
            {countdown.live ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ background: "rgba(239,68,68,0.14)", color: "var(--negative)" }}>
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                Live now
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                <Timer size={11} />
                {countdown.text}
              </span>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        {isPending ? (
          <button
            onClick={() =>
              !tailed &&
              addToQueue({
                id: queueId,
                matchId: tip.id,
                matchLabel: tip.match_label,
                sport: tip.sport as SportSlug,
                league: "",
                marketId: tip.id,
                marketName: tip.market_name,
                selectionId: tip.id,
                selectionLabel: `${tip.selection_label} (via @${tipsterUsername})`,
                odds: tip.odds,
                startTime: tip.start_time,
                addedAt: new Date().toISOString(),
              })
            }
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all"
            style={
              tailed
                ? { background: "rgba(34,197,94,0.15)", color: "var(--positive)" }
                : { background: "var(--accent)", color: "#0f2418" }
            }
          >
            {tailed ? "✓ Tailed" : <><Zap size={11} /> Tail pick</>}
          </button>
        ) : tip.outcome === "won" ? (
          <span className="rounded-full px-3 py-1.5 text-[11px] font-semibold" style={{ background: "rgba(34,197,94,0.15)", color: "var(--positive)" }}>
            Won
          </span>
        ) : tip.outcome === "void" ? (
          <span className="rounded-full px-3 py-1.5 text-[11px] font-semibold" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text2)" }}>
            Void
          </span>
        ) : (
          <span className="rounded-full px-3 py-1.5 text-[11px] font-semibold" style={{ background: "rgba(239,68,68,0.12)", color: "var(--negative)" }}>
            Lost
          </span>
        )}
        <button
          onClick={handleShare}
          title="Share this tip"
          className="ml-1 inline-flex items-center justify-center rounded-full p-1.5 text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-primary"
        >
          <Share2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Tipster detail modal ──────────────────────────────────────────────────────

function TipsterModal({
  tipster,
  tips,
  onClose,
  onFollow,
  backtest,
}: {
  tipster: TipsterProfile;
  tips: TipsterTip[];
  onClose: () => void;
  onFollow: () => void;
  backtest?: BacktestRunResult | null;
}) {
  const color = avatarColor(tipster.username);
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [historyTips, setHistoryTips] = useState<TipsterTip[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  function handleHistoryTab() {
    setActiveTab("history");
    if (historyTips.length === 0) {
      setLoadingHistory(true);
      getTipsterTips(tipster.id, true)
        .then(setHistoryTips)
        .catch(() => {})
        .finally(() => setLoadingHistory(false));
    }
  }

  const overallWinRate = tipster.overall_win_rate ?? 0;
  const profitLoss = tipster.profit_loss ?? 0;
  const overallWinPct = Math.round(overallWinRate * 100);
  const weeklyWinPct = Math.round(tipster.weekly_win_rate * 100);
  const plStr = `${profitLoss >= 0 ? "+" : ""}${profitLoss.toFixed(1)}u`;
  const activeTips = tips.filter((t) => !t.outcome || t.outcome === "pending");
  const settledHistory = historyTips.filter((t) => t.outcome === "won" || t.outcome === "lost" || t.outcome === "void");

  const voidPicks = tipster.void_picks ?? 0;
  const recordStr = `${tipster.won_picks}W - ${tipster.lost_picks}L${voidPicks > 0 ? ` - ${voidPicks}V` : ""}`;

  const useBacktest = tipster.is_ai && backtest;
  const summary = useBacktest
    ? [
        { label: "Accuracy", value: `${((backtest!.accuracy ?? 0) * 100).toFixed(1)}%`, tone: (backtest!.accuracy ?? 0) >= 0.55 ? "var(--positive)" : "var(--warning)" },
        { label: "Units", value: `${(backtest!.pnl_units ?? 0) >= 0 ? "+" : ""}${(backtest!.pnl_units ?? 0).toFixed(1)}u`, tone: (backtest!.pnl_units ?? 0) >= 0 ? "var(--positive)" : "var(--negative)" },
        { label: "Sharpe", value: (backtest!.sharpe_ratio ?? 0).toFixed(2), tone: (backtest!.sharpe_ratio ?? 0) >= 2 ? "var(--positive)" : "var(--warning)" },
        { label: "Predictions", value: (backtest!.n_predictions ?? 0).toLocaleString(), tone: "var(--text0)" },
      ]
    : [
        { label: "Win rate", value: `${overallWinPct}%`, tone: overallWinPct >= 55 ? "var(--positive)" : overallWinPct >= 50 ? "var(--warning)" : "var(--text0)" },
        { label: "Units", value: tipster.settled_picks > 0 ? plStr : "—", tone: profitLoss >= 0 ? "var(--positive)" : "var(--negative)" },
        { label: "Record", value: tipster.settled_picks > 0 ? recordStr : "—", tone: "var(--text0)" },
        { label: "Avg odds", value: (tipster.avg_odds ?? 0) > 0 ? (tipster.avg_odds ?? 0).toFixed(2) : "—", tone: "var(--text0)" },
      ];

  const displayedTips = activeTab === "active" ? activeTips : settledHistory;
  const emptyCopy = activeTab === "active" ? "No active tips right now" : "No settled tips yet";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(2,6,12,0.72)", backdropFilter: "blur(6px)" }}>
      <div
        className="flex w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border"
        style={{ background: "#08111a", borderColor: "var(--border0)", maxHeight: "88vh", boxShadow: "0 28px 80px rgba(0,0,0,0.42)" }}
      >
        <div className="border-b px-5 py-5 sm:px-6" style={{ borderColor: "var(--border0)" }}>
          <div className="flex items-start gap-4">
            {tipster.is_ai ? (
              <AiAvatar displayName={tipster.username} size="lg" />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: color }}>
                {initials(tipster.username)}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-text-primary">@{tipster.username}</h2>
                <span className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ borderColor: "var(--border0)", color: "var(--text2)" }}>
                  {tipster.followers.toLocaleString()} followers
                </span>
              </div>
              {tipster.bio ? <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">{tipster.bio}</p> : null}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.14em] text-text-muted">Recent form</span>
                <div className="flex items-center gap-1.5">
                  {tipster.recent_results.map((r, i) => <ResultBadge key={i} result={r} />)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onFollow}
                className="rounded-xl px-4 py-2 text-xs font-semibold transition-all"
                style={
                  tipster.is_following
                    ? { background: "rgba(255,255,255,0.04)", border: "1px solid var(--border0)", color: "var(--text1)" }
                    : { background: "var(--accent)", color: "#0f2418", border: "1px solid transparent" }
                }
              >
                {tipster.is_following ? "Following" : "Follow"}
              </button>
              <button onClick={onClose} className="rounded-xl p-2 text-text-muted transition-colors hover:text-text-primary hover:bg-white/[0.04]">
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-b px-5 py-4 sm:grid-cols-4 sm:px-6" style={{ borderColor: "var(--border0)" }}>
          {summary.map((item) => (
            <div key={item.label} className="rounded-2xl border px-4 py-4" style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.03)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">{item.label}</p>
              <p className="mt-2 text-lg font-semibold tracking-[-0.03em]" style={{ color: item.tone }}>{item.value}</p>
            </div>
          ))}
        </div>

        <div className="border-b px-5 py-3 sm:px-6" style={{ borderColor: "var(--border0)" }}>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab("active")}
              className={cn("rounded-full px-3.5 py-2 text-xs font-semibold transition-all", activeTab === "active" ? "text-[#0f2418]" : "text-text-muted")}
              style={activeTab === "active" ? { background: "var(--accent)" } : { background: "rgba(255,255,255,0.04)" }}
            >
              Active picks ({activeTips.length})
            </button>
            <button
              onClick={handleHistoryTab}
              className={cn("rounded-full px-3.5 py-2 text-xs font-semibold transition-all", activeTab === "history" ? "text-[#0f2418]" : "text-text-muted")}
              style={activeTab === "history" ? { background: "var(--accent)" } : { background: "rgba(255,255,255,0.04)" }}
            >
              History
            </button>
            <div className="ml-auto hidden items-center text-[11px] text-text-muted sm:flex">
              Weekly win rate: <span className="ml-1 font-semibold" style={{ color: weeklyWinPct >= 55 ? "var(--positive)" : "var(--text0)" }}>{weeklyWinPct}%</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {activeTab === "history" && loadingHistory ? (
            <p className="py-10 text-center text-sm text-text-muted">Loading history…</p>
          ) : displayedTips.length === 0 ? (
            <p className="py-10 text-center text-sm text-text-muted">{emptyCopy}</p>
          ) : (
            <div className="space-y-3">
              {displayedTips.map((t) => (
                <TipRow key={t.id} tip={t} tipsterUsername={tipster.username} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Post tip modal ─────────────────────────────────────────────────────────────

const SPORTS = ["soccer", "tennis", "basketball", "esports", "baseball", "hockey"] as const;

function PostTipModal({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const [sport, setSport] = useState<SportSlug>("soccer");
  const [matchLabel, setMatchLabel] = useState("");
  const [selection, setSelection] = useState("");
  const [market, setMarket] = useState("1X2");
  const [odds, setOdds] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matchLabel.trim()) { setError("Enter a match"); return; }
    if (!selection.trim()) { setError("Enter your selection"); return; }
    if (!odds || isNaN(Number(odds)) || Number(odds) < 1) { setError("Enter valid odds (≥ 1.01)"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/tipsters/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, match_label: matchLabel, selection_label: selection, market_name: market, odds: Number(odds), note: note || undefined }),
      });
      if (!res.ok) throw new Error("Failed to post tip");
      onPosted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post tip");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-4" style={{ background: "rgba(8,18,14,0.97)", border: "1px solid var(--border0)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-text-primary">Post a Tip</h2>
          <button onClick={onClose} className="p-1 rounded text-text-muted hover:text-text-primary"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="label">Sport</label>
            <div className="flex gap-1 flex-wrap">
              {SPORTS.map((s) => (
                <button key={s} type="button" onClick={() => setSport(s)}
                  className="text-xs px-3 py-1 rounded-full border transition-all capitalize"
                  style={sport === s
                    ? { background: "var(--accent-dim)", borderColor: "rgba(34,226,131,0.35)", color: "var(--accent)" }
                    : { background: "transparent", borderColor: "var(--border0)", color: "var(--text1)" }
                  }
                >{s}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="label">Match</label>
            <input value={matchLabel} onChange={e => setMatchLabel(e.target.value)} placeholder="e.g. Arsenal vs Chelsea" className="input-field" />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 w-24 flex-shrink-0">
              <label className="label">Market</label>
              <input value={market} onChange={e => setMarket(e.target.value)} placeholder="1X2" className="input-field" />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="label">Selection</label>
              <input value={selection} onChange={e => setSelection(e.target.value)} placeholder="e.g. Home, Over 2.5" className="input-field" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="label">Odds (decimal)</label>
            <input type="number" step="0.01" min="1.01" value={odds} onChange={e => setOdds(e.target.value)} placeholder="e.g. 2.10" className="input-field" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="label">Note <span className="text-text-muted font-normal">(optional)</span></label>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Reasoning, context…" rows={2}
              className="input-field resize-none" style={{ lineHeight: 1.5 }} />
          </div>

          {error && <p className="text-xs" style={{ color: "var(--negative)" }}>{error}</p>}

          <button type="submit" className="btn btn-primary h-10" disabled={saving}>
            {saving ? "Posting…" : "Post Tip"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Community tipster card ────────────────────────────────────────────────────

function boardState(tipster: TipsterProfile) {
  const active = tipster.active_tips_count ?? 0;
  const units = tipster.profit_loss ?? 0;
  const settled = tipster.settled_picks ?? 0;

  if (active > 0) return { label: active >= 3 ? "Active board" : "Live now", copy: `${active} open ${active === 1 ? "tip" : "tips"} available to tail right now.`, tone: "accent" as const };
  if (settled === 0) return { label: "Building sample", copy: "Fresh profile — not enough settled picks to judge yet.", tone: "neutral" as const };
  if (units > 0) return { label: "Profitable", copy: `Closed sample is in the green at ${units >= 0 ? "+" : ""}${units.toFixed(1)}u.`, tone: "positive" as const };
  return { label: "Quiet board", copy: "No open plays right now, but recent settled performance is still tracked.", tone: "warning" as const };
}

function recentSummary(results: ("W" | "L")[]) {
  const wins = results.filter((r) => r === "W").length;
  const losses = results.filter((r) => r === "L").length;
  if (results.length === 0) return "No settled streak yet";
  return `Last ${results.length}: ${wins}-${losses}`;
}

function TipsterCard({
  tipster,
  onOpen,
  onFollow,
}: {
  tipster: TipsterProfile;
  onOpen: () => void;
  onFollow: () => void;
}) {
  const color = avatarColor(tipster.username);
  const winPct = Math.round((tipster.overall_win_rate ?? 0) * 100);
  const pl = tipster.profit_loss ?? 0;
  const plStr = `${pl >= 0 ? "+" : ""}${pl.toFixed(1)}u`;
  const settled = tipster.settled_picks ?? 0;
  const sport = detectTipsterSport(tipster);
  const state = boardState(tipster);
  const recent = recentSummary(tipster.recent_results);
  const followers = tipster.followers ?? 0;
  const openTips = tipster.active_tips_count ?? 0;

  const toneStyles = {
    accent: { background: "rgba(0,255,132,0.10)", borderColor: "rgba(0,255,132,0.16)", color: "var(--accent)" },
    positive: { background: "rgba(53,230,160,0.10)", borderColor: "rgba(53,230,160,0.16)", color: "var(--positive)" },
    warning: { background: "rgba(255,199,106,0.10)", borderColor: "rgba(255,199,106,0.16)", color: "var(--warning)" },
    neutral: { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)", color: "var(--text1)" },
  }[state.tone];

  return (
    <article
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[24px] border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(0,0,0,0.2)]"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02)), rgba(8,13,21,0.9)",
        borderColor: "var(--border0)",
      }}
      onClick={onOpen}
    >
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border0)" }}>
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ background: `${sport.color}16`, borderColor: `${sport.color}38`, color: sport.color }}
        >
          <span>{sport.emoji}</span>
          {sport.label}
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
          style={toneStyles}
        >
          <Activity size={11} />
          {state.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: color }}
          >
            {initials(tipster.username)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold leading-tight text-text-primary">@{tipster.username}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
              {followers > 0 ? `${followers.toLocaleString()} followers` : "Fresh profile"}
              {settled > 0 ? ` · ${settled} graded` : ""}
            </p>
            <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-text-muted">
              {tipster.bio || "Community tipster board."}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Win rate", value: settled > 0 ? `${winPct}%` : "Building", color: settled > 0 ? (winPct >= 60 ? "var(--positive)" : winPct >= 50 ? "var(--warning)" : "var(--negative)") : "var(--text1)" },
            { label: "Units", value: settled > 0 ? plStr : "—", color: settled > 0 ? (pl >= 0 ? "var(--positive)" : "var(--negative)") : "var(--text1)" },
            { label: "Open tips", value: String(openTips || "—"), color: "var(--text0)" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border px-3.5 py-3" style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.03)" }}>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-subtle">{s.label}</div>
              <div className="mt-2 text-xl font-black tracking-[-0.04em]" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="rounded-[20px] border px-4 py-3" style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.025)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-subtle">Board read</div>
              <div className="mt-1 text-sm font-semibold text-text-primary">{recent}</div>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.04)", color: "var(--text1)" }}>
              {openTips > 0 ? <Flame size={11} /> : <Clock3 size={11} />}
              {openTips > 0 ? `${openTips} live` : settled > 0 ? "Tracked" : "Fresh"}
            </div>
          </div>
          <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-text-muted">{state.copy}</p>
        </div>
      </div>

      <div
        className="mt-auto flex flex-wrap items-center gap-2 border-t px-5 py-4"
        style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.03)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onFollow(); }}
          className="inline-flex h-10 items-center rounded-xl px-3.5 text-[12px] font-semibold transition-all hover:-translate-y-0.5"
          style={tipster.is_following ? {
            background: "var(--bg3)", color: "var(--text1)", border: "1px solid var(--border1)",
          } : {
            background: "rgba(255,255,255,0.04)", color: "var(--text1)", border: "1px solid var(--border0)",
          }}
        >
          {tipster.is_following ? "Following" : "Follow"}
        </button>
        <span
          className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[12px] font-bold"
          style={openTips > 0
            ? { background: "rgba(0,255,132,0.10)", border: "1px solid rgba(0,255,132,0.22)", color: "var(--accent)" }
            : { background: "rgba(255,255,255,0.03)", border: "1px solid var(--border0)", color: "var(--text2)" }
          }
        >
          {openTips > 0 ? <Flame size={12} /> : <Clock3 size={12} />}
          {openTips > 0 ? `${openTips} open ${openTips === 1 ? "tip" : "tips"}` : "No open tips"}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[12px] font-bold transition-all hover:-translate-y-0.5"
          style={{ background: "var(--accent)", color: "#0f2418", border: "1px solid transparent" }}
        >
          View <ChevronRight size={13} />
        </button>
      </div>
    </article>
  );
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

function LeaderboardView({ tipsters }: { tipsters: TipsterProfile[] }) {
  const ranked = [...tipsters].sort((a, b) => (b.profit_loss ?? 0) - (a.profit_loss ?? 0));
  return (
    <div className="px-4 py-4 lg:px-6">
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border0)", background: "var(--bg1)" }}>
        <div className="grid grid-cols-[28px_1fr_72px_72px_64px_72px] gap-2 px-4 py-2 border-b text-[10px] uppercase tracking-wider text-text-muted font-bold" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
          <span>#</span><span>Tipster</span><span className="text-right">Win rate</span><span className="text-right">Units</span><span className="text-right">Picks</span><span className="text-right">Followers</span>
        </div>
        {ranked.map((t, i) => {
          const color = avatarColor(t.username);
          const winPct = Math.round(t.overall_win_rate * 100);
          const pl = t.profit_loss ?? 0;
          const plStr = `${pl >= 0 ? "+" : ""}${pl.toFixed(1)}u`;
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
          return (
            <div key={t.id} className="grid grid-cols-[28px_1fr_72px_72px_64px_72px] gap-2 items-center px-4 py-3 border-b last:border-b-0 hover:bg-[var(--bg2)] transition-colors" style={{ borderColor: "var(--border0)" }}>
              <span className="text-sm">{medal ?? <span className="text-[11px] text-text-muted font-bold">{i + 1}</span>}</span>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: color }}>
                  {initials(t.username)}
                </div>
                <span className="text-sm font-semibold text-text-primary truncate">@{t.username}</span>
              </div>
              <span className="text-right text-sm font-bold" style={{ color: t.settled_picks > 0 ? (winPct >= 60 ? "var(--positive)" : winPct >= 50 ? "var(--warning)" : "var(--negative)") : "var(--text2)" }}>
                {t.settled_picks > 0 ? `${winPct}%` : "—"}
              </span>
              <span className="text-right text-sm font-bold" style={{ color: t.settled_picks > 0 ? (pl >= 0 ? "var(--positive)" : "var(--negative)") : "var(--text2)" }}>
                {t.settled_picks > 0 ? plStr : "—"}
              </span>
              <span className="text-right text-sm font-mono text-text-primary">{t.total_picks}</span>
              <span className="text-right text-sm font-mono text-text-muted">{t.followers.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

type SortOpt = "followers" | "winrate" | "active";
type Tab = "tipsters" | "leaderboard";

export function TipstersView({
  initialTipsters = [],
  initialBacktest = {},
}: {
  initialTipsters?: TipsterProfile[];
  initialBacktest?: Record<string, BacktestRunResult>;
}) {
  const [tipsters, setTipsters] = useState<TipsterProfile[]>(initialTipsters);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOpt>("followers");
  const [tab, setTab] = useState<Tab>("tipsters");
  const [openTipster, setOpenTipster] = useState<TipsterProfile | null>(null);
  const [openTips, setOpenTips] = useState<TipsterTip[]>([]);
  const [showPostModal, setShowPostModal] = useState(false);
  const [backtestSummary, setBacktestSummary] = useState<Record<string, BacktestRunResult>>(initialBacktest);

  useEffect(() => {
    getTipsters().then(setTipsters).catch(() => {});
    getBacktestSummary().then(setBacktestSummary).catch(() => {});
  }, []);

  function handleOpenTipster(tipster: TipsterProfile) {
    setOpenTipster(tipster);
    setOpenTips([]);
    getTipsterTips(tipster.id).then(setOpenTips).catch(() => {});
  }

  const handleFollow = useCallback((id: string) => {
    setTipsters(prev => prev.map(t =>
      t.id === id
        ? { ...t, is_following: !t.is_following, followers: t.followers + (t.is_following ? -1 : 1) }
        : t
    ));
    if (openTipster?.id === id) {
      setOpenTipster(prev => prev ? { ...prev, is_following: !prev.is_following, followers: prev.followers + (prev.is_following ? -1 : 1) } : prev);
    }
  }, [openTipster]);

  // Split AI vs community tipsters
  const aiTipsters = useMemo(() => tipsters.filter((t) => t.is_ai), [tipsters]);

  const communityFiltered = useMemo(() =>
    tipsters
      .filter((t) => !t.is_ai)
      .filter((t) => {
        const haystack = `${t.username} ${t.display_name ?? ""} ${t.bio ?? ""}`.toLowerCase();
        return !search || haystack.includes(search.toLowerCase());
      })
      .sort((a, b) => {
        if (sort === "winrate") return (b.overall_win_rate ?? 0) - (a.overall_win_rate ?? 0);
        if (sort === "active") return (b.active_tips_count ?? 0) - (a.active_tips_count ?? 0);
        return (b.followers ?? 0) - (a.followers ?? 0);
      }),
    [tipsters, search, sort]
  );

  const followingCount = tipsters.filter(t => t.is_following).length;
  const activeCommunityBoards = communityFiltered.filter((t) => (t.active_tips_count ?? 0) > 0);
  const quietCommunityBoards = communityFiltered.filter((t) => (t.active_tips_count ?? 0) === 0);

  return (
    <>
      {/* Page header */}
      <div className="px-4 pt-5 pb-4 lg:px-6 border-b" style={{ borderColor: "var(--border0)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} style={{ color: "var(--accent)" }} />
              <h1 className="text-lg font-bold text-text-primary">Tipsters</h1>
            </div>
            <p className="text-sm text-text-muted">AI model boards and community tipsters, all in one place.</p>
          </div>
          <button
            onClick={() => setShowPostModal(true)}
            className="btn btn-primary flex items-center gap-1.5 h-9 px-4 text-xs flex-shrink-0"
          >
            <Plus size={13} /> Post a Tip
          </button>
        </div>

        {followingCount > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-text-muted">Following</span>
            {tipsters.filter(t => t.is_following).map(t => (
              <div key={t.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: "rgba(34,226,131,0.12)", color: "var(--positive)", border: "1px solid rgba(34,226,131,0.2)" }}>
                <span className="w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center text-white" style={{ background: avatarColor(t.username) }}>
                  {initials(t.username)}
                </span>
                @{t.username}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-0 px-4 lg:px-6 border-b" style={{ borderColor: "var(--border0)" }}>
        {([["tipsters", "Tipsters", <Users key="u" size={12} />], ["leaderboard", "Leaderboard", <Trophy key="t" size={12} />]] as [Tab, string, React.ReactNode][]).map(([value, label, icon]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn("flex items-center gap-1.5 px-4 py-3 text-[12px] font-semibold border-b-2 transition-all", tab === value
              ? "border-[var(--accent)] text-text-primary"
              : "border-transparent text-text-muted hover:text-text-primary"
            )}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {tab === "leaderboard" && <LeaderboardView tipsters={tipsters} />}

      {tab === "tipsters" && (
        <>
          {/* ── Spotlight Boards (AI) ────────────────────────────────────── */}
          <SpotlightBoards
            aiTipsters={aiTipsters}
            backtestSummary={backtestSummary}
            onOpen={handleOpenTipster}
            onFollow={handleFollow}
          />

          {/* ── Community tipsters ───────────────────────────────────────── */}
          <div className="px-4 pt-6 pb-4 lg:px-6 border-b" style={{ borderColor: "var(--border0)" }}>
            <div className="flex items-center gap-2 mb-1">
              <Star size={13} style={{ color: "var(--accent)" }} />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Community</span>
            </div>
            <h2 className="text-xl font-black tracking-[-0.04em] text-text-primary">Community Boards</h2>
            <p className="mt-1 text-sm text-text-muted">Follow and tail picks from community tipsters.</p>
          </div>

          {/* Toolbar */}
          <div className="flex flex-col gap-3 px-4 py-4 lg:px-6 border-b" style={{ borderColor: "var(--border0)" }}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1 lg:max-w-sm">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search tipsters, sports, bios…"
                  className="input-field pl-8 h-10 text-sm w-full"
                />
              </div>
              <div className="flex items-center gap-1 lg:ml-auto flex-wrap">
                <span className="text-[11px] text-text-muted mr-1">Sort</span>
                {(["followers", "winrate", "active"] as SortOpt[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setSort(s)}
                    className={cn("px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all border", sort === s
                      ? "bg-[var(--bg1)] border-[var(--border1)] text-text-primary shadow-sm"
                      : "border-transparent text-text-muted hover:text-text-primary"
                    )}
                  >
                    {s === "followers" ? "Popular" : s === "winrate" ? "Win rate" : "Active tips"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-4 py-5 lg:px-6 space-y-6">
            {communityFiltered.length === 0 && (
              <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-6 py-16">
                <div className="flex flex-col items-center justify-center gap-5 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-300/10">
                    <Users size={28} style={{ color: "var(--accent)" }} />
                  </div>
                  <div className="max-w-sm">
                    <p className="mb-1 text-base font-bold text-text-primary">
                      {search ? `No tipsters matching "${search}"` : "No community tipsters yet"}
                    </p>
                    <p className="text-sm text-text-muted">
                      {search ? "Try a different search or clear the filter." : "Be the first to post a tip and build your reputation on the board."}
                    </p>
                  </div>
                  {!search && (
                    <button onClick={() => setShowPostModal(true)} className="btn btn-primary flex h-10 items-center gap-2 px-6 text-sm">
                      <Plus size={14} /> Post your first tip
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeCommunityBoards.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-end justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-subtle">Active now</div>
                    <h3 className="mt-1 text-lg font-black tracking-[-0.04em] text-text-primary">Boards with open plays</h3>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold" style={{ borderColor: "rgba(0,255,132,0.16)", background: "rgba(0,255,132,0.08)", color: "var(--accent)" }}>
                    <Flame size={12} /> {activeCommunityBoards.reduce((sum, t) => sum + (t.active_tips_count ?? 0), 0)} live opportunities
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {activeCommunityBoards.map(t => (
                    <TipsterCard key={t.id} tipster={t} onOpen={() => handleOpenTipster(t)} onFollow={() => handleFollow(t.id)} />
                  ))}
                </div>
              </section>
            )}

            {quietCommunityBoards.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-end justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-subtle">Watchlist</div>
                    <h3 className="mt-1 text-lg font-black tracking-[-0.04em] text-text-primary">Quiet or developing boards</h3>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {quietCommunityBoards.map(t => (
                    <TipsterCard key={t.id} tipster={t} onOpen={() => handleOpenTipster(t)} onFollow={() => handleFollow(t.id)} />
                  ))}
                </div>
              </section>
            )}

            <div className="rounded-2xl border px-4 py-3 text-[11px] leading-5 text-text-muted" style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.03)" }}>
              Win rates are calculated over settled picks and should always be read alongside sample size and open activity. Past performance does not guarantee future results.
            </div>
          </div>
        </>
      )}

      {openTipster && (
        <TipsterModal
          tipster={openTipster}
          tips={openTips}
          onClose={() => { setOpenTipster(null); setOpenTips([]); }}
          onFollow={() => handleFollow(openTipster.id)}
          backtest={openTipster.is_ai ? (backtestSummary[detectTipsterSport(openTipster).slug ?? ""] ?? null) : null}
        />
      )}

      {showPostModal && (
        <PostTipModal onClose={() => setShowPostModal(false)} onPosted={() => {}} />
      )}
    </>
  );
}
