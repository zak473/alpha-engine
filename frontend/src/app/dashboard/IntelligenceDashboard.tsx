"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Zap, ChevronRight, Trophy, TrendingUp, Users,
  Clock, Target, BarChart3, Flame, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SPORT_CONFIG } from "@/lib/betting-types";
import type { SportSlug } from "@/lib/betting-types";
import { useBetting } from "@/components/betting/BettingContext";
import {
  getPredictions, getLiveMatches, getPicksStats, getChallenges, getTipsters,
  type LiveMatchOut, type PicksStatsOut, type TipsterProfile,
} from "@/lib/api";
import type { MvpPrediction, Challenge } from "@/lib/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

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
  if (c >= 0.7) return "var(--positive)";
  if (c >= 0.58) return "var(--warning)";
  return "var(--text2)";
}

const FEATURE_LABELS: Record<string, string> = {
  elo_diff: "ELO differential", elo_home: "Home ELO edge",
  elo_away: "Away ELO strength", form_home: "Recent home form",
  form_away: "Recent away form", h2h_wins_home: "H2H record",
  odds_home_log: "Market lean (home)", odds_away_log: "Market lean (away)",
  surface_advantage: "Surface advantage", rest_days: "Rest advantage",
};

function fmtFeature(name: string): string {
  return FEATURE_LABELS[name] ??
    name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Live Now Strip ─────────────────────────────────────────────────────────────

function LiveNowStrip({ matches }: { matches: LiveMatchOut[] }) {
  if (!matches.length) return null;
  return (
    <div className="px-4 lg:px-6 py-3 border-b" style={{ borderColor: "var(--border0)" }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--positive)" }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--positive)" }}>Live Now</span>
        <span className="text-[11px] text-text-muted">{matches.length} match{matches.length !== 1 ? "es" : ""}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {matches.map((m) => {
          const cfg = SPORT_CONFIG[m.sport as SportSlug] ?? SPORT_CONFIG.soccer;
          const hasScore = m.home_score !== null && m.away_score !== null;
          return (
            <div
              key={m.id}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs"
              style={{
                background: "rgba(255,255,255,0.04)",
                borderColor: `rgba(${cfg.color.replace(/[^0-9,]/g, "")},0.2)`,
                minWidth: 170,
              }}
            >
              <span>{cfg.icon}</span>
              <div className="min-w-0">
                <p className="text-text-primary font-semibold truncate">
                  {m.home_name} {hasScore ? `${m.home_score}–${m.away_score}` : "vs"} {m.away_name}
                </p>
                {m.live_clock && (
                  <p className="text-[10px] font-bold" style={{ color: "var(--positive)" }}>{m.live_clock}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Pick of the Day Card ───────────────────────────────────────────────────────

function PickOfTheDayCard({ prediction: pred }: { prediction: MvpPrediction }) {
  const { addToQueue, isInQueue } = useBetting();
  const best = getBestPick(pred);
  const edge = getEdge(pred, best.key);
  const cfg = SPORT_CONFIG[pred.sport as SportSlug] ?? SPORT_CONFIG.soccer;
  const confPct = Math.round(pred.confidence * 100);
  const col = confColor(pred.confidence);
  const queueId = `pred:${pred.event_id}:${best.key}`;
  const inQueue = isInQueue(queueId);
  const marketOdds = pred.market_odds?.[best.key];
  const fairOddsVal = pred.fair_odds[best.key];
  const topDrivers = pred.key_drivers.filter((d) => d.importance > 0.05).slice(0, 3);

  function handleQueue() {
    addToQueue({
      id: queueId,
      matchId: pred.event_id,
      matchLabel: `${pred.participants.home.name} vs ${pred.participants.away.name}`,
      sport: pred.sport as SportSlug,
      league: pred.league,
      marketId: "1x2",
      marketName: "Match Result",
      selectionId: best.key,
      selectionLabel: best.label,
      odds: marketOdds ?? fairOddsVal ?? 2.0,
      startTime: pred.start_time,
      addedAt: new Date().toISOString(),
    });
  }

  return (
    <div
      className="rounded-2xl border overflow-hidden relative"
      style={{
        background: `linear-gradient(135deg, ${cfg.color}0d 0%, rgba(255,255,255,0.02) 100%)`,
        borderColor: `${cfg.color}33`,
      }}
    >
      {/* Top label */}
      <div
        className="flex items-center gap-2 px-5 py-2 border-b"
        style={{ borderColor: `${cfg.color}22`, background: `${cfg.color}0a` }}
      >
        <Flame size={12} style={{ color: cfg.color }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: cfg.color }}>
          AI Pick of the Day
        </span>
        <span className="ml-auto text-[10px] text-text-muted">{cfg.icon} {cfg.label} · {pred.league}</span>
      </div>

      <div className="px-5 pt-4 pb-5">
        {/* Teams + time */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-extrabold text-text-primary leading-tight">
              {pred.participants.home.name}
              <span className="text-text-muted font-normal"> vs </span>
              {pred.participants.away.name}
            </h2>
            <p className="text-xs text-text-muted mt-1 flex items-center gap-1">
              <Clock size={11} />
              {formatKickoff(pred.start_time)}
            </p>
          </div>
          {/* Confidence ring */}
          <div className="flex-shrink-0 text-center px-3 py-2 rounded-xl" style={{ background: `${col}15`, border: `1px solid ${col}30` }}>
            <p className="text-2xl font-black tabular-nums" style={{ color: col }}>{confPct}%</p>
            <p className="text-[9px] uppercase tracking-widest text-text-muted">Confidence</p>
          </div>
        </div>

        {/* Recommendation bar */}
        <div
          className="rounded-xl p-3 mb-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border0)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-muted uppercase tracking-wider">Model recommends</span>
            {edge !== null && edge > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(34,226,131,0.12)", color: "var(--positive)" }}>
                +{(edge * 100).toFixed(1)}% edge
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-base font-bold text-text-primary flex-shrink-0">{best.label}</p>
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.round(best.prob * 100)}%`, background: `linear-gradient(90deg, ${cfg.color}, var(--accent))` }}
              />
            </div>
            <span className="text-sm font-bold flex-shrink-0" style={{ color: col }}>{Math.round(best.prob * 100)}%</span>
          </div>
        </div>

        {/* Odds row */}
        {(fairOddsVal || marketOdds) && (
          <div className="flex items-center gap-3 mb-4 text-xs">
            {fairOddsVal && (
              <div className="flex flex-col items-center px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border0)" }}>
                <span className="text-text-muted text-[9px] uppercase tracking-wider mb-0.5">Fair</span>
                <span className="font-bold text-text-primary tabular-nums">{fairOddsVal.toFixed(2)}</span>
              </div>
            )}
            {marketOdds && (
              <div className="flex flex-col items-center px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border0)" }}>
                <span className="text-text-muted text-[9px] uppercase tracking-wider mb-0.5">Market</span>
                <span className="font-bold text-text-primary tabular-nums">{marketOdds.toFixed(2)}</span>
              </div>
            )}
            <div className="h-8 w-px mx-1" style={{ background: "var(--border0)" }} />
            <div className="flex gap-2 flex-wrap">
              {[
                { label: pred.participants.home.name, pct: Math.round(pred.probabilities.home_win * 100) },
                ...(pred.sport === "soccer" ? [{ label: "Draw", pct: Math.round(pred.probabilities.draw * 100) }] : []),
                { label: pred.participants.away.name, pct: Math.round(pred.probabilities.away_win * 100) },
              ].map(({ label, pct }) => (
                <span key={label} className="text-text-muted">
                  <span className="text-text-primary font-semibold">{pct}%</span> {label.split(" ").pop()}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Key drivers */}
        {topDrivers.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-4">
            {topDrivers.map((d) => (
              <span key={d.feature} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}22` }}>
                {fmtFeature(d.feature)}
              </span>
            ))}
          </div>
        )}

        {/* CTA row */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleQueue}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={inQueue
              ? { background: "rgba(34,226,131,0.15)", color: "var(--positive)", border: "1px solid rgba(34,226,131,0.25)" }
              : { background: "var(--accent)", color: "#0f2418" }
            }
          >
            {inQueue ? <><Activity size={14} /> In Queue</> : <><Zap size={14} /> Add to Queue</>}
          </button>
          <Link
            href={`/sports/${pred.sport}/matches/${pred.event_id}`}
            className="flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-text-muted hover:text-text-primary transition-colors border"
            style={{ borderColor: "var(--border0)" }}
          >
            Full Analysis <ChevronRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Standard Pick Card ─────────────────────────────────────────────────────────

function PickCard({ prediction: pred }: { prediction: MvpPrediction }) {
  const { addToQueue, isInQueue } = useBetting();
  const best = getBestPick(pred);
  const edge = getEdge(pred, best.key);
  const cfg = SPORT_CONFIG[pred.sport as SportSlug] ?? SPORT_CONFIG.soccer;
  const confPct = Math.round(pred.confidence * 100);
  const col = confColor(pred.confidence);
  const queueId = `pred:${pred.event_id}:${best.key}`;
  const inQueue = isInQueue(queueId);
  const marketOdds = pred.market_odds?.[best.key];
  const fairOddsVal = pred.fair_odds[best.key];

  function handleQueue() {
    addToQueue({
      id: queueId,
      matchId: pred.event_id,
      matchLabel: `${pred.participants.home.name} vs ${pred.participants.away.name}`,
      sport: pred.sport as SportSlug,
      league: pred.league,
      marketId: "1x2",
      marketName: "Match Result",
      selectionId: best.key,
      selectionLabel: best.label,
      odds: marketOdds ?? fairOddsVal ?? 2.0,
      startTime: pred.start_time,
      addedAt: new Date().toISOString(),
    });
  }

  return (
    <div
      className="rounded-2xl border flex flex-col overflow-hidden hover:border-opacity-50 transition-all"
      style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--border0)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{cfg.icon}</span>
          <span className="text-[11px] font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
        </div>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: col }}>{confPct}%</span>
      </div>

      {/* Teams */}
      <div className="px-4 pb-3 flex-1">
        <p className="text-sm font-bold text-text-primary leading-tight line-clamp-1">
          {pred.participants.home.name} <span className="text-text-muted font-normal">vs</span> {pred.participants.away.name}
        </p>
        <p className="text-[11px] text-text-muted mt-0.5 truncate">{formatKickoff(pred.start_time)}</p>

        {/* Confidence bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-text-muted">Pick: <span className="text-text-primary font-semibold">{best.label}</span></span>
            {edge !== null && edge > 0 && (
              <span className="text-[10px] font-semibold" style={{ color: "var(--positive)" }}>+{(edge * 100).toFixed(1)}%</span>
            )}
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-full rounded-full" style={{ width: `${confPct}%`, background: col }} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-t"
        style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.02)" }}
      >
        <span className="text-xs font-bold text-text-primary tabular-nums">
          {(marketOdds ?? fairOddsVal)?.toFixed(2) ?? "—"}
        </span>
        <button
          onClick={handleQueue}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all"
          style={inQueue
            ? { background: "rgba(34,226,131,0.12)", color: "var(--positive)" }
            : { background: "var(--accent)", color: "#0f2418" }
          }
        >
          {inQueue ? "✓" : <Zap size={10} />}
          {inQueue ? "Added" : "Queue"}
        </button>
      </div>
    </div>
  );
}

// ── Personal Stats Bar ─────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: PicksStatsOut | null }) {
  if (!stats) {
    return (
      <div className="rounded-2xl border p-4 flex flex-col justify-between" style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--border0)" }}>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={14} style={{ color: "var(--accent)" }} />
          <span className="text-xs font-bold text-text-primary">Your Record</span>
        </div>
        <p className="text-xs text-text-muted">
          <Link href="/picks" className="text-accent underline underline-offset-2 hover:opacity-80">Log in</Link> to track your picks and see your performance here.
        </p>
        <Link href="/picks" className="mt-3 text-center py-2 rounded-xl text-xs font-bold" style={{ background: "var(--accent)", color: "#0f2418" }}>
          Track Picks
        </Link>
      </div>
    );
  }

  const roiPositive = stats.roi >= 0;
  const winPct = stats.settled > 0 ? Math.round((stats.won / stats.settled) * 100) : 0;

  const metrics = [
    { label: "Win Rate", value: stats.settled > 0 ? `${winPct}%` : "—", color: winPct >= 60 ? "var(--positive)" : winPct >= 50 ? "var(--warning)" : "var(--text1)" },
    { label: "ROI", value: stats.settled > 0 ? `${roiPositive ? "+" : ""}${(stats.roi * 100).toFixed(1)}%` : "—", color: roiPositive ? "var(--positive)" : "var(--negative)" },
    { label: "Picks", value: String(stats.total), color: "var(--text0)" },
    { label: "Pending", value: String(stats.pending), color: "var(--warning)" },
  ];

  return (
    <div className="rounded-2xl border p-4 flex flex-col" style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--border0)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} style={{ color: "var(--accent)" }} />
          <span className="text-xs font-bold text-text-primary">Your Record</span>
        </div>
        <Link href="/picks" className="text-[11px] text-text-muted hover:text-text-primary transition-colors flex items-center gap-0.5">
          View all <ChevronRight size={11} />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 flex-1">
        {metrics.map(({ label, value, color }) => (
          <div key={label} className="rounded-xl px-3 py-2.5 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border0)" }}>
            <p className="text-[9px] uppercase tracking-wider text-text-muted mb-0.5">{label}</p>
            <p className="text-base font-bold tabular-nums" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Challenge Card ─────────────────────────────────────────────────────────────

function ChallengeCard({ challenges }: { challenges: Challenge[] }) {
  const active = challenges.find((c) => c.is_member && new Date(c.end_at) > new Date());

  if (!active) {
    return (
      <div className="rounded-2xl border p-4 flex flex-col" style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--border0)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={14} style={{ color: "var(--warning)" }} />
          <span className="text-xs font-bold text-text-primary">Challenges</span>
        </div>
        <p className="text-xs text-text-muted flex-1 mb-3">
          Compete against other tipsters. Pick the most accurate predictions and climb the leaderboard.
        </p>
        <Link href="/challenges" className="text-center py-2.5 rounded-xl text-xs font-bold transition-all" style={{ background: "rgba(251,191,36,0.15)", color: "var(--warning)", border: "1px solid rgba(251,191,36,0.25)" }}>
          Browse Challenges →
        </Link>
      </div>
    );
  }

  const now = new Date();
  const end = new Date(active.end_at);
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
  const sports = active.sport_scope.slice(0, 3).join(", ");

  return (
    <div className="rounded-2xl border p-4 flex flex-col" style={{ background: "rgba(251,191,36,0.04)", borderColor: "rgba(251,191,36,0.18)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Trophy size={14} style={{ color: "var(--warning)" }} />
          <span className="text-xs font-bold text-text-primary">Active Challenge</span>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(251,191,36,0.15)", color: "var(--warning)" }}>
          {daysLeft}d left
        </span>
      </div>
      <p className="text-sm font-bold text-text-primary mb-1 truncate">{active.name}</p>
      <p className="text-[11px] text-text-muted mb-3 capitalize">{sports || "All sports"} · {active.member_count} competitor{active.member_count !== 1 ? "s" : ""}</p>
      <div className="flex gap-2 mt-auto">
        <Link
          href={`/challenges/${active.id}`}
          className="flex-1 text-center py-2 rounded-xl text-xs font-bold transition-all"
          style={{ background: "rgba(251,191,36,0.15)", color: "var(--warning)", border: "1px solid rgba(251,191,36,0.25)" }}
        >
          View Progress
        </Link>
        <Link
          href="/predictions"
          className="flex-1 text-center py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1"
          style={{ background: "var(--warning)", color: "#0f2418" }}
        >
          <Zap size={11} /> Make a Pick
        </Link>
      </div>
    </div>
  );
}

// ── Tipster Spotlight ──────────────────────────────────────────────────────────

function TipsterSpotlight({ tipsters }: { tipsters: TipsterProfile[] }) {
  const top = [...tipsters]
    .filter((t) => (t.settled_picks ?? 0) > 0)
    .sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0))
    .slice(0, 4);

  const colors = ["#22e283", "#60a5fa", "#f59e0b", "#a855f7"];
  const initials = (name: string) => name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();

  return (
    <div className="rounded-2xl border p-4 flex flex-col" style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--border0)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users size={14} style={{ color: "var(--accent)" }} />
          <span className="text-xs font-bold text-text-primary">Tipster Spotlight</span>
        </div>
        <Link href="/tipsters" className="text-[11px] text-text-muted hover:text-text-primary transition-colors flex items-center gap-0.5">
          View all <ChevronRight size={11} />
        </Link>
      </div>

      {top.length === 0 ? (
        <p className="text-xs text-text-muted flex-1 flex items-center justify-center py-4">No tipster data yet</p>
      ) : (
        <div className="flex flex-col gap-2 flex-1">
          {top.map((t, i) => {
            const winPct = Math.round((t.overall_win_rate ?? 0) * 100);
            const roi = (t.roi ?? 0) * 100;
            const roiPos = roi >= 0;
            return (
              <div key={t.id} className="flex items-center gap-3 py-1.5">
                <span className="text-sm">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}</span>
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                  style={{ background: colors[i % colors.length] }}
                >
                  {initials(t.username)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">@{t.username}</p>
                  <p className="text-[10px] text-text-muted">{t.settled_picks} picks</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold" style={{ color: winPct >= 60 ? "var(--positive)" : "var(--warning)" }}>{winPct}%</p>
                  <p className="text-[10px] font-semibold" style={{ color: roiPos ? "var(--positive)" : "var(--negative)" }}>
                    {roiPos ? "+" : ""}{roi.toFixed(1)}%
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Link
        href="/tipsters"
        className="mt-3 text-center py-2 rounded-xl text-xs font-semibold transition-colors"
        style={{ background: "rgba(255,255,255,0.04)", color: "var(--text1)", border: "1px solid var(--border0)" }}
      >
        Follow Tipsters
      </Link>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────────

function EmptyPicks() {
  return (
    <div className="col-span-full rounded-2xl border p-10 flex flex-col items-center gap-4 text-center" style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.02)" }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(54,242,143,0.1)", border: "1px solid rgba(54,242,143,0.2)" }}>
        <Target size={22} style={{ color: "var(--accent)" }} />
      </div>
      <div>
        <p className="text-sm font-bold text-text-primary mb-1">No predictions ready yet</p>
        <p className="text-xs text-text-muted max-w-xs">AI models are working on today&apos;s picks. Check back soon or explore all upcoming matches.</p>
      </div>
      <Link href="/predictions" className="btn btn-primary text-xs px-6 py-2 flex items-center gap-1.5">
        <TrendingUp size={13} /> Browse Predictions
      </Link>
    </div>
  );
}

// ── Skeleton Loader ────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl", className)} style={{ background: "rgba(255,255,255,0.05)" }} />;
}

function DashboardSkeleton() {
  return (
    <div className="px-4 pt-5 pb-8 lg:px-6 space-y-5">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-52 w-full" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export function IntelligenceDashboard() {
  const [predictions, setPredictions] = useState<MvpPrediction[]>([]);
  const [liveMatches, setLiveMatches] = useState<LiveMatchOut[]>([]);
  const [pickStats, setPickStats] = useState<PicksStatsOut | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [tipsters, setTipsters] = useState<TipsterProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const today = new Date().toISOString().split("T")[0];
    const inTwoDays = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];

    setLoading(true);
    Promise.allSettled([
      getPredictions({ date_from: today, date_to: inTwoDays, limit: 15 }),
      getLiveMatches(),
      getPicksStats().catch(() => null),
      getChallenges({ mine: true }).catch(() => []),
      getTipsters(),
    ]).then(([predsRes, liveRes, statsRes, challengesRes, tipstersRes]) => {
      if (predsRes.status === "fulfilled") setPredictions(predsRes.value.items);
      if (liveRes.status === "fulfilled") setLiveMatches(liveRes.value);
      if (statsRes.status === "fulfilled") setPickStats(statsRes.value);
      if (challengesRes.status === "fulfilled") setChallenges(challengesRes.value as Challenge[]);
      if (tipstersRes.status === "fulfilled") setTipsters(tipstersRes.value);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <DashboardSkeleton />;

  // Sort: live first, then highest confidence
  const sorted = [...predictions].sort((a, b) => {
    const aLive = a.status === "live" ? 1 : 0;
    const bLive = b.status === "live" ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    return b.confidence - a.confidence;
  });

  const potd = sorted[0];
  const rest = sorted.slice(1, 7);

  const todayStr = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="pb-12">
      <LiveNowStrip matches={liveMatches} />

      {/* Page header */}
      <div className="px-4 pt-5 pb-4 lg:px-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-extrabold text-text-primary">{getGreeting()}</h1>
            <p className="text-sm text-text-muted mt-0.5 flex items-center gap-1.5">
              <Clock size={12} /> {todayStr}
              {sorted.length > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: "rgba(54,242,143,0.12)", color: "var(--positive)" }}>
                  {sorted.length} pick{sorted.length !== 1 ? "s" : ""} ready
                </span>
              )}
            </p>
          </div>
          <Link
            href="/predictions"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-[rgba(255,255,255,0.06)]"
            style={{ borderColor: "var(--border0)", color: "var(--text1)" }}
          >
            <TrendingUp size={13} /> All Predictions
          </Link>
        </div>
      </div>

      <div className="px-4 lg:px-6 space-y-4">
        {/* Pick of the Day */}
        {potd ? (
          <PickOfTheDayCard prediction={potd} />
        ) : (
          <EmptyPicks />
        )}

        {/* Rest of today's picks grid */}
        {rest.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">More Today</h2>
              <Link href="/predictions" className="text-[11px] text-text-muted hover:text-text-primary transition-colors flex items-center gap-0.5">
                View all <ChevronRight size={11} />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((p) => <PickCard key={p.event_id} prediction={p} />)}
            </div>
          </div>
        )}

        {/* Bottom 3-col row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatsBar stats={pickStats} />
          <ChallengeCard challenges={challenges} />
          <TipsterSpotlight tipsters={tipsters} />
        </div>
      </div>
    </div>
  );
}
