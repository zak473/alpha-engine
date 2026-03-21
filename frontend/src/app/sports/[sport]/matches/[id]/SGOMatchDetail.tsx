"use client";

import { useState, useCallback, useEffect } from "react";
import { ChevronDown, ChevronUp, Timer, Flame, TrendingUp, Shield, MapPin, Cloud, Users, Sparkles, Loader2 } from "lucide-react";
import { getMatchReasoning, getMatchReasoningPreview } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SportSlug, Market, Selection } from "@/lib/betting-types";
import { SPORT_CONFIG } from "@/lib/betting-types";
import { useBetting } from "@/components/betting/BettingContext";
import { sgoEventToMatch } from "@/lib/sgo";
import type { SGOEvent, SGOTeamStats, SGOPlayer } from "@/lib/sgo";
import type { SportMatchDetail } from "@/lib/types";
import type { EloPoint } from "@/app/sports/_lib/fetchMatchPageData";

// ─── Odds button ──────────────────────────────────────────────────────────────

function OddsButton({ selId, selection, matchLabel, sport, league, marketId, marketName, startTime, disabled }: {
  selId: string; selection: Selection; matchLabel: string; sport: SportSlug; league: string;
  marketId: string; marketName: string; startTime: string; disabled?: boolean;
}) {
  const { addToQueue, isInQueue } = useBetting();
  const added = isInQueue(selId);
  const [flash, setFlash] = useState(false);

  const handleClick = useCallback(() => {
    if (added || disabled) return;
    addToQueue({ id: selId, matchId: selId.split(":")[0], matchLabel, sport, league, marketId, marketName,
      selectionId: selection.id, selectionLabel: selection.label, odds: selection.odds, edge: selection.edge,
      startTime, addedAt: new Date().toISOString() });
    setFlash(true);
    setTimeout(() => setFlash(false), 1400);
  }, [added, disabled, addToQueue, selId, matchLabel, sport, league, marketId, marketName, selection, startTime]);

  return (
    <button onClick={handleClick} disabled={!!disabled}
      className={cn("relative flex flex-col items-start justify-center overflow-hidden rounded-2xl border text-left transition-all duration-150 min-w-[84px] px-3 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed",
        added || flash ? "text-white" : "text-text-primary hover:-translate-y-[1px]")}
      style={added || flash ? { background: "rgba(46,219,108,0.12)", borderColor: "rgba(46,219,108,0.20)", boxShadow: "0 10px 22px rgba(46,219,108,0.10)" } : { background: "var(--bg2)", borderColor: "var(--border0)" }}>
      <span className="font-mono font-bold tabular-nums leading-tight text-sm">{flash || added ? "✓ Added" : selection.odds.toFixed(2)}</span>
      <span className="mt-0.5 max-w-full truncate leading-tight text-text-muted text-[10px]">{flash || added ? "Tracked" : selection.label}</span>
    </button>
  );
}

function MarketSection({ market, matchId, matchLabel, sport, league, startTime, isFinished }: {
  market: Market; matchId: string; matchLabel: string; sport: SportSlug; league: string; startTime: string; isFinished: boolean;
}) {
  return (
    <div className="rounded-[20px] border p-4" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{market.name}</div>
      <div className="flex flex-wrap items-center gap-2">
        {market.selections.map((sel) => (
          <OddsButton key={sel.id} selId={`${matchId}:${market.id}:${sel.id}`} selection={sel}
            matchLabel={matchLabel} sport={sport} league={league} marketId={market.id} marketName={market.name}
            startTime={startTime} disabled={isFinished} />
        ))}
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sportsbook-card p-4 space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{title}</div>
      {children}
    </div>
  );
}

function StatRow({ label, home, away }: { label: string; home: unknown; away: unknown }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border px-2.5 py-1.5" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
      <span className="text-right text-xs text-text-primary">{fmt(home)}</span>
      <span className="text-[9px] uppercase tracking-[0.14em] text-text-muted text-center min-w-[72px]">{label.replace(/_/g, " ")}</span>
      <span className="text-xs text-text-primary">{fmt(away)}</span>
    </div>
  );
}

function EloSparkline({ points, color }: { points: EloPoint[]; color: string }) {
  if (points.length < 2) return null;
  const ratings = points.map((p) => p.rating);
  const min = Math.min(...ratings); const max = Math.max(...ratings);
  const range = max - min || 1;
  const w = 100; const h = 28;
  const pts = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p.rating - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
    </svg>
  );
}

function ProbCard({ label, prob, color }: { label: string; prob: number; color: string }) {
  const pct = Math.round(prob * 100);
  return (
    <div className="rounded-xl border p-3 text-center" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
      <div className="text-[9px] uppercase tracking-[0.14em] text-text-muted mb-1 truncate">{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{pct}%</div>
      <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--bg3)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function FormPill({ result }: { result: string }) {
  const r = result?.toUpperCase();
  const style = r === "W" ? { bg: "rgba(34,197,94,0.15)", color: "#22c55e" }
    : r === "L" ? { bg: "rgba(239,68,68,0.15)", color: "#ef4444" }
    : { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" };
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold"
      style={{ background: style.bg, color: style.color }}>{r || "?"}</span>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

function ProbabilitiesSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const prob = match.probabilities;
  if (!prob) return null;
  const hasDraw = prob.draw != null && prob.draw > 0;
  return (
    <Card title="Model Prediction">
      <div className={cn("grid gap-3", hasDraw ? "grid-cols-3" : "grid-cols-2")}>
        <ProbCard label={`${homeName} win`} prob={prob.home_win} color="#22c55e" />
        {hasDraw && <ProbCard label="Draw" prob={prob.draw!} color="#f59e0b" />}
        <ProbCard label={`${awayName} win`} prob={prob.away_win} color="#a855f7" />
      </div>
      {(match.confidence != null || match.fair_odds) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {match.confidence != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <Shield size={12} /> {match.confidence}% confidence
            </span>
          )}
          {match.fair_odds?.home_win && (
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <TrendingUp size={12} /> Fair H: {match.fair_odds.home_win.toFixed(2)}
            </span>
          )}
          {match.fair_odds?.away_win && (
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <TrendingUp size={12} /> Fair A: {match.fair_odds.away_win.toFixed(2)}
            </span>
          )}
        </div>
      )}
      {match.model?.accuracy != null && (
        <div className="text-[10px] text-text-muted pt-1">
          Model accuracy: {(match.model.accuracy * 100).toFixed(1)}%
        </div>
      )}
    </Card>
  );
}

function EloSection({ match, homeName, awayName, eloHome, eloAway, cfg }: {
  match: SportMatchDetail; homeName: string; awayName: string; eloHome: EloPoint[]; eloAway: EloPoint[];
  cfg: { color: string };
}) {
  if (!match.elo_home && !match.elo_away && !eloHome.length && !eloAway.length) return null;
  return (
    <Card title="ELO Ratings">
      <div className="grid gap-3 sm:grid-cols-2">
        <EloCard name={homeName} elo={match.elo_home} history={eloHome} color={cfg.color} />
        <EloCard name={awayName} elo={match.elo_away} history={eloAway} color="#6366f1" />
      </div>
    </Card>
  );
}

function EloCard({ name, elo, history, color }: { name: string; elo: Record<string, unknown> | null | undefined; history: EloPoint[]; color: string }) {
  const rating = elo?.rating ?? elo?.overall_rating ?? elo?.surface_rating;
  const change = elo?.rating_change;
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
      <div className="text-[9px] uppercase tracking-[0.14em] text-text-muted mb-1 truncate">{name}</div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="text-xl font-bold text-text-primary">{rating != null ? Math.round(Number(rating)) : "—"}</span>
          {change != null && (
            <span className={cn("ml-2 text-xs font-semibold", Number(change) >= 0 ? "text-emerald-400" : "text-red-400")}>
              {Number(change) >= 0 ? "+" : ""}{Math.round(Number(change))}
            </span>
          )}
        </div>
        {history.length > 1 && <EloSparkline points={history} color={color} />}
      </div>
    </div>
  );
}

function ContextSection({ match }: { match: SportMatchDetail }) {
  const ctx = match.context;
  if (!ctx) return null;
  const hasData = ctx.venue_name || ctx.venue_city || ctx.attendance || ctx.weather_desc;
  if (!hasData) return null;
  return (
    <Card title="Match Info">
      <div className="grid gap-2 sm:grid-cols-2">
        {(ctx.venue_name || ctx.venue_city) && (
          <div className="flex items-start gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
            <MapPin size={13} className="mt-0.5 text-text-muted shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Venue</div>
              <div className="text-sm text-text-primary">{[ctx.venue_name, ctx.venue_city].filter(Boolean).join(", ")}</div>
            </div>
          </div>
        )}
        {ctx.attendance && (
          <div className="flex items-start gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
            <Users size={13} className="mt-0.5 text-text-muted shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Attendance</div>
              <div className="text-sm text-text-primary">{ctx.attendance.toLocaleString()}</div>
            </div>
          </div>
        )}
        {ctx.weather_desc && (
          <div className="flex items-start gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
            <Cloud size={13} className="mt-0.5 text-text-muted shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Weather</div>
              <div className="text-sm text-text-primary">
                {ctx.weather_desc}{ctx.temperature_c != null ? ` · ${ctx.temperature_c}°C` : ""}
              </div>
            </div>
          </div>
        )}
        {ctx.neutral_site && (
          <div className="flex items-start gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
            <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted mt-0.5">Neutral</div>
            <div className="text-sm text-text-primary">Neutral venue</div>
          </div>
        )}
      </div>
    </Card>
  );
}

function FormSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const fh = match.form_home as Record<string, unknown> | null | undefined;
  const fa = match.form_away as Record<string, unknown> | null | undefined;
  if (!fh && !fa) return null;

  return (
    <Card title="Recent Form">
      <div className="space-y-3">
        {[{ name: homeName, form: fh }, { name: awayName, form: fa }].map(({ name, form }) => {
          if (!form) return null;
          const results: string[] = (form.form_last_5 as string[] | undefined) ?? (form.recent_results as string[] | undefined) ?? [];
          const pts = form.form_pts ?? form.wins;
          const gf = form.goals_scored_avg ?? form.points_scored_avg ?? form.avg_runs_for ?? form.maps_won;
          const ga = form.goals_against_avg ?? form.goals_conceded_avg ?? form.points_conceded_avg ?? form.avg_runs_against;
          const xg = form.xg_avg;
          const winPct = form.win_pct ?? form.series_win_pct;

          return (
            <div key={name} className="rounded-xl border p-3" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-medium text-text-primary truncate">{name}</span>
                {winPct != null && <span className="text-[11px] font-semibold text-emerald-400">{(Number(winPct) * (Number(winPct) > 1 ? 1 : 100)).toFixed(0)}% W</span>}
              </div>
              {results.length > 0 && (
                <div className="flex items-center gap-1 mb-2">
                  {results.slice(-5).map((r, i) => <FormPill key={i} result={r} />)}
                </div>
              )}
              <div className="flex flex-wrap gap-2 text-[10px] text-text-muted">
                {pts != null && <span>Pts: <b className="text-text-primary">{fmt(pts)}</b></span>}
                {gf != null && <span>Scored avg: <b className="text-text-primary">{fmt(gf)}</b></span>}
                {ga != null && <span>Conceded avg: <b className="text-text-primary">{fmt(ga)}</b></span>}
                {xg != null && <span>xG avg: <b className="text-text-primary">{fmt(xg)}</b></span>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function KeyDriversSection({ match }: { match: SportMatchDetail }) {
  if (!match.key_drivers?.length) return null;
  return (
    <Card title="Model Drivers">
      <div className="space-y-2">
        {match.key_drivers.slice(0, 6).map((d, i) => {
          const pct = Math.round(d.importance * 100);
          return (
            <div key={`${d.feature}-${i}`} className="rounded-[18px] border p-3" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-medium text-text-primary">{d.feature}</span>
                <span className="text-[11px] font-semibold text-emerald-300">{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg3)" }}>
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
              </div>
              {d.value != null && <div className="mt-1 text-[10px] text-text-muted">Value: {fmt(d.value)}</div>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function H2HSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  if (!match.h2h) return null;
  const h2h = match.h2h as Record<string, unknown>;
  const homeWins = Number(h2h.home_wins ?? h2h.player_a_wins ?? h2h.team_a_wins ?? 0);
  const awayWins = Number(h2h.away_wins ?? h2h.player_b_wins ?? h2h.team_b_wins ?? 0);
  const draws = Number(h2h.draws ?? 0);
  const recent = (h2h.recent_matches as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <Card title="Head to Head">
      <div className="grid grid-cols-3 gap-3 text-center">
        {[{ label: homeName, value: homeWins, color: "#22c55e" }, { label: "Draws", value: draws, color: "#f59e0b" }, { label: awayName, value: awayWins, color: "#a855f7" }].map(({ label, value, color }) => (
          <div key={label} className="rounded-[20px] border p-3" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
            <div className="text-xl font-bold" style={{ color }}>{value}</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted mt-1 truncate">{label}</div>
          </div>
        ))}
      </div>
      {recent.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-text-muted">Recent meetings</div>
          {recent.slice(0, 5).map((m, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <span className="text-text-muted text-[11px]">{m.date ? new Date(String(m.date)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}</span>
              <span className="font-mono font-semibold text-text-primary">
                {m.home_score != null ? `${m.home_score} – ${m.away_score}` : (m.player_a_sets != null ? `${m.player_a_sets} – ${m.player_b_sets}` : String(m.winner ?? "—"))}
              </span>
              {!!(m.surface || m.round) && <span className="text-[10px] text-text-muted">{[m.surface, m.round].filter(Boolean).join(" · ")}</span>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function StatsSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const sh = match.stats_home as Record<string, unknown> | null | undefined;
  const sa = match.stats_away as Record<string, unknown> | null | undefined;
  if (!sh && !sa) return null;
  const keys = Array.from(new Set([...Object.keys(sh ?? {}), ...Object.keys(sa ?? {})])).filter(k => !["player_id", "player_name"].includes(k)).slice(0, 16);
  if (!keys.length) return null;
  return (
    <Card title="Stats Comparison">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 mb-2">
        <span className="text-right text-[10px] font-semibold text-text-muted">{homeName}</span>
        <span />
        <span className="text-[10px] font-semibold text-text-muted">{awayName}</span>
      </div>
      <div className="space-y-1.5">
        {keys.map((key) => <StatRow key={key} label={key} home={sh?.[key]} away={sa?.[key]} />)}
      </div>
    </Card>
  );
}

function EventsSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const events = match.events;
  if (!events?.length) return null;
  return (
    <Card title="Match Timeline">
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {events.map((e, i) => {
          const isHome = e.team === "home" || e.team === homeName;
          const icon = e.type === "goal" ? "⚽" : e.type === "yellow_card" ? "🟡" : e.type === "red_card" ? "🔴" : e.type === "substitution" ? "🔄" : "•";
          const time = e.minute != null ? `${e.minute}${e.minute_extra ? `+${e.minute_extra}` : ""}'` : "";
          return (
            <div key={i} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2", isHome ? "flex-row" : "flex-row-reverse")} style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <span className="text-base">{icon}</span>
              <div className={cn("flex-1", !isHome && "text-right")}>
                <span className="text-sm font-medium text-text-primary">{e.player_name ?? e.description ?? e.type}</span>
                {e.player_out && <span className="text-[10px] text-text-muted ml-1">↔ {e.player_out}</span>}
                {e.score_home != null && <span className="ml-2 text-[11px] font-mono text-text-muted">{e.score_home}–{e.score_away}</span>}
              </div>
              {time && <span className="text-[11px] font-mono text-text-muted shrink-0">{time}</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SimulationSection({ match }: { match: SportMatchDetail }) {
  const sim = match.simulation;
  if (!sim?.distribution?.length) return null;
  const top = [...sim.distribution].sort((a, b) => b.probability - a.probability).slice(0, 8);
  const maxProb = top[0]?.probability ?? 1;
  return (
    <Card title="Score Simulation">
      <div className="space-y-1.5">
        {top.map((d) => (
          <div key={d.score} className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold text-text-primary w-10 text-center">{d.score}</span>
            <div className="flex-1 h-5 rounded-lg overflow-hidden" style={{ background: "var(--bg3)" }}>
              <div className="h-full rounded-lg bg-emerald-400/50" style={{ width: `${(d.probability / maxProb) * 100}%` }} />
            </div>
            <span className="text-[11px] font-mono text-text-muted w-10 text-right">{(d.probability * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
      {sim.mean_home_goals != null && (
        <div className="flex gap-4 text-[10px] text-text-muted pt-1">
          <span>xG H: <b className="text-text-primary">{sim.mean_home_goals.toFixed(2)}</b></span>
          {sim.mean_away_goals != null && <span>xG A: <b className="text-text-primary">{sim.mean_away_goals.toFixed(2)}</b></span>}
        </div>
      )}
    </Card>
  );
}

// ─── Tennis-specific sections ─────────────────────────────────────────────────

function TennisOddsSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const bm = match as unknown as { odds_home?: number | null; odds_away?: number | null; fair_odds?: { home_win?: number | null; away_win?: number | null } | null };
  const mktH = bm.odds_home;
  const mktA = bm.odds_away;
  const fairH = bm.fair_odds?.home_win;
  const fairA = bm.fair_odds?.away_win;
  if (!mktH && !mktA) return null;

  const edgePct = (mkt?: number | null, fair?: number | null): number | null => {
    if (!mkt || !fair || fair <= 0) return null;
    return ((mkt / fair) - 1) * 100;
  };
  const edgeH = edgePct(mktH, fairH);
  const edgeA = edgePct(mktA, fairA);

  return (
    <Card title="Odds">
      <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-xs">
        <div className="text-right text-text-muted truncate">{homeName}</div>
        <div className="text-center" />
        <div className="text-text-muted truncate">{awayName}</div>

        <div className="text-right font-mono font-semibold">{mktH != null ? mktH.toFixed(2) : "—"}</div>
        <div className="text-center text-[9px] uppercase tracking-widest text-text-muted">Market</div>
        <div className="font-mono font-semibold">{mktA != null ? mktA.toFixed(2) : "—"}</div>

        {(fairH != null || fairA != null) && (
          <>
            <div className="text-right font-mono text-text-muted">{fairH != null ? fairH.toFixed(2) : "—"}</div>
            <div className="text-center text-[9px] uppercase tracking-widest text-text-muted">Fair</div>
            <div className="font-mono text-text-muted">{fairA != null ? fairA.toFixed(2) : "—"}</div>
          </>
        )}

        {(edgeH != null || edgeA != null) && (
          <>
            <div className={cn("text-right font-mono text-[10px]", edgeH != null && edgeH > 0 ? "text-green-400" : "text-text-muted")}>
              {edgeH != null ? `${edgeH > 0 ? "+" : ""}${edgeH.toFixed(1)}%` : "—"}
            </div>
            <div className="text-center text-[9px] uppercase tracking-widest text-text-muted">Edge</div>
            <div className={cn("font-mono text-[10px]", edgeA != null && edgeA > 0 ? "text-green-400" : "text-text-muted")}>
              {edgeA != null ? `${edgeA > 0 ? "+" : ""}${edgeA.toFixed(1)}%` : "—"}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function TennisInfoSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const info = (match as unknown as Record<string, unknown>).tennis_info as Record<string, unknown> | null | undefined;
  if (!info) return null;

  const sets = (info.sets_detail as Array<Record<string, unknown>> | undefined) ?? [];
  const retired = info.retired as boolean | undefined;

  return (
    <Card title="Match Info">
      {/* Set-by-set scoreboard */}
      {sets.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-text-muted">
                <th className="text-left font-medium pb-1 pr-3">Player</th>
                {sets.map((s) => <th key={String(s.set_num)} className="text-center font-medium pb-1 px-2 min-w-[28px]">S{String(s.set_num)}</th>)}
              </tr>
            </thead>
            <tbody>
              {[{ label: homeName, key: "a" }, { label: awayName, key: "b" }].map(({ label, key }) => (
                <tr key={key} className="border-t" style={{ borderColor: "var(--border0)" }}>
                  <td className="py-1.5 pr-3 text-text-primary font-medium whitespace-nowrap truncate max-w-[120px]">{label}</td>
                  {sets.map((s) => {
                    const games = s[key] as number | undefined;
                    const tb = s[`tb_${key}` as keyof typeof s] as number | undefined;
                    return (
                      <td key={String(s.set_num)} className="py-1.5 px-2 text-center font-mono font-semibold text-text-primary">
                        {games ?? "—"}{tb != null ? <sup className="text-[8px] text-text-muted ml-0.5">{tb}</sup> : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {retired && <div className="text-[10px] text-amber-400 mt-1">Retired</div>}
        </div>
      )}

      {/* Match metadata grid */}
      <div className="grid gap-1.5 grid-cols-2">
        {[
          { label: "Surface", value: info.surface },
          { label: "Round", value: info.round_name },
          { label: "Format", value: info.best_of ? `Best of ${info.best_of}` : null },
          { label: "Setting", value: info.is_indoor != null ? (info.is_indoor ? "Indoor" : "Outdoor") : null },
          { label: "Level", value: info.tournament_level },
          { label: "Court speed", value: info.court_speed_index ? `${Number(info.court_speed_index).toFixed(0)}/100` : null },
          { label: "Balls", value: info.balls_brand },
          { label: "Draw size", value: info.draw_size },
          { label: "Prize pool", value: info.tournament_prize_pool_usd ? `$${Number(info.tournament_prize_pool_usd).toLocaleString()}` : null },
          { label: "Points on offer", value: info.points_on_offer },
          { label: "Duration", value: info.match_duration_min ? `${info.match_duration_min}min` : null },
        ].filter((r) => r.value != null).map(({ label, value }) => (
          <div key={label} className="rounded-lg border px-2.5 py-1.5" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
            <div className="text-[9px] uppercase tracking-[0.12em] text-text-muted">{label}</div>
            <div className="text-xs text-text-primary font-medium">{String(value)}</div>
          </div>
        ))}
      </div>

      {/* Fatigue indicators */}
      {(info.player_a_days_rest != null || info.player_a_matches_last_14d != null) && (
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { name: homeName, rest: info.player_a_days_rest as number | null, load: info.player_a_matches_last_14d as number | null },
            { name: awayName, rest: info.player_b_days_rest as number | null, load: info.player_b_matches_last_14d as number | null },
          ].map(({ name, rest, load }) => (
            <div key={name} className="rounded-lg border px-2.5 py-1.5" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <div className="text-[9px] uppercase tracking-[0.12em] text-text-muted truncate">{name}</div>
              <div className="text-[10px] text-text-primary mt-0.5">
                {rest != null && <span>Rest: <b>{rest}d</b></span>}
                {rest != null && load != null && <span className="mx-1 text-text-muted">·</span>}
                {load != null && <span>14d load: <b>{load}</b></span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function TennisServeStatsSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const sh = (match as unknown as Record<string, unknown>).stats_home as Record<string, unknown> | null | undefined;
  const sa = (match as unknown as Record<string, unknown>).stats_away as Record<string, unknown> | null | undefined;
  if (!sh && !sa) return null;

  const rows: { label: string; hKey: string; aKey: string; pct?: boolean }[] = [
    { label: "Aces",             hKey: "aces",                    aKey: "aces" },
    { label: "Double Faults",    hKey: "double_faults",           aKey: "double_faults" },
    { label: "1st Serve In %",   hKey: "first_serve_in_pct",      aKey: "first_serve_in_pct",      pct: true },
    { label: "1st Serve Won %",  hKey: "first_serve_won_pct",     aKey: "first_serve_won_pct",     pct: true },
    { label: "2nd Serve Won %",  hKey: "second_serve_won_pct",    aKey: "second_serve_won_pct",    pct: true },
    { label: "Hold %",           hKey: "service_hold_pct",        aKey: "service_hold_pct",        pct: true },
    { label: "BP Created",       hKey: "break_points_created",    aKey: "break_points_created" },
    { label: "BP Conv %",        hKey: "bp_conversion_pct",       aKey: "bp_conversion_pct",       pct: true },
    { label: "Winners",          hKey: "winners",                  aKey: "winners" },
    { label: "Unforced Errors",  hKey: "unforced_errors",         aKey: "unforced_errors" },
    { label: "W/UE Ratio",       hKey: "winner_ue_ratio",         aKey: "winner_ue_ratio" },
    { label: "Net Win %",        hKey: "net_win_pct",             aKey: "net_win_pct",             pct: true },
    { label: "Rally 0-4 Won %",  hKey: "rally_0_4_won_pct",      aKey: "rally_0_4_won_pct",       pct: true },
    { label: "Rally 5-8 Won %",  hKey: "rally_5_8_won_pct",      aKey: "rally_5_8_won_pct",       pct: true },
    { label: "Rally 9+ Won %",   hKey: "rally_9plus_won_pct",     aKey: "rally_9plus_won_pct",     pct: true },
    { label: "1st Serve Avg",    hKey: "first_serve_avg_mph",     aKey: "first_serve_avg_mph" },
    { label: "1st Serve Max",    hKey: "first_serve_max_mph",     aKey: "first_serve_max_mph" },
  ];

  const active = rows.filter(r => sh?.[r.hKey] != null || sa?.[r.aKey] != null);
  if (!active.length) return null;

  const fmtStat = (v: unknown, pct?: boolean): string => {
    if (v == null) return "—";
    const n = Number(v);
    if (pct) return `${(n > 1 ? n : n * 100).toFixed(0)}%`;
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  };

  return (
    <Card title="Serve Stats">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 mb-1">
        <span className="text-right text-[10px] font-semibold text-text-muted truncate">{homeName}</span>
        <span />
        <span className="text-[10px] font-semibold text-text-muted truncate">{awayName}</span>
      </div>
      <div className="space-y-1">
        {active.map(({ label, hKey, aKey, pct }) => (
          <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border px-2.5 py-1" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
            <span className="text-right text-xs text-text-primary">{fmtStat(sh?.[hKey], pct)}</span>
            <span className="text-[9px] uppercase tracking-[0.12em] text-text-muted text-center min-w-[80px]">{label}</span>
            <span className="text-xs text-text-primary">{fmtStat(sa?.[aKey], pct)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TennisTiebreakSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const tb = (match as unknown as Record<string, unknown>).tiebreaks as Record<string, unknown> | null | undefined;
  if (!tb) return null;
  const list = (tb.tiebreaks as Array<Record<string, unknown>> | undefined) ?? [];
  const aWon = tb.player_a_tiebreaks_won as number | undefined;
  const bWon = tb.player_b_tiebreaks_won as number | undefined;
  if (!list.length && aWon == null) return null;

  return (
    <Card title="Tiebreaks">
      {(aWon != null || bWon != null) && (
        <div className="grid grid-cols-2 gap-2">
          {[{ name: homeName, won: aWon }, { name: awayName, won: bWon }].map(({ name, won }) => (
            <div key={name} className="rounded-lg border px-2.5 py-2 text-center" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <div className="text-[9px] uppercase tracking-[0.12em] text-text-muted truncate">{name}</div>
              <div className="text-xl font-bold text-text-primary">{won ?? 0}</div>
            </div>
          ))}
        </div>
      )}
      {list.length > 0 && (
        <div className="space-y-1">
          {list.map((t, i) => {
            const winner = t.winner === "a" ? homeName : awayName;
            return (
              <div key={i} className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
                <span className="text-text-muted">Set {String(t.set_num)}</span>
                <span className="font-mono font-semibold text-text-primary">{String(t.score_a ?? "—")}–{String(t.score_b ?? "—")}</span>
                <span className="text-emerald-400 text-[10px] truncate max-w-[80px]">{winner}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function TennisFormSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const fh = (match as unknown as Record<string, unknown>).form_home as Record<string, unknown> | null | undefined;
  const fa = (match as unknown as Record<string, unknown>).form_away as Record<string, unknown> | null | undefined;
  if (!fh && !fa) return null;

  const renderPlayer = (name: string, f: Record<string, unknown> | null | undefined) => {
    if (!f) return null;
    const wins = f.wins as number | undefined;
    const losses = f.losses as number | undefined;
    const winPct = f.win_pct as number | undefined;
    const trend = f.ranking_trend as number | undefined;
    return (
      <div key={name} className="rounded-xl border p-3 space-y-2" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-text-primary truncate">{name}</span>
          <div className="flex items-center gap-2 shrink-0">
            {winPct != null && <span className="text-[10px] font-semibold text-emerald-400">{(winPct * (winPct > 1 ? 1 : 100)).toFixed(0)}% W</span>}
            {trend != null && (
              <span className={cn("text-[10px] font-semibold", trend < 0 ? "text-emerald-400" : "text-red-400")}>
                {trend < 0 ? `▲${Math.abs(trend)}` : `▼${trend}`}
              </span>
            )}
          </div>
        </div>
        {/* W/L record */}
        {(wins != null || losses != null) && (
          <div className="text-[10px] text-text-muted">
            {wins != null && losses != null ? `${wins}W – ${losses}L` : wins != null ? `${wins}W` : `${losses}L`}
            {(f.matches_played as number | undefined) != null && ` (${f.matches_played} matches)`}
          </div>
        )}
        {/* Surface breakdown */}
        {(f.win_pct_hard != null || f.win_pct_clay != null || f.win_pct_grass != null) && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-muted">
            {f.win_pct_hard != null && <span>Hard: <b className="text-text-primary">{(Number(f.win_pct_hard) * 100).toFixed(0)}%</b></span>}
            {f.win_pct_clay != null && <span>Clay: <b className="text-text-primary">{(Number(f.win_pct_clay) * 100).toFixed(0)}%</b></span>}
            {f.win_pct_grass != null && <span>Grass: <b className="text-text-primary">{(Number(f.win_pct_grass) * 100).toFixed(0)}%</b></span>}
          </div>
        )}
        {/* Serve/return averages */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-muted">
          {f.avg_first_serve_in_pct != null && <span>1st In: <b className="text-text-primary">{(Number(f.avg_first_serve_in_pct) * 100).toFixed(0)}%</b></span>}
          {f.avg_service_hold_pct != null && <span>Hold: <b className="text-text-primary">{(Number(f.avg_service_hold_pct) * 100).toFixed(0)}%</b></span>}
          {f.avg_bp_conversion_pct != null && <span>BP Conv: <b className="text-text-primary">{(Number(f.avg_bp_conversion_pct) * 100).toFixed(0)}%</b></span>}
          {f.tiebreak_win_pct != null && <span>TB Win: <b className="text-text-primary">{(Number(f.tiebreak_win_pct) * 100).toFixed(0)}%</b></span>}
          {f.three_setters_pct != null && <span>3-setters: <b className="text-text-primary">{(Number(f.three_setters_pct) * 100).toFixed(0)}%</b></span>}
          {f.avg_match_duration_min != null && <span>Avg duration: <b className="text-text-primary">{Math.round(Number(f.avg_match_duration_min))}min</b></span>}
          {f.titles_ytd != null && <span>Titles YTD: <b className="text-text-primary">{String(f.titles_ytd)}</b></span>}
        </div>
      </div>
    );
  };

  return (
    <Card title="Player Form">
      <div className="grid gap-2 sm:grid-cols-2">
        {renderPlayer(homeName, fh)}
        {renderPlayer(awayName, fa)}
      </div>
    </Card>
  );
}

function TennisProfileSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const ph = (match as unknown as Record<string, unknown>).profile_home as Record<string, unknown> | null | undefined;
  const pa = (match as unknown as Record<string, unknown>).profile_away as Record<string, unknown> | null | undefined;
  // Show section even if only logos/names available
  const hasAnyData = (p: typeof ph) => p && Object.values(p).some((v) => v != null && v !== p.player_id && v !== p.player_name);
  if (!hasAnyData(ph) && !hasAnyData(pa)) return null;

  return (
    <Card title="Player Profiles">
      <div className="grid gap-2 sm:grid-cols-2">
        {[{ name: homeName, p: ph }, { name: awayName, p: pa }].map(({ name, p }) => {
          if (!p) return null;
          const rankChange = p.ranking_change_week as number | undefined;
          const logo = p.logo_url as string | undefined;
          return (
            <div key={name} className="rounded-xl border p-3 space-y-2" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              {/* Header: photo + name + ranking */}
              <div className="flex items-center gap-2">
                {logo ? (
                  <img src={logo} alt={name} className="h-8 w-8 rounded-full object-cover shrink-0" style={{ background: "var(--bg3)" }} />
                ) : (
                  <div className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-text-muted" style={{ background: "var(--bg3)" }}>
                    {name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-text-primary truncate">{name}</div>
                  {p.ranking != null && (
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-bold" style={{ color: "var(--accent)" }}>
                        #{String(p.ranking)}
                      </span>
                      {p.ranking_points != null && (
                        <span className="text-[10px] text-text-muted">{Number(p.ranking_points).toLocaleString()} pts</span>
                      )}
                      {rankChange != null && (
                        <span className={cn("text-[9px] font-semibold", rankChange < 0 ? "text-emerald-400" : "text-red-400")}>
                          {rankChange < 0 ? `▲${Math.abs(rankChange)}` : `▼${rankChange}`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                {[
                  ["Nationality", p.nationality],
                  ["Age", p.age],
                  ["Plays", p.plays],
                  ["Height", p.height_cm ? `${p.height_cm}cm` : null],
                  ["Turned pro", p.turned_pro],
                  ["Career titles", p.career_titles],
                  ["Grand Slams", p.career_grand_slams ?? p.grand_slams],
                  ["Career W%", p.career_win_pct ? `${(Number(p.career_win_pct) * 100).toFixed(0)}%` : null],
                  ["Season W/L", (p.season_wins != null && p.season_losses != null) ? `${p.season_wins}W/${p.season_losses}L` : null],
                  ["Highest rank", p.highest_ranking ? `#${p.highest_ranking}` : null],
                  ["Prize YTD", p.prize_money_ytd_usd ? `$${Number(p.prize_money_ytd_usd).toLocaleString()}` : null],
                  ["Coach", p.coach],
                ].filter(([, v]) => v != null).map(([label, value]) => (
                  <div key={String(label)}>
                    <span className="text-text-muted">{String(label)}: </span>
                    <span className="text-text-primary font-medium">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Esports-specific section ─────────────────────────────────────────────────

function EsportsInfoSection({ match }: { match: SportMatchDetail }) {
  const info = (match as unknown as Record<string, unknown>).match_info as Record<string, unknown> | null | undefined;
  if (!info) return null;
  return (
    <Card title="Match Details">
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { label: "Game", value: info.game_type },
          { label: "Format", value: info.series_format },
          { label: "Stage", value: info.stage },
          { label: "Tier", value: info.tournament_tier },
          { label: "Setting", value: info.is_lan ? "LAN" : "Online" },
          { label: "Patch", value: info.patch_version },
        ].filter((r) => r.value != null).map(({ label, value }) => (
          <div key={label} className="rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
            <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">{label}</div>
            <div className="text-sm text-text-primary capitalize">{String(value)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Lineup section ───────────────────────────────────────────────────────────

function LineupSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const lh = match.lineup_home as Record<string, unknown> | null | undefined;
  const la = match.lineup_away as Record<string, unknown> | null | undefined;
  if (!lh && !la) return null;

  return (
    <Card title="Lineups">
      <div className="grid gap-3 sm:grid-cols-2">
        {[{ name: homeName, lineup: lh }, { name: awayName, lineup: la }].map(({ name, lineup }) => {
          if (!lineup) return null;
          const players = (lineup.players as Array<Record<string, unknown>> | undefined) ?? [];
          return (
            <div key={name} className="rounded-xl border p-3" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-text-primary truncate">{name}</span>
                {lineup.formation != null && <span className="text-[10px] font-mono text-text-muted">{String(lineup.formation)}</span>}
              </div>
              {players.length > 0 && (
                <div className="space-y-0.5">
                  {players.slice(0, 11).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      {p.number != null && <span className="text-text-muted w-5 text-right">{String(p.number)}</span>}
                      <span className="text-text-primary">{String(p.name ?? p.player_name ?? "—")}</span>
                      {p.position != null && <span className="text-text-subtle text-[9px]">{String(p.position)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Injuries section ─────────────────────────────────────────────────────────

function InjuriesSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const ih = match.injuries_home as Array<Record<string, unknown>> | null | undefined;
  const ia = match.injuries_away as Array<Record<string, unknown>> | null | undefined;
  if ((!ih || !ih.length) && (!ia || !ia.length)) return null;

  return (
    <Card title="Injuries">
      <div className="grid gap-3 sm:grid-cols-2">
        {[{ name: homeName, list: ih }, { name: awayName, list: ia }].map(({ name, list }) => {
          if (!list?.length) return null;
          return (
            <div key={name} className="rounded-xl border p-3" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted mb-2">{name}</div>
              <div className="space-y-1">
                {list.slice(0, 6).map((inj, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="text-text-primary">{String(inj.player_name ?? inj.name ?? "Unknown")}</span>
                    <span className="text-text-muted">{String(inj.status ?? inj.type ?? "")}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Highlights section ───────────────────────────────────────────────────────

function HighlightsSection({ match }: { match: SportMatchDetail }) {
  const clips = match.highlights as Array<Record<string, unknown>> | null | undefined;
  if (!clips?.length) return null;
  return (
    <Card title="Highlights">
      <div className="space-y-2">
        {clips.slice(0, 6).map((clip, i) => {
          const url = String(clip.url ?? "");
          const title = String(clip.title ?? clip.event_type ?? "Highlight");
          const thumb = clip.thumbnail ? String(clip.thumbnail) : null;
          const min = clip.minute != null ? `${clip.minute}'` : null;
          const dur = clip.duration != null ? `${Math.round(Number(clip.duration) / 60)}m` : null;
          if (!url) return null;
          return (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:border-white/20"
              style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              {thumb ? (
                <img src={thumb} alt="" className="h-12 w-20 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="h-12 w-20 rounded-lg shrink-0 flex items-center justify-center text-2xl"
                  style={{ background: "var(--bg3)" }}>▶</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{title}</div>
                <div className="text-[10px] text-text-muted mt-0.5">
                  {[min, dur].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span className="text-text-muted text-xs shrink-0">▶</span>
            </a>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Full standings section ───────────────────────────────────────────────────

function FullStandingsSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const rows = (match as unknown as { full_standings?: Array<Record<string, unknown>> }).full_standings;
  if (!rows?.length) return null;
  const [collapsed, setCollapsed] = useState(true);
  const display = collapsed ? rows.slice(0, 6) : rows;
  return (
    <Card title="League Table">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-text-muted border-b" style={{ borderColor: "var(--border0)" }}>
              <th className="text-left font-medium pb-1 pr-1 w-5">#</th>
              <th className="text-left font-medium pb-1">Team</th>
              <th className="text-center font-medium pb-1 px-1">P</th>
              <th className="text-center font-medium pb-1 px-1">W</th>
              <th className="text-center font-medium pb-1 px-1">D</th>
              <th className="text-center font-medium pb-1 px-1">L</th>
              <th className="text-center font-medium pb-1 px-1">GD</th>
              <th className="text-center font-medium pb-1 px-1">Pts</th>
              <th className="text-right font-medium pb-1 pl-1">Form</th>
            </tr>
          </thead>
          <tbody>
            {display.map((row, i) => {
              const isHome = String(row.team_name ?? "").toLowerCase() === homeName.toLowerCase();
              const isAway = String(row.team_name ?? "").toLowerCase() === awayName.toLowerCase();
              const highlight = isHome || isAway;
              const formStr = String(row.form ?? "");
              return (
                <tr key={i} className="border-t" style={{
                  borderColor: "var(--border0)",
                  background: highlight ? "rgba(255,255,255,0.04)" : undefined,
                }}>
                  <td className="py-1.5 pr-1 text-text-muted">{String(row.position ?? i + 1)}</td>
                  <td className="py-1.5 font-medium truncate max-w-[100px]" style={{ color: highlight ? "var(--text-primary)" : "var(--text-muted)" }}>
                    {String(row.team_name ?? "")}
                  </td>
                  <td className="py-1.5 text-center text-text-muted">{String(row.played ?? "")}</td>
                  <td className="py-1.5 text-center text-text-muted">{String(row.won ?? "")}</td>
                  <td className="py-1.5 text-center text-text-muted">{String(row.drawn ?? "")}</td>
                  <td className="py-1.5 text-center text-text-muted">{String(row.lost ?? "")}</td>
                  <td className="py-1.5 text-center text-text-muted">{row.goal_diff != null ? (Number(row.goal_diff) > 0 ? `+${row.goal_diff}` : String(row.goal_diff)) : ""}</td>
                  <td className="py-1.5 text-center font-bold text-text-primary">{String(row.points ?? "")}</td>
                  <td className="py-1.5 pl-1 text-right">
                    <div className="flex justify-end gap-0.5">
                      {formStr.split("").slice(-5).map((r, j) => (
                        <span key={j} className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[8px] font-bold"
                          style={{
                            background: r === "W" ? "rgba(34,197,94,0.20)" : r === "L" ? "rgba(239,68,68,0.20)" : "rgba(148,163,184,0.15)",
                            color: r === "W" ? "#22c55e" : r === "L" ? "#ef4444" : "#94a3b8",
                          }}>
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 6 && (
        <button onClick={() => setCollapsed(!collapsed)}
          className="mt-2 text-[10px] text-text-muted hover:text-text-primary transition-colors w-full text-center">
          {collapsed ? `Show all ${rows.length} teams ↓` : "Show less ↑"}
        </button>
      )}
    </Card>
  );
}

// ─── Soccer form section ──────────────────────────────────────────────────────

function SoccerFormSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const fh = match.form_home as Record<string, unknown> | null | undefined;
  const fa = match.form_away as Record<string, unknown> | null | undefined;
  if (!fh && !fa) return null;

  const renderTeam = (name: string, form: Record<string, unknown> | null | undefined) => {
    if (!form) return null;
    const results: string[] = (form.form_last_5 as string[] | undefined) ?? [];
    return (
      <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-text-primary truncate">{name}</span>
          {form.form_pts != null && <span className="text-[10px] font-bold text-emerald-400">{String(form.form_pts)} pts</span>}
        </div>
        {results.length > 0 && (
          <div className="flex items-center gap-1">
            {results.slice(-5).map((r, i) => <FormPill key={i} result={r} />)}
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-text-muted">
          {form.wins != null && <span>W/D/L: <b className="text-text-primary">{String(form.wins)}/{String(form.draws ?? 0)}/{String(form.losses ?? 0)}</b></span>}
          {form.goals_scored_avg != null && <span>Scored avg: <b className="text-text-primary">{Number(form.goals_scored_avg).toFixed(2)}</b></span>}
          {form.goals_conceded_avg != null && <span>Conceded avg: <b className="text-text-primary">{Number(form.goals_conceded_avg).toFixed(2)}</b></span>}
          {form.xg_avg != null && <span>xG avg: <b className="text-text-primary">{Number(form.xg_avg).toFixed(2)}</b></span>}
          {form.xga_avg != null && <span>xGA avg: <b className="text-text-primary">{Number(form.xga_avg).toFixed(2)}</b></span>}
          {form.ppda_avg != null && <span>PPDA: <b className="text-text-primary">{Number(form.ppda_avg).toFixed(2)}</b></span>}
          {form.shots_avg != null && <span>Shots avg: <b className="text-text-primary">{Number(form.shots_avg).toFixed(1)}</b></span>}
          {form.shots_on_target_avg != null && <span>On target avg: <b className="text-text-primary">{Number(form.shots_on_target_avg).toFixed(1)}</b></span>}
          {form.corners_avg != null && <span>Corners avg: <b className="text-text-primary">{Number(form.corners_avg).toFixed(1)}</b></span>}
          {form.clean_sheets != null && <span>Clean sheets: <b className="text-text-primary">{String(form.clean_sheets)}</b></span>}
          {form.btts != null && <span>BTTS: <b className="text-text-primary">{String(form.btts)}</b></span>}
          {form.days_rest != null && <span>Days rest: <b className="text-text-primary">{Number(form.days_rest).toFixed(0)}</b></span>}
        </div>
      </div>
    );
  };

  return (
    <Card title="Recent Form">
      <div className="grid gap-2 sm:grid-cols-2">
        {renderTeam(homeName, fh)}
        {renderTeam(awayName, fa)}
      </div>
    </Card>
  );
}

// ─── Soccer stats bar section ─────────────────────────────────────────────────

function SoccerStatsBarSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const sh = match.stats_home as Record<string, unknown> | null | undefined;
  const sa = match.stats_away as Record<string, unknown> | null | undefined;
  if (!sh && !sa) return null;

  const statRows: { label: string; hKey: string; pct?: boolean }[] = [
    { label: "Possession", hKey: "possession_pct", pct: true },
    { label: "Shots", hKey: "shots_total" },
    { label: "On Target", hKey: "shots_on_target" },
    { label: "xG", hKey: "xg" },
    { label: "Corners", hKey: "corners" },
    { label: "Passes", hKey: "passes_completed" },
    { label: "Pass Acc %", hKey: "pass_accuracy_pct", pct: true },
    { label: "Fouls", hKey: "fouls" },
    { label: "Yellow Cards", hKey: "yellow_cards" },
    { label: "Offsides", hKey: "offsides" },
    { label: "Aerial Won", hKey: "aerial_duels_won" },
    { label: "Big Chances", hKey: "big_chances_created" },
  ];

  const active = statRows.filter(r => sh?.[r.hKey] != null || sa?.[r.hKey] != null);
  if (!active.length) return null;

  return (
    <Card title="Match Stats">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 mb-2">
        <span className="text-right text-[10px] font-semibold text-text-muted truncate">{homeName}</span>
        <span />
        <span className="text-[10px] font-semibold text-text-muted truncate">{awayName}</span>
      </div>
      <div className="space-y-2">
        {active.map(({ label, hKey, pct }) => {
          const hv = sh?.[hKey] != null ? Number(sh[hKey]) : null;
          const av = sa?.[hKey] != null ? Number(sa[hKey]) : null;
          const total = (hv ?? 0) + (av ?? 0);
          const hPct = total > 0 ? (hv ?? 0) / total : 0.5;
          const aPct = total > 0 ? (av ?? 0) / total : 0.5;
          const fmtVal = (v: number | null) => {
            if (v == null) return "—";
            if (pct) return `${v.toFixed(0)}%`;
            return Number.isInteger(v) ? String(v) : v.toFixed(2);
          };
          return (
            <div key={label}>
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="font-mono font-semibold text-text-primary w-8 text-left">{fmtVal(hv)}</span>
                <span className="text-text-muted text-center flex-1">{label}</span>
                <span className="font-mono font-semibold text-text-primary w-8 text-right">{fmtVal(av)}</span>
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden gap-px" style={{ background: "var(--bg3)" }}>
                <div className="h-full rounded-l-full" style={{ width: `${hPct * 100}%`, background: "#22c55e", opacity: 0.7 }} />
                <div className="h-full rounded-r-full" style={{ width: `${aPct * 100}%`, background: "#a855f7", opacity: 0.7 }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Soccer odds edge section ─────────────────────────────────────────────────

function SoccerOddsEdgeSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const m = match as unknown as { odds_home?: number | null; odds_draw?: number | null; odds_away?: number | null };
  const mktH = m.odds_home;
  const mktD = m.odds_draw;
  const mktA = m.odds_away;
  const fairH = match.fair_odds?.home_win;
  const fairD = match.fair_odds?.draw;
  const fairA = match.fair_odds?.away_win;
  if (!mktH && !mktD && !mktA) return null;

  const edge = (mkt?: number | null, fair?: number | null) => {
    if (!mkt || !fair || fair <= 0) return null;
    return ((mkt / fair) - 1) * 100;
  };

  const rows = [
    { label: homeName, mkt: mktH, fair: fairH, edge: edge(mktH, fairH) },
    { label: "Draw", mkt: mktD, fair: fairD, edge: edge(mktD, fairD) },
    { label: awayName, mkt: mktA, fair: fairA, edge: edge(mktA, fairA) },
  ].filter(r => r.mkt != null);

  if (!rows.length) return null;

  return (
    <Card title="Odds & Edge">
      <div className="space-y-1.5">
        {rows.map(({ label, mkt, fair, edge: e }) => (
          <div key={label} className="flex items-center justify-between rounded-xl border px-3 py-2" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
            <span className="text-sm text-text-muted truncate max-w-[120px]">{label}</span>
            <div className="flex items-center gap-4 text-right shrink-0">
              {fair != null && <span className="text-[11px] text-text-muted">Fair: <span className="font-mono font-semibold text-text-primary">{fair.toFixed(2)}</span></span>}
              <span className="text-[11px] text-text-muted">Mkt: <span className="font-mono font-semibold text-text-primary">{mkt?.toFixed(2)}</span></span>
              {e != null && (
                <span className={cn("text-[11px] font-bold min-w-[48px] text-right", e > 2 ? "text-emerald-400" : e > 0 ? "text-emerald-300/70" : "text-text-muted")}>
                  {e > 0 ? "+" : ""}{e.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-text-muted pt-1">Edge = how much market odds exceed model fair odds</div>
    </Card>
  );
}

// ─── Model meta section ───────────────────────────────────────────────────────

function ModelMetaSection({ match }: { match: SportMatchDetail }) {
  const model = match.model as Record<string, unknown> | null | undefined;
  if (!model) return null;
  const fields = [
    { label: "Version", value: model.version },
    { label: "Algorithm", value: model.algorithm },
    { label: "Accuracy", value: model.accuracy != null ? `${(Number(model.accuracy) * 100).toFixed(1)}%` : null },
    { label: "Brier score", value: model.brier_score != null ? Number(model.brier_score).toFixed(4) : null },
    { label: "Trained", value: model.trained_at ? new Date(String(model.trained_at)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : null },
    { label: "Training samples", value: model.n_train_samples != null ? Number(model.n_train_samples).toLocaleString() : null },
  ].filter(f => f.value != null);
  if (!fields.length) return null;
  return (
    <Card title="Model Info">
      <div className="grid grid-cols-2 gap-1.5">
        {fields.map(({ label, value }) => (
          <div key={label} className="rounded-lg border px-2.5 py-1.5" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
            <div className="text-[9px] uppercase tracking-[0.12em] text-text-muted">{label}</div>
            <div className="text-xs text-text-primary font-medium">{String(value)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Basketball box score section ─────────────────────────────────────────────

function BasketballBoxScoreSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const bh = match.box_home as { team_name: string; players: any[]; total_points?: number | null; fg_pct?: number | null; fg3_pct?: number | null; ft_pct?: number | null } | null | undefined;
  const ba = match.box_away as { team_name: string; players: any[]; total_points?: number | null; fg_pct?: number | null; fg3_pct?: number | null; ft_pct?: number | null } | null | undefined;
  if (!bh?.players?.length && !ba?.players?.length) return null;

  const cols = [
    { key: "minutes",   label: "MIN" },
    { key: "points",    label: "PTS" },
    { key: "rebounds",  label: "REB" },
    { key: "assists",   label: "AST" },
    { key: "steals",    label: "STL" },
    { key: "blocks",    label: "BLK" },
    { key: "turnovers", label: "TO" },
    { key: "plus_minus",label: "+/-" },
    { key: "fg_pct",    label: "FG%",  isPct: true },
    { key: "fg3_pct",   label: "3P%",  isPct: true },
    { key: "ft_pct",    label: "FT%",  isPct: true },
  ];

  const fmt = (v: unknown, isPct?: boolean) => {
    if (v == null) return "–";
    const n = Number(v);
    if (isNaN(n)) return "–";
    if (isPct) return (n * 100).toFixed(1) + "%";
    return n % 1 === 0 ? String(n) : n.toFixed(1);
  };

  const renderTeam = (box: typeof bh, name: string) => {
    if (!box?.players?.length) return null;
    return (
      <div className="mb-4 last:mb-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-1.5">{name}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-text-muted border-b" style={{ borderColor: "var(--border0)" }}>
                <th className="text-left font-medium pb-1 pr-2">Player</th>
                <th className="text-center font-medium pb-1 px-1">Pos</th>
                {cols.map(c => <th key={c.key} className="text-center font-medium pb-1 px-1 min-w-[28px]">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {(box.players as any[]).map((p, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--border0)", opacity: p.is_starter ? 1 : 0.65 }}>
                  <td className="py-1.5 pr-2 text-text-primary font-medium whitespace-nowrap truncate max-w-[120px]">{p.name}</td>
                  <td className="py-1.5 px-1 text-center text-text-muted text-[10px]">{p.position ?? ""}</td>
                  {cols.map(c => {
                    const val = p[c.key];
                    const isPlus = c.key === "plus_minus" && Number(val) > 0;
                    const isMinus = c.key === "plus_minus" && Number(val) < 0;
                    const isPts = c.key === "points" && Number(val) >= 20;
                    return (
                      <td key={c.key} className="py-1.5 px-1 text-center tabular-nums" style={{
                        color: isPts ? "#f59e0b" : isPlus ? "#22c55e" : isMinus ? "#ef4444" : "var(--text-primary)",
                        fontWeight: isPts ? 700 : undefined,
                      }}>
                        {fmt(val, (c as any).isPct)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t font-bold" style={{ borderColor: "var(--border0)", color: "var(--text-muted)" }}>
                <td className="py-1.5 pr-2" colSpan={2}>Team</td>
                <td className="py-1.5 px-1 text-center">–</td>
                <td className="py-1.5 px-1 text-center">{box.total_points ?? "–"}</td>
                <td className="py-1.5 px-1 text-center" colSpan={5}>–</td>
                <td className="py-1.5 px-1 text-center">{fmt(box.fg_pct, true)}</td>
                <td className="py-1.5 px-1 text-center">{fmt(box.fg3_pct, true)}</td>
                <td className="py-1.5 px-1 text-center">{fmt(box.ft_pct, true)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <Card title="Player Box Scores">
      {renderTeam(bh, homeName)}
      {renderTeam(ba, awayName)}
    </Card>
  );
}

// ─── Referee section ─────────────────────────────────────────────────────────

function RefereeSection({ match }: { match: SportMatchDetail }) {
  const ref = match.referee as Record<string, unknown> | null | undefined;
  if (!ref?.name) return null;
  return (
    <Card title="Referee">
      <div className="rounded-xl border p-3" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
        <div className="text-sm font-semibold text-text-primary mb-2">{String(ref.name)}</div>
        <div className="flex flex-wrap gap-3 text-[10px] text-text-muted">
          {ref.yellow_cards_per_game != null && <span>Yellows/game: <b className="text-text-primary">{fmt(ref.yellow_cards_per_game)}</b></span>}
          {ref.red_cards_per_game != null && <span>Reds/game: <b className="text-text-primary">{fmt(ref.red_cards_per_game)}</b></span>}
          {ref.home_win_pct != null && <span>Home win%: <b className="text-text-primary">{fmt(ref.home_win_pct)}</b></span>}
          {ref.nationality != null && <span>Nationality: <b className="text-text-primary">{String(ref.nationality)}</b></span>}
        </div>
      </div>
    </Card>
  );
}

// ─── League context section ───────────────────────────────────────────────────

function LeagueContextSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const lc = match.league_context as Record<string, unknown> | null | undefined;
  if (!lc || (lc.home_position == null && lc.away_position == null)) return null;
  return (
    <Card title="League Standing">
      <div className="grid grid-cols-2 gap-3">
        {[
          { name: homeName, pos: lc.home_position, pts: lc.home_points, played: lc.home_games_played, formRank: lc.home_form_rank, top4gap: lc.top_4_gap_home },
          { name: awayName, pos: lc.away_position, pts: lc.away_points, played: lc.away_games_played, formRank: lc.away_form_rank, relGap: lc.relegation_gap_away },
        ].map(({ name, pos, pts, played, formRank, top4gap, relGap }) => (
          <div key={name} className="rounded-xl border p-3" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
            <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted mb-1 truncate">{name}</div>
            {pos != null && <div className="text-2xl font-bold text-text-primary">#{String(pos)}</div>}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-muted mt-1">
              {pts != null && <span>Pts: <b className="text-text-primary">{String(pts)}</b></span>}
              {played != null && <span>P: <b className="text-text-primary">{String(played)}</b></span>}
              {formRank != null && <span>Form rank: <b className="text-text-primary">#{String(formRank)}</b></span>}
              {top4gap != null && <span>Top 4: <b className={cn(Number(top4gap) >= 0 ? "text-emerald-400" : "text-red-400")}>{Number(top4gap) > 0 ? `+${top4gap}` : String(top4gap)}</b></span>}
              {relGap != null && <span>Rel zone: <b className={cn(Number(relGap) <= 3 ? "text-red-400" : "text-emerald-400")}>+{String(relGap)}</b></span>}
            </div>
          </div>
        ))}
      </div>
      {lc.points_gap != null && (
        <div className="text-[10px] text-text-muted text-center pt-1">
          Points gap: <b className="text-text-primary">{Number(lc.points_gap) > 0 ? `+${lc.points_gap}` : String(lc.points_gap)}</b>
        </div>
      )}
    </Card>
  );
}

// ─── Live stats section ───────────────────────────────────────────────────────

const LIVE_STAT_LABELS: Record<string, string> = {
  possession: "Possession %",
  shots: "Shots",
  shots_on_target: "On Target",
  xg: "xG",
  corners: "Corners",
  fouls: "Fouls",
  yellow_cards: "Yellow Cards",
  red_cards: "Red Cards",
  passes: "Passes",
  pass_accuracy: "Pass Acc %",
  offsides: "Offsides",
  saves: "Saves",
};

function LiveStatsSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const sh = match.stats_home_live as Record<string, unknown> | null | undefined;
  const sa = match.stats_away_live as Record<string, unknown> | null | undefined;
  if (!sh && !sa) return null;
  const keys = Object.keys(LIVE_STAT_LABELS).filter((k) => sh?.[k] != null || sa?.[k] != null);
  if (!keys.length) return null;
  return (
    <Card title="Live Stats">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 mb-2">
        <span className="text-right text-[10px] font-semibold text-text-muted">{homeName}</span>
        <span />
        <span className="text-[10px] font-semibold text-text-muted">{awayName}</span>
      </div>
      <div className="space-y-1.5">
        {keys.map((k) => <StatRow key={k} label={LIVE_STAT_LABELS[k] ?? k} home={sh?.[k]} away={sa?.[k]} />)}
      </div>
    </Card>
  );
}

// ─── Advanced stats section ───────────────────────────────────────────────────

const ADV_STAT_LABELS: Record<string, string> = {
  ppda: "PPDA (pressing)",
  high_press_success_rate: "Press Success %",
  big_chances_created: "Big Chances Created",
  big_chances_missed: "Big Chances Missed",
  big_chance_conversion_pct: "Chance Conv %",
  set_piece_goals: "Set Piece Goals",
  corners_won: "Corners Won",
  aerial_duel_win_pct: "Aerial Duels Won %",
  xpts: "xPoints",
  final_third_entries: "Final 3rd Entries",
};

function AdvancedStatsSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const ah = match.adv_home as Record<string, unknown> | null | undefined;
  const aa = match.adv_away as Record<string, unknown> | null | undefined;
  if (!ah && !aa) return null;
  const keys = Object.keys(ADV_STAT_LABELS).filter((k) => ah?.[k] != null || aa?.[k] != null);
  if (!keys.length) return null;
  return (
    <Card title="Advanced Stats">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 mb-2">
        <span className="text-right text-[10px] font-semibold text-text-muted">{homeName}</span>
        <span />
        <span className="text-[10px] font-semibold text-text-muted">{awayName}</span>
      </div>
      <div className="space-y-1.5">
        {keys.map((k) => <StatRow key={k} label={ADV_STAT_LABELS[k] ?? k} home={ah?.[k]} away={aa?.[k]} />)}
      </div>
    </Card>
  );
}

// ─── SGO Venue section ────────────────────────────────────────────────────────

function SGOVenueSection({ event }: { event: SGOEvent }) {
  const venue = event.info?.venue;
  if (!venue?.name) return null;
  return (
    <Card title="Venue">
      <div className="flex items-start gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
        <MapPin size={13} className="mt-0.5 text-text-muted shrink-0" />
        <div>
          <div className="text-sm text-text-primary">{venue.name}{venue.city ? `, ${venue.city}` : ""}</div>
          {venue.capacity != null && <div className="text-[10px] text-text-muted">Capacity: {venue.capacity.toLocaleString()}</div>}
        </div>
      </div>
    </Card>
  );
}

// ─── SGO Team stats section ───────────────────────────────────────────────────

const SGO_TEAM_STAT_LABELS: Record<string, string> = {
  // Possession
  possessionPercent: "Possession %", possession: "Possession %", possession_pct: "Possession %",
  possessionPct: "Possession %", ball_possession: "Possession %", ballPossession: "Possession %",
  // Shots
  shots: "Shots", total_shots: "Shots",
  shots_onGoal: "On Target", shotsOnTarget: "On Target", shots_on_target: "On Target", shotsOnGoal: "On Target",
  shots_offGoal: "Off Target",
  shots_insideBox: "Shots (In Box)",
  shots_outsideBox: "Shots (Out Box)",
  shots_blocked: "Blocked Shots", blockedShots: "Blocked Shots",
  shots_hitCrossbar: "Hit Crossbar",
  // Set pieces
  cornerKicks: "Corners", corners: "Corners", corner_kicks: "Corners",
  // Fouls & cards
  fouls: "Fouls", total_fouls: "Fouls",
  yellowCards: "Yellow Cards", yellow_cards: "Yellow Cards",
  redCards: "Red Cards", red_cards: "Red Cards",
  // Passing
  passes_accurate: "Passes Acc", passesAccurate: "Passes Acc",
  passes_attempted: "Passes", passes: "Passes", total_passes: "Passes",
  passes_percent: "Pass Acc %",
  longBalls_accurate: "Long Balls Acc",
  longBalls_attempted: "Long Balls",
  crosses_accurate: "Crosses Acc",
  crosses_attempted: "Crosses",
  // Defensive
  clearances: "Clearances", total_clearances: "Clearances",
  interceptions: "Interceptions",
  offsides: "Offsides", total_offsides: "Offsides",
  // Goalkeeping
  goalie_saves: "Saves", saves: "Saves", goalkeeper_saves: "Saves",
  // Dribbles
  dribbles_attempted: "Dribbles",
  dribbles_won: "Dribbles Won",
  // Attacks
  attacks: "Attacks", dangerous_attacks: "Dangerous Attacks", dangerousAttacks: "Dangerous Attacks",
};

// Keys to skip in team stats (non-stat metadata or redundant)
const TEAM_STAT_SKIP = new Set(["teamID", "name", "score", "colors", "id", "points"]);

function formatStatKey(k: string): string {
  return k.replace(/_/g, " ").replace(/([A-Z])/g, " $1").trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function SGOTeamStatsSection({ event, homeName, awayName }: { event: SGOEvent; homeName: string; awayName: string }) {
  const game = event.results?.game;
  const sh = game?.home as SGOTeamStats | undefined;
  const sa = game?.away as SGOTeamStats | undefined;
  if (!sh && !sa) return null;

  // Union of all keys from both objects, deduplicated by canonical label
  const seen = new Set<string>();
  const rows: { key: string; label: string }[] = [];
  for (const k of Array.from(new Set([...Object.keys(sh ?? {}), ...Object.keys(sa ?? {})]))) {
    if (TEAM_STAT_SKIP.has(k)) continue;
    if (sh?.[k] == null && sa?.[k] == null) continue;
    const label = SGO_TEAM_STAT_LABELS[k] ?? formatStatKey(k);
    if (seen.has(label)) continue;
    seen.add(label);
    rows.push({ key: k, label });
  }

  if (!rows.length) return null;
  return (
    <Card title="Match Stats">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 mb-2">
        <span className="text-right text-[10px] font-semibold text-text-muted">{homeName}</span>
        <span />
        <span className="text-[10px] font-semibold text-text-muted">{awayName}</span>
      </div>
      <div className="space-y-1.5">
        {rows.map(({ key, label }) => <StatRow key={key} label={label} home={sh?.[key]} away={sa?.[key]} />)}
      </div>
    </Card>
  );
}

// ─── SGO Player stats section ─────────────────────────────────────────────────

// Ordered columns — try multiple key name variants per stat
const SGO_PLAYER_STAT_COLS: { label: string; keys: string[] }[] = [
  { label: "Min",  keys: ["minutesPlayed", "minutes_played", "minutes"] },
  { label: "Rat",  keys: ["playerRating", "player_rating", "rating"] },
  { label: "Sh",   keys: ["shots", "total_shots", "shots_total"] },
  { label: "Pa",   keys: ["passes_accurate", "passesAccurate"] },
  { label: "Tch",  keys: ["touches", "total_touches"] },
  { label: "Tck",  keys: ["tackles", "total_tackles", "tackles_total"] },
  { label: "YC",   keys: ["yellowCards", "yellow_cards", "yellow_card"] },
  { label: "RC",   keys: ["redCards", "red_cards", "red_card"] },
];

function resolveStatCol(stats: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (stats[k] != null) return stats[k];
  }
  return null;
}

function SGOPlayerStatsSection({ event, homeName, awayName }: { event: SGOEvent; homeName: string; awayName: string }) {
  const game = event.results?.game;
  const players = event.players;
  if (!game || !players) return null;

  const homeTeamID = event.teams.home.teamID;
  const playerIDs = Object.keys(game).filter((k) => k !== "home" && k !== "away");
  if (!playerIDs.length) return null;

  type PlayerRow = { id: string; info: SGOPlayer; stats: Record<string, unknown> };
  const homePlayers: PlayerRow[] = [];
  const awayPlayers: PlayerRow[] = [];

  for (const id of playerIDs) {
    const info = players[id];
    const stats = game[id] as Record<string, unknown> | undefined;
    if (!info || !stats) continue;
    const mins = resolveStatCol(stats, SGO_PLAYER_STAT_COLS[0].keys);
    if (Number(mins ?? 0) <= 0) continue;
    const row = { id, info, stats };
    if (info.teamID === homeTeamID) homePlayers.push(row);
    else awayPlayers.push(row);
  }

  if (!homePlayers.length && !awayPlayers.length) return null;

  const getRating = (row: PlayerRow) => Number(resolveStatCol(row.stats, SGO_PLAYER_STAT_COLS[1].keys) ?? 0);
  homePlayers.sort((a, b) => getRating(b) - getRating(a));
  awayPlayers.sort((a, b) => getRating(b) - getRating(a));

  const renderTeam = (name: string, rows: PlayerRow[]) => {
    if (!rows.length) return null;
    return (
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-1.5">{name}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-text-muted">
                <th className="text-left font-medium pb-1 pr-2">Player</th>
                {SGO_PLAYER_STAT_COLS.map((col) => (
                  <th key={col.label} className="text-center font-medium pb-1 px-1 min-w-[28px]">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ id, info, stats }) => {
                const displayName = info.name ?? [info.firstName, info.lastName].filter(Boolean).join(" ") ?? id;
                const nameParts = displayName.split(" ");
                const shortDisplay = nameParts.length > 1 ? `${nameParts[0][0]}. ${nameParts.slice(-1)[0]}` : displayName;
                return (
                  <tr key={id} className="border-t" style={{ borderColor: "var(--border0)" }}>
                    <td className="py-1.5 pr-2 text-text-primary font-medium whitespace-nowrap">{shortDisplay}</td>
                    {SGO_PLAYER_STAT_COLS.map((col) => {
                      const v = resolveStatCol(stats, col.keys);
                      const isRating = col.label === "Rat";
                      const ratingNum = isRating && v != null ? Number(v) : null;
                      const ratingColor = ratingNum != null
                        ? ratingNum >= 7.5 ? "#22c55e" : ratingNum >= 6.5 ? "#f59e0b" : "#ef4444"
                        : undefined;
                      return (
                        <td key={col.label} className="py-1.5 px-1 text-center" style={{ color: ratingColor ?? "var(--text-primary)" }}>
                          {v != null ? (isRating ? Number(v).toFixed(1) : String(v)) : <span className="text-text-muted">–</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <Card title="Player Stats">
      <div className="space-y-4">
        {renderTeam(homeName, homePlayers)}
        {renderTeam(awayName, awayPlayers)}
      </div>
    </Card>
  );
}

// ─── Market grouping ──────────────────────────────────────────────────────────

const CATEGORY_ORDER = ["Full Game", "1st Half", "2nd Half", "Quarters", "Periods", "Player Props"];

function categorizeMarkets(markets: Market[]): Record<string, Market[]> {
  const groups: Record<string, Market[]> = {};
  for (const m of markets) {
    let cat = "Full Game";
    if (m.id.startsWith("1h-"))   cat = "1st Half";
    else if (m.id.startsWith("2h-")) cat = "2nd Half";
    else if (/^[1-4]q-/.test(m.id)) cat = "Quarters";
    else if (/^[1-3]p-/.test(m.id)) cat = "Periods";
    else if (m.id.startsWith("prop-")) cat = "Player Props";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(m);
  }
  return groups;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v).replace(/_/g, " ");
}

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  if (d >= todayStart && d < tomorrowStart) return "Today " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (d >= tomorrowStart && d < new Date(tomorrowStart.getTime() + 86_400_000)) return "Tomorrow " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// ─── Main component ───────────────────────────────────────────────────────────

function PreMatchAnalysisSection({
  matchId,
  isFinished,
  previewParams,
}: {
  matchId: string;
  isFinished: boolean;
  previewParams?: {
    home: string; away: string; sport: string; league?: string;
    p_home?: number; p_draw?: number; p_away?: number;
    confidence?: number; fair_home?: number; fair_draw?: number; fair_away?: number;
    elo_home?: number | null; elo_away?: number | null;
  };
}) {
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = previewParams
      ? getMatchReasoningPreview(previewParams)
      : getMatchReasoning(matchId);
    fetch.then((r) => {
      setReasoning(r);
      setLoading(false);
    });
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isFinished) return null;

  return (
    <div className="sportsbook-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/15">
          <Sparkles size={12} className="text-purple-400" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Pre-match analysis</span>
        <span className="ml-auto rounded-full border border-purple-400/20 bg-purple-400/8 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-purple-400/70">AI</span>
      </div>

      <div className="px-4 pb-4">
        {loading ? (
          <div className="flex items-center gap-2 py-3">
            <Loader2 size={13} className="animate-spin text-purple-400/50" />
            <span className="text-[12px] text-white/30">Generating analysis…</span>
          </div>
        ) : reasoning ? (
          <p className="border-l-2 border-purple-400/30 pl-3 text-[13px] leading-relaxed text-white/60">
            {reasoning}
          </p>
        ) : (
          <p className="text-[12px] text-white/40">Analysis not yet available — check back shortly.</p>
        )}
      </div>
    </div>
  );
}

// Fallback when backend is unavailable: derive probabilities from market odds
function MarketImpliedProbsSection({ match, homeName, awayName }: { match: ReturnType<typeof sgoEventToMatch>; homeName: string; awayName: string }) {
  const MAIN_MARKET_NAMES = ["1x2", "full time result", "moneyline", "h2h", "match winner", "result"];
  const mainMkt = match.allMarkets.find((m) => MAIN_MARKET_NAMES.some((n) => m.name.toLowerCase().includes(n)))
    ?? match.allMarkets[0];

  if (!mainMkt || mainMkt.selections.length < 2) {
    return (
      <div className="sportsbook-card p-5 text-sm text-text-muted">
        No prediction data available for this match.
      </div>
    );
  }

  // Normalise implied probs from odds
  const sels = mainMkt.selections;
  const rawProbs = sels.map((s) => s.impliedProb ?? (s.odds > 0 ? 1 / s.odds : 0));
  const total = rawProbs.reduce((a, b) => a + b, 0);
  const normProbs = rawProbs.map((p) => total > 0 ? p / total : 1 / rawProbs.length);
  const overround = total > 0 ? ((total - 1) * 100).toFixed(1) : null;

  const homeIdx = sels.findIndex((s) => s.label.toLowerCase().includes(homeName.toLowerCase().split(" ")[0]!) || s.id === "home" || s.id === "1");
  const awayIdx = sels.findIndex((s) => s.label.toLowerCase().includes(awayName.toLowerCase().split(" ")[0]!) || s.id === "away" || s.id === "2");
  const drawIdx = sels.findIndex((s) => s.id === "draw" || s.label.toLowerCase() === "draw" || s.label === "X");

  const hi = homeIdx >= 0 ? homeIdx : 0;
  const ai = awayIdx >= 0 ? awayIdx : (sels.length > 1 ? sels.length - 1 : 1);
  const di = drawIdx >= 0 ? drawIdx : -1;
  const hasDraw = di >= 0;

  const pHome = normProbs[hi] ?? 0;
  const pAway = normProbs[ai] ?? 0;
  const pDraw = di >= 0 ? (normProbs[di] ?? 0) : 0;

  const cols = [
    { label: `${homeName} win`, prob: pHome, color: "#22c55e", odds: sels[hi]?.odds },
    ...(hasDraw ? [{ label: "Draw", prob: pDraw, color: "#f59e0b", odds: sels[di]?.odds }] : []),
    { label: `${awayName} win`, prob: pAway, color: "#a855f7", odds: sels[ai]?.odds }
  ];

  // Derive expected goals from totals markets
  const totalsMkt = match.allMarkets.find((m) => m.name.toLowerCase().includes("total") && !m.name.toLowerCase().includes("home") && !m.name.toLowerCase().includes("away") && !m.name.toLowerCase().includes("player"));
  const over25 = totalsMkt?.selections.find((s) => s.label.toLowerCase().includes("over") && s.label.includes("2.5"));
  const homeTotalMkt = match.allMarkets.find((m) => m.name.toLowerCase().includes("home total") || (m.name.toLowerCase().includes("home") && m.name.toLowerCase().includes("total")));
  const awayTotalMkt = match.allMarkets.find((m) => m.name.toLowerCase().includes("away total") || (m.name.toLowerCase().includes("away") && m.name.toLowerCase().includes("total")));
  const homeOver15 = homeTotalMkt?.selections.find((s) => s.label.toLowerCase().includes("over") && s.label.includes("1.5"));
  const awayOver15 = awayTotalMkt?.selections.find((s) => s.label.toLowerCase().includes("over") && s.label.includes("1.5"));

  // Expected goals: P(>1.5 goals) implies mean of a Poisson ~ -ln(1-p) roughly
  const expGoals = (sel: typeof over25) => {
    if (!sel) return null;
    const p = sel.odds > 0 ? 1 / sel.odds : 0;
    // Invert Poisson CDF: P(X>=2) = 1 - e^(-λ)(1+λ) ≈ 1 - e^(-λ) for λ>1.5
    return p > 0 && p < 1 ? Math.max(0.5, -Math.log(1 - p) * 1.1).toFixed(1) : null;
  };
  const homeXG = expGoals(homeOver15);
  const awayXG = expGoals(awayOver15);

  // Favorite indicator
  const favorite = pHome > pAway ? homeName : awayName;
  const favoriteProb = Math.max(pHome, pAway);
  const spreadMkt = match.allMarkets.find((m) => m.name.toLowerCase().includes("spread") || m.name.toLowerCase().includes("handicap") || m.name.toLowerCase().includes("asian"));

  return (
    <>
      <Card title="Market-Implied Probabilities">
        <div className={cn("grid gap-3 mb-3", hasDraw ? "grid-cols-3" : "grid-cols-2")}>
          {cols.map(({ label, prob, color, odds }) => (
            <div key={label} className="rounded-xl border p-3 text-center" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <div className="text-[9px] uppercase tracking-[0.14em] text-text-muted mb-1 truncate">{label}</div>
              <div className="text-2xl font-bold" style={{ color }}>{Math.round(prob * 100)}%</div>
              {odds && <div className="text-[10px] text-text-muted mt-0.5">{odds.toFixed(2)}</div>}
              <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--bg3)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.round(prob * 100)}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg p-2.5" style={{ background: "var(--bg2)", border: "1px solid var(--border0)" }}>
            <div className="text-text-muted mb-0.5">Favourite</div>
            <div className="font-semibold text-text-primary truncate">{favorite}</div>
            <div style={{ color: "#22c55e" }}>{Math.round(favoriteProb * 100)}% implied win</div>
          </div>
          {overround && (
            <div className="rounded-lg p-2.5" style={{ background: "var(--bg2)", border: "1px solid var(--border0)" }}>
              <div className="text-text-muted mb-0.5">Book margin</div>
              <div className="font-semibold text-text-primary">{overround}%</div>
              <div className="text-text-muted">over-round</div>
            </div>
          )}
        </div>
        <div className="pt-2 text-[10px] text-text-muted">Derived from {mainMkt.name} odds</div>
      </Card>

      {(homeXG || awayXG || spreadMkt || over25) && (
        <Card title="Match Projections">
          <div className="space-y-2 text-[12px]">
            {(homeXG || awayXG) && (
              <div className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "var(--border0)" }}>
                <span className="text-text-muted">Expected goals</span>
                <span className="font-semibold text-text-primary">
                  {homeXG ?? "?"} – {awayXG ?? "?"}
                  <span className="text-text-muted font-normal ml-1">({homeName.split(" ")[0]} – {awayName.split(" ")[0]})</span>
                </span>
              </div>
            )}
            {over25 && (
              <div className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "var(--border0)" }}>
                <span className="text-text-muted">Over 2.5 goals</span>
                <span className="font-semibold" style={{ color: "#22c55e" }}>
                  {Math.round((over25.odds > 0 ? 1 / over25.odds : 0) * 100)}% · {over25.odds.toFixed(2)}
                </span>
              </div>
            )}
            {spreadMkt?.selections.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-1.5 border-b last:border-0" style={{ borderColor: "var(--border0)" }}>
                <span className="text-text-muted">{s.label}</span>
                <span className="font-semibold text-text-primary">{s.odds.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

interface Props {
  event: SGOEvent;
  sport: SportSlug;
  backendMatch?: SportMatchDetail | null;
  eloHome?: EloPoint[];
  eloAway?: EloPoint[];
}

export function SGOMatchDetail({ event, sport, backendMatch: backendMatchProp, eloHome: eloHomeProp = [], eloAway: eloAwayProp = [] }: Props) {
  const match = sgoEventToMatch(event, sport);
  const cfg = SPORT_CONFIG[sport];
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const matchLabel = `${match.home.name} vs ${match.away.name}`;

  // backendMatch starts from SSR prop but can be fetched client-side if SSR returned null
  const [backendMatch, setBackendMatch] = useState<SportMatchDetail | null>(backendMatchProp ?? null);
  const [eloHome, setEloHome] = useState<EloPoint[]>(eloHomeProp);
  const [eloAway, setEloAway] = useState<EloPoint[]>(eloAwayProp);
  const [loadingBackend, setLoadingBackend] = useState(!backendMatchProp);

  useEffect(() => {
    if (backendMatch) { setLoadingBackend(false); return; } // SSR already provided it
    const sgoHome = event.teams?.home?.names?.long ?? "";
    const sgoAway = event.teams?.away?.names?.long ?? "";

    // Try both relative (rewrite) and absolute (env var) base URLs
    const API_BASES = [
      "/api/v1",
      ...(process.env.NEXT_PUBLIC_API_URL ? [`${process.env.NEXT_PUBLIC_API_URL}/api/v1`] : []),
    ];

    async function tryFetch(base: string): Promise<SportMatchDetail | null> {
      const searchTerm = sport === "tennis" ? (sgoHome.split(" ").pop() ?? sgoHome) : sgoHome;
      let detail: SportMatchDetail | null = null;
      try {
        const searchRes = await fetch(`${base}/matches/search?q=${encodeURIComponent(searchTerm)}&limit=20`);
        if (searchRes.ok) {
          const results: Array<{ id: string; type: string; sport: string; title: string }> = await searchRes.json();
          const best = results.find(
            (r) => r.type === "match" && r.sport === sport &&
              r.title.split(" vs ").pop()?.toLowerCase().includes(sgoAway.toLowerCase().split(" ")[0] ?? "")
          );
          if (best) {
            const dr = await fetch(`${base}/sports/${sport}/matches/${best.id}`);
            if (dr.ok) detail = await dr.json();
          }
        }
        if (!detail) {
          const pr = await fetch(`${base}/sports/${sport}/matches/preview?home=${encodeURIComponent(sgoHome)}&away=${encodeURIComponent(sgoAway)}`);
          if (pr.ok) detail = await pr.json();
        }
      } catch { /* try next base */ }
      return detail;
    }

    async function fetchBackend() {
      try {
        let detail: SportMatchDetail | null = null;
        for (const base of API_BASES) {
          detail = await tryFetch(base);
          if (detail) break;
        }
        if (detail) {
          setBackendMatch(detail);
          if (!detail.id.startsWith("preview-") && detail.home?.id && detail.away?.id) {
            const base = API_BASES[0];
            const eloBase = sport === "tennis" ? `${base}/sports/tennis/players` : `${base}/sports/${sport}/teams`;
            const [eh, ea] = await Promise.all([
              fetch(`${eloBase}/${detail.home.id}/elo-history?limit=30`),
              fetch(`${eloBase}/${detail.away.id}/elo-history?limit=30`),
            ]);
            if (eh.ok) { const d = await eh.json(); setEloHome(Array.isArray(d) ? d : (d.history ?? [])); }
            if (ea.ok) { const d = await ea.json(); setEloAway(Array.isArray(d) ? d : (d.history ?? [])); }
          }
        }
      } catch (err) {
        console.error("[SGOMatchDetail] client-side backend fetch failed:", err);
      } finally {
        setLoadingBackend(false);
      }
    }
    void fetchBackend();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(["Full Game"]));
  const toggleCat = (cat: string) => setExpandedCats((prev) => {
    const next = new Set(prev);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    return next;
  });

  const grouped = categorizeMarkets(match.allMarkets);
  const orderedCats = CATEGORY_ORDER.filter((c) => grouped[c]?.length);

  const hasInfoData = !!(backendMatch || event.results?.game || event.info?.venue);

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 lg:px-6 space-y-4">

      {/* Hero — full width */}
      <div className="sportsbook-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full text-base" style={{ background: `${cfg.color}16`, color: cfg.color }}>{cfg.icon}</span>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-text-subtle">{cfg.label}</div>
              <div className="text-sm font-medium text-text-primary">{match.league}</div>
            </div>
          </div>
          {isLive ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1" style={{ borderColor: `${cfg.color}35`, background: `${cfg.color}12` }}>
              <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: cfg.color }} />
              <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: cfg.color }}>Live {match.liveClock ? `· ${match.liveClock}` : ""}</span>
            </div>
          ) : isFinished ? (
            <span className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>Final</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <Timer size={12} /> {formatKickoff(match.startTime)}
            </span>
          )}
        </div>

        <div className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">Home</p>
            <p className="mt-1 text-2xl font-bold leading-tight text-text-primary">{match.home.name}</p>
          </div>
          {match.homeScore != null && match.awayScore != null ? (
            <div className="rounded-2xl border px-5 py-3 text-center" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <div className="text-[10px] uppercase tracking-[0.18em] text-text-subtle mb-1">score</div>
              <div className="flex items-center justify-center gap-3 text-3xl font-mono font-bold text-text-primary">
                <span>{match.homeScore}</span><span className="text-text-subtle">–</span><span>{match.awayScore}</span>
              </div>
            </div>
          ) : (
            <div className="text-center text-2xl font-thin text-text-subtle">vs</div>
          )}
          <div className="text-left lg:text-right">
            <p className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">Away</p>
            <p className="mt-1 text-2xl font-bold leading-tight text-text-primary">{match.away.name}</p>
          </div>
        </div>
      </div>

      {/* Info grid — two columns on desktop */}
      {hasInfoData && (
        <div className="grid gap-4 lg:grid-cols-2">

          {/* Left info column */}
          <div className="space-y-3">
            {sport === "tennis" ? (
              /* Tennis: match info, serve stats, tiebreaks, profiles */
              backendMatch && (
                <>
                  <TennisOddsSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
                  <TennisInfoSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
                  <TennisServeStatsSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
                  <TennisTiebreakSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
                  <TennisProfileSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
                </>
              )
            ) : (
              /* Other sports: SGO live data */
              <>
                <SGOVenueSection event={event} />
                <SGOTeamStatsSection event={event} homeName={match.home.name} awayName={match.away.name} />
                {backendMatch && (isLive || isFinished) && <EventsSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />}
                <LiveStatsSection match={backendMatch ?? ({} as SportMatchDetail)} homeName={match.home.name} awayName={match.away.name} />
                <SGOPlayerStatsSection event={event} homeName={match.home.name} awayName={match.away.name} />
                {backendMatch && <LineupSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />}
                {backendMatch && sport === "basketball" && <BasketballBoxScoreSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />}
                {backendMatch && <InjuriesSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />}
                {backendMatch && <HighlightsSection match={backendMatch} />}
                {backendMatch && sport === "soccer" && <FullStandingsSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />}
              </>
            )}
          </div>

          {/* Right info column: model + analytics */}
          <div className="space-y-3">
            {backendMatch ? (
              <>
                <PreMatchAnalysisSection
                  matchId={backendMatch.id}
                  isFinished={isFinished}
                  previewParams={backendMatch.id.startsWith("preview-") ? {
                    home: backendMatch.home.name,
                    away: backendMatch.away.name,
                    sport: backendMatch.sport ?? sport,
                    league: backendMatch.league ?? undefined,
                    p_home: backendMatch.probabilities?.home_win ?? undefined,
                    p_draw: backendMatch.probabilities?.draw ?? undefined,
                    p_away: backendMatch.probabilities?.away_win ?? undefined,
                    confidence: backendMatch.confidence ?? undefined,
                    fair_home: backendMatch.fair_odds?.home_win ?? undefined,
                    fair_draw: backendMatch.fair_odds?.draw ?? undefined,
                    fair_away: backendMatch.fair_odds?.away_win ?? undefined,
                    elo_home: typeof backendMatch.elo_home === "object" && backendMatch.elo_home ? (backendMatch.elo_home as { rating?: number }).rating : null,
                    elo_away: typeof backendMatch.elo_away === "object" && backendMatch.elo_away ? (backendMatch.elo_away as { rating?: number }).rating : null,
                  } : undefined}
                />
                <ProbabilitiesSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
                <EloSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} eloHome={eloHome} eloAway={eloAway} cfg={cfg} />
                {sport === "tennis" ? (
                  <TennisFormSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
                ) : sport === "soccer" ? (
                  <SoccerFormSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
                ) : (
                  <FormSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
                )}
                <H2HSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
                {sport !== "tennis" && <LeagueContextSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />}
                <KeyDriversSection match={backendMatch} />
                <SimulationSection match={backendMatch} />
                {sport === "soccer" && <SoccerOddsEdgeSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />}
                <ModelMetaSection match={backendMatch} />
                {sport === "soccer" ? (
                  <SoccerStatsBarSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
                ) : sport !== "tennis" ? (
                  <StatsSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
                ) : null}
                {sport !== "tennis" && <AdvancedStatsSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />}
                <ContextSection match={backendMatch} />
                {sport === "esports" && <EsportsInfoSection match={backendMatch} />}
                {sport !== "tennis" && <RefereeSection match={backendMatch} />}
              </>
            ) : loadingBackend ? (
              <div className="sportsbook-card p-5 flex items-center gap-2 text-sm text-text-muted">
                <Loader2 size={14} className="animate-spin" /> Loading predictions…
              </div>
            ) : (
              <MarketImpliedProbsSection match={match} homeName={match.home.name} awayName={match.away.name} />
            )}
          </div>
        </div>
      )}

      {/* Odds — full width at bottom */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted px-1">Betting Markets</div>
        {orderedCats.length === 0 && !isFinished && (
          <div className="rounded-[20px] border px-5 py-8 text-center text-sm text-text-muted" style={{ borderColor: "var(--border0)" }}>
            No odds available for this match.
          </div>
        )}
        {orderedCats.map((cat) => {
          const markets = grouped[cat];
          const isExpanded = expandedCats.has(cat);
          const hasEdge = markets.some((m) => m.selections.some((s) => (s.edge ?? 0) >= 0.05));
          return (
            <div key={cat} className="sportsbook-card overflow-hidden">
              <button onClick={() => toggleCat(cat)} className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary">{cat}</span>
                  <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>{markets.length}</span>
                  {hasEdge && (
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]"
                      style={{ borderColor: "rgba(251,191,36,0.30)", background: "rgba(251,191,36,0.12)", color: "#f59e0b" }}>
                      <Flame size={9} /> Value
                    </span>
                  )}
                </div>
                {isExpanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
              </button>
              {isExpanded && (
                <div className="border-t px-4 py-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" style={{ borderColor: "var(--border0)" }}>
                  {markets.map((mkt) => (
                    <MarketSection key={mkt.id} market={mkt} matchId={match.id} matchLabel={matchLabel}
                      sport={sport} league={match.league} startTime={match.startTime} isFinished={isFinished} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {isFinished && <p className="text-center text-sm text-text-muted py-2">This match has ended — odds are no longer available.</p>}
      </div>

    </div>
  );
}
