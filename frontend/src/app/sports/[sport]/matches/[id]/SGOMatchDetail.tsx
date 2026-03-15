"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Timer, Flame, TrendingUp, Shield, MapPin, Cloud, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SportSlug, Market, Selection } from "@/lib/betting-types";
import { SPORT_CONFIG } from "@/lib/betting-types";
import { useBetting } from "@/components/betting/BettingContext";
import { sgoEventToMatch } from "@/lib/sgo";
import type { SGOEvent } from "@/lib/sgo";
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
    <div className="sportsbook-card p-5 space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{title}</div>
      {children}
    </div>
  );
}

function StatRow({ label, home, away }: { label: string; home: unknown; away: unknown }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
      <span className="text-right text-sm text-text-primary">{fmt(home)}</span>
      <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted text-center min-w-[80px]">{label.replace(/_/g, " ")}</span>
      <span className="text-sm text-text-primary">{fmt(away)}</span>
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
    <div className="rounded-[20px] border p-4 text-center" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-text-muted mb-2 truncate">{label}</div>
      <div className="text-3xl font-bold" style={{ color }}>{pct}%</div>
      <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg3)" }}>
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
      {match.model && (
        <div className="text-[10px] text-text-muted pt-1">
          Model: {match.model.version ?? "—"} · Acc: {match.model.accuracy != null ? `${(match.model.accuracy * 100).toFixed(1)}%` : "—"}
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
    <div className="rounded-[20px] border p-4" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-text-muted mb-1 truncate">{name}</div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="text-2xl font-bold text-text-primary">{rating != null ? Math.round(Number(rating)) : "—"}</span>
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
          const results: string[] = (form.recent_results as string[] | undefined) ?? [];
          const pts = form.form_pts ?? form.wins;
          const gf = form.goals_scored_avg ?? form.avg_runs_for ?? form.maps_won;
          const ga = form.goals_against_avg ?? form.avg_runs_against;
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
                {gf != null && <span>GF avg: <b className="text-text-primary">{fmt(gf)}</b></span>}
                {ga != null && <span>GA avg: <b className="text-text-primary">{fmt(ga)}</b></span>}
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

function TennisInfoSection({ match }: { match: SportMatchDetail }) {
  const info = (match as unknown as Record<string, unknown>).tennis_info as Record<string, unknown> | null | undefined;
  if (!info) return null;
  return (
    <Card title="Match Details">
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { label: "Surface", value: info.surface },
          { label: "Round", value: info.round_name },
          { label: "Format", value: info.best_of ? `Best of ${info.best_of}` : null },
          { label: "Indoor", value: info.is_indoor != null ? (info.is_indoor ? "Indoor" : "Outdoor") : null },
          { label: "Level", value: info.tournament_level },
          { label: "Court speed", value: info.court_speed_index ? `${info.court_speed_index}/100` : null },
          { label: "Prize pool", value: info.tournament_prize_pool_usd ? `$${Number(info.tournament_prize_pool_usd).toLocaleString()}` : null },
          { label: "Draw size", value: info.draw_size },
        ].filter((r) => r.value != null).map(({ label, value }) => (
          <div key={label} className="rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
            <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">{label}</div>
            <div className="text-sm text-text-primary">{String(value)}</div>
          </div>
        ))}
      </div>
      {/* Rest days */}
      {(info.player_a_days_rest != null || info.player_b_days_rest != null) && (
        <div className="flex gap-3 text-[11px] text-text-muted">
          {info.player_a_days_rest != null && <span>Home rest: <b className="text-text-primary">{String(info.player_a_days_rest)}d</b></span>}
          {info.player_b_days_rest != null && <span>Away rest: <b className="text-text-primary">{String(info.player_b_days_rest)}d</b></span>}
        </div>
      )}
    </Card>
  );
}

function TennisProfileSection({ match, homeName, awayName }: { match: SportMatchDetail; homeName: string; awayName: string }) {
  const ph = (match as unknown as Record<string, unknown>).profile_home as Record<string, unknown> | null | undefined;
  const pa = (match as unknown as Record<string, unknown>).profile_away as Record<string, unknown> | null | undefined;
  if (!ph && !pa) return null;

  return (
    <Card title="Player Profiles">
      <div className="grid gap-3 sm:grid-cols-2">
        {[{ name: homeName, p: ph }, { name: awayName, p: pa }].map(({ name, p }) => {
          if (!p) return null;
          return (
            <div key={name} className="rounded-xl border p-3 space-y-2" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <div className="text-sm font-semibold text-text-primary">{name}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                {[
                  ["Ranking", p.ranking ? `#${p.ranking}` : null],
                  ["Points", p.ranking_points],
                  ["Age", p.age],
                  ["Nationality", p.nationality],
                  ["Plays", p.plays],
                  ["Backhand", p.backhand],
                  ["Height", p.height_cm ? `${p.height_cm}cm` : null],
                  ["Turned pro", p.turned_pro],
                  ["Titles", p.career_titles],
                  ["Grand Slams", p.grand_slams],
                  ["Season W/L", (p.season_wins != null && p.season_losses != null) ? `${p.season_wins}/${p.season_losses}` : null],
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
  const lh = (match as unknown as Record<string, unknown>).lineup_home as Record<string, unknown> | null | undefined;
  const la = (match as unknown as Record<string, unknown>).lineup_away as Record<string, unknown> | null | undefined;
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
  const ih = (match as unknown as Record<string, unknown>).injuries_home as Array<Record<string, unknown>> | null | undefined;
  const ia = (match as unknown as Record<string, unknown>).injuries_away as Array<Record<string, unknown>> | null | undefined;
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

// ─── Referee section ─────────────────────────────────────────────────────────

function RefereeSection({ match }: { match: SportMatchDetail }) {
  const ref = (match as unknown as Record<string, unknown>).referee as Record<string, unknown> | null | undefined;
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

interface Props {
  event: SGOEvent;
  sport: SportSlug;
  backendMatch?: SportMatchDetail | null;
  eloHome?: EloPoint[];
  eloAway?: EloPoint[];
}

export function SGOMatchDetail({ event, sport, backendMatch, eloHome = [], eloAway = [] }: Props) {
  const match = sgoEventToMatch(event, sport);
  const cfg = SPORT_CONFIG[sport];
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const matchLabel = `${match.home.name} vs ${match.away.name}`;

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(["Full Game"]));
  const toggleCat = (cat: string) => setExpandedCats((prev) => {
    const next = new Set(prev);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    return next;
  });

  const grouped = categorizeMarkets(match.allMarkets);
  const orderedCats = CATEGORY_ORDER.filter((c) => grouped[c]?.length);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <div className={cn("grid gap-6", backendMatch ? "lg:grid-cols-[1fr_400px]" : "")}>

        {/* Left: hero + odds */}
        <div className="space-y-4">

          {/* Hero */}
          <div className="sportsbook-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 pt-5">
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

            <div className="grid gap-4 px-5 py-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
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

          {/* Events timeline on left (only when finished/live) */}
          {backendMatch && (isLive || isFinished) && <EventsSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />}

          {/* Odds */}
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
                <button onClick={() => toggleCat(cat)} className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-white/[0.02]">
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
                  <div className="border-t px-5 py-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" style={{ borderColor: "var(--border0)" }}>
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

        {/* Right: all backend data */}
        {!backendMatch && (
          <div className="sportsbook-card p-5 text-sm text-text-muted">
            No model data found for this match.
          </div>
        )}
        {backendMatch && (
          <div className="space-y-4">
            <ProbabilitiesSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
            <EloSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} eloHome={eloHome} eloAway={eloAway} cfg={cfg} />
            <ContextSection match={backendMatch} />
            {sport === "tennis" && <TennisInfoSection match={backendMatch} />}
            {sport === "esports" && <EsportsInfoSection match={backendMatch} />}
            <FormSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
            {sport === "tennis" && <TennisProfileSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />}
            <KeyDriversSection match={backendMatch} />
            <H2HSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
            <StatsSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
            <SimulationSection match={backendMatch} />
            <LineupSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
            <InjuriesSection match={backendMatch} homeName={match.home.name} awayName={match.away.name} />
            <RefereeSection match={backendMatch} />
          </div>
        )}
      </div>
    </div>
  );
}
