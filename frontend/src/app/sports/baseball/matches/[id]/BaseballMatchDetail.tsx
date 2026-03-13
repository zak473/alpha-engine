"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  BaseballMatchDetail as TMatch,
  StarterPitcherOut,
  BullpenSummaryOut,
  BaseballTeamBattingOut,
  BatterOut,
  BaseballInningScore,
  BaseballEloPanelOut,
  BaseballTeamFormOut,
  SituationalBattingOut,
  BattedBallStatsOut,
  UmpireOut,
  PitchTypeOut,
} from "@/lib/types";
import { FormStreak } from "@/components/charts/FormStreak";
import { TeamRadarChart, norm } from "@/components/charts/TeamRadarChart";
import { ScoringTimeline } from "@/components/charts/ScoringTimeline";
import { BaseballLivePanel } from "@/components/live/LiveMatchPanel";
import { SportMatchHeader } from "@/components/match/SportMatchHeader";

// ─── Design tokens ───────────────────────────────────────────────────────────
const colors = {
  bg0:         "#09090b",
  surface:     "rgba(255,255,255,0.04)",
  border0:     "rgba(255,255,255,0.08)",
  textPrimary: "#f4f4f5",
  textMuted:   "#a1a1aa",
  textSubtle:  "#71717a",
  accentBlue:  "#3b82f6",
  accentGreen: "#22c55e",
  accentRed:   "#ef4444",
  accentAmber: "#f59e0b",
  accentPurple:"#a855f7",
};

// ─── Utility ─────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, d = 2): string {
  if (n == null) return "—";
  return n.toFixed(d);
}
function fmtPct(n: number | null | undefined, d = 1): string {
  if (n == null) return "—";
  return (n * 100).toFixed(d) + "%";
}
function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return String(Math.round(n));
}
function fmtAvg(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(3).replace(/^0/, "");   // ".285" style
}

// ─── Layout primitives ────────────────────────────────────────────────────────

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
    <div className="flex items-center justify-center h-24 text-text-subtle text-xs text-center px-4">{msg}</div>
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

function StatDuel({ label, home, away, homeWins }: { label: string; home: string; away: string; homeWins?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-surface-border/40 last:border-0">
      <span className={cn("text-xs w-[38%] text-right pr-3 font-mono tabular-nums", homeWins === true ? "text-accent-green font-semibold" : "text-text-muted")}>{home}</span>
      <span className="text-[10px] text-text-subtle w-[24%] text-center">{label}</span>
      <span className={cn("text-xs w-[38%] text-left pl-3 font-mono tabular-nums", homeWins === false ? "text-accent-green font-semibold" : "text-text-muted")}>{away}</span>
    </div>
  );
}

// ─── Line Score ───────────────────────────────────────────────────────────────

function LineScoreInnings({ match }: { match: TMatch }) {
  const mi = match.match_info;
  if (!mi?.inning_scores?.length) return null;
  const innings = mi.inning_scores;

  return (
    <div className="overflow-x-auto">
      <table className="text-xs font-mono tabular-nums text-right w-full border-collapse">
        <thead>
          <tr className="text-text-subtle border-b border-surface-border/40">
            <th className="text-left font-normal pr-4 py-1">Team</th>
            {innings.map(i => <th key={i.inning} className="w-7 py-1">{i.inning}</th>)}
            <th className="pl-3 py-1 font-normal text-text-subtle">R</th>
            <th className="px-2 py-1 font-normal text-text-subtle">H</th>
            <th className="py-1 font-normal text-text-subtle">E</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-surface-border/30">
            <td className="text-left text-text-muted pr-4 py-1 font-sans font-medium">{match.away.name}</td>
            {innings.map((i, idx) => <td key={idx} className="py-1 text-text-muted">{i.away ?? "0"}</td>)}
            <td className="pl-3 py-1 text-text-primary font-bold">{match.away_score ?? "—"}</td>
            <td className="px-2 py-1 text-text-muted">{mi.away_hits ?? "—"}</td>
            <td className="py-1 text-text-muted">{mi.away_errors ?? "—"}</td>
          </tr>
          <tr>
            <td className="text-left text-text-muted pr-4 py-1 font-sans font-medium">{match.home.name}</td>
            {innings.map((i, idx) => <td key={idx} className="py-1 text-text-muted">{i.home ?? "0"}</td>)}
            <td className="pl-3 py-1 text-text-primary font-bold">{match.home_score ?? "—"}</td>
            <td className="px-2 py-1 text-text-muted">{mi.home_hits ?? "—"}</td>
            <td className="py-1 text-text-muted">{mi.home_errors ?? "—"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function TeamBlock({ elo, name, form, isHome }: { elo: BaseballEloPanelOut | null | undefined; name: string; form: BaseballTeamFormOut | null | undefined; isHome: boolean }) {
  const align = isHome ? "items-end text-right" : "items-start text-left";
  const starter = form?.starter;
  return (
    <div className={cn("flex flex-col gap-1.5", align)}>
      <div className="text-lg font-bold text-text-primary">{name}</div>
      {elo && (
        <div className="flex items-center gap-2">
          <span className="text-text-subtle text-xs">ELO</span>
          <span className="text-positive font-mono text-sm font-semibold">{fmtInt(elo.rating)}</span>
          {elo.rating_change != null && (
            <span className={cn("text-xs font-mono", elo.rating_change >= 0 ? "text-accent-green" : "text-t1")}>
              {elo.rating_change >= 0 ? "+" : ""}{fmt(elo.rating_change, 1)}
            </span>
          )}
        </div>
      )}
      {/* Form streak dots */}
      {form?.last_5 && (
        <FormStreak results={form.last_5.map(g => g.result)} size="sm" />
      )}
      {/* Starting pitcher */}
      {starter && (
        <div className="flex items-center gap-1.5 text-xs text-text-subtle">
          <span>SP:</span>
          <span className="text-text-muted font-medium">{starter.name}</span>
          {starter.hand && <span className="text-[10px] bg-surface-border rounded px-1">{starter.hand}HP</span>}
          {starter.era != null && <span className="font-mono">{fmt(starter.era, 2)} ERA</span>}
        </div>
      )}
    </div>
  );
}

function MatchBlock({ match }: { match: TMatch }) {
  const mi = match.match_info;
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const weather = mi?.weather;
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[120px]">
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
          {isFinished ? "Final" : "Scheduled"}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="text-4xl font-black text-text-primary tabular-nums font-mono">
          {match.away_score ?? (isLive ? "—" : "·")}
        </div>
        <div className="text-text-subtle">–</div>
        <div className="text-4xl font-black text-text-primary tabular-nums font-mono">
          {match.home_score ?? (isLive ? "—" : "·")}
        </div>
      </div>
      <div className="text-[9px] text-text-subtle">Away – Home</div>
      {mi && (
        <div className="flex flex-col items-center gap-0.5 text-[10px] text-text-subtle">
          {mi.ballpark && <span>{mi.ballpark}</span>}
          {weather && weather.wind_speed_mph != null && (
            <span>{weather.wind_speed_mph} mph {weather.wind_direction ?? ""}</span>
          )}
          {weather && weather.temperature_f != null && (
            <span>{weather.temperature_f}°F · {weather.conditions}</span>
          )}
        </div>
      )}

      {/* Win probability bar */}
      {match.probabilities && (
        <div className="w-full flex flex-col items-center gap-0.5 mt-1">
          <div className="flex h-1.5 w-full rounded-full overflow-hidden">
            <div className="bg-accent-blue h-full" style={{ width: `${Math.round(match.probabilities.home_win * 100)}%` }} />
            <div className="bg-accent-amber h-full flex-1" />
          </div>
          <div className="flex justify-between w-full text-[10px] font-mono tabular-nums">
            <span className="text-positive">{Math.round(match.probabilities.home_win * 100)}%</span>
            <span className="text-accent-amber">{Math.round(match.probabilities.away_win * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function BaseballMatchHeader({ match }: { match: TMatch }) {
  const info = match.match_info;
  return (
    <SportMatchHeader
      sport="baseball"
      league={match.league}
      season={null}
      status={match.status}
      kickoffUtc={match.kickoff_utc}
      liveClock={match.live_clock ?? undefined}
      home={match.home}
      away={match.away}
      homeScore={match.home_score}
      awayScore={match.away_score}
      outcome={match.outcome}
      probabilities={match.probabilities}
      eloHome={match.elo_home ? { rating: match.elo_home.rating, rating_change: match.elo_home.rating_change } : null}
      eloAway={match.elo_away ? { rating: match.elo_away.rating, rating_change: match.elo_away.rating_change } : null}
      formHome={match.form_home ? { wins: match.form_home.wins_last_5, losses: match.form_home.losses_last_5 } : null}
      formAway={match.form_away ? { wins: match.form_away.wins_last_5, losses: match.form_away.losses_last_5 } : null}
      venue={info?.ballpark ?? undefined}
      homeExtras={match.starter_home ? (
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-mono text-white/60">
          SP: {match.starter_home.name}
        </span>
      ) : undefined}
      awayExtras={match.starter_away ? (
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-mono text-white/60">
          SP: {match.starter_away.name}
        </span>
      ) : undefined}
    />
  );
}

// ─── KPI strip ────────────────────────────────────────────────────────────────

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="detail-kpi-card min-w-[120px]">
      <div className="detail-kpi-label">{label}</div>
      <div className={cn("detail-kpi-value text-[18px]", color || "text-text-primary")}>{value}</div>
      {sub && <div className="detail-kpi-sub">{sub}</div>}
    </div>
  );
}

function BaseballKpiStrip({ match }: { match: TMatch }) {
  const p = match.probabilities;
  const elo_h = match.elo_home;
  const elo_a = match.elo_away;
  const mi = match.match_info;
  const weather = mi?.weather;
  const eloDiff = elo_h && elo_a ? Math.round(elo_h.rating - elo_a.rating) : null;

  return (
    <div className="px-3 py-3 space-y-3">
      <div className="detail-kpi-grid">
        {p && (
          <>
            <Kpi label={`${match.home.name} Win`} value={fmtPct(p.home_win, 1)} color="text-positive" />
            <Kpi label={`${match.away.name} Win`} value={fmtPct(p.away_win, 1)} color="text-t1" />
          </>
        )}
        {elo_h && elo_a && (
          <>
            <Kpi label="Elo Home" value={fmtPct(elo_h.elo_win_prob)} sub={`${fmtInt(elo_h.rating)}`} />
            <Kpi label="Elo Away" value={fmtPct(elo_a.elo_win_prob)} sub={`${fmtInt(elo_a.rating)}`} />
          </>
        )}
        {match.fair_odds && (
          <>
            <Kpi label="Fair H" value={match.fair_odds.home_win?.toFixed(2) ?? "—"} />
            <Kpi label="Fair A" value={match.fair_odds.away_win?.toFixed(2) ?? "—"} />
          </>
        )}
        {match.confidence != null && (
          <Kpi label="Confidence" value={`${match.confidence}%`} color={match.confidence >= 65 ? "text-accent-green" : match.confidence >= 55 ? "text-accent-amber" : "text-text-muted"} />
        )}
      </div>
      <div className="detail-kpi-grid">
        {eloDiff != null && <Kpi label="Elo Diff" value={eloDiff >= 0 ? `+${eloDiff}` : String(eloDiff)} color={eloDiff > 0 ? "text-positive" : "text-t1"} />}
        {elo_h?.pitcher_adj != null && <Kpi label="SP Adj (H)" value={elo_h.pitcher_adj >= 0 ? `+${fmtInt(elo_h.pitcher_adj)}` : fmtInt(elo_h.pitcher_adj)} sub="Elo pts" color={elo_h.pitcher_adj > 0 ? "text-accent-green" : "text-t1"} />}
        {elo_a?.pitcher_adj != null && <Kpi label="SP Adj (A)" value={elo_a.pitcher_adj >= 0 ? `+${fmtInt(elo_a.pitcher_adj)}` : fmtInt(elo_a.pitcher_adj)} sub="Elo pts" color={elo_a.pitcher_adj > 0 ? "text-accent-green" : "text-t1"} />}
        {match.bullpen_home?.fatigue_score != null && <Kpi label="Bullpen (H)" value={`${match.bullpen_home.fatigue_score.toFixed(1)}/10`} sub="fatigue" color={match.bullpen_home.fatigue_score > 6 ? "text-t1" : match.bullpen_home.fatigue_score > 4 ? "text-accent-amber" : "text-accent-green"} />}
        {match.bullpen_away?.fatigue_score != null && <Kpi label="Bullpen (A)" value={`${match.bullpen_away.fatigue_score.toFixed(1)}/10`} sub="fatigue" color={match.bullpen_away.fatigue_score > 6 ? "text-t1" : match.bullpen_away.fatigue_score > 4 ? "text-accent-amber" : "text-accent-green"} />}
        {mi?.park_factor != null && <Kpi label="Park Factor" value={mi.park_factor >= 0 ? `+${fmtInt(mi.park_factor)}` : fmtInt(mi.park_factor)} sub="Elo adj" color={mi.park_factor > 0 ? "text-accent-amber" : mi.park_factor < 0 ? "text-accent-purple" : "text-text-muted"} />}
        {weather?.wind_speed_mph != null && <Kpi label="Wind" value={`${fmtInt(weather.wind_speed_mph)} mph`} sub={weather.wind_direction ?? ""} />}
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = ["Overview", "Lineups", "Pitching", "Batting", "Innings", "H2H", "Elo", "Model", "Context"] as const;
type Tab = typeof TABS[number];

// ─── Pitcher card ─────────────────────────────────────────────────────────────

function StarterCard({ sp, teamName }: { sp: StarterPitcherOut; teamName: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-text-primary">{sp.name}</span>
        {sp.hand && <span className="text-[10px] bg-surface-border rounded px-1.5 text-text-muted">{sp.hand}HP</span>}
        <span className="text-[10px] text-text-subtle ml-auto">{teamName}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
        {[
          { l: "ERA", v: fmt(sp.era, 2) },
          { l: "WHIP", v: fmt(sp.whip, 2) },
          { l: "K/9", v: fmt(sp.k_per_9, 1) },
          { l: "BB/9", v: fmt(sp.bb_per_9, 1) },
          { l: "HR/9", v: fmt(sp.hr_per_9, 1) },
          { l: "FIP", v: fmt(sp.fip, 2) },
        ].map(r => (
          <div key={r.l} className="flex flex-col">
            <span className="text-[10px] text-text-subtle">{r.l}</span>
            <span className="text-text-muted font-semibold">{r.v}</span>
          </div>
        ))}
      </div>
      {sp.ip != null && (
        <div className="border-t border-surface-border/40 pt-2 mt-1">
          <div className="text-[10px] text-text-subtle uppercase tracking-widest mb-1">This Game</div>
          <div className="grid grid-cols-4 gap-2 text-xs font-mono tabular-nums">
            {[
              { l: "IP", v: fmt(sp.ip, 1) },
              { l: "H", v: fmtInt(sp.hits_allowed) },
              { l: "ER", v: fmtInt(sp.earned_runs) },
              { l: "SO", v: fmtInt(sp.strikeouts) },
              { l: "BB", v: fmtInt(sp.walks) },
              { l: "P", v: fmtInt(sp.pitches_thrown) },
              { l: "Str%", v: sp.strikes_pct != null ? fmtPct(sp.strikes_pct, 1) : "—" },
            ].map(r => (
              <div key={r.l} className="flex flex-col">
                <span className="text-[10px] text-text-subtle">{r.l}</span>
                <span className="text-text-muted font-semibold">{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BullpenTable({ bp, teamName }: { bp: BullpenSummaryOut; teamName: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-widest text-text-subtle">{teamName} Bullpen</div>
        {bp.fatigue_score != null && (
          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded",
            bp.fatigue_score > 6 ? "bg-accent-red/20 text-t1" :
            bp.fatigue_score > 4 ? "bg-accent-amber/20 text-accent-amber" :
            "bg-accent-green/20 text-accent-green"
          )}>Fatigue {bp.fatigue_score.toFixed(1)}</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono tabular-nums border-collapse">
          <thead>
            <tr className="text-text-subtle border-b border-surface-border/40 font-sans">
              <th className="text-left font-normal py-1">Pitcher</th>
              <th className="text-center font-normal py-1 px-2">H</th>
              <th className="text-right font-normal py-1 px-2">IP</th>
              <th className="text-right font-normal py-1 px-2">ER</th>
              <th className="text-right font-normal py-1 px-2">SO</th>
              <th className="text-right font-normal py-1 px-2">Days</th>
              <th className="text-right font-normal py-1">P/3d</th>
            </tr>
          </thead>
          <tbody>
            {bp.pitchers.map((p, i) => (
              <tr key={i} className="border-b border-surface-border/20 last:border-0">
                <td className="py-1 font-sans text-text-muted">{p.name}</td>
                <td className="py-1 px-2 text-center text-text-subtle">{p.hand}</td>
                <td className="py-1 px-2 text-right text-text-muted">{p.ip != null ? fmt(p.ip, 1) : "—"}</td>
                <td className="py-1 px-2 text-right text-text-muted">{fmtInt(p.earned_runs)}</td>
                <td className="py-1 px-2 text-right text-text-muted">{fmtInt(p.strikeouts)}</td>
                <td className={cn("py-1 px-2 text-right", (p.days_since_last ?? 99) === 0 ? "text-t1 font-bold" : "text-text-subtle")}>{p.days_since_last ?? "—"}</td>
                <td className={cn("py-1 text-right", (p.pitches_last_3d ?? 0) > 60 ? "text-accent-amber" : "text-text-subtle")}>{fmtInt(p.pitches_last_3d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ match }: { match: TMatch }) {
  const fh = match.form_home;
  const fa = match.form_away;
  const sh = match.starter_home;
  const sa = match.starter_away;

  return (
    <SideGrid>
      <MainCol>
        {/* Team Comparison */}
        <PanelCard title="Team Comparison">
          <div>
            <div className="flex text-[10px] text-text-subtle mb-1">
              <span className="w-[38%] text-right pr-3">{match.home.name}</span>
              <span className="w-[24%] text-center"></span>
              <span className="w-[38%] text-left pl-3">{match.away.name}</span>
            </div>
            <StatDuel label="Elo" home={fmtInt(match.elo_home?.rating)} away={fmtInt(match.elo_away?.rating)} homeWins={(match.elo_home?.rating ?? 0) > (match.elo_away?.rating ?? 0)} />
            <StatDuel label="Elo Δ" home={match.elo_home?.rating_change != null ? `${match.elo_home.rating_change >= 0 ? "+" : ""}${fmt(match.elo_home.rating_change, 1)}` : "—"} away={match.elo_away?.rating_change != null ? `${match.elo_away.rating_change >= 0 ? "+" : ""}${fmt(match.elo_away.rating_change, 1)}` : "—"} homeWins={(match.elo_home?.rating_change ?? 0) > (match.elo_away?.rating_change ?? 0)} />
            <StatDuel label="SP ERA" home={fmt(sh?.era, 2)} away={fmt(sa?.era, 2)} homeWins={(sh?.era ?? 99) < (sa?.era ?? 99)} />
            <StatDuel label="SP WHIP" home={fmt(sh?.whip, 2)} away={fmt(sa?.whip, 2)} homeWins={(sh?.whip ?? 99) < (sa?.whip ?? 99)} />
            <StatDuel label="SP K/9" home={fmt(sh?.k_per_9, 1)} away={fmt(sa?.k_per_9, 1)} homeWins={(sh?.k_per_9 ?? 0) > (sa?.k_per_9 ?? 0)} />
            <StatDuel label="Bullpen Fat" home={fh ? fmt(match.bullpen_home?.fatigue_score, 1) + "/10" : "—"} away={fa ? fmt(match.bullpen_away?.fatigue_score, 1) + "/10" : "—"} homeWins={(match.bullpen_home?.fatigue_score ?? 99) < (match.bullpen_away?.fatigue_score ?? 99)} />
            {fh?.avg_runs_for != null && fa?.avg_runs_for != null && (
              <>
                <StatDuel label="Runs/G (L5)" home={fmt(fh.avg_runs_for, 2)} away={fmt(fa.avg_runs_for, 2)} homeWins={fh.avg_runs_for > fa.avg_runs_for} />
                <StatDuel label="Runs All/G (L5)" home={fmt(fh.avg_runs_against, 2)} away={fmt(fa.avg_runs_against, 2)} homeWins={(fh.avg_runs_against ?? 99) < (fa.avg_runs_against ?? 99)} />
              </>
            )}
            {fh?.team_era_last_5 != null && fa?.team_era_last_5 != null && (
              <StatDuel label="Team ERA (L5)" home={fmt(fh.team_era_last_5, 2)} away={fmt(fa.team_era_last_5, 2)} homeWins={fh.team_era_last_5 < fa.team_era_last_5} />
            )}
            {(match.batting_home?.team_avg != null || match.batting_away?.team_avg != null) && (
              <>
                <StatDuel label="Team AVG" home={fmtAvg(match.batting_home?.team_avg)} away={fmtAvg(match.batting_away?.team_avg)} homeWins={(match.batting_home?.team_avg ?? 0) > (match.batting_away?.team_avg ?? 0)} />
                <StatDuel label="Team OPS" home={fmt(match.batting_home?.team_ops, 3)} away={fmt(match.batting_away?.team_ops, 3)} homeWins={(match.batting_home?.team_ops ?? 0) > (match.batting_away?.team_ops ?? 0)} />
              </>
            )}
          </div>
        </PanelCard>

        {/* Recent Form */}
        <PanelCard title="Recent Form (Last 5)">
          {(fh?.last_5 || fa?.last_5) ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-text-subtle border-b border-surface-border/40">
                    <th className="text-left font-normal py-1 pr-2">Team</th>
                    <th className="text-left font-normal py-1 pr-2">Opp</th>
                    <th className="text-right font-normal py-1 pr-2">Score</th>
                    <th className="text-center font-normal py-1 pr-2">H/A</th>
                    <th className="text-center font-normal py-1 pr-2">W/L</th>
                    <th className="text-left font-normal py-1 pr-2">SP</th>
                    <th className="text-right font-normal py-1">ERA</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(fh?.last_5 || []).map(e => ({ ...e, team: match.home.name })), ...(fa?.last_5 || []).map(e => ({ ...e, team: match.away.name }))].map((e, i) => (
                    <tr key={i} className="border-b border-surface-border/30 last:border-0">
                      <td className="py-1 pr-2 text-text-muted">{e.team}</td>
                      <td className="py-1 pr-2 font-mono text-text-subtle">{e.opponent}</td>
                      <td className="py-1 pr-2 font-mono text-text-muted text-right">{e.score}</td>
                      <td className="py-1 pr-2 text-center text-text-subtle">{e.home_away}</td>
                      <td className={cn("py-1 pr-2 text-center font-bold", e.result === "W" ? "text-accent-green" : "text-t1")}>{e.result}</td>
                      <td className="py-1 pr-2 text-text-subtle truncate max-w-[80px]">{e.starter ?? "—"}</td>
                      <td className="py-1 font-mono text-text-subtle text-right">{e.starter_era != null ? fmt(e.starter_era, 2) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState msg="No form data yet" />
          )}
        </PanelCard>
      </MainCol>

      <SideCol>
        {/* Starters panel */}
        <PanelCard title="Starting Pitchers">
          {sh ? (
            <div className="mb-4 pb-4 border-b border-surface-border/40">
              <StarterCard sp={sh} teamName={match.home.name} />
            </div>
          ) : null}
          {sa ? <StarterCard sp={sa} teamName={match.away.name} /> : null}
          {!sh && !sa && <EmptyState msg="No starter data yet" />}
        </PanelCard>

        {/* Bullpen fatigue summary */}
        <PanelCard title="Bullpen Fatigue">
          {[
            { bp: match.bullpen_home, name: match.home.name },
            { bp: match.bullpen_away, name: match.away.name },
          ].map(({ bp, name }) => bp ? (
            <div key={name} className="flex items-center justify-between py-2 border-b border-surface-border/30 last:border-0">
              <div className="match-page-shell flex flex-col max-w-[1440px] mx-auto w-full px-4 py-4">
                <span className="text-xs text-text-muted">{name}</span>
                <span className="text-[10px] text-text-subtle">{bp.total_pitches_last_3d} P / last 3d</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 rounded-full bg-white/[0.06]">
                  <div className={cn("h-full rounded-full", bp.fatigue_score != null && bp.fatigue_score > 6 ? "bg-accent-red" : bp.fatigue_score != null && bp.fatigue_score > 4 ? "bg-accent-amber" : "bg-accent-green")} style={{ width: `${Math.min(100, (bp.fatigue_score ?? 0) * 10)}%` }} />
                </div>
                <span className={cn("font-mono text-xs font-bold", bp.fatigue_score != null && bp.fatigue_score > 6 ? "text-t1" : bp.fatigue_score != null && bp.fatigue_score > 4 ? "text-accent-amber" : "text-accent-green")}>{bp.fatigue_score?.toFixed(1)}</span>
              </div>
            </div>
          ) : null)}
          {!match.bullpen_home && !match.bullpen_away && <EmptyState msg="No bullpen data" />}
        </PanelCard>

        {/* Key Edges */}
        <PanelCard title="Key Edges">
          {match.key_drivers && match.key_drivers.length > 0 ? (
            <div className="flex flex-col gap-2">
              {match.key_drivers.slice(0, 5).map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="text-xs text-text-subtle w-28 truncate">{d.feature}</div>
                  <div className="flex-1 h-1 rounded-full bg-white/[0.06]">
                    <div className={cn("h-full rounded-full", d.direction === "home" ? "bg-accent-blue/50" : d.direction === "away" ? "bg-accent-red/50" : "bg-accent-amber/40")} style={{ width: `${d.importance * 100}%` }} />
                  </div>
                  <div className="text-[10px] font-mono text-text-subtle w-8 text-right">{Math.round(d.importance * 100)}%</div>
                </div>
              ))}
            </div>
          ) : <EmptyState msg="No edge analysis" />}
        </PanelCard>
      </SideCol>
    </SideGrid>
  );
}

// ─── Lineups tab ──────────────────────────────────────────────────────────────

function LineupsTab({ match }: { match: TMatch }) {
  const renderOrder = (batting: BaseballTeamBattingOut | null | undefined, teamName: string) => {
    if (!batting?.batters.length) return <EmptyState msg="No lineup data yet" />;
    return (
      <div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-text-subtle border-b border-surface-border/40">
              <th className="text-center font-normal py-1 w-6">#</th>
              <th className="text-left font-normal py-1 pl-2">Player</th>
              <th className="text-center font-normal py-1 px-2">Pos</th>
              <th className="text-center font-normal py-1 px-2">B</th>
              <th className="text-right font-normal py-1">AVG</th>
            </tr>
          </thead>
          <tbody>
            {batting.batters.map((b, i) => (
              <tr key={i} className="border-b border-surface-border/20 last:border-0">
                <td className="py-1 text-center text-text-subtle font-mono">{b.batting_order}</td>
                <td className="py-1 pl-2 text-text-muted">{b.name}</td>
                <td className="py-1 px-2 text-center text-text-subtle">{b.position}</td>
                <td className="py-1 px-2 text-center text-text-subtle">{b.hand}</td>
                <td className="py-1 text-right font-mono text-text-muted">{fmtAvg(b.batting_avg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {batting.team_avg != null && (
          <div className="mt-2 flex items-center justify-between text-xs border-t border-surface-border/40 pt-2">
            <span className="text-text-subtle">Team AVG / OBP / SLG</span>
            <span className="font-mono text-text-muted">{fmtAvg(batting.team_avg)} / {fmtAvg(batting.team_obp)} / {fmtAvg(batting.team_slg)}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <SideGrid>
      <MainCol>
        <div className="grid grid-cols-2 gap-4">
          <PanelCard title={match.home.name}>{renderOrder(match.batting_home, match.home.name)}</PanelCard>
          <PanelCard title={match.away.name}>{renderOrder(match.batting_away, match.away.name)}</PanelCard>
        </div>
      </MainCol>
      <SideCol>
        <PanelCard title="Starters">
          {match.starter_home && <div className="mb-3 pb-3 border-b border-surface-border/40"><StarterCard sp={match.starter_home} teamName={match.home.name} /></div>}
          {match.starter_away && <StarterCard sp={match.starter_away} teamName={match.away.name} />}
        </PanelCard>
      </SideCol>
    </SideGrid>
  );
}

// ─── Pitching tab ─────────────────────────────────────────────────────────────

function PitchingTab({ match }: { match: TMatch }) {
  const sh = match.starter_home;
  const sa = match.starter_away;

  const pitchingRadar = (sh || sa) ? [
    { label: "ERA",    home: norm(sh?.era,    1.5, 6.0, true), away: norm(sa?.era,    1.5, 6.0, true) },
    { label: "WHIP",   home: norm(sh?.whip,   0.9, 1.7, true), away: norm(sa?.whip,   0.9, 1.7, true) },
    { label: "K/9",    home: norm(sh?.k_per_9, 4,  13),        away: norm(sa?.k_per_9, 4,  13) },
    { label: "BB/9",   home: norm(sh?.bb_per_9, 1,  5, true),  away: norm(sa?.bb_per_9, 1,  5, true) },
    { label: "FIP",    home: norm(sh?.fip,    2.0, 5.5, true), away: norm(sa?.fip,    2.0, 5.5, true) },
    { label: "HR/9",   home: norm(sh?.hr_per_9, 0.2, 2.0, true), away: norm(sa?.hr_per_9, 0.2, 2.0, true) },
  ] : null;

  return (
    <SideGrid>
      <MainCol>
        {pitchingRadar && (
          <PanelCard title="Pitcher Profile Radar — Normalised 0–100">
            <TeamRadarChart
              metrics={pitchingRadar}
              homeLabel={`${match.home.name} SP`}
              awayLabel={`${match.away.name} SP`}
              homeColor={colors.accentBlue}
              awayColor={colors.accentAmber}
              height={220}
            />
          </PanelCard>
        )}
        {(match.starter_home || match.starter_away) ? (
          <PanelCard title="Starting Pitchers">
            <div className="grid grid-cols-2 gap-x-8">
              {match.starter_home && (
                <div>
                  <div className="text-[10px] text-positive uppercase tracking-widest mb-2">{match.home.name}</div>
                  <StarterCard sp={match.starter_home} teamName={match.home.name} />
                </div>
              )}
              {match.starter_away && (
                <div>
                  <div className="text-[10px] text-t1 uppercase tracking-widest mb-2">{match.away.name}</div>
                  <StarterCard sp={match.starter_away} teamName={match.away.name} />
                </div>
              )}
            </div>
          </PanelCard>
        ) : <PanelCard><EmptyState msg="No pitching data yet" /></PanelCard>}

        {(match.bullpen_home || match.bullpen_away) && (
          <PanelCard title="Bullpen Usage">
            {match.bullpen_home && <div className="mb-4 pb-4 border-b border-surface-border/40"><BullpenTable bp={match.bullpen_home} teamName={match.home.name} /></div>}
            {match.bullpen_away && <BullpenTable bp={match.bullpen_away} teamName={match.away.name} />}
          </PanelCard>
        )}
      </MainCol>
      <SideCol>
        {/* Pitch arsenal from starter_home / starter_away */}
        {(sh?.pitch_arsenal?.length || sa?.pitch_arsenal?.length) ? (
          <>
            {sh?.pitch_arsenal && sh.pitch_arsenal.length > 0 && (
              <PanelCard title={`${match.home.name} Pitch Arsenal`}>
                {sh.pitch_arsenal.map((p, i) => (
                  <div key={i} className="py-1.5 border-b border-surface-border/30 last:border-0">
                    <div className="flex items-center justify-between mb-0.5 text-xs">
                      <span className="text-text-muted font-medium">{p.pitch_name}</span>
                      <span className="font-mono text-text-subtle">{(p.usage_pct * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <div className="flex-1 h-1.5 rounded bg-surface-border overflow-hidden">
                        <div className="h-full bg-accent-blue/60 rounded" style={{ width: `${p.usage_pct * 100}%` }} />
                      </div>
                      <div className="flex gap-2 text-[10px] font-mono text-text-subtle">
                        {p.velocity_avg != null && <span>{p.velocity_avg.toFixed(0)} mph</span>}
                        {p.whiff_pct != null && <span className="text-accent-green">{(p.whiff_pct * 100).toFixed(0)}% whiff</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </PanelCard>
            )}
            {sa?.pitch_arsenal && sa.pitch_arsenal.length > 0 && (
              <PanelCard title={`${match.away.name} Pitch Arsenal`}>
                {sa.pitch_arsenal.map((p, i) => (
                  <div key={i} className="py-1.5 border-b border-surface-border/30 last:border-0">
                    <div className="flex items-center justify-between mb-0.5 text-xs">
                      <span className="text-text-muted font-medium">{p.pitch_name}</span>
                      <span className="font-mono text-text-subtle">{(p.usage_pct * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <div className="flex-1 h-1.5 rounded bg-surface-border overflow-hidden">
                        <div className="h-full bg-accent-amber/60 rounded" style={{ width: `${p.usage_pct * 100}%` }} />
                      </div>
                      <div className="flex gap-2 text-[10px] font-mono text-text-subtle">
                        {p.velocity_avg != null && <span>{p.velocity_avg.toFixed(0)} mph</span>}
                        {p.whiff_pct != null && <span className="text-accent-green">{(p.whiff_pct * 100).toFixed(0)}% whiff</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </PanelCard>
            )}
          </>
        ) : (
          <>
            <PanelCard title="Pitch Mix"><EmptyState msg="Pitch arsenal unavailable" /></PanelCard>
          </>
        )}

        {/* Regression metrics / xStats */}
        {(sh || sa) && (
          <PanelCard title="Regression Metrics">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-1 pb-1 mb-1 border-b border-surface-border/60 text-[10px] text-text-subtle font-medium">
              <span>{match.home.name}</span>
              <span className="text-center">Stat</span>
              <span className="text-right">{match.away.name}</span>
            </div>
            {[
              { label: "xFIP", hv: sh?.xfip, av: sa?.xfip, lowerBetter: true },
              { label: "SIERA", hv: sh?.siera, av: sa?.siera, lowerBetter: true },
              { label: "BABIP", hv: sh?.babip, av: sa?.babip, lowerBetter: true },
              { label: "LOB%",  hv: sh?.lob_pct != null ? sh.lob_pct * 100 : null, av: sa?.lob_pct != null ? sa.lob_pct * 100 : null },
            ].map(({ label, hv, av, lowerBetter }) => {
              const hWins = hv != null && av != null && (lowerBetter ? hv < av : hv > av);
              const aWins = hv != null && av != null && (lowerBetter ? av < hv : av > hv);
              return (
                <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 py-1.5 border-b border-surface-border/30 last:border-0 text-xs font-mono">
                  <span className={cn("font-medium", hWins ? "text-accent-green" : "text-text-muted")}>{hv != null ? hv.toFixed(2) : "—"}</span>
                  <span className="text-[10px] text-text-subtle text-center">{label}</span>
                  <span className={cn("font-medium text-right", aWins ? "text-accent-green" : "text-text-muted")}>{av != null ? av.toFixed(2) : "—"}</span>
                </div>
              );
            })}
          </PanelCard>
        )}
      </SideCol>
    </SideGrid>
  );
}

// ─── Batting tab ──────────────────────────────────────────────────────────────

function BattingTable({ batting, teamName }: { batting: BaseballTeamBattingOut; teamName: string }) {
  if (!batting.batters.length) return <EmptyState msg={`No batting data for ${teamName}`} />;
  return (
    <div>
      <div className="text-[10px] text-text-subtle uppercase tracking-widest mb-2">{teamName}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono tabular-nums border-collapse">
          <thead>
            <tr className="text-text-subtle border-b border-surface-border/40 font-sans">
              <th className="text-left font-normal py-1">Player</th>
              <th className="text-center font-normal py-1 px-1">Pos</th>
              <th className="text-right font-normal py-1 px-1">AB</th>
              <th className="text-right font-normal py-1 px-1">R</th>
              <th className="text-right font-normal py-1 px-1">H</th>
              <th className="text-right font-normal py-1 px-1">RBI</th>
              <th className="text-right font-normal py-1 px-1">BB</th>
              <th className="text-right font-normal py-1 px-1">SO</th>
              <th className="text-right font-normal py-1 px-1">HR</th>
              <th className="text-right font-normal py-1">AVG</th>
            </tr>
          </thead>
          <tbody>
            {batting.batters.map((b, i) => (
              <tr key={i} className="border-b border-surface-border/20 last:border-0">
                <td className="py-1 font-sans text-text-muted">{b.name}</td>
                <td className="py-1 px-1 text-center text-text-subtle">{b.position}</td>
                <td className="py-1 px-1 text-right text-text-muted">{fmtInt(b.at_bats)}</td>
                <td className="py-1 px-1 text-right text-text-muted">{fmtInt(b.runs)}</td>
                <td className="py-1 px-1 text-right text-text-muted">{fmtInt(b.hits)}</td>
                <td className="py-1 px-1 text-right text-text-muted">{fmtInt(b.rbi)}</td>
                <td className="py-1 px-1 text-right text-text-muted">{fmtInt(b.walks)}</td>
                <td className="py-1 px-1 text-right text-text-muted">{fmtInt(b.strikeouts)}</td>
                <td className={cn("py-1 px-1 text-right font-bold", (b.home_runs ?? 0) > 0 ? "text-accent-amber" : "text-text-muted")}>{fmtInt(b.home_runs)}</td>
                <td className="py-1 text-right text-text-muted">{fmtAvg(b.batting_avg)}</td>
              </tr>
            ))}
            <tr className="border-t border-surface-border/60 text-text-muted font-bold">
              <td className="py-1 font-sans" colSpan={2}>Totals</td>
              <td className="py-1 px-1 text-right">{fmtInt(batting.batters.reduce((s, b) => s + (b.at_bats ?? 0), 0))}</td>
              <td className="py-1 px-1 text-right">{fmtInt(batting.total_runs)}</td>
              <td className="py-1 px-1 text-right">{fmtInt(batting.total_hits)}</td>
              <td className="py-1 px-1 text-right">{fmtInt(batting.total_rbi)}</td>
              <td className="py-1 px-1 text-right">{fmtInt(batting.total_bb)}</td>
              <td className="py-1 px-1 text-right">{fmtInt(batting.total_so)}</td>
              <td className="py-1 px-1 text-right">{fmtInt(batting.total_hr)}</td>
              <td className="py-1 text-right">{fmtAvg(batting.team_avg)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BattingTab({ match }: { match: TMatch }) {
  const bh = match.batting_home;
  const ba = match.batting_away;

  if (!bh && !ba) {
    return <SideGrid><MainCol><PanelCard><EmptyState msg="No batting data yet. Available after game start." /></PanelCard></MainCol><SideCol><PanelCard title="Situational"><EmptyState msg="—" /></PanelCard></SideCol></SideGrid>;
  }

  const battingRadar = (bh || ba) ? [
    { label: "AVG",  home: norm(bh?.team_avg, 0.22, 0.30),  away: norm(ba?.team_avg, 0.22, 0.30) },
    { label: "OBP",  home: norm(bh?.team_obp, 0.29, 0.38),  away: norm(ba?.team_obp, 0.29, 0.38) },
    { label: "SLG",  home: norm(bh?.team_slg, 0.35, 0.50),  away: norm(ba?.team_slg, 0.35, 0.50) },
    { label: "OPS",  home: norm(bh?.team_ops, 0.64, 0.88),  away: norm(ba?.team_ops, 0.64, 0.88) },
    { label: "HR",   home: norm(bh?.total_hr, 0, 4),         away: norm(ba?.total_hr, 0, 4) },
    { label: "BB",   home: norm(bh?.total_bb, 0, 8),         away: norm(ba?.total_bb, 0, 8) },
  ] : null;

  return (
    <SideGrid>
      <MainCol>
        {battingRadar && (
          <PanelCard title="Team Batting Radar — Normalised 0–100">
            <TeamRadarChart
              metrics={battingRadar}
              homeLabel={match.home.name}
              awayLabel={match.away.name}
              homeColor={colors.accentBlue}
              awayColor={colors.accentAmber}
              height={220}
            />
          </PanelCard>
        )}
        {bh && <PanelCard><BattingTable batting={bh} teamName={match.home.name} /></PanelCard>}
        {ba && <PanelCard><BattingTable batting={ba} teamName={match.away.name} /></PanelCard>}
      </MainCol>
      <SideCol>
        <PanelCard title="Team Batting Lines">
          {[
            { t: match.home.name, b: bh },
            { t: match.away.name, b: ba },
          ].map(({ t, b }) => b ? (
            <div key={t} className="mb-3 pb-3 border-b border-surface-border/40 last:border-0">
              <div className="text-[10px] text-text-subtle mb-1">{t}</div>
              <div className="text-xs font-mono text-text-muted">
                {fmtAvg(b.team_avg)} / {fmtAvg(b.team_obp)} / {fmtAvg(b.team_slg)} <span className="text-text-subtle text-[10px]">AVG/OBP/SLG</span>
              </div>
              <div className="text-xs font-mono text-text-muted mt-0.5">
                {fmtInt(b.total_hr)} HR · {fmtInt(b.total_rbi)} RBI · {fmtInt(b.total_lob)} LOB
              </div>
            </div>
          ) : null)}
        </PanelCard>
        {/* Situational hitting from new fields */}
        {(match.situational_home || match.situational_away) ? (
          <PanelCard title="Situational Hitting">
            {[
              { t: match.home.name, s: match.situational_home, col: "text-positive" },
              { t: match.away.name, s: match.situational_away, col: "text-t1" },
            ].map(({ t, s, col }) => s ? (
              <div key={t} className="mb-3 last:mb-0">
                <div className={cn("text-[10px] uppercase tracking-widest mb-1", col)}>{t}</div>
                <div className="text-xs flex flex-col gap-0.5">
                  {s.risp_avg != null && <div className="flex justify-between py-0.5 border-b border-surface-border/20"><span className="text-text-subtle">RISP AVG</span><span className="font-mono">{fmtAvg(s.risp_avg)}</span></div>}
                  {s.risp_ops != null && <div className="flex justify-between py-0.5 border-b border-surface-border/20"><span className="text-text-subtle">RISP OPS</span><span className="font-mono">{fmtAvg(s.risp_ops)}</span></div>}
                  {s.two_out_risp_avg != null && <div className="flex justify-between py-0.5 border-b border-surface-border/20"><span className="text-text-subtle">2-out RISP</span><span className="font-mono">{fmtAvg(s.two_out_risp_avg)}</span></div>}
                  {s.vs_lhp_ops != null && <div className="flex justify-between py-0.5 border-b border-surface-border/20"><span className="text-text-subtle">vs LHP OPS</span><span className="font-mono">{fmtAvg(s.vs_lhp_ops)}</span></div>}
                  {s.vs_rhp_ops != null && <div className="flex justify-between py-0.5 border-b border-surface-border/20"><span className="text-text-subtle">vs RHP OPS</span><span className="font-mono">{fmtAvg(s.vs_rhp_ops)}</span></div>}
                  {s.late_close_avg != null && <div className="flex justify-between py-0.5 border-b border-surface-border/20"><span className="text-text-subtle">Late/Close</span><span className="font-mono">{fmtAvg(s.late_close_avg)}</span></div>}
                  {s.clutch_score != null && <div className="flex justify-between py-0.5"><span className="text-text-subtle">Clutch Score</span><span className={cn("font-mono font-semibold", s.clutch_score > 0 ? "text-accent-green" : "text-t1")}>{s.clutch_score >= 0 ? "+" : ""}{s.clutch_score.toFixed(2)}</span></div>}
                </div>
              </div>
            ) : null)}
          </PanelCard>
        ) : (
          <PanelCard title="Situational Hitting">
            <EmptyState msg="RISP / splits unavailable" />
          </PanelCard>
        )}

        {/* Statcast / batted ball */}
        {(match.batted_ball_home || match.batted_ball_away) && (
          <PanelCard title="Statcast / Batted Ball">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-1 pb-1 mb-1 border-b border-surface-border/60 text-[10px] text-text-subtle font-medium">
              <span>{match.home.name}</span>
              <span className="text-center">Stat</span>
              <span className="text-right">{match.away.name}</span>
            </div>
            {[
              { label: "Exit Velo avg", hv: match.batted_ball_home?.avg_exit_velocity, av: match.batted_ball_away?.avg_exit_velocity },
              { label: "Barrel %",      hv: match.batted_ball_home?.barrel_pct != null ? match.batted_ball_home.barrel_pct * 100 : null,
                                        av: match.batted_ball_away?.barrel_pct != null ? match.batted_ball_away.barrel_pct * 100 : null },
              { label: "Hard Hit %",    hv: match.batted_ball_home?.hard_hit_pct != null ? match.batted_ball_home.hard_hit_pct * 100 : null,
                                        av: match.batted_ball_away?.hard_hit_pct != null ? match.batted_ball_away.hard_hit_pct * 100 : null },
              { label: "xBA",           hv: match.batted_ball_home?.xba, av: match.batted_ball_away?.xba },
              { label: "xSLG",          hv: match.batted_ball_home?.xslg, av: match.batted_ball_away?.xslg },
            ].map(({ label, hv, av }) => {
              const hWins = hv != null && av != null && hv > av;
              const aWins = hv != null && av != null && av > hv;
              const d = label.includes("%") ? 1 : label.includes("Velo") ? 1 : 3;
              return (
                <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 py-1.5 border-b border-surface-border/30 last:border-0 text-xs font-mono">
                  <span className={cn("font-medium", hWins ? "text-accent-green" : "text-text-muted")}>{hv != null ? hv.toFixed(d) : "—"}</span>
                  <span className="text-[10px] text-text-subtle text-center whitespace-nowrap">{label}</span>
                  <span className={cn("font-medium text-right", aWins ? "text-accent-green" : "text-text-muted")}>{av != null ? av.toFixed(d) : "—"}</span>
                </div>
              );
            })}
          </PanelCard>
        )}
      </SideCol>
    </SideGrid>
  );
}

// ─── Innings tab ──────────────────────────────────────────────────────────────

function InningsTab({ match }: { match: TMatch }) {
  const events = match.inning_events;
  const mi = match.match_info;

  if (!events?.length && !mi?.inning_scores?.length) {
    return (
      <SideGrid>
        <MainCol><PanelCard><EmptyState msg="No inning-by-inning data yet. Available after game." /></PanelCard></MainCol>
        <SideCol><PanelCard title="Win Probability"><EmptyState msg="WP chart coming soon" /></PanelCard></SideCol>
      </SideGrid>
    );
  }

  // Group events by inning
  const byInning: Record<number, typeof events> = {};
  for (const e of (events ?? [])) {
    if (!byInning[e.inning]) byInning[e.inning] = [];
    byInning[e.inning]!.push(e);
  }

  const inningTimelinePeriods = (mi?.inning_scores ?? []).map(s => ({
    period: `Inn ${s.inning}`,
    home: s.home ?? null,
    away: s.away ?? null,
  }));

  return (
    <SideGrid>
      <MainCol>
        {inningTimelinePeriods.length > 0 && (
          <PanelCard title="Inning Scoring Timeline">
            <ScoringTimeline
              periods={inningTimelinePeriods}
              homeLabel={match.home.name}
              awayLabel={match.away.name}
              showRunningTotal={true}
              height={180}
            />
          </PanelCard>
        )}
        {mi?.inning_scores?.length && (
          <PanelCard title="Line Score">
            <LineScoreInnings match={match} />
          </PanelCard>
        )}
        <PanelCard title="Scoring Events">
          {Object.keys(byInning).length > 0 ? (
            <div className="flex flex-col gap-3">
              {Object.entries(byInning).sort(([a], [b]) => Number(a) - Number(b)).map(([inn, evts]) => (
                <div key={inn}>
                  <div className="text-[10px] text-text-subtle uppercase tracking-widest mb-1">Inning {inn}</div>
                  {evts!.map((e, i) => (
                    <div key={i} className={cn("flex items-start gap-2 py-1 border-b border-surface-border/20 last:border-0")}>
                      <span className={cn("text-[10px] font-bold px-1 py-0.5 rounded mt-0.5",
                        e.event_type === "HR" ? "bg-accent-amber/20 text-accent-amber" : "bg-surface-border text-text-subtle"
                      )}>{e.event_type ?? "•"}</span>
                      <span className={cn("text-xs", e.team === "home" ? "text-positive" : "text-t1")}>{e.half === "bottom" ? "▼" : "▲"}</span>
                      <span className="text-xs text-text-muted">{e.description}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState msg="No scoring events recorded" />
          )}
        </PanelCard>
      </MainCol>
      <SideCol>
        <PanelCard title="Win Probability">
          <EmptyState msg="Win probability chart coming soon" />
        </PanelCard>
      </SideCol>
    </SideGrid>
  );
}

// ─── H2H tab ──────────────────────────────────────────────────────────────────

function H2HTab({ match }: { match: TMatch }) {
  const h2h = match.h2h;
  if (!h2h || h2h.total_matches === 0) return <PanelCard><EmptyState msg="No head-to-head history found" /></PanelCard>;
  return (
    <SideGrid>
      <MainCol>
        <PanelCard title="All-Time Record">
          <div className="flex items-center justify-around mb-4">
            <div className="flex flex-col items-center">
              <div className="text-4xl font-black text-text-primary">{h2h.home_wins}</div>
              <div className="text-text-muted text-xs mt-1">{match.home.name}</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-4xl font-black text-text-primary">{h2h.away_wins}</div>
              <div className="text-text-muted text-xs mt-1">{match.away.name}</div>
            </div>
          </div>
        </PanelCard>
        {h2h.recent_matches.length > 0 && (
          <PanelCard title="Recent Series">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-text-subtle border-b border-surface-border/40">
                  <th className="text-left font-normal py-1">Date</th>
                  <th className="text-right font-normal py-1">Away</th>
                  <th className="text-center font-normal py-1 px-2">–</th>
                  <th className="text-left font-normal py-1">Home</th>
                  <th className="text-right font-normal py-1">Winner</th>
                </tr>
              </thead>
              <tbody>
                {h2h.recent_matches.map((m: any, i: number) => (
                  <tr key={i} className="border-b border-surface-border/20 last:border-0">
                    <td className="py-1 text-text-subtle">{m.date ? new Date(m.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}</td>
                    <td className="py-1 text-right font-mono text-text-muted">{m.away_score ?? "—"}</td>
                    <td className="py-1 text-center text-text-subtle px-2">–</td>
                    <td className="py-1 font-mono text-text-muted">{m.home_score ?? "—"}</td>
                    <td className={cn("py-1 text-right capitalize", m.winner === "home" ? "text-positive" : "text-text-muted")}>{m.winner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PanelCard>
        )}
      </MainCol>
      <SideCol>
        <PanelCard title="H2H Summary">
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex justify-between"><span className="text-text-subtle">Total Games</span><span className="font-mono text-text-muted">{h2h.total_matches}</span></div>
            <div className="flex justify-between"><span className="text-text-subtle">{match.home.name} Win%</span><span className="font-mono text-positive">{h2h.total_matches > 0 ? fmtPct(h2h.home_wins / h2h.total_matches) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-text-subtle">{match.away.name} Win%</span><span className="font-mono text-text-muted">{h2h.total_matches > 0 ? fmtPct(h2h.away_wins / h2h.total_matches) : "—"}</span></div>
          </div>
        </PanelCard>
      </SideCol>
    </SideGrid>
  );
}

// ─── ELO tab ──────────────────────────────────────────────────────────────────

function EloTab({
  match,
  eloHomeHistory,
  eloAwayHistory,
}: {
  match: TMatch;
  eloHomeHistory: Array<{ date: string; rating: number }>;
  eloAwayHistory: Array<{ date: string; rating: number }>;
}) {
  const elo_h = match.elo_home;
  const elo_a = match.elo_away;

  const chartData = eloHomeHistory.map((pt, i) => ({
    date: pt.date.slice(0, 10),
    home: pt.rating,
    away: eloAwayHistory[i]?.rating ?? null,
  }));

  return (
    <SideGrid>
      <MainCol>
        <PanelCard title="Elo Rating History">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border0} />
                <XAxis dataKey="date" tick={{ fill: colors.textSubtle, fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: colors.textSubtle, fontSize: 10 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: colors.surface, border: `1px solid ${colors.border0}`, borderRadius: 8, fontSize: 11 }} labelStyle={{ color: colors.textMuted }} />
                <Legend wrapperStyle={{ fontSize: 11, color: colors.textMuted }} />
                <Line type="monotone" dataKey="home" name={match.home.name} stroke={colors.accentBlue} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="away" name={match.away.name} stroke={colors.accentRed} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState msg="No ELO history available" />
          )}
        </PanelCard>

        <PanelCard title="Elo Breakdown (with Modifiers)">
          {(elo_h || elo_a) ? (
            <div className="grid grid-cols-2 gap-x-8 text-xs">
              {[
                { elo: elo_h, name: match.home.name },
                { elo: elo_a, name: match.away.name },
              ].map(({ elo, name }) => elo && (
                <div key={name} className="flex flex-col gap-1">
                  <div className="text-text-muted font-semibold mb-1">{name}</div>
                  <div className="flex justify-between py-0.5"><span className="text-text-subtle">Team Rating</span><span className="font-mono">{fmtInt(elo.rating)}</span></div>
                  <div className="flex justify-between py-0.5"><span className="text-text-subtle">Δ last game</span><span className={cn("font-mono", (elo.rating_change ?? 0) >= 0 ? "text-accent-green" : "text-t1")}>{(elo.rating_change ?? 0) >= 0 ? "+" : ""}{fmt(elo.rating_change, 1)}</span></div>
                  {elo.home_advantage_applied != null && <div className="flex justify-between py-0.5"><span className="text-text-subtle">Home Adv</span><span className="font-mono">+{fmtInt(elo.home_advantage_applied)}</span></div>}
                  {elo.pitcher_adj != null && <div className="flex justify-between py-0.5"><span className="text-text-subtle">SP Adj</span><span className={cn("font-mono", elo.pitcher_adj >= 0 ? "text-accent-green" : "text-t1")}>{elo.pitcher_adj >= 0 ? "+" : ""}{fmt(elo.pitcher_adj, 1)}</span></div>}
                  {elo.park_factor_applied != null && <div className="flex justify-between py-0.5"><span className="text-text-subtle">Park Factor</span><span className={cn("font-mono", elo.park_factor_applied > 0 ? "text-accent-amber" : "text-text-muted")}>{elo.park_factor_applied > 0 ? "+" : ""}{fmt(elo.park_factor_applied, 0)}</span></div>}
                  {elo.bullpen_fatigue_adj != null && <div className="flex justify-between py-0.5"><span className="text-text-subtle">Bullpen Adj</span><span className={cn("font-mono", elo.bullpen_fatigue_adj < 0 ? "text-t1" : "text-text-muted")}>{fmt(elo.bullpen_fatigue_adj, 1)}</span></div>}
                  {elo.implied_win_prob != null && <div className="flex justify-between py-0.5 border-t border-surface-border/40 mt-1 pt-1"><span className="text-text-subtle">Elo Win Prob</span><span className="font-mono font-bold text-text-primary">{fmtPct(elo.implied_win_prob, 1)}</span></div>}
                </div>
              ))}
            </div>
          ) : <EmptyState msg="No ELO data" />}
        </PanelCard>
      </MainCol>
      <SideCol>
        <PanelCard title="Elo Last 10 — Home">
          {elo_h?.last_10_ratings?.length ? (
            <div className="flex flex-col gap-1">
              {elo_h.last_10_ratings.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-text-subtle w-3">{i + 1}</span>
                  <div className="flex-1 h-1 rounded bg-white/[0.04]">
                    <div className="h-full rounded bg-accent-blue/60" style={{ width: `${Math.min(100, Math.max(0, (r - 1300) / 4))}%` }} />
                  </div>
                  <span className="font-mono text-[10px] text-text-muted w-12 text-right">{r}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState msg="—" />}
        </PanelCard>
        <PanelCard title="Elo Last 10 — Away">
          {elo_a?.last_10_ratings?.length ? (
            <div className="flex flex-col gap-1">
              {elo_a.last_10_ratings.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-text-subtle w-3">{i + 1}</span>
                  <div className="flex-1 h-1 rounded bg-white/[0.04]">
                    <div className="h-full rounded bg-accent-red/60" style={{ width: `${Math.min(100, Math.max(0, (r - 1300) / 4))}%` }} />
                  </div>
                  <span className="font-mono text-[10px] text-text-muted w-12 text-right">{r}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState msg="—" />}
        </PanelCard>
      </SideCol>
    </SideGrid>
  );
}

// ─── Model tab ────────────────────────────────────────────────────────────────

function ModelTab({ match }: { match: TMatch }) {
  const p = match.probabilities;
  const m = match.model;
  return (
    <SideGrid>
      <MainCol>
        <PanelCard title="Win Probabilities">
          {p ? (
            <div className="flex flex-col gap-4">
              {[
                { label: match.home.name, prob: p.home_win, color: "bg-accent-blue" },
                { label: match.away.name, prob: p.away_win, color: "bg-accent-red" },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-4">
                  <div className="w-32 text-xs text-text-muted">{row.label}</div>
                  <div className="flex-1 h-2 rounded-full bg-white/[0.06]">
                    <div className={cn("h-full rounded-full", row.color)} style={{ width: `${row.prob * 100}%` }} />
                  </div>
                  <div className="w-14 text-right font-mono font-bold text-text-primary text-sm tabular-nums">{fmtPct(row.prob, 1)}</div>
                </div>
              ))}
            </div>
          ) : <EmptyState msg="No model probabilities" />}
        </PanelCard>

        {match.key_drivers && match.key_drivers.length > 0 && (
          <PanelCard title="Feature Drivers">
            <div className="flex flex-col gap-2">
              {match.key_drivers.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-40 text-xs text-text-muted truncate">{d.feature}</div>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.06]">
                    <div className={cn("h-full rounded-full", d.direction === "home" ? "bg-positive/55" : d.direction === "away" ? "bg-accent-red/70" : "bg-accent-amber/50")} style={{ width: `${d.importance * 100}%` }} />
                  </div>
                  <div className="text-[10px] font-mono text-text-subtle w-8 text-right">{Math.round(d.importance * 100)}%</div>
                  {d.value != null && <div className="text-[10px] font-mono text-text-subtle w-12 text-right">{fmt(d.value, 1)}</div>}
                </div>
              ))}
            </div>
          </PanelCard>
        )}
      </MainCol>
      <SideCol>
        {m && (
          <PanelCard title="Model Metadata">
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex justify-between"><span className="text-text-subtle">Version</span><span className="font-mono text-text-muted">{m.version}</span></div>
              {m.algorithm && <div className="flex justify-between"><span className="text-text-subtle">Algorithm</span><span className="font-mono text-text-muted">{m.algorithm}</span></div>}
              {m.n_train_samples && <div className="flex justify-between"><span className="text-text-subtle">Train samples</span><span className="font-mono text-text-muted">{m.n_train_samples.toLocaleString()}</span></div>}
              {m.accuracy != null && <div className="flex justify-between"><span className="text-text-subtle">Accuracy</span><span className="font-mono text-text-muted">{fmtPct(m.accuracy, 1)}</span></div>}
              {m.brier_score != null && <div className="flex justify-between"><span className="text-text-subtle">Brier</span><span className="font-mono text-text-muted">{m.brier_score.toFixed(4)}</span></div>}
            </div>
          </PanelCard>
        )}
        {match.fair_odds && (
          <PanelCard title="Fair Odds">
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex justify-between"><span className="text-text-subtle">{match.home.name}</span><span className="font-mono font-semibold text-text-primary">{match.fair_odds.home_win?.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-text-subtle">{match.away.name}</span><span className="font-mono font-semibold text-text-primary">{match.fair_odds.away_win?.toFixed(2)}</span></div>
            </div>
          </PanelCard>
        )}
        {match.betting && (
          <div className="card p-4 flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Market Odds</h3>
            <div className="flex gap-3">
              {[
                { label: 'Home', val: match.betting.home_ml },
                { label: 'Away', val: match.betting.away_ml },
              ].map(({ label, val }) => {
                if (val == null) return null;
                const prob = label === 'Home' ? match.probabilities?.home_win : match.probabilities?.away_win;
                const edge = prob != null ? (prob - 1 / Number(val)) * 100 : null;
                return (
                  <div key={label} className="flex-1 bg-surface-overlay border border-surface-border rounded-xl p-3 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-text-muted">{label}</span>
                    <span className="text-lg font-bold font-mono text-text-primary">{Number(val).toFixed(2)}</span>
                    {edge != null && (
                      <span className={cn("text-[10px] font-semibold font-mono", edge > 0 ? "text-green-400" : "text-red-400")}>
                        {edge > 0 ? "+" : ""}{edge.toFixed(1)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <PanelCard title="Run Distribution">
          <EmptyState msg="Run distribution chart coming soon" />
        </PanelCard>
      </SideCol>
    </SideGrid>
  );
}

// ─── Context tab ──────────────────────────────────────────────────────────────

function ContextTab({ match }: { match: TMatch }) {
  const dc = match.data_completeness;
  const mi = match.match_info;
  const weather = mi?.weather;

  return (
    <SideGrid>
      <MainCol>
        <PanelCard title="Venue & Park">
          <div className="flex flex-col gap-2 text-xs">
            {mi?.ballpark && <div className="flex justify-between"><span className="text-text-subtle">Ballpark</span><span className="text-text-muted">{mi.ballpark}</span></div>}
            {mi?.city && <div className="flex justify-between"><span className="text-text-subtle">City</span><span className="text-text-muted">{mi.city}</span></div>}
            {mi?.attendance != null && <div className="flex justify-between"><span className="text-text-subtle">Attendance</span><span className="font-mono text-text-muted">{mi.attendance.toLocaleString()}</span></div>}
            {mi?.park_factor != null && (
              <div className="flex flex-col gap-1.5 mt-1">
                <div className="flex justify-between text-xs">
                  <span className="text-text-subtle">Park Factor</span>
                  <span className={cn("font-mono font-semibold", mi.park_factor > 10 ? "text-accent-amber" : mi.park_factor < -5 ? "text-accent-purple" : "text-text-muted")}>
                    {mi.park_factor >= 0 ? "+" : ""}{fmtInt(mi.park_factor)} Elo pts
                  </span>
                </div>
                {/* Directional bar: centre=0, amber right=hitter-friendly, purple left=pitcher-friendly, range -30 to +30 */}
                <div className="relative h-3 rounded-full bg-surface-border overflow-hidden">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
                  {mi.park_factor > 0 ? (
                    <div
                      className="absolute inset-y-0 bg-accent-amber rounded-r-full"
                      style={{ left: "50%", width: `${Math.min(50, (mi.park_factor / 30) * 50)}%` }}
                    />
                  ) : (
                    <div
                      className="absolute inset-y-0 bg-accent-purple rounded-l-full"
                      style={{ right: "50%", width: `${Math.min(50, (Math.abs(mi.park_factor) / 30) * 50)}%` }}
                    />
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-text-subtle font-mono">
                  <span className="text-accent-purple">Pitcher</span>
                  <span>Neutral</span>
                  <span className="text-accent-amber">Hitter</span>
                </div>
              </div>
            )}
          </div>
        </PanelCard>
        {weather && (
          <PanelCard title="Weather">
            <div className="flex flex-col gap-2 text-xs">
              {weather.temperature_f != null && <div className="flex justify-between"><span className="text-text-subtle">Temperature</span><span className="font-mono text-text-muted">{weather.temperature_f}°F</span></div>}
              {weather.wind_speed_mph != null && <div className="flex justify-between"><span className="text-text-subtle">Wind</span><span className="font-mono text-text-muted">{weather.wind_speed_mph} mph {weather.wind_direction ?? ""}</span></div>}
              {weather.conditions && <div className="flex justify-between"><span className="text-text-subtle">Conditions</span><span className="text-text-muted">{weather.conditions}</span></div>}
              {weather.humidity_pct != null && <div className="flex justify-between"><span className="text-text-subtle">Humidity</span><span className="font-mono text-text-muted">{weather.humidity_pct}%</span></div>}
            </div>
          </PanelCard>
        )}

        {/* Umpire panel */}
        {match.umpire && (
          <PanelCard title="Home Plate Umpire">
            <div className="flex flex-col gap-2 text-xs">
              <div className="text-text-muted font-semibold">{match.umpire.name}</div>
              {match.umpire.games_called != null && <div className="flex justify-between"><span className="text-text-subtle">Games called</span><span className="font-mono">{match.umpire.games_called}</span></div>}
              {match.umpire.k_zone_size != null && <div className="flex justify-between"><span className="text-text-subtle">K-zone size</span><span className={cn("font-mono", match.umpire.k_zone_size > 1.02 ? "text-accent-amber" : match.umpire.k_zone_size < 0.98 ? "text-positive" : "text-text-muted")}>{(match.umpire.k_zone_size * 100).toFixed(0)}%</span></div>}
              {match.umpire.strikeouts_per_game != null && <div className="flex justify-between"><span className="text-text-subtle">K/game</span><span className="font-mono">{fmt(match.umpire.strikeouts_per_game, 1)}</span></div>}
              {match.umpire.walks_per_game != null && <div className="flex justify-between"><span className="text-text-subtle">BB/game</span><span className="font-mono">{fmt(match.umpire.walks_per_game, 1)}</span></div>}
              {match.umpire.home_win_pct != null && <div className="flex justify-between"><span className="text-text-subtle">Home team win%</span><span className="font-mono">{fmtPct(match.umpire.home_win_pct, 1)}</span></div>}
              {match.umpire.over_record && <div className="flex justify-between"><span className="text-text-subtle">Over record</span><span className="font-mono text-accent-green">{match.umpire.over_record}</span></div>}
              {match.umpire.run_scoring_impact != null && <div className="flex justify-between"><span className="text-text-subtle">Run scoring impact</span><span className={cn("font-mono", match.umpire.run_scoring_impact > 0 ? "text-accent-amber" : "text-positive")}>{match.umpire.run_scoring_impact >= 0 ? "+" : ""}{fmt(match.umpire.run_scoring_impact, 2)} runs/game</span></div>}
            </div>
          </PanelCard>
        )}

        {/* Betting lines */}
        {(match as any).betting && (
          <PanelCard title="Betting Lines">
            {(() => {
              const bet = (match as any).betting as Record<string, any>;
              return (
                <div className="flex flex-col gap-2 text-xs">
                  {bet.run_line != null && <div className="flex justify-between"><span className="text-text-subtle">Run line (home)</span><span className="font-mono font-semibold">{bet.run_line >= 0 ? "+" : ""}{bet.run_line}</span></div>}
                  {bet.total != null && <div className="flex justify-between"><span className="text-text-subtle">Total (O/U)</span><span className="font-mono">{bet.total}</span></div>}
                  {bet.home_ml != null && <div className="flex justify-between"><span className="text-text-subtle">{match.home.name} ML</span><span className="font-mono">{bet.home_ml >= 0 ? "+" : ""}{bet.home_ml}</span></div>}
                  {bet.away_ml != null && <div className="flex justify-between"><span className="text-text-subtle">{match.away.name} ML</span><span className="font-mono">{bet.away_ml >= 0 ? "+" : ""}{bet.away_ml}</span></div>}
                  {bet.implied_home_total != null && <div className="flex justify-between"><span className="text-text-subtle">Impl. home runs</span><span className="font-mono text-positive">{fmt(bet.implied_home_total, 1)}</span></div>}
                  {bet.implied_away_total != null && <div className="flex justify-between"><span className="text-text-subtle">Impl. away runs</span><span className="font-mono text-t1">{fmt(bet.implied_away_total, 1)}</span></div>}
                </div>
              );
            })()}
          </PanelCard>
        )}

        {/* Team records */}
        {(mi?.home_record || mi?.away_record) && (
          <PanelCard title="Season Records">
            {mi.home_record && (
              <div className="flex items-center justify-between py-1 border-b border-surface-border/30 text-xs">
                <span className="text-text-subtle">{match.home.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-text-primary">{mi.home_record}</span>
                  {mi.home_streak && (
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold",
                      mi.home_streak.startsWith("W") ? "bg-accent-green/20 text-accent-green" : "bg-accent-red/20 text-t1"
                    )}>{mi.home_streak}</span>
                  )}
                </div>
              </div>
            )}
            {mi.away_record && (
              <div className="flex items-center justify-between py-1 text-xs">
                <span className="text-text-subtle">{match.away.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-text-primary">{mi.away_record}</span>
                  {mi.away_streak && (
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold",
                      mi.away_streak.startsWith("W") ? "bg-accent-green/20 text-accent-green" : "bg-accent-red/20 text-t1"
                    )}>{mi.away_streak}</span>
                  )}
                </div>
              </div>
            )}
          </PanelCard>
        )}
      </MainCol>
      <SideCol>
        <PanelCard title="Data Completeness">
          {dc ? (
            <div className="flex flex-col gap-1.5 text-xs">
              {Object.entries(dc).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-text-subtle capitalize">{k.replace(/_/g, " ")}</span>
                  <span className={cn("font-semibold", v ? "text-accent-green" : "text-text-subtle")}>{v ? "✓" : "○"}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState msg="—" />}
        </PanelCard>
      </SideCol>
    </SideGrid>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

interface Props {
  match: TMatch;
  eloHomeHistory: Array<{ date: string; rating: number }>;
  eloAwayHistory: Array<{ date: string; rating: number }>;
}

export function BaseballMatchDetail({ match, eloHomeHistory, eloAwayHistory }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const router = useRouter();
  const isLive = match.status === "live";
  const tick = useLiveRefresh(isLive);
  useEffect(() => { if (tick > 0) router.refresh(); }, [tick, router]);

  return (
    <div className="match-page-shell flex flex-col max-w-[1440px] mx-auto w-full px-4 py-4">
      <BaseballMatchHeader match={match} />
      <div className="match-kpi-strip match-kpi-strip--soft overflow-hidden"><BaseballKpiStrip match={match} /></div>

      {match.status === "live" && <div className="match-live-wrap px-4 pb-1"><BaseballLivePanel match={match as any} /></div>}

      {/* Tab bar */}
      <div className="match-tabbar-wrap px-1"><div className="match-tabbar">
        <div className="flex gap-0 min-w-max">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="match-tab" data-active={activeTab === tab}
            >
              {tab}
            </button>
          ))}
        </div>
      </div></div>

      {/* Tab content */}
      <div className="match-content-wrap p-4">
        {activeTab === "Overview"  && <OverviewTab match={match} />}
        {activeTab === "Lineups"   && <LineupsTab match={match} />}
        {activeTab === "Pitching"  && <PitchingTab match={match} />}
        {activeTab === "Batting"   && <BattingTab match={match} />}
        {activeTab === "Innings"   && <InningsTab match={match} />}
        {activeTab === "H2H"       && <H2HTab match={match} />}
        {activeTab === "Elo"       && <EloTab match={match} eloHomeHistory={eloHomeHistory} eloAwayHistory={eloAwayHistory} />}
        {activeTab === "Model"     && <ModelTab match={match} />}
        {activeTab === "Context"   && <ContextTab match={match} />}
      </div>
    </div>
  );
}
