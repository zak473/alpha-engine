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
  BasketballMatchDetail as TMatch,
  BasketballTeamBoxScore,
  BasketballPlayerOut,
  BasketballAdvancedStats,
  BasketballShotZone,
  BasketballInjury,
  BasketballTeamFormOut,
  BasketballEloPanelOut,
  BasketballClutchStatsOut,
  BasketballLineupUnitOut,
  BasketballScoringRunOut,
  BasketballRefereeOut,
  BasketballBettingOut,
} from "@/lib/types";
import { FormStreak } from "@/components/charts/FormStreak";
import { BasketballLivePanel } from "@/components/live/LiveMatchPanel";
import { SportMatchHeader } from "@/components/match/SportMatchHeader";
import { TeamRadarChart, norm } from "@/components/charts/TeamRadarChart";
import { ScoringTimeline } from "@/components/charts/ScoringTimeline";
import { BasketballCourtSVG } from "@/components/charts/BasketballCourtSVG";

// ─── Design tokens ───────────────────────────────────────────────────────────
const colors = {
  bg0:        "#09090b",
  surface:    "rgba(255,255,255,0.04)",
  border0:    "rgba(255,255,255,0.08)",
  textPrimary:"#f4f4f5",
  textMuted:  "#a1a1aa",
  textSubtle: "#71717a",
  accentBlue: "#3b82f6",
  accentGreen:"#22c55e",
  accentRed:  "#ef4444",
  accentAmber:"#f59e0b",
  accentPurple:"#a855f7",
};

// ─── Utility ─────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, d = 1): string {
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

function shotLine(m: number | null | undefined, a: number | null | undefined): string {
  if (m == null || a == null) return "—";
  return `${m}/${a}`;
}

// ─── Primitive layout components ─────────────────────────────────────────────

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
    <div className="flex items-center justify-center h-28 text-text-subtle text-xs text-center px-4">{msg}</div>
  );
}

// 8 / 4 grid
function SideGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">{children}</div>;
}
function MainCol({ children }: { children: React.ReactNode }) {
  return <div className="lg:col-span-8 flex flex-col gap-4">{children}</div>;
}
function SideCol({ children }: { children: React.ReactNode }) {
  return <div className="lg:col-span-4 flex flex-col gap-4">{children}</div>;
}

// Single stat comparison row
function StatDuel({
  label,
  home,
  away,
  homeWins,
  mono = true,
}: {
  label: string;
  home: string;
  away: string;
  homeWins?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-surface-border/40 last:border-0">
      <span className={cn("text-xs w-[38%] text-right pr-3 tabular-nums", mono && "font-mono", homeWins === true ? "text-accent-green font-semibold" : "text-text-muted")}>{home}</span>
      <span className="text-[10px] text-text-subtle w-[24%] text-center">{label}</span>
      <span className={cn("text-xs w-[38%] text-left pl-3 tabular-nums", mono && "font-mono", homeWins === false ? "text-accent-green font-semibold" : "text-text-muted")}>{away}</span>
    </div>
  );
}

// ─── Score by quarter ─────────────────────────────────────────────────────────

function ScoreByQuarter({ match }: { match: TMatch }) {
  const info = match.match_info;
  if (!info?.home_quarters && !info?.away_quarters) return null;
  const hq = info.home_quarters;
  const aq = info.away_quarters;
  const quarters = ["Q1", "Q2", "Q3", "Q4", ...(hq?.ot != null ? ["OT"] : [])];
  const hVals = [hq?.q1, hq?.q2, hq?.q3, hq?.q4, ...(hq?.ot != null ? [hq.ot] : [])];
  const aVals = [aq?.q1, aq?.q2, aq?.q3, aq?.q4, ...(aq?.ot != null ? [aq.ot] : [])];
  return (
    <div className="overflow-x-auto">
      <table className="text-xs font-mono tabular-nums text-right w-full border-collapse">
        <thead>
          <tr className="text-text-subtle border-b border-surface-border/40">
            <th className="text-left font-normal pr-4 py-1">Team</th>
            {quarters.map(q => <th key={q} className="w-10 py-1">{q}</th>)}
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

// ─── Header ──────────────────────────────────────────────────────────────────

function TeamBlock({ elo, name, form, isHome }: { elo: BasketballEloPanelOut | null | undefined; name: string; form: BasketballTeamFormOut | null | undefined; isHome: boolean }) {
  const align = isHome ? "items-end text-right" : "items-start text-left";
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
      {form?.last_5 && (
        <FormStreak
          results={form.last_5.map(g => g.result)}
          size="sm"
        />
      )}
      {form && (
        <div className="flex gap-3 text-xs text-text-subtle">
          {form.days_rest != null && <span>{form.days_rest}d rest</span>}
          {form.back_to_back && <span className="text-accent-amber font-semibold">B2B</span>}
          {form.injury_count != null && form.injury_count > 0 && (
            <span className="text-t1">{form.injury_count} inj</span>
          )}
        </div>
      )}
    </div>
  );
}

function MatchBlock({ match }: { match: TMatch }) {
  const info = match.match_info;
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
          {isFinished ? "Final" : "Scheduled"}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="text-4xl font-black text-text-primary tabular-nums">
          {match.home_score ?? (isLive ? "—" : "·")}
        </div>
        <div className="text-text-subtle text-lg">–</div>
        <div className="text-4xl font-black text-text-primary tabular-nums">
          {match.away_score ?? (isLive ? "—" : "·")}
        </div>
      </div>
      {info && (
        <div className="flex flex-col items-center gap-0.5 text-[10px] text-text-subtle">
          {info.arena && <span>{info.arena}</span>}
          {info.season_phase && <span className="capitalize">{info.season_phase}</span>}
          {info.pace != null && <span>Pace {fmt(info.pace, 1)}</span>}
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

function BasketballMatchHeader({ match }: { match: TMatch }) {
  return (
    <SportMatchHeader
      sport="basketball"
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
      formHome={match.form_home ? {
        last_5: match.form_home.last_5?.map(g => ({ result: g.result })),
        days_rest: match.form_home.days_rest,
        back_to_back: match.form_home.back_to_back,
        injury_count: match.form_home.injury_count,
      } : null}
      formAway={match.form_away ? {
        last_5: match.form_away.last_5?.map(g => ({ result: g.result })),
        days_rest: match.form_away.days_rest,
        back_to_back: match.form_away.back_to_back,
        injury_count: match.form_away.injury_count,
      } : null}
      venue={match.match_info?.arena}
      centerExtras={<ScoreByQuarter match={match} />}
    />
  );
}

// ─── KPI strip ──────────────────────────────────────────────────────────────

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="detail-kpi-card min-w-[120px]">
      <div className="detail-kpi-label">{label}</div>
      <div className={cn("detail-kpi-value text-[18px]", color || "text-text-primary")}>{value}</div>
      {sub && <div className="detail-kpi-sub">{sub}</div>}
    </div>
  );
}

function BasketballKpiStrip({ match }: { match: TMatch }) {
  const p = match.probabilities;
  const elo_h = match.elo_home;
  const elo_a = match.elo_away;
  const form_h = match.form_home;
  const form_a = match.form_away;
  const eloDiff = elo_h && elo_a ? Math.round(elo_h.rating - elo_a.rating) : null;

  return (
    <div className="bg-surface-base px-4 py-3">
      {/* Row 1 */}
      <div className="flex items-center gap-6 flex-wrap pb-2 border-b border-surface-border/40">
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
            <Kpi label="Fair Odds H" value={match.fair_odds.home_win?.toFixed(2) ?? "—"} />
            <Kpi label="Fair Odds A" value={match.fair_odds.away_win?.toFixed(2) ?? "—"} />
          </>
        )}
        {match.confidence != null && (
          <Kpi
            label="Confidence"
            value={`${match.confidence}%`}
            color={match.confidence >= 70 ? "text-accent-green" : match.confidence >= 55 ? "text-accent-amber" : "text-text-muted"}
          />
        )}
      </div>
      {/* Row 2 */}
      <div className="flex items-center gap-6 flex-wrap pt-2">
        {eloDiff != null && (
          <Kpi label="Elo Diff" value={eloDiff >= 0 ? `+${eloDiff}` : String(eloDiff)} color={eloDiff > 0 ? "text-positive" : "text-t1"} />
        )}
        {elo_h?.home_advantage_applied != null && (
          <Kpi label="Home Adv" value={`+${fmtInt(elo_h.home_advantage_applied)}`} sub="Elo pts" />
        )}
        {form_h && <Kpi label={`${match.home.name} Rest`} value={form_h.days_rest != null ? `${form_h.days_rest}d` : "—"} sub={form_h.back_to_back ? "B2B" : undefined} color={form_h.back_to_back ? "text-accent-amber" : undefined} />}
        {form_a && <Kpi label={`${match.away.name} Rest`} value={form_a.days_rest != null ? `${form_a.days_rest}d` : "—"} sub={form_a.back_to_back ? "B2B" : undefined} color={form_a.back_to_back ? "text-accent-amber" : undefined} />}
        {match.match_info?.pace != null && <Kpi label="Pace" value={fmt(match.match_info.pace, 1)} sub="poss/48" />}
        {form_h?.ortg_last_5 != null && <Kpi label="Home ORtg L5" value={fmt(form_h.ortg_last_5, 1)} />}
        {form_a?.drtg_last_5 != null && <Kpi label="Away DRtg L5" value={fmt(form_a.drtg_last_5, 1)} />}
      </div>
    </div>
  );
}

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TABS = ["Overview", "Lineups", "Box Score", "Team Stats", "Shot Profile", "H2H", "Elo", "Model", "Context"] as const;
type Tab = typeof TABS[number];

// ─── Overview tab ────────────────────────────────────────────────────────────

function OverviewTab({ match }: { match: TMatch }) {
  const ah = match.adv_home;
  const aa = match.adv_away;
  const fh = match.form_home;
  const fa = match.form_away;

  const hq = match.match_info?.home_quarters;
  const aq = match.match_info?.away_quarters;
  const quarterPeriods = (hq || aq) ? (["Q1", "Q2", "Q3", "Q4"] as const).map((p, i) => ({
    period: p,
    home: [hq?.q1, hq?.q2, hq?.q3, hq?.q4][i] ?? null,
    away: [aq?.q1, aq?.q2, aq?.q3, aq?.q4][i] ?? null,
  })).filter(p => p.home != null || p.away != null) : [];

  return (
    <SideGrid>
      <MainCol>
        {/* Quarter Scoring Timeline */}
        {quarterPeriods.length > 0 && (
          <PanelCard title="Quarter Scoring">
            <ScoringTimeline
              periods={quarterPeriods}
              homeLabel={match.home.name}
              awayLabel={match.away.name}
              showRunningTotal={true}
              height={180}
            />
          </PanelCard>
        )}

        {/* Team Comparison */}
        <PanelCard title="Team Comparison">
          {(ah || aa) ? (
            <div>
              <div className="flex text-[10px] text-text-subtle mb-1">
                <span className="w-[38%] text-right pr-3">{match.home.name}</span>
                <span className="w-[24%] text-center"></span>
                <span className="w-[38%] text-left pl-3">{match.away.name}</span>
              </div>
              <StatDuel label="Elo Rating" home={fmtInt(match.elo_home?.rating)} away={fmtInt(match.elo_away?.rating)} homeWins={(match.elo_home?.rating ?? 0) > (match.elo_away?.rating ?? 0)} />
              <StatDuel label="Elo Δ (last)" home={match.elo_home?.rating_change != null ? (match.elo_home.rating_change >= 0 ? "+" : "") + fmt(match.elo_home.rating_change) : "—"} away={match.elo_away?.rating_change != null ? (match.elo_away.rating_change >= 0 ? "+" : "") + fmt(match.elo_away.rating_change) : "—"} homeWins={(match.elo_home?.rating_change ?? 0) > (match.elo_away?.rating_change ?? 0)} />
              {ah && aa && (
                <>
                  <StatDuel label="ORtg" home={fmt(ah.ortg, 1)} away={fmt(aa.ortg, 1)} homeWins={(ah.ortg ?? 0) > (aa.ortg ?? 0)} />
                  <StatDuel label="DRtg" home={fmt(ah.drtg, 1)} away={fmt(aa.drtg, 1)} homeWins={(ah.drtg ?? 999) < (aa.drtg ?? 999)} />
                  <StatDuel label="NetRtg" home={fmt(ah.net_rtg, 1)} away={fmt(aa.net_rtg, 1)} homeWins={(ah.net_rtg ?? -99) > (aa.net_rtg ?? -99)} />
                  <StatDuel label="Pace" home={fmt(ah.pace, 1)} away={fmt(aa.pace, 1)} homeWins={false} mono />
                  <StatDuel label="eFG%" home={fmtPct(ah.efg_pct, 1)} away={fmtPct(aa.efg_pct, 1)} homeWins={(ah.efg_pct ?? 0) > (aa.efg_pct ?? 0)} />
                  <StatDuel label="TS%" home={fmtPct(ah.ts_pct, 1)} away={fmtPct(aa.ts_pct, 1)} homeWins={(ah.ts_pct ?? 0) > (aa.ts_pct ?? 0)} />
                  <StatDuel label="TOV%" home={fmt(ah.tov_pct, 1)} away={fmt(aa.tov_pct, 1)} homeWins={(ah.tov_pct ?? 99) < (aa.tov_pct ?? 99)} />
                  <StatDuel label="ORB%" home={fmt(ah.orb_pct, 1)} away={fmt(aa.orb_pct, 1)} homeWins={(ah.orb_pct ?? 0) > (aa.orb_pct ?? 0)} />
                  <StatDuel label="FT Rate" home={fmtPct(ah.ftr, 2)} away={fmtPct(aa.ftr, 2)} homeWins={(ah.ftr ?? 0) > (aa.ftr ?? 0)} />
                  <StatDuel label="3PAr" home={fmtPct(ah.three_par, 1)} away={fmtPct(aa.three_par, 1)} homeWins={false} />
                </>
              )}
            </div>
          ) : (
            <EmptyState msg="Advanced stats unavailable" />
          )}
        </PanelCard>

        {/* Recent Form */}
        <PanelCard title="Recent Form (Last 5)">
          {(fh?.last_5 || fa?.last_5) ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-text-subtle border-b border-surface-border/40">
                    <th className="text-left font-normal py-1 pr-3">Team</th>
                    <th className="text-left font-normal py-1 pr-2">Opp</th>
                    <th className="text-right font-normal py-1 pr-2">Score</th>
                    <th className="text-center font-normal py-1 pr-2">H/A</th>
                    <th className="text-center font-normal py-1 pr-2">W/L</th>
                    <th className="text-right font-normal py-1 pr-2">Rest</th>
                    <th className="text-right font-normal py-1">NetRtg</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(fh?.last_5 || []).map(e => ({ ...e, team: match.home.name })), ...(fa?.last_5 || []).map(e => ({ ...e, team: match.away.name }))].map((e, i) => (
                    <tr key={i} className="border-b border-surface-border/30 last:border-0">
                      <td className="py-1 pr-3 text-text-muted">{e.team}</td>
                      <td className="py-1 pr-2 font-mono text-text-subtle">{e.opponent}</td>
                      <td className="py-1 pr-2 font-mono text-text-muted text-right">{e.score}</td>
                      <td className="py-1 pr-2 text-center text-text-subtle">{e.home_away}</td>
                      <td className={cn("py-1 pr-2 text-center font-bold", e.result === "W" ? "text-accent-green" : "text-t1")}>{e.result}</td>
                      <td className="py-1 pr-2 font-mono text-text-subtle text-right">{e.days_rest ?? "—"}d</td>
                      <td className={cn("py-1 font-mono text-right", (e.net_rtg ?? 0) >= 0 ? "text-accent-green" : "text-t1")}>{e.net_rtg != null ? `${e.net_rtg >= 0 ? "+" : ""}${e.net_rtg.toFixed(1)}` : "—"}</td>
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
        {/* Context */}
        <PanelCard title="Context">
          <div className="flex flex-col gap-2 text-xs">
            {match.form_home && (
              <div className="flex items-center justify-between">
                <span className="text-text-subtle">{match.home.name} Rest</span>
                <span className={cn("font-mono font-semibold", match.form_home.back_to_back ? "text-accent-amber" : "text-text-muted")}>
                  {match.form_home.days_rest != null ? `${match.form_home.days_rest}d` : "—"}
                  {match.form_home.back_to_back ? " (B2B)" : ""}
                </span>
              </div>
            )}
            {match.form_away && (
              <div className="flex items-center justify-between">
                <span className="text-text-subtle">{match.away.name} Rest</span>
                <span className={cn("font-mono font-semibold", match.form_away.back_to_back ? "text-accent-amber" : "text-text-muted")}>
                  {match.form_away.days_rest != null ? `${match.form_away.days_rest}d` : "—"}
                  {match.form_away.back_to_back ? " (B2B)" : ""}
                </span>
              </div>
            )}
            {match.match_info?.arena && (
              <div className="flex items-center justify-between">
                <span className="text-text-subtle">Arena</span>
                <span className="text-text-muted">{match.match_info.arena}</span>
              </div>
            )}
            {match.match_info?.attendance != null && (
              <div className="flex items-center justify-between">
                <span className="text-text-subtle">Attendance</span>
                <span className="font-mono text-text-muted">{match.match_info.attendance.toLocaleString()}</span>
              </div>
            )}
            {match.match_info?.pace != null && (
              <div className="flex items-center justify-between">
                <span className="text-text-subtle">Pace</span>
                <span className="font-mono text-text-muted">{fmt(match.match_info.pace, 1)} poss/48</span>
              </div>
            )}
          </div>
        </PanelCard>

        {/* Key Edges */}
        <PanelCard title="Key Edges">
          {match.key_drivers && match.key_drivers.length > 0 ? (
            <div className="flex flex-col gap-2">
              {match.key_drivers.slice(0, 5).map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="text-xs text-text-subtle w-28 truncate">{d.feature}</div>
                  <div className="flex-1 h-1 rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-accent-blue/50" style={{ width: `${d.importance * 100}%` }} />
                  </div>
                  <div className="text-[10px] font-mono text-text-subtle w-8 text-right">{Math.round(d.importance * 100)}%</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState msg="No edge analysis yet" />
          )}
        </PanelCard>

        {/* Team Records */}
        {(match.match_info?.home_record || match.match_info?.away_record) && (
          <PanelCard title="Season Records">
            {match.match_info.home_record && (
              <div className="flex justify-between items-center py-1 border-b border-surface-border/30 text-xs">
                <span className="text-text-subtle">{match.home.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-text-primary">{match.match_info.home_record}</span>
                  {match.match_info.home_streak && (
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold",
                      match.match_info.home_streak.startsWith("W") ? "bg-accent-green/20 text-accent-green" : "bg-accent-red/20 text-t1"
                    )}>{match.match_info.home_streak}</span>
                  )}
                </div>
              </div>
            )}
            {match.match_info.away_record && (
              <div className="flex justify-between items-center py-1 text-xs">
                <span className="text-text-subtle">{match.away.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-text-primary">{match.match_info.away_record}</span>
                  {match.match_info.away_streak && (
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold",
                      match.match_info.away_streak.startsWith("W") ? "bg-accent-green/20 text-accent-green" : "bg-accent-red/20 text-t1"
                    )}>{match.match_info.away_streak}</span>
                  )}
                </div>
              </div>
            )}
          </PanelCard>
        )}

        {/* Scoring Runs */}
        {(match as any).scoring_runs && ((match as any).scoring_runs as BasketballScoringRunOut[]).length > 0 && (
          <PanelCard title="Key Scoring Runs">
            <div className="flex flex-col gap-1">
              {((match as any).scoring_runs as BasketballScoringRunOut[]).map((run, i) => (
                <div key={i} className="flex items-center justify-between py-1 border-b border-surface-border/20 last:border-0 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("w-2 h-2 rounded-full inline-block", run.team === "home" ? "bg-accent-blue" : "bg-accent-red")} />
                    <span className="text-text-muted">{run.team === "home" ? match.home.name : match.away.name}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-bold text-text-primary">{run.run_size}-0</span>
                    <span className="text-text-subtle text-[10px]">{run.period}</span>
                  </div>
                </div>
              ))}
            </div>
          </PanelCard>
        )}
      </SideCol>
    </SideGrid>
  );
}

// ─── Lineups tab ─────────────────────────────────────────────────────────────

function InjuryList({ injuries, teamName }: { injuries: BasketballInjury[]; teamName: string }) {
  if (!injuries.length) return <div className="text-xs text-text-subtle italic">No injuries reported</div>;
  return (
    <div className="flex flex-col gap-1">
      {injuries.map((inj, i) => (
        <div key={i} className="flex items-center gap-2 py-1 border-b border-surface-border/30 last:border-0">
          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded",
            inj.status === "Out" ? "bg-accent-red/20 text-t1" :
            inj.status === "Doubtful" ? "bg-accent-amber/20 text-accent-amber" :
            inj.status === "Questionable" ? "bg-yellow-500/20 text-yellow-400" :
            "bg-accent-green/20 text-accent-green"
          )}>{inj.status}</span>
          <span className="text-xs text-text-muted">{inj.player_name}</span>
          {inj.position && <span className="text-[10px] text-text-subtle">{inj.position}</span>}
          {inj.reason && <span className="text-[10px] text-text-subtle ml-auto">{inj.reason}</span>}
        </div>
      ))}
    </div>
  );
}

function LineupsTab({ match }: { match: TMatch }) {
  const boxH = match.box_home;
  const boxA = match.box_away;
  const injH = match.injuries_home ?? [];
  const injA = match.injuries_away ?? [];

  const renderLineup = (box: BasketballTeamBoxScore | null | undefined, teamName: string) => {
    if (!box?.players.length) return <EmptyState msg="No lineup data yet" />;
    const starters = box.players.filter(p => p.is_starter);
    const bench = box.players.filter(p => !p.is_starter);
    return (
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-[10px] text-positive uppercase tracking-widest mb-1">Starters</div>
          {starters.map((p, i) => (
            <div key={i} className="flex items-center justify-between py-1 border-b border-surface-border/30 last:border-0 text-xs">
              <span className="text-text-subtle w-8">{p.position}</span>
              <span className="text-text-muted flex-1">{p.name}</span>
              <span className="font-mono text-text-subtle text-right">{p.minutes != null ? `${p.minutes.toFixed(0)}m` : ""}</span>
            </div>
          ))}
        </div>
        {bench.length > 0 && (
          <div>
            <div className="text-[10px] text-text-subtle uppercase tracking-widest mb-1">Bench</div>
            {bench.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-1 border-b border-surface-border/30 last:border-0 text-xs">
                <span className="text-text-subtle w-8">{p.position}</span>
                <span className="text-text-subtle flex-1">{p.name}</span>
                <span className="font-mono text-text-subtle text-right">{p.minutes != null ? `${p.minutes.toFixed(0)}m` : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <SideGrid>
      <MainCol>
        <div className="grid grid-cols-2 gap-4">
          <PanelCard title={match.home.name}>{renderLineup(boxH, match.home.name)}</PanelCard>
          <PanelCard title={match.away.name}>{renderLineup(boxA, match.away.name)}</PanelCard>
        </div>
      </MainCol>
      <SideCol>
        <PanelCard title={`${match.home.name} — Injuries`}>
          <InjuryList injuries={injH} teamName={match.home.name} />
        </PanelCard>
        <PanelCard title={`${match.away.name} — Injuries`}>
          <InjuryList injuries={injA} teamName={match.away.name} />
        </PanelCard>

        {/* Top 5-man lineup units */}
        {(match as any).top_lineups_home && (
          <PanelCard title={`${match.home.name} — Top Lineups`}>
            {((match as any).top_lineups_home as BasketballLineupUnitOut[]).slice(0, 3).map((lu, i) => (
              <div key={i} className="py-2 border-b border-surface-border/30 last:border-0">
                <div className="text-[10px] text-text-subtle mb-1">{lu.players.join(" · ")}</div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  {lu.minutes != null && <span className="text-text-subtle">{fmt(lu.minutes, 0)}m</span>}
                  {lu.net_rating != null && <span className={cn("font-bold", lu.net_rating >= 0 ? "text-accent-green" : "text-t1")}>{lu.net_rating >= 0 ? "+" : ""}{fmt(lu.net_rating, 1)} NetRtg</span>}
                  {lu.plus_minus != null && <span className={cn(lu.plus_minus >= 0 ? "text-accent-green" : "text-t1")}>{lu.plus_minus >= 0 ? "+" : ""}{lu.plus_minus} +/-</span>}
                </div>
              </div>
            ))}
          </PanelCard>
        )}
        {(match as any).top_lineups_away && (
          <PanelCard title={`${match.away.name} — Top Lineups`}>
            {((match as any).top_lineups_away as BasketballLineupUnitOut[]).slice(0, 3).map((lu, i) => (
              <div key={i} className="py-2 border-b border-surface-border/30 last:border-0">
                <div className="text-[10px] text-text-subtle mb-1">{lu.players.join(" · ")}</div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  {lu.minutes != null && <span className="text-text-subtle">{fmt(lu.minutes, 0)}m</span>}
                  {lu.net_rating != null && <span className={cn("font-bold", lu.net_rating >= 0 ? "text-accent-green" : "text-t1")}>{lu.net_rating >= 0 ? "+" : ""}{fmt(lu.net_rating, 1)} NetRtg</span>}
                </div>
              </div>
            ))}
          </PanelCard>
        )}
      </SideCol>
    </SideGrid>
  );
}

// ─── Box Score tab ────────────────────────────────────────────────────────────

function PlayerBoxTable({ box, teamName }: { box: BasketballTeamBoxScore; teamName: string }) {
  const cols: Array<{ key: keyof BasketballPlayerOut; label: string; d?: number }> = [
    { key: "minutes",   label: "MIN",  d: 0 },
    { key: "points",    label: "PTS",  d: 0 },
    { key: "rebounds",  label: "REB",  d: 0 },
    { key: "assists",   label: "AST",  d: 0 },
    { key: "steals",    label: "STL",  d: 0 },
    { key: "blocks",    label: "BLK",  d: 0 },
    { key: "turnovers", label: "TO",   d: 0 },
    { key: "fouls",     label: "PF",   d: 0 },
    { key: "plus_minus",label: "+/-",  d: 0 },
    { key: "fg_pct",    label: "FG%",  d: 1 },
    { key: "fg3_pct",   label: "3P%",  d: 1 },
    { key: "ft_pct",    label: "FT%",  d: 1 },
  ];
  return (
    <div>
      <div className="text-[10px] text-text-subtle uppercase tracking-widest mb-2">{teamName}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse font-mono tabular-nums">
          <thead>
            <tr className="border-b border-surface-border/40 text-text-subtle">
              <th className="text-left font-normal py-1 pr-4 font-sans">Player</th>
              <th className="text-center font-normal py-1 px-1 w-6">Pos</th>
              {cols.map(c => <th key={c.key} className="text-right font-normal py-1 px-1.5">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {box.players.map((p, i) => (
              <tr key={i} className={cn("border-b border-surface-border/20 last:border-0", !p.is_starter && "opacity-70")}>
                <td className="py-1 pr-4 font-sans text-text-muted truncate max-w-[140px]">{p.name}</td>
                <td className="py-1 px-1 text-center text-text-subtle">{p.position ?? ""}</td>
                {cols.map(c => {
                  const val = p[c.key] as number | null | undefined;
                  const isShot = c.key === "fg_pct" || c.key === "fg3_pct" || c.key === "ft_pct";
                  return (
                    <td key={c.key} className={cn("py-1 px-1.5 text-right",
                      c.key === "points" && (p.points ?? 0) >= 20 ? "text-accent-amber font-bold" :
                      c.key === "plus_minus" && (p.plus_minus ?? 0) > 0 ? "text-accent-green" :
                      c.key === "plus_minus" && (p.plus_minus ?? 0) < 0 ? "text-t1" :
                      "text-text-muted"
                    )}>
                      {isShot ? fmtPct(val, 1) : fmtInt(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* Team totals */}
            <tr className="border-t border-surface-border/60 text-text-muted font-bold">
              <td className="py-1 pr-4 font-sans">Team Totals</td>
              <td></td>
              <td className="py-1 px-1.5 text-right">{fmt(box.players.reduce((s, p) => s + (p.minutes ?? 0), 0), 0)}</td>
              <td className="py-1 px-1.5 text-right">{fmtInt(box.total_points)}</td>
              <td className="py-1 px-1.5 text-right">{fmtInt(box.total_rebounds)}</td>
              <td className="py-1 px-1.5 text-right">{fmtInt(box.total_assists)}</td>
              <td className="py-1 px-1.5 text-right">{fmtInt(box.total_steals)}</td>
              <td className="py-1 px-1.5 text-right">{fmtInt(box.total_blocks)}</td>
              <td className="py-1 px-1.5 text-right">{fmtInt(box.total_turnovers)}</td>
              <td className="py-1 px-1.5 text-right">{fmtInt(box.total_fouls)}</td>
              <td></td>
              <td className="py-1 px-1.5 text-right">{fmtPct(box.fg_pct, 1)}</td>
              <td className="py-1 px-1.5 text-right">{fmtPct(box.fg3_pct, 1)}</td>
              <td className="py-1 px-1.5 text-right">{fmtPct(box.ft_pct, 1)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamLeaders({ box, teamName }: { box: BasketballTeamBoxScore; teamName: string }) {
  if (!box.players.length) return <EmptyState msg="No player data" />;
  const topPts = [...box.players].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];
  const topReb = [...box.players].sort((a, b) => (b.rebounds ?? 0) - (a.rebounds ?? 0))[0];
  const topAst = [...box.players].sort((a, b) => (b.assists ?? 0) - (a.assists ?? 0))[0];
  const leaders = [
    { label: "PTS", player: topPts, val: topPts?.points },
    { label: "REB", player: topReb, val: topReb?.rebounds },
    { label: "AST", player: topAst, val: topAst?.assists },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] text-text-subtle uppercase tracking-widest mb-1">{teamName}</div>
      {leaders.map(l => (
        <div key={l.label} className="flex items-center justify-between text-xs py-1 border-b border-surface-border/30 last:border-0">
          <span className="text-text-subtle w-8">{l.label}</span>
          <span className="text-text-muted flex-1 mx-2 truncate">{l.player?.name ?? "—"}</span>
          <span className="font-mono font-bold text-text-primary">{fmtInt(l.val)}</span>
        </div>
      ))}
    </div>
  );
}

function BoxScoreTab({ match }: { match: TMatch }) {
  const boxH = match.box_home;
  const boxA = match.box_away;

  if (!boxH && !boxA) {
    return (
      <SideGrid>
        <MainCol>
          <PanelCard><EmptyState msg="No box score data yet. Available after game completion." /></PanelCard>
        </MainCol>
        <SideCol>
          <PanelCard title="Leaders"><EmptyState msg="—" /></PanelCard>
        </SideCol>
      </SideGrid>
    );
  }

  return (
    <SideGrid>
      <MainCol>
        {boxH && <PanelCard><PlayerBoxTable box={boxH} teamName={match.home.name} /></PanelCard>}
        {boxA && <PanelCard><PlayerBoxTable box={boxA} teamName={match.away.name} /></PanelCard>}
        {/* Misc team stats */}
        {(boxH || boxA) && (
          <PanelCard title="Misc Team Stats">
            <div className="grid grid-cols-1 gap-y-1 text-xs">
              {[
                { label: "Fast Break Pts",     hv: fmtInt(boxH?.fast_break_pts),         av: fmtInt(boxA?.fast_break_pts) },
                { label: "Pts in Paint",       hv: fmtInt(boxH?.pts_in_paint),           av: fmtInt(boxA?.pts_in_paint) },
                { label: "2nd Chance Pts",     hv: fmtInt(boxH?.second_chance_pts),      av: fmtInt(boxA?.second_chance_pts) },
                { label: "Bench Pts",          hv: fmtInt(boxH?.bench_points),           av: fmtInt(boxA?.bench_points) },
                { label: "Pts off Turnovers",  hv: fmtInt(boxH?.points_off_turnovers),   av: fmtInt(boxA?.points_off_turnovers) },
                { label: "Largest Lead",       hv: fmtInt(boxH?.largest_lead),           av: fmtInt(boxA?.largest_lead) },
                { label: "Lead Changes",       hv: fmtInt(boxH?.lead_changes),           av: fmtInt(boxA?.lead_changes) },
                { label: "Times Tied",         hv: fmtInt(boxH?.times_tied),             av: fmtInt(boxA?.times_tied) },
              ].filter(r => r.hv !== "—" || r.av !== "—").map(r => (
                <div key={r.label} className="flex items-center justify-between py-0.5 border-b border-surface-border/30 last:border-0">
                  <span className="text-text-subtle">{r.label}</span>
                  <div className="flex items-center gap-3 font-mono text-text-muted">
                    <span className="text-positive">{r.hv}</span>
                    <span className="text-text-subtle text-[10px]">vs</span>
                    <span className="text-t1">{r.av}</span>
                  </div>
                </div>
              ))}
            </div>
          </PanelCard>
        )}
      </MainCol>
      <SideCol>
        {boxH && <PanelCard title="Team Leaders"><TeamLeaders box={boxH} teamName={match.home.name} /></PanelCard>}
        {boxA && <PanelCard title="Team Leaders"><TeamLeaders box={boxA} teamName={match.away.name} /></PanelCard>}
        {/* Shooting splits */}
        {(boxH || boxA) && (
          <PanelCard title="Shooting Splits">
            <div className="flex flex-col gap-1.5 text-xs">
              {[
                { label: "FG%", hv: fmtPct(boxH?.fg_pct, 1), av: fmtPct(boxA?.fg_pct, 1) },
                { label: "3P%", hv: fmtPct(boxH?.fg3_pct, 1), av: fmtPct(boxA?.fg3_pct, 1) },
                { label: "FT%", hv: fmtPct(boxH?.ft_pct, 1), av: fmtPct(boxA?.ft_pct, 1) },
                { label: "FGM-A", hv: shotLine(boxH?.fg_made, boxH?.fg_att), av: shotLine(boxA?.fg_made, boxA?.fg_att) },
                { label: "3PM-A", hv: shotLine(boxH?.fg3_made, boxH?.fg3_att), av: shotLine(boxA?.fg3_made, boxA?.fg3_att) },
                { label: "FTM-A", hv: shotLine(boxH?.ft_made, boxH?.ft_att), av: shotLine(boxA?.ft_made, boxA?.ft_att) },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-0.5 border-b border-surface-border/30 last:border-0">
                  <span className="font-mono text-text-muted">{r.hv}</span>
                  <span className="text-text-subtle text-center">{r.label}</span>
                  <span className="font-mono text-text-muted">{r.av}</span>
                </div>
              ))}
            </div>
          </PanelCard>
        )}
      </SideCol>
    </SideGrid>
  );
}

// ─── Team Stats tab ───────────────────────────────────────────────────────────

function TeamStatsTab({ match }: { match: TMatch }) {
  const ah = match.adv_home;
  const aa = match.adv_away;

  const radarMetrics = (ah && aa) ? [
    { label: "ORtg",   home: norm(ah.ortg, 95, 120),                           away: norm(aa.ortg, 95, 120) },
    { label: "DRtg",   home: norm(ah.drtg, 90, 120, true),                     away: norm(aa.drtg, 90, 120, true) },
    { label: "eFG%",   home: norm(ah.efg_pct != null ? ah.efg_pct * 100 : null, 45, 60), away: norm(aa.efg_pct != null ? aa.efg_pct * 100 : null, 45, 60) },
    { label: "TS%",    home: norm(ah.ts_pct  != null ? ah.ts_pct  * 100 : null, 50, 65), away: norm(aa.ts_pct  != null ? aa.ts_pct  * 100 : null, 50, 65) },
    { label: "TOV%",   home: norm(ah.tov_pct, 8, 20, true),                    away: norm(aa.tov_pct, 8, 20, true) },
    { label: "Pace",   home: norm(ah.pace, 90, 105),                           away: norm(aa.pace, 90, 105) },
  ] : null;

  const fourFactors = [
    { factor: "eFG%",    desc: "Effective FG%",     hv: fmtPct(ah?.efg_pct, 1), av: fmtPct(aa?.efg_pct, 1), homeWins: (ah?.efg_pct ?? 0) > (aa?.efg_pct ?? 0) },
    { factor: "TOV%",    desc: "Turnover Rate",      hv: fmt(ah?.tov_pct, 1),   av: fmt(aa?.tov_pct, 1),    homeWins: (ah?.tov_pct ?? 99) < (aa?.tov_pct ?? 99) },
    { factor: "ORB%",    desc: "Offensive Reb Rate", hv: fmt(ah?.orb_pct, 1),   av: fmt(aa?.orb_pct, 1),    homeWins: (ah?.orb_pct ?? 0) > (aa?.orb_pct ?? 0) },
    { factor: "FT Rate", desc: "FTA/FGA",             hv: fmtPct(ah?.ftr, 2),    av: fmtPct(aa?.ftr, 2),     homeWins: (ah?.ftr ?? 0) > (aa?.ftr ?? 0) },
  ];

  return (
    <SideGrid>
      <MainCol>
        {radarMetrics && (
          <PanelCard title="Team Profile Radar — Normalised 0–100">
            <TeamRadarChart
              metrics={radarMetrics}
              homeLabel={match.home.name}
              awayLabel={match.away.name}
              homeColor={colors.accentBlue}
              awayColor={colors.accentAmber}
              height={220}
            />
          </PanelCard>
        )}
        <PanelCard title="Advanced Ratings">
          {(ah && aa) ? (
            <>
              <StatDuel label="ORtg"   home={fmt(ah.ortg, 1)}    away={fmt(aa.ortg, 1)}    homeWins={(ah.ortg ?? 0) > (aa.ortg ?? 0)} />
              <StatDuel label="DRtg"   home={fmt(ah.drtg, 1)}    away={fmt(aa.drtg, 1)}    homeWins={(ah.drtg ?? 999) < (aa.drtg ?? 999)} />
              <StatDuel label="NetRtg" home={fmt(ah.net_rtg, 1)} away={fmt(aa.net_rtg, 1)} homeWins={(ah.net_rtg ?? -99) > (aa.net_rtg ?? -99)} />
              <StatDuel label="Pace"   home={fmt(ah.pace, 1)}    away={fmt(aa.pace, 1)}    homeWins={false} />
              <StatDuel label="TS%"    home={fmtPct(ah.ts_pct, 1)} away={fmtPct(aa.ts_pct, 1)} homeWins={(ah.ts_pct ?? 0) > (aa.ts_pct ?? 0)} />
              <StatDuel label="DRB%"   home={fmt(ah.drb_pct, 1)} away={fmt(aa.drb_pct, 1)} homeWins={(ah.drb_pct ?? 0) > (aa.drb_pct ?? 0)} />
              <StatDuel label="3PAr"   home={fmtPct(ah.three_par, 1)} away={fmtPct(aa.three_par, 1)} homeWins={false} />
            </>
          ) : (
            <EmptyState msg="Advanced stats unavailable" />
          )}
        </PanelCard>
      </MainCol>
      <SideCol>
        <PanelCard title="Four Factors">
          {(ah && aa) ? (
            <div className="flex flex-col gap-2">
              {fourFactors.map(ff => (
                <div key={ff.factor} className="flex items-center justify-between py-1 border-b border-surface-border/30 last:border-0">
                  <div className="match-page-shell flex flex-col max-w-[1440px] mx-auto w-full px-4 py-4">
                    <span className="text-xs text-text-muted font-semibold">{ff.factor}</span>
                    <span className="text-[10px] text-text-subtle">{ff.desc}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className={cn(ff.homeWins ? "text-accent-green font-semibold" : "text-text-muted")}>{ff.hv}</span>
                    <span className="text-text-subtle">vs</span>
                    <span className={cn(!ff.homeWins ? "text-accent-green font-semibold" : "text-text-muted")}>{ff.av}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState msg="Four factors unavailable" />
          )}
        </PanelCard>

        {/* Clutch stats */}
        {((match as any).clutch_home || (match as any).clutch_away) && (
          <PanelCard title="Clutch Stats (< 5 min, ≤5 pts)">
            {[
              { c: (match as any).clutch_home as BasketballClutchStatsOut | null, name: match.home.name },
              { c: (match as any).clutch_away as BasketballClutchStatsOut | null, name: match.away.name },
            ].map(({ c, name }) => c ? (
              <div key={name} className="mb-3 last:mb-0">
                <div className="text-[10px] text-text-subtle uppercase tracking-widest mb-1">{name}</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                  <div className="flex justify-between py-0.5 border-b border-surface-border/20"><span className="text-text-subtle">Points</span><span className="font-mono">{fmtInt(c.clutch_points)}</span></div>
                  <div className="flex justify-between py-0.5 border-b border-surface-border/20"><span className="text-text-subtle">FG%</span><span className="font-mono">{fmtPct(c.clutch_fg_pct, 1)}</span></div>
                  <div className="flex justify-between py-0.5 border-b border-surface-border/20"><span className="text-text-subtle">FT%</span><span className="font-mono">{fmtPct(c.clutch_ft_pct, 1)}</span></div>
                  <div className="flex justify-between py-0.5 border-b border-surface-border/20"><span className="text-text-subtle">TOV</span><span className="font-mono">{fmtInt(c.clutch_turnovers)}</span></div>
                  {c.clutch_net_rating != null && <div className="flex justify-between py-0.5 col-span-2 border-b border-surface-border/20"><span className="text-text-subtle">Net Rating</span><span className={cn("font-mono font-bold", c.clutch_net_rating >= 0 ? "text-accent-green" : "text-t1")}>{c.clutch_net_rating >= 0 ? "+" : ""}{fmt(c.clutch_net_rating, 1)}</span></div>}
                  {(c.clutch_wins_season != null || c.clutch_losses_season != null) && (
                    <div className="flex justify-between py-0.5 col-span-2"><span className="text-text-subtle">Season clutch W-L</span><span className="font-mono">{c.clutch_wins_season ?? 0}–{c.clutch_losses_season ?? 0}</span></div>
                  )}
                </div>
              </div>
            ) : null)}
          </PanelCard>
        )}
      </SideCol>
    </SideGrid>
  );
}

// ─── Shot Profile tab ─────────────────────────────────────────────────────────

function ShotZoneTable({ zones, teamName }: { zones: BasketballShotZone[]; teamName: string }) {
  return (
    <div>
      <div className="text-[10px] text-text-subtle uppercase tracking-widest mb-2">{teamName}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono tabular-nums border-collapse">
          <thead>
            <tr className="text-text-subtle border-b border-surface-border/40 font-sans">
              <th className="text-left font-normal py-1">Zone</th>
              <th className="text-right font-normal py-1 px-2">Att</th>
              <th className="text-right font-normal py-1 px-2">Made</th>
              <th className="text-right font-normal py-1 px-2">FG%</th>
              <th className="text-right font-normal py-1">Share</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z, i) => (
              <tr key={i} className="border-b border-surface-border/20 last:border-0">
                <td className="py-1 font-sans text-text-muted">{z.zone}</td>
                <td className="py-1 px-2 text-right text-text-muted">{z.attempts}</td>
                <td className="py-1 px-2 text-right text-text-muted">{z.made}</td>
                <td className={cn("py-1 px-2 text-right font-semibold", z.pct >= 0.45 ? "text-accent-green" : z.pct >= 0.35 ? "text-text-muted" : "text-t1")}>{fmtPct(z.pct, 1)}</td>
                <td className="py-1 text-right text-text-subtle">{fmtPct(z.attempts_pct, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShotProfileTab({ match }: { match: TMatch }) {
  const sh = match.shots_home;
  const sa = match.shots_away;
  return (
    <SideGrid>
      <MainCol>
        {(sh || sa) ? (
          <>
            {(sh || sa) && (
              <PanelCard title="Shot Zone Court">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sh && <BasketballCourtSVG zones={sh} label={match.home.name} />}
                  {sa && <BasketballCourtSVG zones={sa} label={match.away.name} />}
                </div>
              </PanelCard>
            )}
            {sh && <PanelCard><ShotZoneTable zones={sh} teamName={match.home.name} /></PanelCard>}
            {sa && <PanelCard><ShotZoneTable zones={sa} teamName={match.away.name} /></PanelCard>}
          </>
        ) : (
          <PanelCard><EmptyState msg="No shot chart data yet" /></PanelCard>
        )}
      </MainCol>
      <SideCol>
        {match.match_info?.pace != null && (
          <PanelCard title="Pace & Possessions">
            <div className="text-xs text-text-muted flex flex-col gap-1">
              <div className="flex justify-between"><span className="text-text-subtle">Pace</span><span className="font-mono">{fmt(match.match_info.pace, 1)} poss/48</span></div>
            </div>
          </PanelCard>
        )}
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
            {h2h.draws != null && (
              <div className="flex flex-col items-center">
                <div className="text-4xl font-black text-text-subtle">{h2h.draws}</div>
                <div className="text-text-subtle text-xs mt-1">Draws</div>
              </div>
            )}
            <div className="flex flex-col items-center">
              <div className="text-4xl font-black text-text-primary">{h2h.away_wins}</div>
              <div className="text-text-muted text-xs mt-1">{match.away.name}</div>
            </div>
          </div>
        </PanelCard>

        {h2h.recent_matches.length > 0 && (
          <PanelCard title="Recent Meetings">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-text-subtle border-b border-surface-border/40">
                    <th className="text-left font-normal py-1">Date</th>
                    <th className="text-right font-normal py-1">Home</th>
                    <th className="text-center font-normal py-1 px-2">–</th>
                    <th className="text-left font-normal py-1">Away</th>
                    <th className="text-right font-normal py-1">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {h2h.recent_matches.map((m: any, i: number) => (
                    <tr key={i} className="border-b border-surface-border/20 last:border-0">
                      <td className="py-1 text-text-subtle">{m.date ? new Date(m.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}</td>
                      <td className="py-1 text-right font-mono text-text-muted">{m.home_score ?? "—"}</td>
                      <td className="py-1 text-center text-text-subtle px-2">–</td>
                      <td className="py-1 font-mono text-text-muted">{m.away_score ?? "—"}</td>
                      <td className={cn("py-1 text-right capitalize", m.winner === "home" ? "text-positive" : "text-text-muted")}>{m.winner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelCard>
        )}
      </MainCol>
      <SideCol>
        <PanelCard title="H2H Summary">
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex justify-between"><span className="text-text-subtle">Total Matches</span><span className="font-mono text-text-muted">{h2h.total_matches}</span></div>
            <div className="flex justify-between"><span className="text-text-subtle">{match.home.name} Wins</span><span className="font-mono text-positive">{h2h.home_wins}</span></div>
            <div className="flex justify-between"><span className="text-text-subtle">{match.away.name} Wins</span><span className="font-mono text-text-muted">{h2h.away_wins}</span></div>
            <div className="flex justify-between"><span className="text-text-subtle">Home Win%</span><span className="font-mono text-text-muted">{h2h.total_matches > 0 ? fmtPct(h2h.home_wins / h2h.total_matches) : "—"}</span></div>
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
                <Tooltip
                  contentStyle={{ background: colors.surface, border: `1px solid ${colors.border0}`, borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: colors.textMuted }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: colors.textMuted }} />
                <Line type="monotone" dataKey="home" name={match.home.name} stroke={colors.accentBlue} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="away" name={match.away.name} stroke={colors.accentRed} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState msg="No ELO history available" />
          )}
        </PanelCard>

        {/* ELO Breakdown */}
        {(elo_h || elo_a) && (
          <PanelCard title="Elo Breakdown">
            <div className="grid grid-cols-2 gap-x-8 text-xs">
              {[
                { elo: elo_h, name: match.home.name },
                { elo: elo_a, name: match.away.name },
              ].map(({ elo, name }) => elo && (
                <div key={name} className="flex flex-col gap-1">
                  <div className="text-text-muted font-semibold mb-1">{name}</div>
                  <div className="flex justify-between py-0.5"><span className="text-text-subtle">Rating</span><span className="font-mono">{fmtInt(elo.rating)}</span></div>
                  <div className="flex justify-between py-0.5"><span className="text-text-subtle">Δ last</span><span className={cn("font-mono", (elo.rating_change ?? 0) >= 0 ? "text-accent-green" : "text-t1")}>{(elo.rating_change ?? 0) >= 0 ? "+" : ""}{fmt(elo.rating_change)}</span></div>
                  {elo.k_used != null && <div className="flex justify-between py-0.5"><span className="text-text-subtle">K used</span><span className="font-mono">{fmt(elo.k_used, 1)}</span></div>}
                  {elo.home_advantage_applied != null && <div className="flex justify-between py-0.5"><span className="text-text-subtle">Home adv</span><span className="font-mono">+{fmtInt(elo.home_advantage_applied)}</span></div>}
                  {elo.mov_modifier != null && <div className="flex justify-between py-0.5"><span className="text-text-subtle">MoV mod</span><span className="font-mono">{fmt(elo.mov_modifier, 2)}</span></div>}
                  {elo.rest_modifier != null && <div className="flex justify-between py-0.5"><span className="text-text-subtle">Rest mod</span><span className={cn("font-mono", elo.rest_modifier < 0 ? "text-t1" : "text-text-muted")}>{fmt(elo.rest_modifier, 0)}</span></div>}
                  {elo.implied_win_prob != null && <div className="flex justify-between py-0.5 border-t border-surface-border/40 mt-1 pt-1"><span className="text-text-subtle">Elo win prob</span><span className="font-mono font-bold text-text-primary">{fmtPct(elo.implied_win_prob, 1)}</span></div>}
                </div>
              ))}
            </div>
          </PanelCard>
        )}
      </MainCol>

      <SideCol>
        <PanelCard title="Elo Last 10 — Home">
          {elo_h?.last_10_ratings && elo_h.last_10_ratings.length > 0 ? (
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
          {elo_a?.last_10_ratings && elo_a.last_10_ratings.length > 0 ? (
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
                  <div className="w-36 text-xs text-text-muted truncate">{d.feature}</div>
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
      </SideCol>
    </SideGrid>
  );
}

// ─── Context tab ──────────────────────────────────────────────────────────────

function ContextTab({ match }: { match: TMatch }) {
  const dc = match.data_completeness;
  const info = match.match_info;
  return (
    <SideGrid>
      <MainCol>
        {(match.injuries_home?.length || match.injuries_away?.length) ? (
          <PanelCard title="Injury Report">
            {match.injuries_home?.length ? (
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-widest text-positive mb-1">{match.home.name}</div>
                <InjuryList injuries={match.injuries_home} teamName={match.home.name} />
              </div>
            ) : null}
            {match.injuries_away?.length ? (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-t1 mb-1">{match.away.name}</div>
                <InjuryList injuries={match.injuries_away} teamName={match.away.name} />
              </div>
            ) : null}
          </PanelCard>
        ) : null}

        <PanelCard title="Schedule / Rest">
          <div className="flex flex-col gap-2 text-xs">
            {match.form_home && (
              <div className="flex justify-between"><span className="text-text-subtle">{match.home.name} rest</span><span className="font-mono text-text-muted">{match.form_home.days_rest != null ? `${match.form_home.days_rest}d` : "—"}{match.form_home.back_to_back ? " (B2B)" : ""}</span></div>
            )}
            {match.form_away && (
              <div className="flex justify-between"><span className="text-text-subtle">{match.away.name} rest</span><span className="font-mono text-text-muted">{match.form_away.days_rest != null ? `${match.form_away.days_rest}d` : "—"}{match.form_away.back_to_back ? " (B2B)" : ""}</span></div>
            )}
            {info?.arena && <div className="flex justify-between"><span className="text-text-subtle">Arena</span><span className="text-text-muted">{info.arena}</span></div>}
            {info?.city && <div className="flex justify-between"><span className="text-text-subtle">City</span><span className="text-text-muted">{info.city}</span></div>}
            {info?.attendance != null && <div className="flex justify-between"><span className="text-text-subtle">Attendance</span><span className="font-mono text-text-muted">{info.attendance.toLocaleString()}</span></div>}
            {info?.season_phase && <div className="flex justify-between"><span className="text-text-subtle">Phase</span><span className="text-text-muted capitalize">{info.season_phase}</span></div>}
            {info?.home_record && <div className="flex justify-between"><span className="text-text-subtle">{match.home.name} record</span><span className="font-mono text-text-muted">{info.home_record}</span></div>}
            {info?.away_record && <div className="flex justify-between"><span className="text-text-subtle">{match.away.name} record</span><span className="font-mono text-text-muted">{info.away_record}</span></div>}
            {info?.overtime_periods != null && info.overtime_periods > 0 && <div className="flex justify-between"><span className="text-text-subtle">Overtime periods</span><span className="font-mono text-accent-amber">{info.overtime_periods}</span></div>}
          </div>
        </PanelCard>

        {/* Referee panel */}
        {(match as any).referee && (
          <PanelCard title="Officiating Crew">
            {(() => {
              const ref = (match as any).referee as BasketballRefereeOut;
              return (
                <div className="flex flex-col gap-2 text-xs">
                  {ref.names.length > 0 && (
                    <div className="text-text-muted">{ref.names.join(", ")}</div>
                  )}
                  {ref.avg_fouls_per_game != null && <div className="flex justify-between"><span className="text-text-subtle">Fouls / game</span><span className="font-mono">{fmt(ref.avg_fouls_per_game, 1)}</span></div>}
                  {ref.avg_fta_per_game != null && <div className="flex justify-between"><span className="text-text-subtle">FTA / game</span><span className="font-mono">{fmt(ref.avg_fta_per_game, 1)}</span></div>}
                  {ref.technicals_per_game != null && <div className="flex justify-between"><span className="text-text-subtle">Technicals / game</span><span className="font-mono">{fmt(ref.technicals_per_game, 2)}</span></div>}
                  {ref.home_win_pct != null && <div className="flex justify-between"><span className="text-text-subtle">Home team win%</span><span className="font-mono">{fmtPct(ref.home_win_pct, 1)}</span></div>}
                  {ref.avg_total_points != null && <div className="flex justify-between"><span className="text-text-subtle">Avg total pts</span><span className="font-mono">{fmt(ref.avg_total_points, 1)}</span></div>}
                </div>
              );
            })()}
          </PanelCard>
        )}

        {/* Betting lines */}
        {(match as any).betting && (
          <PanelCard title="Betting Lines">
            {(() => {
              const bet = (match as any).betting as BasketballBettingOut;
              return (
                <div className="flex flex-col gap-2 text-xs">
                  {bet.spread != null && <div className="flex justify-between"><span className="text-text-subtle">Spread (home)</span><span className="font-mono font-semibold">{bet.spread >= 0 ? "+" : ""}{bet.spread}</span></div>}
                  {bet.total != null && <div className="flex justify-between"><span className="text-text-subtle">Total (O/U)</span><span className="font-mono">{bet.total}</span></div>}
                  {bet.home_ml != null && <div className="flex justify-between"><span className="text-text-subtle">{match.home.name} ML</span><span className="font-mono">{bet.home_ml >= 0 ? "+" : ""}{bet.home_ml}</span></div>}
                  {bet.away_ml != null && <div className="flex justify-between"><span className="text-text-subtle">{match.away.name} ML</span><span className="font-mono">{bet.away_ml >= 0 ? "+" : ""}{bet.away_ml}</span></div>}
                  {bet.implied_home_total != null && <div className="flex justify-between"><span className="text-text-subtle">Implied home total</span><span className="font-mono text-positive">{fmt(bet.implied_home_total, 1)}</span></div>}
                  {bet.implied_away_total != null && <div className="flex justify-between"><span className="text-text-subtle">Implied away total</span><span className="font-mono text-t1">{fmt(bet.implied_away_total, 1)}</span></div>}
                  {bet.sharp_side_spread && <div className="flex justify-between"><span className="text-text-subtle">Sharp side (spread)</span><span className="font-mono text-accent-amber capitalize">{bet.sharp_side_spread}</span></div>}
                  {bet.spread_line_move != null && <div className="flex justify-between"><span className="text-text-subtle">Spread line move</span><span className={cn("font-mono", bet.spread_line_move > 0 ? "text-accent-green" : "text-t1")}>{bet.spread_line_move > 0 ? "+" : ""}{fmt(bet.spread_line_move, 1)}</span></div>}
                </div>
              );
            })()}
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

export function BasketballMatchDetail({ match, eloHomeHistory, eloAwayHistory }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const router = useRouter();
  const isLive = match.status === "live";
  const tick = useLiveRefresh(isLive);
  useEffect(() => { if (tick > 0) router.refresh(); }, [tick, router]);

  return (
    <div className="match-page-shell flex flex-col max-w-[1440px] mx-auto w-full px-4 py-4">
      <BasketballMatchHeader match={match} />
      <div className="match-kpi-strip match-kpi-strip--soft overflow-hidden"><BasketballKpiStrip match={match} /></div>

      {match.status === "live" && <div className="match-live-wrap px-4 pb-1"><BasketballLivePanel match={match} /></div>}

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
        {activeTab === "Overview"      && <OverviewTab match={match} />}
        {activeTab === "Lineups"       && <LineupsTab match={match} />}
        {activeTab === "Box Score"     && <BoxScoreTab match={match} />}
        {activeTab === "Team Stats"    && <TeamStatsTab match={match} />}
        {activeTab === "Shot Profile"  && <ShotProfileTab match={match} />}
        {activeTab === "H2H"           && <H2HTab match={match} />}
        {activeTab === "Elo"           && <EloTab match={match} eloHomeHistory={eloHomeHistory} eloAwayHistory={eloAwayHistory} />}
        {activeTab === "Model"         && <ModelTab match={match} />}
        {activeTab === "Context"       && <ContextTab match={match} />}
      </div>
    </div>
  );
}
