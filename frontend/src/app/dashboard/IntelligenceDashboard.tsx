"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Zap, ChevronRight, Trophy, TrendingUp, Users, Clock, Target, BarChart3, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPORT_CONFIG } from "@/lib/betting-types";
import type { SportSlug } from "@/lib/betting-types";
import { useBetting } from "@/components/betting/BettingContext";
import {
  getPredictions, getLiveMatches, getPicksStats, getChallenges, getTipsters, getPerformance,
  type LiveMatchOut, type PicksStatsOut, type TipsterProfile,
} from "@/lib/api";
import type { MvpPrediction, MvpPerformance, Challenge } from "@/lib/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`;
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) + ` · ${time}`;
}

type OutcomeKey = "home_win" | "draw" | "away_win";

function getBestPick(pred: MvpPrediction): { label: string; key: OutcomeKey; prob: number } {
  const { home_win, draw, away_win } = pred.probabilities;
  const opts: Array<{ label: string; key: OutcomeKey; prob: number }> = [
    { label: pred.participants.home.name, key: "home_win", prob: home_win },
    { label: pred.participants.away.name, key: "away_win", prob: away_win },
  ];
  if (pred.sport === "soccer") opts.push({ label: "Draw", key: "draw", prob: draw });
  return opts.reduce((best, cur) => (cur.prob > best.prob ? cur : best));
}

function getEdge(pred: MvpPrediction, key: OutcomeKey): number | null {
  const mo = pred.market_odds?.[key];
  if (!mo || mo <= 1) return null;
  return pred.probabilities[key] - 1 / mo;
}

function confColor(c: number): string {
  if (c >= 0.70) return "var(--positive)";
  if (c >= 0.58) return "var(--warning)";
  return "var(--text2)";
}

function getConviction(c: number): { label: string; color: string } {
  if (c >= 0.72) return { label: "High conviction", color: "var(--positive)" };
  if (c >= 0.62) return { label: "Medium conviction", color: "var(--warning)" };
  return { label: "Standard pick", color: "var(--text2)" };
}

function getPickType(pred: MvpPrediction): { label: string; color: string } {
  const best = getBestPick(pred);
  const edge = getEdge(pred, best.key);
  const marketOdds = pred.market_odds?.[best.key] ?? pred.fair_odds[best.key] ?? 2.0;
  const hoursUntil = (new Date(pred.start_time).getTime() - Date.now()) / 3600000;
  if (hoursUntil < 2 && pred.status !== "finished") return { label: "Live Target", color: "var(--positive)" };
  if (edge !== null && edge > 0.07 && marketOdds > 1.9) return { label: "Value Pick", color: "#22d3ee" };
  if (pred.confidence >= 0.68 && marketOdds < 2.0) return { label: "Safe Play", color: "var(--warning)" };
  if (pred.confidence < 0.63 && marketOdds > 2.5) return { label: "High Odds", color: "#a855f7" };
  return { label: "Form Pick", color: "var(--accent)" };
}

const DRIVER_SENTENCES: Record<string, (val: number | null, home: string, away: string) => string> = {
  elo_diff:      (v, h, a) => v !== null ? `+${Math.abs(Math.round(v))} ELO gap favours ${v > 0 ? h : a}` : `ELO gap favours ${h}`,
  elo_home:      (v, h)    => v !== null ? `+${Math.round(v)} ELO edge for ${h}` : `ELO edge for ${h}`,
  elo_away:      (v, _, a) => v !== null ? `+${Math.round(v)} ELO edge for ${a}` : `ELO edge for ${a}`,
  form_home:     (_, h)    => `${h} in strong recent form`,
  form_away:     (_, __, a)=> `${a} in strong recent form`,
  h2h_wins_home: (v, h)    => v !== null ? `${h} won ${Math.round(v * 100)}% of recent H2H meetings` : `Historical H2H favours ${h}`,
  rest_days:     ()        => `Rest advantage in play`,
  surface_advantage: ()    => `Surface conditions favour the pick`,
};

function getTopDriverSentence(pred: MvpPrediction): string | null {
  const home = pred.participants.home.name.split(" ").slice(-1)[0];
  const away = pred.participants.away.name.split(" ").slice(-1)[0];
  const top = pred.key_drivers.find((d) => d.importance > 0.05);
  if (!top) return null;
  const fn = DRIVER_SENTENCES[top.feature];
  return fn ? fn(top.value, home, away) : top.feature.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildQueueItem(pred: MvpPrediction, best: ReturnType<typeof getBestPick>) {
  const marketOdds = pred.market_odds?.[best.key];
  const fairOdds = pred.fair_odds[best.key];
  return {
    id: `pred:${pred.event_id}:${best.key}`,
    matchId: pred.event_id,
    matchLabel: `${pred.participants.home.name} vs ${pred.participants.away.name}`,
    sport: pred.sport as SportSlug,
    league: pred.league,
    marketId: "1x2",
    marketName: "Match Result",
    selectionId: best.key,
    selectionLabel: best.label,
    odds: marketOdds ?? fairOdds ?? 2.0,
    startTime: pred.start_time,
    addedAt: new Date().toISOString(),
  };
}

// ── Live Now Strip ─────────────────────────────────────────────────────────────

function LiveNowStrip({ matches }: { matches: LiveMatchOut[] }) {
  if (!matches.length) return null;
  return (
    <div className="px-4 lg:px-6 py-2.5 border-b" style={{ borderColor: "var(--border0)" }}>
      <div className="flex items-center gap-3 overflow-x-auto pb-0.5 scrollbar-hide">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--positive)" }} />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--positive)" }}>Live</span>
        </div>
        {matches.map((m) => {
          const cfg = SPORT_CONFIG[m.sport as SportSlug] ?? SPORT_CONFIG.soccer;
          const hasScore = m.home_score !== null && m.away_score !== null;
          return (
            <div key={m.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border flex-shrink-0 text-xs" style={{ background: "rgba(255,255,255,0.03)", borderColor: `${cfg.color}25` }}>
              <span className="text-sm">{cfg.icon}</span>
              <span className="text-text-primary font-semibold whitespace-nowrap">
                {m.home_name} {hasScore ? <><span style={{ color: "var(--positive)" }}>{m.home_score}–{m.away_score}</span></> : "vs"} {m.away_name}
              </span>
              {m.live_clock && <span className="text-[10px] font-bold" style={{ color: "var(--positive)" }}>{m.live_clock}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Status Line ────────────────────────────────────────────────────────────────

function StatusLine({ predsCount, pendingCount, liveCount }: { predsCount: number; pendingCount: number; liveCount: number }) {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="flex items-center gap-1.5 text-sm text-text-muted">
        <Clock size={13} />
        {today}
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        {predsCount > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: "rgba(54,242,143,0.12)", color: "var(--positive)", border: "1px solid rgba(54,242,143,0.2)" }}>
            {predsCount} pick{predsCount !== 1 ? "s" : ""} ready
          </span>
        )}
        {pendingCount > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: "rgba(251,191,36,0.12)", color: "var(--warning)", border: "1px solid rgba(251,191,36,0.2)" }}>
            {pendingCount} pending
          </span>
        )}
        {liveCount > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: "rgba(34,226,131,0.08)", color: "var(--positive)", border: "1px solid rgba(34,226,131,0.18)" }}>
            <span className="w-1 h-1 rounded-full animate-pulse inline-block" style={{ background: "var(--positive)" }} />
            {liveCount} live
          </span>
        )}
      </div>
    </div>
  );
}

// ── Today's Best Pick (Hero) ───────────────────────────────────────────────────

function HeroPickCard({ prediction: pred, performance }: { prediction: MvpPrediction; performance: MvpPerformance | null }) {
  const { addToQueue, isInQueue } = useBetting();
  const best = getBestPick(pred);
  const edge = getEdge(pred, best.key);
  const cfg = SPORT_CONFIG[pred.sport as SportSlug] ?? SPORT_CONFIG.soccer;
  const confPct = Math.round(pred.confidence * 100);
  const col = confColor(pred.confidence);
  const conviction = getConviction(pred.confidence);
  const queueId = `pred:${pred.event_id}:${best.key}`;
  const inQueue = isInQueue(queueId);
  const marketOdds = pred.market_odds?.[best.key];

  // Trust anchor: live model accuracy for this sport
  const sportModel = performance?.models.find((m) => m.sport === pred.sport && m.is_live && m.accuracy !== null);
  const modelAccuracy = sportModel?.accuracy ? Math.round(sportModel.accuracy * 100) : null;
  const modelPreds = sportModel?.n_predictions;

  const probs = [
    { label: pred.participants.home.name.split(" ").slice(-1)[0], val: Math.round(pred.probabilities.home_win * 100) },
    ...(pred.sport === "soccer" ? [{ label: "Draw", val: Math.round(pred.probabilities.draw * 100) }] : []),
    { label: pred.participants.away.name.split(" ").slice(-1)[0], val: Math.round(pred.probabilities.away_win * 100) },
  ];

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${cfg.color}0f 0%, rgba(255,255,255,0.02) 60%)`, borderColor: `${cfg.color}30` }}
    >
      {/* Label bar */}
      <div className="flex items-center justify-between px-5 py-2 border-b" style={{ borderColor: `${cfg.color}18`, background: `${cfg.color}08` }}>
        <div className="flex items-center gap-2 text-[11px]">
          <span>{cfg.icon}</span>
          <span className="font-bold uppercase tracking-wider" style={{ color: cfg.color }}>{cfg.label}</span>
          <span className="text-text-muted">·</span>
          <span className="text-text-muted truncate max-w-[180px]">{pred.league}</span>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: conviction.color, background: `${conviction.color}18`, border: `1px solid ${conviction.color}28` }}>
          {conviction.label}
        </span>
      </div>

      <div className="px-5 pt-4 pb-5 space-y-4">
        {/* Teams + trust anchor */}
        <div>
          <h2 className="text-xl font-extrabold text-text-primary leading-tight">
            {pred.participants.home.name}
            <span className="text-text-muted font-normal text-lg"> vs </span>
            {pred.participants.away.name}
          </h2>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-text-muted flex items-center gap-1"><Clock size={11} />{formatKickoff(pred.start_time)}</span>
            {modelAccuracy !== null && (
              <span className="text-xs" style={{ color: "var(--text2)" }}>
                Model: <span className="font-semibold" style={{ color: confColor(modelAccuracy / 100) }}>{modelAccuracy}% accurate</span>
                {modelPreds ? ` on ${modelPreds.toLocaleString()} ${pred.sport} predictions` : ` on ${pred.sport}`}
              </span>
            )}
          </div>
        </div>

        {/* Pick + confidence bar */}
        <div className="rounded-xl p-3.5 space-y-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border0)" }}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-text-muted">Model recommends</span>
              <p className="text-base font-bold text-text-primary mt-0.5">{best.label}</p>
            </div>
            <span className="text-2xl font-black tabular-nums" style={{ color: col }}>{confPct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${confPct}%`, background: `linear-gradient(90deg, ${cfg.color}, var(--accent))` }} />
          </div>
          <div className="flex items-center gap-3 pt-0.5 text-[11px] text-text-muted flex-wrap">
            {probs.map(({ label, val }) => (
              <span key={label}><span className="font-semibold text-text-primary">{val}%</span> {label}</span>
            ))}
          </div>
        </div>

        {/* Odds + edge */}
        {(marketOdds || edge !== null) && (
          <div className="flex items-center gap-3 text-sm flex-wrap">
            {marketOdds && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border0)" }}>
                <span className="text-text-muted text-xs">Market odds</span>
                <span className="font-bold text-text-primary tabular-nums">{marketOdds.toFixed(2)}</span>
              </div>
            )}
            {edge !== null && edge > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: "rgba(34,226,131,0.08)", border: "1px solid rgba(34,226,131,0.2)" }}>
                <TrendingUp size={13} style={{ color: "var(--positive)" }} />
                <span className="font-bold tabular-nums" style={{ color: "var(--positive)" }}>+{(edge * 100).toFixed(1)}% edge vs market</span>
              </div>
            )}
            {edge !== null && edge <= 0 && marketOdds && (
              <span className="text-xs text-text-muted">No market edge — confidence-based pick</span>
            )}
          </div>
        )}

        {/* CTA row */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => addToQueue(buildQueueItem(pred, best))}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex-shrink-0"
            style={inQueue
              ? { background: "rgba(34,226,131,0.15)", color: "var(--positive)", border: "1px solid rgba(34,226,131,0.3)" }
              : { background: "var(--accent)", color: "#0f2418" }
            }
          >
            {inQueue ? <><Activity size={14} /> Tailed</> : <><Zap size={14} /> Tail This Pick</>}
          </button>
          <Link
            href={`/sports/${pred.sport}/matches/${pred.event_id}`}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border text-text-muted hover:text-text-primary transition-colors"
            style={{ borderColor: "var(--border0)" }}
          >
            Why this pick <ChevronRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Pick Card (Today's Intel grid) ────────────────────────────────────────────

function PickCard({ prediction: pred }: { prediction: MvpPrediction }) {
  const { addToQueue, isInQueue } = useBetting();
  const best = getBestPick(pred);
  const edge = getEdge(pred, best.key);
  const cfg = SPORT_CONFIG[pred.sport as SportSlug] ?? SPORT_CONFIG.soccer;
  const confPct = Math.round(pred.confidence * 100);
  const col = confColor(pred.confidence);
  const pickType = getPickType(pred);
  const driverLine = getTopDriverSentence(pred);
  const queueId = `pred:${pred.event_id}:${best.key}`;
  const inQueue = isInQueue(queueId);
  const marketOdds = pred.market_odds?.[best.key];
  const displayOdds = marketOdds ?? pred.fair_odds[best.key];

  return (
    <div className="rounded-2xl border flex flex-col overflow-hidden transition-all hover:border-white/10" style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--border0)" }}>
      {/* Type badge + sport */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-1.5">
          <span>{cfg.icon}</span>
          <span className="text-[10px] font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
        </div>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${pickType.color}15`, color: pickType.color }}>
          {pickType.label}
        </span>
      </div>

      {/* Teams */}
      <div className="px-4 flex-1">
        <p className="text-sm font-bold text-text-primary leading-tight line-clamp-1">
          {pred.participants.home.name} <span className="text-text-muted font-normal">vs</span> {pred.participants.away.name}
        </p>
        <p className="text-[11px] text-text-muted mt-0.5 truncate">{formatKickoff(pred.start_time)}</p>

        {/* Pick + bar */}
        <div className="mt-3 mb-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-text-muted">
              Pick: <span className="text-text-primary font-semibold">{best.label}</span>
            </span>
            {edge !== null && edge > 0 ? (
              <span className="text-[10px] font-bold" style={{ color: "var(--positive)" }}>+{(edge * 100).toFixed(1)}%</span>
            ) : (
              <span className="text-[10px] font-bold tabular-nums" style={{ color: col }}>{confPct}%</span>
            )}
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
            <div className="h-full rounded-full" style={{ width: `${confPct}%`, background: col }} />
          </div>
        </div>

        {/* Driver line */}
        {driverLine && (
          <p className="text-[11px] text-text-muted mt-2 mb-1 italic line-clamp-1">{driverLine}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 mt-2 border-t" style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.02)" }}>
        <span className="text-sm font-bold text-text-primary tabular-nums">
          {displayOdds ? displayOdds.toFixed(2) : "—"}
        </span>
        <button
          onClick={() => addToQueue(buildQueueItem(pred, best))}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all"
          style={inQueue
            ? { background: "rgba(34,226,131,0.12)", color: "var(--positive)", border: "1px solid rgba(34,226,131,0.2)" }
            : { background: "var(--accent)", color: "#0f2418" }
          }
        >
          {inQueue ? "✓ Tailed" : <><Zap size={10} /> Tail</>}
        </button>
      </div>
    </div>
  );
}

// ── Your Edge (stats) ──────────────────────────────────────────────────────────

function YourEdgeCard({ stats }: { stats: PicksStatsOut | null }) {
  if (!stats || stats.total === 0) {
    return (
      <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--border0)" }}>
        <div className="flex items-center gap-2">
          <BarChart3 size={14} style={{ color: "var(--accent)" }} />
          <span className="text-xs font-bold text-text-primary">Your Edge</span>
        </div>
        <p className="text-xs text-text-muted leading-relaxed flex-1">
          Track your picks to see your win rate, ROI, and edge against the market — all in one place.
        </p>
        <Link href="/record" className="text-center py-2.5 rounded-xl text-xs font-bold" style={{ background: "var(--accent)", color: "#0f2418" }}>
          Start Tracking
        </Link>
      </div>
    );
  }

  const winPct = stats.settled > 0 ? Math.round((stats.won / stats.settled) * 100) : 0;
  const roiPos = stats.roi >= 0;
  const roiPct = (stats.roi * 100).toFixed(1);

  const tiles = [
    { label: "Win Rate", value: stats.settled > 0 ? `${winPct}%` : "—", color: winPct >= 60 ? "var(--positive)" : winPct >= 50 ? "var(--warning)" : "var(--text1)" },
    { label: "ROI", value: stats.settled > 0 ? `${roiPos ? "+" : ""}${roiPct}%` : "—", color: roiPos ? "var(--positive)" : "var(--negative)" },
    { label: "Settled", value: String(stats.settled), color: "var(--text0)" },
    { label: "Pending", value: String(stats.pending), color: stats.pending > 0 ? "var(--warning)" : "var(--text2)" },
  ];

  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--border0)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} style={{ color: "var(--accent)" }} />
          <span className="text-xs font-bold text-text-primary">Your Edge</span>
        </div>
        <Link href="/record" className="text-[11px] text-text-muted hover:text-text-primary flex items-center gap-0.5">
          Full record <ChevronRight size={11} />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map(({ label, value, color }) => (
          <div key={label} className="rounded-xl px-3 py-2.5 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border0)" }}>
            <p className="text-[9px] uppercase tracking-wider text-text-muted mb-0.5">{label}</p>
            <p className="text-base font-bold tabular-nums" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Live Challenge ─────────────────────────────────────────────────────────────

function LiveChallengeCard({ challenges }: { challenges: Challenge[] }) {
  const active = challenges.find((c) => c.is_member && new Date(c.end_at) > new Date());

  if (!active) {
    return (
      <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--border0)" }}>
        <div className="flex items-center gap-2">
          <Trophy size={14} style={{ color: "var(--warning)" }} />
          <span className="text-xs font-bold text-text-primary">Live Challenges</span>
        </div>
        <p className="text-xs text-text-muted leading-relaxed flex-1">
          Compete against other members. Pick the most accurate predictions and climb the leaderboard this week.
        </p>
        <Link href="/challenges" className="text-center py-2.5 rounded-xl text-xs font-bold transition-all" style={{ background: "rgba(251,191,36,0.12)", color: "var(--warning)", border: "1px solid rgba(251,191,36,0.22)" }}>
          Browse Challenges →
        </Link>
      </div>
    );
  }

  const daysLeft = Math.max(0, Math.ceil((new Date(active.end_at).getTime() - Date.now()) / 86400000));
  const sportsLabel = active.sport_scope.slice(0, 2).join(", ") || "All sports";

  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: "rgba(251,191,36,0.04)", borderColor: "rgba(251,191,36,0.18)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={14} style={{ color: "var(--warning)" }} />
          <span className="text-xs font-bold text-text-primary">Live Challenge</span>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(251,191,36,0.15)", color: "var(--warning)" }}>
          {daysLeft}d left
        </span>
      </div>
      <div>
        <p className="text-sm font-bold text-text-primary leading-tight truncate">{active.name}</p>
        <p className="text-[11px] text-text-muted mt-0.5 capitalize">{sportsLabel} · {active.member_count} competitor{active.member_count !== 1 ? "s" : ""}</p>
      </div>
      <div className="flex gap-2">
        <Link href={`/challenges/${active.id}`} className="flex-1 text-center py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: "rgba(251,191,36,0.25)", color: "var(--warning)" }}>
          View Standing
        </Link>
        <Link href="/predictions" className="flex-1 text-center py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1" style={{ background: "var(--warning)", color: "#0f2418" }}>
          <Zap size={11} /> Make Pick
        </Link>
      </div>
    </div>
  );
}

// ── Community Tipsters ─────────────────────────────────────────────────────────

function CommunityRow({ tipsters }: { tipsters: TipsterProfile[] }) {
  const top = [...tipsters]
    .filter((t) => (t.settled_picks ?? 0) >= 3)
    .sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0))
    .slice(0, 4);

  if (!top.length) return null;

  const avatarColors = ["#22e283", "#60a5fa", "#f59e0b", "#a855f7"];
  const initials = (n: string) => n.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();

  return (
    <div className="rounded-2xl border p-4" style={{ background: "rgba(255,255,255,0.02)", borderColor: "var(--border0)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users size={13} style={{ color: "var(--accent)" }} />
          <span className="text-xs font-bold text-text-primary">Community</span>
          <span className="text-[10px] text-text-muted">— top tipsters by ROI</span>
        </div>
        <Link href="/tipsters" className="text-[11px] text-text-muted hover:text-text-primary flex items-center gap-0.5">
          All tipsters <ChevronRight size={11} />
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {top.map((t, i) => {
          const roi = (t.roi ?? 0) * 100;
          const roiPos = roi >= 0;
          const winPct = Math.round((t.overall_win_rate ?? 0) * 100);
          return (
            <div key={t.id} className="flex items-center gap-2 p-2 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border0)" }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: avatarColors[i % avatarColors.length] }}>
                {initials(t.username)}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-text-primary truncate">@{t.username}</p>
                <p className="text-[10px] font-bold" style={{ color: roiPos ? "var(--positive)" : "var(--negative)" }}>
                  {roiPos ? "+" : ""}{roi.toFixed(1)}% ROI
                </p>
                <p className="text-[10px] text-text-muted">{winPct}% win</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Model Performance Strip ────────────────────────────────────────────────────

function ModelPerformanceStrip({ performance }: { performance: MvpPerformance | null }) {
  if (!performance) return null;
  const live = performance.models.filter((m) => m.is_live && m.accuracy !== null && (m.n_predictions ?? 0) >= 20);
  if (!live.length) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap py-3 border-t" style={{ borderColor: "var(--border0)" }}>
      <span className="text-[10px] uppercase tracking-wider text-text-muted font-bold flex-shrink-0">Model accuracy</span>
      {live.map((m) => {
        const pct = Math.round((m.accuracy ?? 0) * 100);
        const cfg = SPORT_CONFIG[m.sport as SportSlug];
        return (
          <span key={m.sport} className="flex items-center gap-1 text-[11px]">
            {cfg && <span>{cfg.icon}</span>}
            <span className="text-text-muted capitalize">{m.sport}</span>
            <span className="font-bold tabular-nums" style={{ color: confColor(m.accuracy ?? 0) }}>{pct}%</span>
          </span>
        );
      })}
    </div>
  );
}

// ── Skeletons ──────────────────────────────────────────────────────────────────

function Sk({ className }: { className?: string }) {
  return <div className={cn("rounded-xl animate-pulse", className)} style={{ background: "rgba(255,255,255,0.05)" }} />;
}

function DashboardSkeleton() {
  return (
    <div className="px-4 lg:px-6 pt-5 pb-8 space-y-5">
      <Sk className="h-6 w-64" />
      <Sk className="h-56 w-full" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[0,1,2,3].map((i) => <Sk key={i} className="h-40" />)}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Sk className="h-36" /><Sk className="h-36" />
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────────

function EmptyPicks() {
  return (
    <div className="rounded-2xl border p-10 flex flex-col items-center gap-4 text-center" style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.02)" }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(54,242,143,0.1)", border: "1px solid rgba(54,242,143,0.2)" }}>
        <Target size={22} style={{ color: "var(--accent)" }} />
      </div>
      <div>
        <p className="text-sm font-bold text-text-primary mb-1">No picks ready yet today</p>
        <p className="text-xs text-text-muted max-w-xs">AI models update throughout the day. Check back soon or browse all upcoming predictions.</p>
      </div>
      <Link href="/predictions" className="btn btn-primary text-xs px-6 py-2.5 flex items-center gap-1.5">
        <TrendingUp size={13} /> Browse All Predictions
      </Link>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export function IntelligenceDashboard() {
  const [predictions, setPredictions] = useState<MvpPrediction[]>([]);
  const [pickStats, setPickStats] = useState<PicksStatsOut | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [tipsters, setTipsters] = useState<TipsterProfile[]>([]);
  const [performance, setPerformance] = useState<MvpPerformance | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const today = new Date().toISOString().split("T")[0];
    const inTwoDays = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
    setLoading(true);
    Promise.allSettled([
      getPredictions({ date_from: today, date_to: inTwoDays, limit: 12 }),
      getPicksStats().catch(() => null),
      getChallenges({ mine: true }).catch(() => []),
      getTipsters(),
      getPerformance().catch(() => null),
    ]).then(([predsR, statsR, chalR, tipsR, perfR]) => {
      if (predsR.status === "fulfilled") setPredictions(predsR.value.items);
      if (statsR.status === "fulfilled") setPickStats(statsR.value);
      if (chalR.status === "fulfilled") setChallenges(chalR.value as Challenge[]);
      if (tipsR.status === "fulfilled") setTipsters(tipsR.value);
      if (perfR.status === "fulfilled") setPerformance(perfR.value);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <DashboardSkeleton />;

  const sorted = [...predictions].sort((a, b) => {
    if (a.status === "live" && b.status !== "live") return -1;
    if (b.status === "live" && a.status !== "live") return 1;
    return b.confidence - a.confidence;
  });

  const potd = sorted[0];
  const rest = sorted.slice(1, 5); // max 4

  return (
    <div className="pb-8">
      <div className="px-4 lg:px-6 pt-4 pb-6 space-y-5">
        {/* Status line */}
        <StatusLine
          predsCount={sorted.length}
          pendingCount={pickStats?.pending ?? 0}
          liveCount={0}
        />

        {/* Hero pick */}
        {potd
          ? <HeroPickCard prediction={potd} performance={performance} />
          : <EmptyPicks />
        }

        {/* Today's Intel grid */}
        {rest.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">Today&apos;s Intel</h2>
              <Link href="/predictions" className="text-[11px] text-text-muted hover:text-text-primary flex items-center gap-0.5">
                View all <ChevronRight size={11} />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {rest.map((p) => <PickCard key={p.event_id} prediction={p} />)}
            </div>
          </div>
        )}

        {/* Your Edge + Live Challenge — side by side */}
        <div className="grid sm:grid-cols-2 gap-4">
          <YourEdgeCard stats={pickStats} />
          <LiveChallengeCard challenges={challenges} />
        </div>

        {/* Community row */}
        <CommunityRow tipsters={tipsters} />

        {/* Model accuracy footer */}
        <ModelPerformanceStrip performance={performance} />
      </div>
    </div>
  );
}
