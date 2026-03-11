"use client";

import { useState } from "react";
import { useLiveRefresh } from "@/lib/hooks/useLiveRefresh";
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
import type {
  HockeyMatchDetail as TMatch,
  HockeyEloPanelOut,
  HockeyTeamFormOut,
  HockeyTeamStatsOut,
  HockeyLineupOut,
  HockeyEventOut,
} from "@/lib/types";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg0:         "#09090b",
  surface:     "#18181b",
  border:      "#27272a",
  textPrimary: "#f4f4f5",
  textMuted:   "#a1a1aa",
  textSubtle:  "#71717a",
  blue:        "#3b82f6",
  green:       "#22c55e",
  red:         "#ef4444",
  amber:       "#f59e0b",
  cyan:        "#06b6d4",
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, d = 1): string {
  if (n == null) return "—";
  return n.toFixed(d);
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return (n * 100).toFixed(1) + "%";
}
function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return String(Math.round(n));
}
function outcomeLabel(o: string | null | undefined): string {
  if (!o) return "—";
  return o === "home_win" ? "Home Win" : o === "away_win" ? "Away Win" : "Draw";
}

// ─── Layout components ────────────────────────────────────────────────────────
function PanelCard({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-surface-overlay border border-surface-border rounded-xl p-4", className)}>
      {title && <div className="text-[10px] uppercase tracking-widest text-text-subtle mb-3">{title}</div>}
      {children}
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center h-20 text-text-subtle text-xs text-center px-4">{msg}</div>
  );
}

function SideGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">{children}</div>;
}
function MainCol({ children }: { children: React.ReactNode }) {
  return <div className="lg:col-span-8 flex flex-col gap-4">{children}</div>;
}
function SideCol({ children }: { children: React.ReactNode }) {
  return <div className="lg:col-span-4 flex flex-col gap-4">{children}</div>;
}

// Stat duel row: home value | label | away value
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
}) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-surface-border/40 last:border-0">
      <span className={cn("text-xs w-[38%] text-right pr-3 tabular-nums font-mono", homeWins === true ? "text-accent-green font-semibold" : "text-text-muted")}>
        {home}
      </span>
      <span className="text-[10px] text-text-subtle w-[24%] text-center">{label}</span>
      <span className={cn("text-xs w-[38%] text-left pl-3 tabular-nums font-mono", homeWins === false ? "text-accent-green font-semibold" : "text-text-muted")}>
        {away}
      </span>
    </div>
  );
}

// ─── Period score table ───────────────────────────────────────────────────────
function PeriodScoreTable({ match }: { match: TMatch }) {
  const hp = match.home_periods;
  const ap = match.away_periods;
  if (!hp && !ap) return null;

  const periods: string[] = ["P1", "P2", "P3"];
  if (hp?.ot != null || ap?.ot != null) periods.push("OT");
  if (hp?.so != null || ap?.so != null) periods.push("SO");

  const hVals = [hp?.p1, hp?.p2, hp?.p3, ...(periods.includes("OT") ? [hp?.ot] : []), ...(periods.includes("SO") ? [hp?.so] : [])];
  const aVals = [ap?.p1, ap?.p2, ap?.p3, ...(periods.includes("OT") ? [ap?.ot] : []), ...(periods.includes("SO") ? [ap?.so] : [])];

  return (
    <div className="overflow-x-auto">
      <table className="text-xs font-mono tabular-nums text-right w-full border-collapse">
        <thead>
          <tr className="text-text-subtle border-b border-surface-border/40">
            <th className="text-left font-normal pr-4 py-1 font-sans">Team</th>
            {periods.map(p => <th key={p} className="w-10 py-1">{p}</th>)}
            <th className="pl-4 py-1 text-text-muted font-semibold">T</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-surface-border/30">
            <td className="text-left text-text-muted pr-4 py-1 font-sans font-medium">{match.home.name}</td>
            {hVals.map((v, i) => <td key={i} className="py-1 text-text-muted">{v ?? "—"}</td>)}
            <td className="pl-4 py-1 text-text-primary font-bold">{match.home_score ?? "—"}</td>
          </tr>
          <tr>
            <td className="text-left text-text-muted pr-4 py-1 font-sans font-medium">{match.away.name}</td>
            {aVals.map((v, i) => <td key={i} className="py-1 text-text-muted">{v ?? "—"}</td>)}
            <td className="pl-4 py-1 text-text-primary font-bold">{match.away_score ?? "—"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Match header ─────────────────────────────────────────────────────────────
function TeamBlock({ elo, name, form, isHome }: { elo: HockeyEloPanelOut | null | undefined; name: string; form: HockeyTeamFormOut | null | undefined; isHome: boolean }) {
  const align = isHome ? "items-end text-right" : "items-start text-left";
  return (
    <div className={cn("flex flex-col gap-1.5", align)}>
      <div className="text-lg font-bold text-text-primary leading-tight">{name}</div>
      {elo && (
        <div className="flex items-center gap-2">
          <span className="text-text-subtle text-xs">ELO</span>
          <span className="font-mono text-sm font-semibold" style={{ color: C.cyan }}>{fmtInt(elo.rating)}</span>
          {elo.rating_change != null && (
            <span className={cn("text-xs font-mono", elo.rating_change >= 0 ? "text-accent-green" : "text-accent-red")}>
              {elo.rating_change >= 0 ? "+" : ""}{fmt(elo.rating_change, 1)}
            </span>
          )}
        </div>
      )}
      {form && (
        <div className="flex gap-3 text-xs text-text-subtle">
          <span>{form.wins}W–{form.losses}L</span>
          {form.goals_scored_avg != null && <span>{fmt(form.goals_scored_avg)} GPG</span>}
        </div>
      )}
    </div>
  );
}

function MatchBlock({ match }: { match: TMatch }) {
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  return (
    <div className="flex flex-col items-center gap-2 min-w-[120px]">
      {isLive ? (
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-green-400 text-xs font-semibold uppercase tracking-widest">Live</span>
        </div>
      ) : (
        <div className={cn("text-xs uppercase tracking-widest font-semibold", isFinished ? "text-text-subtle" : "text-accent-amber")}>
          {isFinished ? "Final" : "Upcoming"}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="text-4xl font-black text-text-primary tabular-nums">
          {match.home_score ?? (isLive || isFinished ? "0" : "·")}
        </div>
        <div className="text-lg text-text-subtle font-light">–</div>
        <div className="text-4xl font-black text-text-primary tabular-nums">
          {match.away_score ?? (isLive || isFinished ? "0" : "·")}
        </div>
      </div>
      {isLive && match.current_period != null && (
        <div className="text-xs text-text-subtle">Period {match.current_period}</div>
      )}
      {isLive && match.live_clock && (
        <div className="text-xs font-mono text-green-400">{match.live_clock}</div>
      )}
      {!isLive && !isFinished && (
        <div className="text-xs text-text-subtle">
          {new Date(match.kickoff_utc).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}

// ─── Win probability bar ──────────────────────────────────────────────────────
function WinProbBar({ match }: { match: TMatch }) {
  const p = match.probabilities;
  if (!p) return null;
  const ph = Math.round(p.home_win * 100);
  const pa = Math.round(p.away_win * 100);
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-text-muted mb-1">
        <span className="font-semibold truncate max-w-[40%]">{match.home.name}</span>
        <span className="text-text-subtle text-[10px]">Win Probability</span>
        <span className="font-semibold truncate max-w-[40%] text-right">{match.away.name}</span>
      </div>
      <div className="flex h-5 rounded-full overflow-hidden">
        <div className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${ph}%`, background: C.blue }}>{ph}%</div>
        <div className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${pa}%`, background: "#6366f1" }}>{pa}%</div>
      </div>
      <div className="flex justify-between text-xs text-text-subtle">
        {match.fair_odds?.home_win && <span>Fair odds: {fmt(match.fair_odds.home_win, 2)}</span>}
        {match.confidence != null && <span>Confidence: {match.confidence}%</span>}
        {match.fair_odds?.away_win && <span>Fair odds: {fmt(match.fair_odds.away_win, 2)}</span>}
      </div>
    </div>
  );
}

// ─── Key drivers ──────────────────────────────────────────────────────────────
function KeyDrivers({ match }: { match: TMatch }) {
  if (!match.key_drivers?.length) return null;
  return (
    <div className="space-y-2">
      {match.key_drivers.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-text-muted capitalize">{d.feature.replace(/_/g, " ")}</span>
              <span className="text-text-subtle font-mono">{d.value != null ? fmt(d.value) : ""}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-border overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.round(d.importance * 100)}%`, background: C.blue }} />
            </div>
          </div>
          <span className="text-[10px] text-text-subtle w-8 text-right">{Math.round(d.importance * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

// ─── Team stats (shots, faceoffs, etc.) ──────────────────────────────────────
function TeamStatsPanel({ home, away, homeName, awayName }: { home: HockeyTeamStatsOut | null | undefined; away: HockeyTeamStatsOut | null | undefined; homeName: string; awayName: string }) {
  if (!home && !away) return <EmptyState msg="Live stats available during/after games." />;
  const h = home;
  const a = away;
  const cmp = (hv: number | null | undefined, av: number | null | undefined): boolean | undefined => {
    if (hv == null || av == null) return undefined;
    return hv > av;
  };
  return (
    <div>
      <div className="flex justify-between text-[10px] text-text-subtle mb-2 px-1">
        <span className="w-[38%] text-right font-semibold text-text-muted">{homeName}</span>
        <span className="w-[24%] text-center" />
        <span className="w-[38%] text-left font-semibold text-text-muted">{awayName}</span>
      </div>
      <StatDuel label="Shots" home={fmtInt(h?.shots)} away={fmtInt(a?.shots)} homeWins={cmp(h?.shots, a?.shots)} />
      <StatDuel label="SOG" home={fmtInt(h?.shots_on_goal)} away={fmtInt(a?.shots_on_goal)} homeWins={cmp(h?.shots_on_goal, a?.shots_on_goal)} />
      <StatDuel label="Hits" home={fmtInt(h?.hits)} away={fmtInt(a?.hits)} homeWins={cmp(h?.hits, a?.hits)} />
      <StatDuel label="Blocked" home={fmtInt(h?.blocked_shots)} away={fmtInt(a?.blocked_shots)} homeWins={cmp(h?.blocked_shots, a?.blocked_shots)} />
      <StatDuel label="FO Wins" home={fmtInt(h?.faceoff_wins)} away={fmtInt(a?.faceoff_wins)} homeWins={cmp(h?.faceoff_wins, a?.faceoff_wins)} />
      <StatDuel label="FO %" home={h?.faceoff_pct != null ? fmtInt(h.faceoff_pct) + "%" : "—"} away={a?.faceoff_pct != null ? fmtInt(a.faceoff_pct) + "%" : "—"} homeWins={cmp(h?.faceoff_pct, a?.faceoff_pct)} />
      <StatDuel label="PP" home={h?.power_plays != null && h?.power_play_goals != null ? `${h.power_play_goals}/${h.power_plays}` : "—"} away={a?.power_plays != null && a?.power_play_goals != null ? `${a.power_play_goals}/${a.power_plays}` : "—"} />
      <StatDuel label="PIM" home={fmtInt(h?.penalty_minutes)} away={fmtInt(a?.penalty_minutes)} homeWins={h?.penalty_minutes != null && a?.penalty_minutes != null ? h.penalty_minutes < a.penalty_minutes : undefined} />
    </div>
  );
}

// ─── Form panel ───────────────────────────────────────────────────────────────
function FormRow({ label, home, away }: { label: string; home: string; away: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-surface-border/40 last:border-0">
      <span className="text-xs text-text-muted w-[38%] text-right">{home}</span>
      <span className="text-[10px] text-text-subtle w-[24%] text-center">{label}</span>
      <span className="text-xs text-text-muted w-[38%] text-left">{away}</span>
    </div>
  );
}

function FormPanel({ home, away }: { home: HockeyTeamFormOut | null | undefined; away: HockeyTeamFormOut | null | undefined }) {
  if (!home && !away) return <EmptyState msg="Form data not available." />;
  const h = home;
  const a = away;
  return (
    <div>
      <div className="flex justify-between text-[10px] text-text-subtle mb-2 px-1">
        <span className="w-[38%] text-right font-semibold text-text-muted">{h?.team_name ?? "Home"}</span>
        <span className="w-[24%]" />
        <span className="w-[38%] text-left font-semibold text-text-muted">{a?.team_name ?? "Away"}</span>
      </div>
      <FormRow label="Record" home={h ? `${h.wins}W–${h.losses}L` : "—"} away={a ? `${a.wins}W–${a.losses}L` : "—"} />
      <FormRow label="Goals/G" home={fmt(h?.goals_scored_avg)} away={fmt(a?.goals_scored_avg)} />
      <FormRow label="GA/G" home={fmt(h?.goals_conceded_avg)} away={fmt(a?.goals_conceded_avg)} />
      <FormRow label="Form Pts" home={fmtInt(h?.form_pts)} away={fmtInt(a?.form_pts)} />
    </div>
  );
}

// ─── ELO chart ────────────────────────────────────────────────────────────────
function EloChart({
  homeName,
  awayName,
  eloHomeHistory,
  eloAwayHistory,
}: {
  homeName: string;
  awayName: string;
  eloHomeHistory: Array<{ date: string; rating: number }>;
  eloAwayHistory: Array<{ date: string; rating: number }>;
}) {
  const n = Math.max(eloHomeHistory.length, eloAwayHistory.length);
  if (n === 0) return <EmptyState msg="ELO history not available." />;

  const data = Array.from({ length: Math.max(eloHomeHistory.length, eloAwayHistory.length) }, (_, i) => ({
    i: i + 1,
    home: eloHomeHistory[i]?.rating ?? null,
    away: eloAwayHistory[i]?.rating ?? null,
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="i" tick={{ fontSize: 9, fill: "#71717a" }} />
        <YAxis tick={{ fontSize: 9, fill: "#71717a" }} domain={["auto", "auto"]} />
        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 10, color: "#a1a1aa" }} />
        <Line type="monotone" dataKey="home" name={homeName} stroke={C.blue} dot={false} strokeWidth={2} connectNulls />
        <Line type="monotone" dataKey="away" name={awayName} stroke="#a855f7" dot={false} strokeWidth={2} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── H2H panel ────────────────────────────────────────────────────────────────
function H2HPanel({ match }: { match: TMatch }) {
  const h2h = match.h2h;
  if (!h2h || h2h.total_matches === 0) return <EmptyState msg="No head-to-head history found." />;
  const total = h2h.total_matches;
  const hwPct = total > 0 ? Math.round((h2h.home_wins / total) * 100) : 0;
  const awPct = total > 0 ? Math.round((h2h.away_wins / total) * 100) : 0;
  const drawPct = 100 - hwPct - awPct;
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs text-text-subtle">
        <span className="font-semibold text-text-muted">{match.home.name}</span>
        <span>{total} games</span>
        <span className="font-semibold text-text-muted">{match.away.name}</span>
      </div>
      <div className="flex h-4 rounded-full overflow-hidden text-[9px] font-bold text-white">
        {hwPct > 0 && <div className="flex items-center justify-center" style={{ width: `${hwPct}%`, background: C.blue }}>{hwPct}%</div>}
        {drawPct > 0 && <div className="flex items-center justify-center" style={{ width: `${drawPct}%`, background: "#52525b" }}>{drawPct}%</div>}
        {awPct > 0 && <div className="flex items-center justify-center" style={{ width: `${awPct}%`, background: "#a855f7" }}>{awPct}%</div>}
      </div>
      <div className="flex justify-between text-xs text-text-subtle">
        <span>{h2h.home_wins}W</span>
        <span>{total - h2h.home_wins - h2h.away_wins}D</span>
        <span>{h2h.away_wins}W</span>
      </div>
      {h2h.recent_matches.length > 0 && (
        <div className="space-y-1 pt-1">
          {h2h.recent_matches.slice(0, 5).map((m: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-xs text-text-subtle py-0.5 border-b border-surface-border/30 last:border-0">
              <span className="text-[10px] text-text-subtle w-20 shrink-0">{m.date ? new Date(m.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" }) : "—"}</span>
              <span className="font-mono tabular-nums text-text-muted">{m.home_score ?? "?"} – {m.away_score ?? "?"}</span>
              <span className={cn("text-[10px] w-16 text-right", m.outcome === "home_win" ? "text-blue-400" : m.outcome === "away_win" ? "text-purple-400" : "text-text-subtle")}>
                {m.outcome === "home_win" ? match.home.name.split(" ").pop() : m.outcome === "away_win" ? match.away.name.split(" ").pop() : "Draw"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Odds panel ───────────────────────────────────────────────────────────────
function OddsPanel({ match }: { match: TMatch }) {
  const hasOdds = match.odds_home != null || match.odds_away != null;
  if (!hasOdds) return <EmptyState msg="Live odds not available." />;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col items-center justify-center rounded-lg border border-surface-border p-3 gap-1">
        <span className="text-[10px] text-text-subtle">{match.home.name}</span>
        <span className="text-xl font-black font-mono tabular-nums text-text-primary">{fmt(match.odds_home, 2)}</span>
        {match.fair_odds?.home_win && <span className="text-[10px] text-text-subtle">Fair: {fmt(match.fair_odds.home_win, 2)}</span>}
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-surface-border p-3 gap-1">
        <span className="text-[10px] text-text-subtle">{match.away.name}</span>
        <span className="text-xl font-black font-mono tabular-nums text-text-primary">{fmt(match.odds_away, 2)}</span>
        {match.fair_odds?.away_win && <span className="text-[10px] text-text-subtle">Fair: {fmt(match.fair_odds.away_win, 2)}</span>}
      </div>
    </div>
  );
}

// ─── ELO panel ────────────────────────────────────────────────────────────────
function EloPanel({ elo, label }: { elo: HockeyEloPanelOut | null | undefined; label: string }) {
  if (!elo) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] text-text-subtle">{label}</div>
      <div className="text-lg font-bold font-mono tabular-nums" style={{ color: C.cyan }}>{fmtInt(elo.rating)}</div>
      {elo.rating_change != null && (
        <div className={cn("text-xs font-mono", elo.rating_change >= 0 ? "text-accent-green" : "text-accent-red")}>
          {elo.rating_change >= 0 ? "▲ +" : "▼ "}{fmt(Math.abs(elo.rating_change), 1)}
        </div>
      )}
    </div>
  );
}

// ─── Events feed ─────────────────────────────────────────────────────────────
function EventTypeIcon({ type }: { type: string | null | undefined }) {
  const t = (type || "").toLowerCase();
  if (t === "goal" || t === "shootout_goal") return <span className="text-accent-green font-bold text-xs">⬤</span>;
  if (t.includes("penalty")) return <span className="text-accent-amber text-xs">⬛</span>;
  if (t === "fight") return <span className="text-accent-red text-xs">✕</span>;
  return <span className="text-text-subtle text-xs">·</span>;
}

function EventsFeed({ events, homeName, awayName }: { events: HockeyEventOut[]; homeName: string; awayName: string }) {
  const goalEvents = events.filter(e => e.type === "goal" || e.type === "shootout_goal" || e.type === "penalty_shot");
  const allEvents = events.filter(e => !["period_start", "period_end"].includes(e.type || ""));
  if (!allEvents.length) return <EmptyState msg="No events yet. Available during and after games." />;
  return (
    <div className="space-y-1">
      {allEvents.map((ev, i) => {
        const isHome = ev.team === "home";
        return (
          <div key={i} className={cn("flex items-start gap-2 py-1.5 border-b border-surface-border/30 last:border-0", isHome ? "flex-row" : "flex-row-reverse")}>
            <div className={cn("flex items-center gap-1.5 min-w-[28px]", isHome ? "justify-start" : "justify-end")}>
              <EventTypeIcon type={ev.type} />
              {ev.period && <span className="text-[9px] text-text-subtle">P{ev.period}</span>}
            </div>
            <div className={cn("flex-1 min-w-0", isHome ? "text-left" : "text-right")}>
              <div className="flex items-baseline gap-1.5 flex-wrap" style={{ justifyContent: isHome ? "flex-start" : "flex-end" }}>
                {ev.player_name && <span className="text-xs text-text-muted font-semibold">{ev.player_name}</span>}
                {ev.assist1 && <span className="text-[10px] text-text-subtle">({ev.assist1}{ev.assist2 ? `, ${ev.assist2}` : ""})</span>}
              </div>
              {ev.description && !ev.player_name && <div className="text-[10px] text-text-subtle">{ev.description}</div>}
              {ev.time && <div className="text-[9px] text-text-subtle">{ev.time}</div>}
            </div>
            {ev.score_home != null && ev.score_away != null && (
              <div className="text-[10px] font-mono text-text-subtle shrink-0 tabular-nums">
                {ev.score_home}–{ev.score_away}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Lineup panel ─────────────────────────────────────────────────────────────
function LineupSide({ lineup, isHome }: { lineup: HockeyLineupOut | null | undefined; isHome: boolean }) {
  if (!lineup) return <div className="text-text-subtle text-xs text-center py-4">No lineup data</div>;
  const goalies = lineup.players.filter(p => p.is_goalie);
  const skaters = lineup.players.filter(p => !p.is_goalie && p.is_starter);
  const align = isHome ? "text-left" : "text-right";
  return (
    <div className={cn("space-y-2", align)}>
      {goalies.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wider text-text-subtle mb-1">Goalie</div>
          {goalies.map((p, i) => (
            <div key={i} className="text-xs text-text-muted">
              {p.number && <span className="font-mono text-text-subtle mr-1.5">#{p.number}</span>}
              {p.name}
            </div>
          ))}
        </div>
      )}
      {skaters.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wider text-text-subtle mb-1">Skaters</div>
          {skaters.map((p, i) => (
            <div key={i} className="text-xs text-text-muted">
              {p.number && <span className="font-mono text-text-subtle mr-1.5">#{p.number}</span>}
              {p.name}
              {p.position && <span className="text-[9px] text-text-subtle ml-1">{p.position}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LineupPanel({ home, away, homeName, awayName }: { home: HockeyLineupOut | null | undefined; away: HockeyLineupOut | null | undefined; homeName: string; awayName: string }) {
  if (!home && !away) return <EmptyState msg="Lineups available closer to puck drop." />;
  return (
    <div className="grid grid-cols-2 gap-4 divide-x divide-surface-border/40">
      <div>
        <div className="text-[10px] font-semibold text-text-muted mb-2">{homeName}</div>
        <LineupSide lineup={home} isHome />
      </div>
      <div className="pl-4">
        <div className="text-[10px] font-semibold text-text-muted mb-2 text-right">{awayName}</div>
        <LineupSide lineup={away} isHome={false} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  match: TMatch;
  eloHomeHistory: Array<{ date: string; rating: number; match_id?: string | null }>;
  eloAwayHistory: Array<{ date: string; rating: number; match_id?: string | null }>;
}

export function HockeyMatchDetail({ match: initialMatch, eloHomeHistory, eloAwayHistory }: Props) {
  const { data: match } = useLiveRefresh<TMatch>(
    initialMatch,
    `/sports/hockey/matches/${initialMatch.id}`,
    initialMatch.status === "live" ? 30000 : 0
  );

  const isLive = match.status === "live";
  const isFinished = match.status === "finished";

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">

      {/* ── Header card ── */}
      <PanelCard>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-widest text-text-subtle">{match.league}</span>
          {match.season && <span className="text-[10px] text-text-subtle">{match.season}</span>}
        </div>
        <div className="grid grid-cols-3 items-center gap-2 py-2">
          <TeamBlock elo={match.elo_home} name={match.home.name} form={match.form_home} isHome />
          <MatchBlock match={match} />
          <div className="flex justify-end">
            <TeamBlock elo={match.elo_away} name={match.away.name} form={match.form_away} isHome={false} />
          </div>
        </div>
        {(match.home_periods || match.away_periods) && (
          <div className="mt-3 pt-3 border-t border-surface-border/40">
            <PeriodScoreTable match={match} />
          </div>
        )}
        {isFinished && match.outcome && (
          <div className="mt-2 pt-2 border-t border-surface-border/40 text-center text-xs text-text-subtle">
            Result: <span className="text-text-muted font-semibold">{outcomeLabel(match.outcome)}</span>
          </div>
        )}
        {match.context?.venue_name && (
          <div className="mt-1 text-center text-[10px] text-text-subtle">{match.context.venue_name}</div>
        )}
      </PanelCard>

      {/* ── Main content ── */}
      <SideGrid>
        <MainCol>

          {/* Win probability */}
          {match.probabilities && (
            <PanelCard title="Win Probability">
              <WinProbBar match={match} />
              {match.key_drivers?.length ? (
                <div className="mt-4 pt-3 border-t border-surface-border/40">
                  <div className="text-[10px] uppercase tracking-widest text-text-subtle mb-3">Key Drivers</div>
                  <KeyDrivers match={match} />
                </div>
              ) : null}
            </PanelCard>
          )}

          {/* Team stats */}
          <PanelCard title="Team Stats">
            <TeamStatsPanel
              home={match.stats_home}
              away={match.stats_away}
              homeName={match.home.name}
              awayName={match.away.name}
            />
          </PanelCard>

          {/* ELO chart */}
          <PanelCard title="ELO History">
            <EloChart
              homeName={match.home.name}
              awayName={match.away.name}
              eloHomeHistory={eloHomeHistory}
              eloAwayHistory={eloAwayHistory}
            />
          </PanelCard>

          {/* Events */}
          <PanelCard title="Game Events">
            <EventsFeed events={match.events ?? []} homeName={match.home.name} awayName={match.away.name} />
          </PanelCard>

          {/* H2H */}
          <PanelCard title="Head-to-Head">
            <H2HPanel match={match} />
          </PanelCard>

        </MainCol>

        <SideCol>

          {/* ELO ratings */}
          <PanelCard title="ELO Ratings">
            <div className="grid grid-cols-2 gap-4">
              <EloPanel elo={match.elo_home} label={match.home.name} />
              <EloPanel elo={match.elo_away} label={match.away.name} />
            </div>
          </PanelCard>

          {/* Odds */}
          <PanelCard title="Odds">
            <OddsPanel match={match} />
          </PanelCard>

          {/* Lineups */}
          <PanelCard title="Lineup">
            <LineupPanel home={match.lineup_home} away={match.lineup_away} homeName={match.home.name} awayName={match.away.name} />
          </PanelCard>

          {/* Form */}
          <PanelCard title="Recent Form">
            <FormPanel home={match.form_home} away={match.form_away} />
          </PanelCard>

          {/* Model info */}
          {match.model && (
            <PanelCard title="Model">
              <div className="space-y-1 text-xs text-text-subtle">
                <div className="flex justify-between"><span>Version</span><span className="text-text-muted font-mono">{match.model.version}</span></div>
                {match.model.algorithm && <div className="flex justify-between"><span>Algorithm</span><span className="text-text-muted">{match.model.algorithm}</span></div>}
                {match.model.accuracy != null && <div className="flex justify-between"><span>Accuracy</span><span className="text-text-muted font-mono">{fmtPct(match.model.accuracy)}</span></div>}
                {match.model.brier_score != null && <div className="flex justify-between"><span>Brier Score</span><span className="text-text-muted font-mono">{fmt(match.model.brier_score, 3)}</span></div>}
              </div>
            </PanelCard>
          )}

        </SideCol>
      </SideGrid>
    </div>
  );
}
