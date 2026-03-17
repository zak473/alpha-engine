"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveRefresh } from "@/lib/hooks/useLiveRefresh";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import type {
  BaseballMatchDetail as TMatch,
  StarterPitcherOut,
  BullpenSummaryOut,
  BaseballTeamBattingOut,
  BaseballEloPanelOut,
  BaseballTeamFormOut,
} from "@/lib/types";
import { FormStreak } from "@/components/charts/FormStreak";
import { TeamRadarChart, norm } from "@/components/charts/TeamRadarChart";
import { ScoringTimeline } from "@/components/charts/ScoringTimeline";
import { BaseballLivePanel } from "@/components/live/LiveMatchPanel";
import { SportMatchHeader } from "@/components/match/SportMatchHeader";

// ─── Utils ────────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, d = 2) { return n == null ? "—" : n.toFixed(d); }
function fmtPct(n: number | null | undefined, d = 1) { return n == null ? "—" : (n * 100).toFixed(d) + "%"; }
function fmtInt(n: number | null | undefined) { return n == null ? "—" : String(Math.round(n)); }
function fmtAvg(n: number | null | undefined) { return n == null ? "—" : n.toFixed(3).replace(/^0/, ""); }

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  emerald:    "#22e283",
  emeraldDim: "rgba(34,226,131,0.10)",
  emeraldBorder: "rgba(34,226,131,0.22)",
  blue:       "#60a5fa",
  blueDim:    "rgba(96,165,250,0.10)",
  blueBorder: "rgba(96,165,250,0.22)",
  amber:      "#fbbf24",
  amberDim:   "rgba(251,191,36,0.12)",
  red:        "#f87171",
  redDim:     "rgba(248,113,113,0.10)",
  purple:     "#a78bfa",
  purpleDim:  "rgba(167,139,250,0.10)",
  surface:    "rgba(255,255,255,0.04)",
  surface2:   "rgba(255,255,255,0.06)",
  border:     "rgba(255,255,255,0.08)",
  textPrimary: "#f0fdf4",
  textMuted:   "rgba(255,255,255,0.55)",
  textSubtle:  "rgba(255,255,255,0.30)",
};

// ─── Layout ───────────────────────────────────────────────────────────────────
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">{children}</div>;
}
function Main({ children }: { children: React.ReactNode }) {
  return <div className="lg:col-span-8 flex flex-col gap-4">{children}</div>;
}
function Side({ children }: { children: React.ReactNode }) {
  return <div className="lg:col-span-4 flex flex-col gap-4">{children}</div>;
}

function Panel({
  children, title, accent, className, glow,
}: {
  children: React.ReactNode;
  title?: string;
  accent?: "emerald" | "blue" | "amber" | "red" | "purple";
  glow?: boolean;
  className?: string;
}) {
  const accentColors: Record<string, { border: string; text: string; shadow?: string }> = {
    emerald: { border: C.emeraldBorder, text: C.emerald, shadow: "0 0 24px rgba(34,226,131,0.08)" },
    blue:    { border: C.blueBorder,    text: C.blue,    shadow: "0 0 24px rgba(96,165,250,0.08)" },
    amber:   { border: "rgba(251,191,36,0.24)", text: C.amber },
    red:     { border: "rgba(248,113,113,0.22)", text: C.red },
    purple:  { border: "rgba(167,139,250,0.22)", text: C.purple },
  };
  const ac = accent ? accentColors[accent] : null;
  return (
    <div
      className={cn("rounded-[20px] p-4", className)}
      style={{
        background: C.surface,
        border: `1px solid ${ac ? ac.border : C.border}`,
        boxShadow: glow && ac?.shadow ? ac.shadow : undefined,
      }}
    >
      {title && (
        <div className="flex items-center gap-2 mb-3">
          {ac && <div className="w-1 h-3 rounded-full" style={{ background: ac.text }} />}
          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: ac ? ac.text : C.textSubtle }}>{title}</span>
        </div>
      )}
      {children}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="flex items-center justify-center h-20 text-[11px]" style={{ color: C.textSubtle }}>{msg}</div>;
}

// ─── Stat bar comparison ──────────────────────────────────────────────────────
function DuelBar({
  label, home, away, homeVal, awayVal, lowerBetter = false, fmt: fmtFn,
}: {
  label: string;
  home: string; away: string;
  homeVal?: number | null; awayVal?: number | null;
  lowerBetter?: boolean;
  fmt?: (v: number) => string;
}) {
  const hv = homeVal ?? 0;
  const av = awayVal ?? 0;
  const total = hv + av || 1;
  const homePct = (hv / total) * 100;
  const homeWins = homeVal != null && awayVal != null && (lowerBetter ? homeVal < awayVal : homeVal > awayVal);
  const awayWins = homeVal != null && awayVal != null && (lowerBetter ? awayVal < homeVal : awayVal > homeVal);
  return (
    <div className="py-2 border-b last:border-0" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={cn("text-xs font-mono tabular-nums font-semibold", homeWins ? "text-[#22e283]" : "")} style={{ color: homeWins ? C.emerald : C.textMuted }}>{home}</span>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: C.textSubtle }}>{label}</span>
        <span className="text-xs font-mono tabular-nums font-semibold" style={{ color: awayWins ? C.blue : C.textMuted }}>{away}</span>
      </div>
      <div className="flex h-1 rounded-full overflow-hidden gap-px" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${homePct}%`, background: homeWins ? C.emerald : "rgba(255,255,255,0.20)" }} />
        <div className="h-full flex-1 rounded-full" style={{ background: awayWins ? C.blue : "rgba(255,255,255,0.12)" }} />
      </div>
    </div>
  );
}

// ─── Meter (bullpen fatigue) ──────────────────────────────────────────────────
function FatigueMeter({ score, label }: { score: number; label: string }) {
  const pct = Math.min(100, score * 10);
  const color = score > 6 ? C.red : score > 4 ? C.amber : C.emerald;
  const tag = score > 6 ? "HIGH" : score > 4 ? "MED" : "LOW";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: C.textMuted }}>{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color }}>{tag}</span>
          <span className="text-xs font-mono font-bold tabular-nums" style={{ color }}>{score.toFixed(1)}</span>
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}aa, ${color})` }} />
      </div>
    </div>
  );
}

// ─── Win probability hero bar ─────────────────────────────────────────────────
function WinProbBar({ homeProb, awayProb, homeName, awayName }: { homeProb: number; awayProb: number; homeName: string; awayName: string }) {
  const homePct = Math.round(homeProb * 100);
  const awayPct = Math.round(awayProb * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span style={{ color: C.emerald }} className="font-semibold">{homeName}</span>
        <span style={{ color: C.textSubtle }} className="text-[10px] uppercase tracking-widest">Win Probability</span>
        <span style={{ color: C.blue }} className="font-semibold">{awayName}</span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${homePct}%`, background: `linear-gradient(90deg, ${C.emerald}cc, ${C.emerald}88)` }} />
        <div className="absolute inset-y-0 right-0 rounded-full" style={{ width: `${awayPct}%`, background: `linear-gradient(270deg, ${C.blue}cc, ${C.blue}88)` }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-2xl font-black font-mono tabular-nums" style={{ color: C.emerald }}>{homePct}%</span>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: C.textSubtle }}>vs</span>
        <span className="text-2xl font-black font-mono tabular-nums" style={{ color: C.blue }}>{awayPct}%</span>
      </div>
    </div>
  );
}

// ─── Line Score grid ──────────────────────────────────────────────────────────
function LineScoreGrid({ match }: { match: TMatch }) {
  const mi = match.match_info;
  if (!mi?.inning_scores?.length) return null;
  const innings = mi.inning_scores;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs font-mono tabular-nums">
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            <th className="text-left font-medium py-2 pr-4 text-[10px] uppercase tracking-widest" style={{ color: C.textSubtle }}>Team</th>
            {innings.map(i => (
              <th key={i.inning} className="w-8 py-2 text-center font-normal" style={{ color: C.textSubtle }}>{i.inning}</th>
            ))}
            <th className="pl-3 py-2 font-bold text-center" style={{ color: C.emerald }}>R</th>
            <th className="px-2 py-2 font-normal text-center" style={{ color: C.textSubtle }}>H</th>
            <th className="py-2 font-normal text-center" style={{ color: C.textSubtle }}>E</th>
          </tr>
        </thead>
        <tbody>
          {[
            { name: match.away.name, scores: innings.map(i => i.away), total: match.away_score, hits: mi.away_hits, errors: mi.away_errors },
            { name: match.home.name, scores: innings.map(i => i.home), total: match.home_score, hits: mi.home_hits, errors: mi.home_errors },
          ].map((row, ri) => (
            <tr key={ri} style={{ borderBottom: ri === 0 ? `1px solid rgba(255,255,255,0.04)` : undefined }}>
              <td className="py-2 pr-4 font-sans font-semibold text-[11px]" style={{ color: C.textMuted }}>{row.name}</td>
              {row.scores.map((s, idx) => (
                <td key={idx} className="py-2 text-center" style={{ color: s && Number(s) > 0 ? C.textPrimary : C.textSubtle }}>
                  {s ?? "0"}
                </td>
              ))}
              <td className="pl-3 py-2 text-center font-black text-base" style={{ color: C.emerald }}>{row.total ?? "—"}</td>
              <td className="px-2 py-2 text-center" style={{ color: C.textMuted }}>{row.hits ?? "—"}</td>
              <td className="py-2 text-center" style={{ color: C.textSubtle }}>{row.errors ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Pitcher hero card ────────────────────────────────────────────────────────
function PitcherHeroCard({ sp, teamName, accentColor, borderColor, dimColor }: {
  sp: StarterPitcherOut; teamName: string;
  accentColor: string; borderColor: string; dimColor: string;
}) {
  const bigStats = [
    { label: "ERA",  value: fmt(sp.era, 2) },
    { label: "WHIP", value: fmt(sp.whip, 2) },
    { label: "K/9",  value: fmt(sp.k_per_9, 1) },
  ];
  const smallStats = [
    { label: "BB/9", value: fmt(sp.bb_per_9, 1) },
    { label: "HR/9", value: fmt(sp.hr_per_9, 1) },
    { label: "FIP",  value: fmt(sp.fip, 2) },
    { label: "xFIP", value: fmt(sp.xfip, 2) },
  ];
  return (
    <div className="rounded-[16px] p-4 flex flex-col gap-3" style={{
      background: `linear-gradient(135deg, ${dimColor} 0%, rgba(255,255,255,0.02) 100%)`,
      border: `1px solid ${borderColor}`,
    }}>
      {/* Name + hand */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold" style={{ color: C.textPrimary }}>{sp.name}</div>
          <div className="text-[10px] mt-0.5 uppercase tracking-widest" style={{ color: C.textSubtle }}>{teamName}</div>
        </div>
        {sp.hand && (
          <div className="rounded-md px-2 py-1 text-[11px] font-bold" style={{ background: `${accentColor}20`, color: accentColor, border: `1px solid ${accentColor}30` }}>
            {sp.hand}HP
          </div>
        )}
      </div>
      {/* Big 3 stats */}
      <div className="grid grid-cols-3 gap-2">
        {bigStats.map(s => (
          <div key={s.label} className="flex flex-col items-center rounded-lg py-2" style={{ background: "rgba(255,255,255,0.04)" }}>
            <span className="text-[10px] uppercase tracking-widest mb-1" style={{ color: C.textSubtle }}>{s.label}</span>
            <span className="text-lg font-black font-mono tabular-nums" style={{ color: accentColor }}>{s.value}</span>
          </div>
        ))}
      </div>
      {/* Small stats */}
      <div className="grid grid-cols-4 gap-2">
        {smallStats.map(s => (
          <div key={s.label} className="flex flex-col">
            <span className="text-[10px]" style={{ color: C.textSubtle }}>{s.label}</span>
            <span className="text-xs font-mono font-semibold" style={{ color: C.textMuted }}>{s.value}</span>
          </div>
        ))}
      </div>
      {/* Pitch arsenal */}
      {sp.pitch_arsenal && sp.pitch_arsenal.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-2" style={{ borderTop: `1px solid ${borderColor}` }}>
          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: accentColor }}>Pitch Arsenal</div>
          {sp.pitch_arsenal.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] w-20 truncate" style={{ color: C.textMuted }}>{p.pitch_name}</span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full" style={{ width: `${p.usage_pct * 100}%`, background: accentColor + "99" }} />
              </div>
              <span className="text-[10px] font-mono w-8 text-right" style={{ color: C.textSubtle }}>{(p.usage_pct * 100).toFixed(0)}%</span>
              {p.velocity_avg && <span className="text-[10px] font-mono w-14 text-right" style={{ color: C.textSubtle }}>{p.velocity_avg.toFixed(0)} mph</span>}
            </div>
          ))}
        </div>
      )}
      {/* Game stats if available */}
      {sp.ip != null && (
        <div className="grid grid-cols-4 gap-2 pt-2" style={{ borderTop: `1px solid ${borderColor}` }}>
          <div className="text-[10px] uppercase tracking-widest col-span-4 mb-1" style={{ color: C.textSubtle }}>Today</div>
          {[
            { l: "IP", v: fmt(sp.ip, 1) }, { l: "H", v: fmtInt(sp.hits_allowed) },
            { l: "ER", v: fmtInt(sp.earned_runs) }, { l: "SO", v: fmtInt(sp.strikeouts) },
            { l: "BB", v: fmtInt(sp.walks) }, { l: "P", v: fmtInt(sp.pitches_thrown) },
            { l: "Str%", v: sp.strikes_pct != null ? fmtPct(sp.strikes_pct, 1) : "—" },
          ].map(s => (
            <div key={s.l} className="flex flex-col">
              <span className="text-[10px]" style={{ color: C.textSubtle }}>{s.l}</span>
              <span className="text-xs font-mono font-semibold" style={{ color: C.textMuted }}>{s.v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
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

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = ["Overview", "Lineups", "Pitching", "Batting", "Innings", "H2H", "Elo", "Model", "Context"] as const;
type Tab = typeof TABS[number];

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────
function OverviewTab({ match }: { match: TMatch }) {
  const sh = match.starter_home;
  const sa = match.starter_away;
  const fh = match.form_home;
  const fa = match.form_away;

  return (
    <Grid>
      <Main>
        {/* Win probability */}
        {match.probabilities && (
          <Panel accent="emerald" glow>
            <WinProbBar
              homeProb={match.probabilities.home_win}
              awayProb={match.probabilities.away_win}
              homeName={match.home.name}
              awayName={match.away.name}
            />
          </Panel>
        )}

        {/* Pitcher duel */}
        {(sh || sa) && (
          <Panel title="Pitcher Duel">
            <div className="grid grid-cols-2 gap-4">
              {sh && <PitcherHeroCard sp={sh} teamName={match.home.name} accentColor={C.emerald} borderColor={C.emeraldBorder} dimColor={C.emeraldDim} />}
              {sa && <PitcherHeroCard sp={sa} teamName={match.away.name} accentColor={C.blue} borderColor={C.blueBorder} dimColor={C.blueDim} />}
            </div>
          </Panel>
        )}

        {/* Team duel bars */}
        <Panel title="Head-to-Head Stats">
          <div className="flex text-[10px] justify-between mb-2 uppercase tracking-widest px-1" style={{ color: C.textSubtle }}>
            <span style={{ color: C.emerald }}>{match.home.name}</span>
            <span>Stat</span>
            <span style={{ color: C.blue }}>{match.away.name}</span>
          </div>
          <DuelBar label="Elo Rating" home={fmtInt(match.elo_home?.rating)} away={fmtInt(match.elo_away?.rating)} homeVal={match.elo_home?.rating} awayVal={match.elo_away?.rating} />
          <DuelBar label="SP ERA" home={fmt(sh?.era, 2)} away={fmt(sa?.era, 2)} homeVal={sh?.era ?? undefined} awayVal={sa?.era ?? undefined} lowerBetter />
          <DuelBar label="SP WHIP" home={fmt(sh?.whip, 2)} away={fmt(sa?.whip, 2)} homeVal={sh?.whip ?? undefined} awayVal={sa?.whip ?? undefined} lowerBetter />
          <DuelBar label="SP K/9" home={fmt(sh?.k_per_9, 1)} away={fmt(sa?.k_per_9, 1)} homeVal={sh?.k_per_9 ?? undefined} awayVal={sa?.k_per_9 ?? undefined} />
          {fh?.avg_runs_for != null && fa?.avg_runs_for != null && (
            <DuelBar label="Runs/G (L5)" home={fmt(fh.avg_runs_for, 2)} away={fmt(fa.avg_runs_for, 2)} homeVal={fh.avg_runs_for} awayVal={fa.avg_runs_for} />
          )}
          {match.batting_home?.team_avg != null && match.batting_away?.team_avg != null && (
            <>
              <DuelBar label="Team AVG" home={fmtAvg(match.batting_home.team_avg)} away={fmtAvg(match.batting_away.team_avg)} homeVal={match.batting_home.team_avg} awayVal={match.batting_away.team_avg} />
              <DuelBar label="Team OPS" home={fmt(match.batting_home.team_ops, 3)} away={fmt(match.batting_away.team_ops, 3)} homeVal={match.batting_home.team_ops ?? undefined} awayVal={match.batting_away.team_ops ?? undefined} />
            </>
          )}
        </Panel>

        {/* Line score */}
        {match.match_info?.inning_scores?.length && (
          <Panel title="Line Score" accent="emerald">
            <LineScoreGrid match={match} />
          </Panel>
        )}
      </Main>

      <Side>
        {/* Bullpen fatigue */}
        <Panel title="Bullpen Fatigue" accent="amber">
          {(match.bullpen_home || match.bullpen_away) ? (
            <div className="flex flex-col gap-4">
              {[
                { bp: match.bullpen_home, name: match.home.name },
                { bp: match.bullpen_away, name: match.away.name },
              ].map(({ bp, name }) => bp?.fatigue_score != null ? (
                <div key={name}>
                  <FatigueMeter score={bp.fatigue_score} label={name} />
                  {bp.total_pitches_last_3d != null && (
                    <p className="text-[10px] mt-1" style={{ color: C.textSubtle }}>{bp.total_pitches_last_3d} pitches last 3 days</p>
                  )}
                </div>
              ) : null)}
            </div>
          ) : <Empty msg="No bullpen data" />}
        </Panel>

        {/* Key edges */}
        {match.key_drivers && match.key_drivers.length > 0 && (
          <Panel title="Key Model Drivers" accent="blue">
            <div className="flex flex-col gap-2">
              {match.key_drivers.slice(0, 6).map((d, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] truncate mb-1" style={{ color: C.textMuted }}>{d.feature}</div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full" style={{
                        width: `${d.importance * 100}%`,
                        background: d.direction === "home" ? `${C.emerald}88` : d.direction === "away" ? `${C.blue}88` : `${C.amber}70`,
                      }} />
                    </div>
                  </div>
                  <span className="text-[10px] font-mono w-8 text-right shrink-0" style={{ color: C.textSubtle }}>{Math.round(d.importance * 100)}%</span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Recent form */}
        <Panel title="Recent Form (Last 5)">
          {[
            { name: match.home.name, form: fh, color: C.emerald },
            { name: match.away.name, form: fa, color: C.blue },
          ].map(({ name, form, color }) => form ? (
            <div key={name} className="mb-3 pb-3 last:mb-0 last:pb-0" style={{ borderBottom: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold" style={{ color }}>{name}</span>
                <span className="text-[10px] font-mono" style={{ color: C.textSubtle }}>
                  {form.wins_last_5}W – {form.losses_last_5}L
                </span>
              </div>
              {form.last_5 && <FormStreak results={form.last_5.map((g: any) => g.result)} size="sm" />}
            </div>
          ) : null)}
          {!fh && !fa && <Empty msg="No form data" />}
        </Panel>

        {/* Weather */}
        {match.match_info?.weather && (
          <Panel title="Conditions">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Temp", value: match.match_info.weather.temperature_f != null ? `${match.match_info.weather.temperature_f}°F` : "—" },
                { label: "Wind", value: match.match_info.weather.wind_speed_mph != null ? `${match.match_info.weather.wind_speed_mph} mph` : "—" },
                { label: "Dir", value: match.match_info.weather.wind_direction ?? "—" },
                { label: "Sky", value: match.match_info.weather.conditions ?? "—" },
              ].map(s => (
                <div key={s.label} className="rounded-lg p-2.5" style={{ background: C.surface2 }}>
                  <div className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.textSubtle }}>{s.label}</div>
                  <div className="text-xs font-mono font-semibold" style={{ color: C.textMuted }}>{s.value}</div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Fair odds */}
        {match.fair_odds && (
          <Panel title="Fair Value">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: match.home.name, value: match.fair_odds.home_win?.toFixed(2) ?? "—", color: C.emerald },
                { label: match.away.name, value: match.fair_odds.away_win?.toFixed(2) ?? "—", color: C.blue },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
                  <div className="text-[10px] uppercase tracking-widest mb-1 truncate" style={{ color: C.textSubtle }}>{s.label}</div>
                  <div className="text-2xl font-black font-mono tabular-nums" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
            {match.confidence != null && (
              <div className="mt-3 flex items-center justify-between px-1">
                <span className="text-[10px] uppercase tracking-widest" style={{ color: C.textSubtle }}>Model Confidence</span>
                <span className="text-base font-black font-mono" style={{
                  color: match.confidence >= 65 ? C.emerald : match.confidence >= 55 ? C.amber : C.textMuted,
                }}>{match.confidence}%</span>
              </div>
            )}
          </Panel>
        )}
      </Side>
    </Grid>
  );
}

// ─── LINEUPS TAB ──────────────────────────────────────────────────────────────
function LineupsTab({ match }: { match: TMatch }) {
  const renderOrder = (batting: BaseballTeamBattingOut | null | undefined, teamName: string, accentColor: string) => {
    if (!batting?.batters.length) return <Empty msg="No lineup data yet" />;
    return (
      <div>
        <div className="text-[10px] uppercase tracking-widest mb-3 font-semibold" style={{ color: accentColor }}>{teamName}</div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["#", "Player", "Pos", "B", "AVG"].map((h, i) => (
                <th key={h} className={cn("py-2 font-normal text-[10px] uppercase tracking-widest", i === 0 ? "text-center w-6" : i === 1 ? "text-left pl-2" : i === 4 ? "text-right" : "text-center px-2")} style={{ color: C.textSubtle }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {batting.batters.map((b, i) => (
              <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                <td className="py-1.5 text-center font-mono text-[10px]" style={{ color: C.textSubtle }}>{b.batting_order}</td>
                <td className="py-1.5 pl-2" style={{ color: C.textMuted }}>{b.name}</td>
                <td className="py-1.5 px-2 text-center font-mono text-[10px]" style={{ color: C.textSubtle }}>{b.position}</td>
                <td className="py-1.5 px-2 text-center font-mono text-[10px]" style={{ color: C.textSubtle }}>{b.hand}</td>
                <td className="py-1.5 text-right font-mono font-semibold" style={{ color: C.textMuted }}>{fmtAvg(b.batting_avg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {batting.team_avg != null && (
          <div className="mt-2 flex items-center justify-between pt-2 text-xs" style={{ borderTop: `1px solid ${C.border}` }}>
            <span style={{ color: C.textSubtle }}>AVG / OBP / SLG</span>
            <span className="font-mono font-semibold" style={{ color: C.textMuted }}>{fmtAvg(batting.team_avg)} / {fmtAvg(batting.team_obp)} / {fmtAvg(batting.team_slg)}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <Grid>
      <Main>
        <div className="grid grid-cols-2 gap-4">
          <Panel>{renderOrder(match.batting_home, match.home.name, C.emerald)}</Panel>
          <Panel>{renderOrder(match.batting_away, match.away.name, C.blue)}</Panel>
        </div>
      </Main>
      <Side>
        <Panel title="Starting Pitchers">
          {match.starter_home && (
            <div className="mb-4 pb-4" style={{ borderBottom: `1px solid ${C.border}` }}>
              <PitcherHeroCard sp={match.starter_home} teamName={match.home.name} accentColor={C.emerald} borderColor={C.emeraldBorder} dimColor={C.emeraldDim} />
            </div>
          )}
          {match.starter_away && <PitcherHeroCard sp={match.starter_away} teamName={match.away.name} accentColor={C.blue} borderColor={C.blueBorder} dimColor={C.blueDim} />}
          {!match.starter_home && !match.starter_away && <Empty msg="No starter data yet" />}
        </Panel>
      </Side>
    </Grid>
  );
}

// ─── PITCHING TAB ─────────────────────────────────────────────────────────────
function PitchingTab({ match }: { match: TMatch }) {
  const sh = match.starter_home;
  const sa = match.starter_away;

  const pitchingRadar = (sh || sa) ? [
    { label: "ERA",  home: norm(sh?.era, 1.5, 6.0, true), away: norm(sa?.era, 1.5, 6.0, true) },
    { label: "WHIP", home: norm(sh?.whip, 0.9, 1.7, true), away: norm(sa?.whip, 0.9, 1.7, true) },
    { label: "K/9",  home: norm(sh?.k_per_9, 4, 13), away: norm(sa?.k_per_9, 4, 13) },
    { label: "BB/9", home: norm(sh?.bb_per_9, 1, 5, true), away: norm(sa?.bb_per_9, 1, 5, true) },
    { label: "FIP",  home: norm(sh?.fip, 2.0, 5.5, true), away: norm(sa?.fip, 2.0, 5.5, true) },
    { label: "HR/9", home: norm(sh?.hr_per_9, 0.2, 2.0, true), away: norm(sa?.hr_per_9, 0.2, 2.0, true) },
  ] : null;

  return (
    <Grid>
      <Main>
        {pitchingRadar && (
          <Panel title="Pitcher Profile Radar">
            <TeamRadarChart metrics={pitchingRadar} homeLabel={`${match.home.name} SP`} awayLabel={`${match.away.name} SP`} homeColor={C.emerald} awayColor={C.blue} height={240} />
          </Panel>
        )}
        {(sh || sa) && (
          <Panel title="Starting Pitchers">
            <div className="grid grid-cols-2 gap-4">
              {sh && <PitcherHeroCard sp={sh} teamName={match.home.name} accentColor={C.emerald} borderColor={C.emeraldBorder} dimColor={C.emeraldDim} />}
              {sa && <PitcherHeroCard sp={sa} teamName={match.away.name} accentColor={C.blue} borderColor={C.blueBorder} dimColor={C.blueDim} />}
            </div>
          </Panel>
        )}
        {(match.bullpen_home || match.bullpen_away) && (
          <Panel title="Bullpen Usage">
            {[
              { bp: match.bullpen_home, name: match.home.name },
              { bp: match.bullpen_away, name: match.away.name },
            ].map(({ bp, name }) => bp ? (
              <div key={name} className="mb-4 pb-4 last:mb-0 last:pb-0" style={{ borderBottom: `1px solid ${C.border}` }}>
                <BullpenSection bp={bp} teamName={name} />
              </div>
            ) : null)}
          </Panel>
        )}
      </Main>
      <Side>
        {/* Regression metrics */}
        {(sh || sa) && (
          <Panel title="Advanced Metrics">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-1 pb-2 mb-2 text-[10px] uppercase tracking-widest font-medium" style={{ borderBottom: `1px solid ${C.border}`, color: C.textSubtle }}>
              <span style={{ color: C.emerald }}>{match.home.name}</span>
              <span className="text-center">Stat</span>
              <span className="text-right" style={{ color: C.blue }}>{match.away.name}</span>
            </div>
            {[
              { label: "xFIP",  hv: sh?.xfip, av: sa?.xfip, lowerBetter: true },
              { label: "SIERA", hv: sh?.siera, av: sa?.siera, lowerBetter: true },
              { label: "BABIP", hv: sh?.babip, av: sa?.babip, lowerBetter: true },
              { label: "LOB%",  hv: sh?.lob_pct != null ? sh.lob_pct * 100 : null, av: sa?.lob_pct != null ? sa.lob_pct * 100 : null },
            ].map(({ label, hv, av, lowerBetter }) => {
              const hWins = hv != null && av != null && (lowerBetter ? hv < av : hv > av);
              const aWins = hv != null && av != null && (lowerBetter ? av < hv : av > hv);
              return (
                <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                  <span className="text-xs font-mono font-semibold" style={{ color: hWins ? C.emerald : C.textMuted }}>{hv != null ? hv.toFixed(2) : "—"}</span>
                  <span className="text-[10px] text-center uppercase tracking-widest" style={{ color: C.textSubtle }}>{label}</span>
                  <span className="text-xs font-mono font-semibold text-right" style={{ color: aWins ? C.blue : C.textMuted }}>{av != null ? av.toFixed(2) : "—"}</span>
                </div>
              );
            })}
          </Panel>
        )}
        {/* Bullpen fatigue meters */}
        <Panel title="Bullpen Fatigue" accent="amber">
          {(match.bullpen_home || match.bullpen_away) ? (
            <div className="flex flex-col gap-4">
              {[
                { bp: match.bullpen_home, name: match.home.name },
                { bp: match.bullpen_away, name: match.away.name },
              ].map(({ bp, name }) => bp?.fatigue_score != null ? (
                <FatigueMeter key={name} score={bp.fatigue_score} label={name} />
              ) : null)}
            </div>
          ) : <Empty msg="No bullpen data" />}
        </Panel>
      </Side>
    </Grid>
  );
}

function BullpenSection({ bp, teamName }: { bp: BullpenSummaryOut; teamName: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold" style={{ color: C.textMuted }}>{teamName}</span>
        {bp.fatigue_score != null && <FatigueMeter score={bp.fatigue_score} label="" />}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono tabular-nums border-collapse">
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Pitcher", "H", "IP", "ER", "SO", "Days", "P/3d"].map((h, i) => (
                <th key={h} className={cn("py-1.5 font-normal text-[10px] uppercase tracking-widest", i === 0 ? "text-left pr-2" : i === 1 ? "text-center px-1" : "text-right px-1")} style={{ color: C.textSubtle }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bp.pitchers.map((p, i) => (
              <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                <td className="py-1.5 pr-2 font-sans" style={{ color: C.textMuted }}>{p.name}</td>
                <td className="py-1.5 px-1 text-center" style={{ color: C.textSubtle }}>{p.hand}</td>
                <td className="py-1.5 px-1 text-right" style={{ color: C.textMuted }}>{p.ip != null ? fmt(p.ip, 1) : "—"}</td>
                <td className="py-1.5 px-1 text-right" style={{ color: C.textMuted }}>{fmtInt(p.earned_runs)}</td>
                <td className="py-1.5 px-1 text-right" style={{ color: C.textMuted }}>{fmtInt(p.strikeouts)}</td>
                <td className="py-1.5 px-1 text-right" style={{ color: (p.days_since_last ?? 99) === 0 ? C.red : C.textSubtle }}>{p.days_since_last ?? "—"}</td>
                <td className="py-1.5 text-right" style={{ color: (p.pitches_last_3d ?? 0) > 60 ? C.amber : C.textSubtle }}>{fmtInt(p.pitches_last_3d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── BATTING TAB ──────────────────────────────────────────────────────────────
function BattingTab({ match }: { match: TMatch }) {
  const bh = match.batting_home;
  const ba = match.batting_away;
  if (!bh && !ba) return <Grid><Main><Panel><Empty msg="No batting data yet." /></Panel></Main><Side><Panel title="Situational"><Empty msg="—" /></Panel></Side></Grid>;

  const battingRadar = [
    { label: "AVG", home: norm(bh?.team_avg, 0.22, 0.30), away: norm(ba?.team_avg, 0.22, 0.30) },
    { label: "OBP", home: norm(bh?.team_obp, 0.29, 0.38), away: norm(ba?.team_obp, 0.29, 0.38) },
    { label: "SLG", home: norm(bh?.team_slg, 0.35, 0.50), away: norm(ba?.team_slg, 0.35, 0.50) },
    { label: "OPS", home: norm(bh?.team_ops, 0.64, 0.88), away: norm(ba?.team_ops, 0.64, 0.88) },
    { label: "HR",  home: norm(bh?.total_hr, 0, 4), away: norm(ba?.total_hr, 0, 4) },
    { label: "BB",  home: norm(bh?.total_bb, 0, 8), away: norm(ba?.total_bb, 0, 8) },
  ];

  return (
    <Grid>
      <Main>
        <Panel title="Team Batting Radar">
          <TeamRadarChart metrics={battingRadar} homeLabel={match.home.name} awayLabel={match.away.name} homeColor={C.emerald} awayColor={C.blue} height={240} />
        </Panel>
        {bh && <Panel><BattingTableSection batting={bh} teamName={match.home.name} accentColor={C.emerald} /></Panel>}
        {ba && <Panel><BattingTableSection batting={ba} teamName={match.away.name} accentColor={C.blue} /></Panel>}
      </Main>
      <Side>
        {/* Team lines */}
        <Panel title="Batting Lines">
          {[{ t: match.home.name, b: bh, c: C.emerald }, { t: match.away.name, b: ba, c: C.blue }].map(({ t, b, c }) => b ? (
            <div key={t} className="mb-3 pb-3 last:mb-0 last:pb-0" style={{ borderBottom: `1px solid ${C.border}` }}>
              <div className="text-xs font-semibold mb-2" style={{ color: c }}>{t}</div>
              <div className="font-mono text-sm font-bold mb-1" style={{ color: C.textPrimary }}>
                {fmtAvg(b.team_avg)} / {fmtAvg(b.team_obp)} / {fmtAvg(b.team_slg)}
              </div>
              <div className="text-[11px] font-mono" style={{ color: C.textSubtle }}>
                {fmtInt(b.total_hr)} HR · {fmtInt(b.total_rbi)} RBI · {fmtInt(b.total_lob)} LOB
              </div>
            </div>
          ) : null)}
        </Panel>

        {/* Situational */}
        {(match.situational_home || match.situational_away) && (
          <Panel title="Situational Hitting">
            {[
              { t: match.home.name, s: match.situational_home, c: C.emerald },
              { t: match.away.name, s: match.situational_away, c: C.blue },
            ].map(({ t, s, c }) => s ? (
              <div key={t} className="mb-3 last:mb-0">
                <div className="text-[10px] uppercase tracking-widest mb-2 font-semibold" style={{ color: c }}>{t}</div>
                {[
                  { label: "RISP AVG", value: fmtAvg(s.risp_avg) },
                  { label: "RISP OPS", value: fmtAvg(s.risp_ops) },
                  { label: "2-out RISP", value: fmtAvg(s.two_out_risp_avg) },
                  { label: "vs LHP OPS", value: fmtAvg(s.vs_lhp_ops) },
                  { label: "vs RHP OPS", value: fmtAvg(s.vs_rhp_ops) },
                  { label: "Late/Close", value: fmtAvg(s.late_close_avg) },
                ].map(row => (
                  <div key={row.label} className="flex justify-between py-1.5 text-xs" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                    <span style={{ color: C.textSubtle }}>{row.label}</span>
                    <span className="font-mono font-semibold" style={{ color: C.textMuted }}>{row.value}</span>
                  </div>
                ))}
                {s.clutch_score != null && (
                  <div className="flex justify-between py-1.5 text-xs">
                    <span style={{ color: C.textSubtle }}>Clutch Score</span>
                    <span className="font-mono font-black" style={{ color: s.clutch_score > 0 ? C.emerald : C.red }}>
                      {s.clutch_score >= 0 ? "+" : ""}{s.clutch_score.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            ) : null)}
          </Panel>
        )}

        {/* Statcast */}
        {(match.batted_ball_home || match.batted_ball_away) && (
          <Panel title="Statcast">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-1 pb-2 mb-1 text-[10px] uppercase tracking-widest" style={{ borderBottom: `1px solid ${C.border}`, color: C.textSubtle }}>
              <span style={{ color: C.emerald }}>{match.home.name}</span>
              <span className="text-center">Stat</span>
              <span className="text-right" style={{ color: C.blue }}>{match.away.name}</span>
            </div>
            {[
              { label: "Exit Velo", hv: match.batted_ball_home?.avg_exit_velocity, av: match.batted_ball_away?.avg_exit_velocity },
              { label: "Barrel %", hv: match.batted_ball_home?.barrel_pct != null ? match.batted_ball_home.barrel_pct * 100 : null, av: match.batted_ball_away?.barrel_pct != null ? match.batted_ball_away.barrel_pct * 100 : null },
              { label: "Hard Hit%", hv: match.batted_ball_home?.hard_hit_pct != null ? match.batted_ball_home.hard_hit_pct * 100 : null, av: match.batted_ball_away?.hard_hit_pct != null ? match.batted_ball_away.hard_hit_pct * 100 : null },
              { label: "xBA", hv: match.batted_ball_home?.xba, av: match.batted_ball_away?.xba },
              { label: "xSLG", hv: match.batted_ball_home?.xslg, av: match.batted_ball_away?.xslg },
            ].map(({ label, hv, av }) => {
              const hWins = hv != null && av != null && hv > av;
              const aWins = hv != null && av != null && av > hv;
              const d = label.includes("Velo") ? 1 : label.includes("%") ? 1 : 3;
              return (
                <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                  <span className="text-xs font-mono font-semibold" style={{ color: hWins ? C.emerald : C.textMuted }}>{hv != null ? hv.toFixed(d) : "—"}</span>
                  <span className="text-[10px] text-center uppercase tracking-widest" style={{ color: C.textSubtle }}>{label}</span>
                  <span className="text-xs font-mono font-semibold text-right" style={{ color: aWins ? C.blue : C.textMuted }}>{av != null ? av.toFixed(d) : "—"}</span>
                </div>
              );
            })}
          </Panel>
        )}
      </Side>
    </Grid>
  );
}

function BattingTableSection({ batting, teamName, accentColor }: { batting: BaseballTeamBattingOut; teamName: string; accentColor: string }) {
  if (!batting.batters.length) return <Empty msg={`No batting data for ${teamName}`} />;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest mb-3 font-semibold" style={{ color: accentColor }}>{teamName}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono tabular-nums border-collapse">
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Player", "Pos", "AB", "R", "H", "RBI", "BB", "SO", "HR", "AVG"].map((h, i) => (
                <th key={h} className={cn("py-1.5 font-normal text-[10px] uppercase tracking-widest", i === 0 ? "text-left pr-2" : i === 1 ? "text-center px-1" : "text-right px-1")} style={{ color: C.textSubtle }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {batting.batters.map((b, i) => (
              <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                <td className="py-1.5 pr-2 font-sans" style={{ color: C.textMuted }}>{b.name}</td>
                <td className="py-1.5 px-1 text-center" style={{ color: C.textSubtle }}>{b.position}</td>
                <td className="py-1.5 px-1 text-right" style={{ color: C.textMuted }}>{fmtInt(b.at_bats)}</td>
                <td className="py-1.5 px-1 text-right" style={{ color: C.textMuted }}>{fmtInt(b.runs)}</td>
                <td className="py-1.5 px-1 text-right" style={{ color: C.textMuted }}>{fmtInt(b.hits)}</td>
                <td className="py-1.5 px-1 text-right" style={{ color: C.textMuted }}>{fmtInt(b.rbi)}</td>
                <td className="py-1.5 px-1 text-right" style={{ color: C.textMuted }}>{fmtInt(b.walks)}</td>
                <td className="py-1.5 px-1 text-right" style={{ color: C.textMuted }}>{fmtInt(b.strikeouts)}</td>
                <td className="py-1.5 px-1 text-right font-bold" style={{ color: (b.home_runs ?? 0) > 0 ? C.amber : C.textMuted }}>{fmtInt(b.home_runs)}</td>
                <td className="py-1.5 text-right" style={{ color: C.textMuted }}>{fmtAvg(b.batting_avg)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: `1px solid ${C.border}` }}>
              <td className="py-1.5 pr-2 font-sans font-bold" colSpan={2} style={{ color: C.textMuted }}>Totals</td>
              <td className="py-1.5 px-1 text-right font-bold" style={{ color: C.textMuted }}>{fmtInt(batting.batters.reduce((s, b) => s + (b.at_bats ?? 0), 0))}</td>
              <td className="py-1.5 px-1 text-right font-bold" style={{ color: C.textMuted }}>{fmtInt(batting.total_runs)}</td>
              <td className="py-1.5 px-1 text-right font-bold" style={{ color: C.textMuted }}>{fmtInt(batting.total_hits)}</td>
              <td className="py-1.5 px-1 text-right font-bold" style={{ color: C.textMuted }}>{fmtInt(batting.total_rbi)}</td>
              <td className="py-1.5 px-1 text-right font-bold" style={{ color: C.textMuted }}>{fmtInt(batting.total_bb)}</td>
              <td className="py-1.5 px-1 text-right font-bold" style={{ color: C.textMuted }}>{fmtInt(batting.total_so)}</td>
              <td className="py-1.5 px-1 text-right font-black" style={{ color: C.amber }}>{fmtInt(batting.total_hr)}</td>
              <td className="py-1.5 text-right font-bold" style={{ color: C.textMuted }}>{fmtAvg(batting.team_avg)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── INNINGS TAB ──────────────────────────────────────────────────────────────
function InningsTab({ match }: { match: TMatch }) {
  const events = match.inning_events;
  const mi = match.match_info;
  if (!events?.length && !mi?.inning_scores?.length) {
    return <Grid><Main><Panel><Empty msg="No inning data yet. Available after game." /></Panel></Main></Grid>;
  }
  const byInning: Record<number, typeof events> = {};
  for (const e of (events ?? [])) {
    if (!byInning[e.inning]) byInning[e.inning] = [];
    byInning[e.inning]!.push(e);
  }
  const inningTimelinePeriods = (mi?.inning_scores ?? []).map(s => ({ period: `Inn ${s.inning}`, home: s.home ?? null, away: s.away ?? null }));

  return (
    <Grid>
      <Main>
        {inningTimelinePeriods.length > 0 && (
          <Panel title="Inning Scoring Timeline" accent="emerald">
            <ScoringTimeline periods={inningTimelinePeriods} homeLabel={match.home.name} awayLabel={match.away.name} showRunningTotal={true} height={200} />
          </Panel>
        )}
        {mi?.inning_scores?.length && (
          <Panel title="Line Score" accent="emerald" glow>
            <LineScoreGrid match={match} />
          </Panel>
        )}
        <Panel title="Scoring Events">
          {Object.keys(byInning).length > 0 ? (
            <div className="flex flex-col gap-4">
              {Object.entries(byInning).sort(([a], [b]) => Number(a) - Number(b)).map(([inn, evts]) => (
                <div key={inn}>
                  <div className="text-[10px] uppercase tracking-widest mb-2 font-semibold" style={{ color: C.emerald }}>Inning {inn}</div>
                  {evts!.map((e, i) => (
                    <div key={i} className="flex items-start gap-2.5 py-1.5" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5" style={{
                        background: e.event_type === "HR" ? `${C.amber}25` : "rgba(255,255,255,0.06)",
                        color: e.event_type === "HR" ? C.amber : C.textSubtle,
                      }}>{e.event_type ?? "•"}</span>
                      <span className="text-[10px] shrink-0 mt-0.5" style={{ color: e.team === "home" ? C.emerald : C.blue }}>{e.half === "bottom" ? "▼" : "▲"}</span>
                      <span className="text-xs" style={{ color: C.textMuted }}>{e.description}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : <Empty msg="No scoring events" />}
        </Panel>
      </Main>
      <Side>
        <Panel title="Win Probability"><Empty msg="Win probability chart coming soon" /></Panel>
      </Side>
    </Grid>
  );
}

// ─── H2H TAB ──────────────────────────────────────────────────────────────────
function H2HTab({ match }: { match: TMatch }) {
  const h2h = match.h2h;
  if (!h2h || h2h.total_matches === 0) return <Panel><Empty msg="No head-to-head history found" /></Panel>;
  const homeWinPct = h2h.total_matches > 0 ? h2h.home_wins / h2h.total_matches : 0;
  const awayWinPct = h2h.total_matches > 0 ? h2h.away_wins / h2h.total_matches : 0;
  return (
    <Grid>
      <Main>
        {/* Big record display */}
        <Panel accent="emerald" glow>
          <div className="flex items-center justify-around py-4">
            <div className="flex flex-col items-center gap-1">
              <div className="text-6xl font-black tabular-nums" style={{ color: C.emerald }}>{h2h.home_wins}</div>
              <div className="text-xs uppercase tracking-widest" style={{ color: C.textMuted }}>{match.home.name}</div>
              <div className="text-[10px] font-mono" style={{ color: C.textSubtle }}>{(homeWinPct * 100).toFixed(0)}% win rate</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="text-2xl font-black" style={{ color: C.textSubtle }}>vs</div>
              <div className="text-[10px] uppercase tracking-widest" style={{ color: C.textSubtle }}>{h2h.total_matches} played</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="text-6xl font-black tabular-nums" style={{ color: C.blue }}>{h2h.away_wins}</div>
              <div className="text-xs uppercase tracking-widest" style={{ color: C.textMuted }}>{match.away.name}</div>
              <div className="text-[10px] font-mono" style={{ color: C.textSubtle }}>{(awayWinPct * 100).toFixed(0)}% win rate</div>
            </div>
          </div>
          {/* Split bar */}
          <div className="flex h-2.5 rounded-full overflow-hidden mt-2">
            <div className="h-full" style={{ width: `${homeWinPct * 100}%`, background: `linear-gradient(90deg, ${C.emerald}, ${C.emerald}88)` }} />
            <div className="h-full flex-1" style={{ background: `linear-gradient(270deg, ${C.blue}, ${C.blue}88)` }} />
          </div>
        </Panel>

        {h2h.recent_matches.length > 0 && (
          <Panel title="Recent Series">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Date", "Away", "–", "Home", "Winner"].map((h, i) => (
                    <th key={h} className={cn("py-2 font-normal text-[10px] uppercase tracking-widest", i === 0 ? "text-left" : i === 4 ? "text-right" : i === 2 ? "text-center px-2" : "text-right")} style={{ color: C.textSubtle }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {h2h.recent_matches.map((m: any, i: number) => (
                  <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                    <td className="py-2" style={{ color: C.textSubtle }}>{m.date ? new Date(m.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}</td>
                    <td className="py-2 text-right font-mono font-semibold" style={{ color: C.textMuted }}>{m.away_score ?? "—"}</td>
                    <td className="py-2 text-center px-2" style={{ color: C.textSubtle }}>–</td>
                    <td className="py-2 font-mono font-semibold" style={{ color: C.textMuted }}>{m.home_score ?? "—"}</td>
                    <td className="py-2 text-right capitalize font-semibold" style={{ color: m.winner === "home" ? C.emerald : C.blue }}>{m.winner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </Main>
      <Side>
        <Panel title="H2H Summary">
          {[
            { label: "Total Games", value: String(h2h.total_matches), color: undefined },
            { label: `${match.home.name} Win%`, value: `${(homeWinPct * 100).toFixed(0)}%`, color: C.emerald },
            { label: `${match.away.name} Win%`, value: `${(awayWinPct * 100).toFixed(0)}%`, color: C.blue },
          ].map(s => (
            <div key={s.label} className="flex justify-between py-2.5 text-xs" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
              <span style={{ color: C.textSubtle }}>{s.label}</span>
              <span className="font-mono font-bold" style={{ color: s.color ?? C.textMuted }}>{s.value}</span>
            </div>
          ))}
        </Panel>
      </Side>
    </Grid>
  );
}

// ─── ELO TAB ──────────────────────────────────────────────────────────────────
function EloTab({ match, eloHomeHistory, eloAwayHistory }: {
  match: TMatch;
  eloHomeHistory: Array<{ date: string; rating: number }>;
  eloAwayHistory: Array<{ date: string; rating: number }>;
}) {
  const elo_h = match.elo_home;
  const elo_a = match.elo_away;
  const chartData = eloHomeHistory.map((pt, i) => ({ date: pt.date.slice(0, 10), home: pt.rating, away: eloAwayHistory[i]?.rating ?? null }));

  return (
    <Grid>
      <Main>
        <Panel title="Elo Rating History" accent="blue">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: C.textSubtle, fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: C.textSubtle, fontSize: 10 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: "#0a1510", border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 11 }} labelStyle={{ color: C.textMuted }} />
                <Legend wrapperStyle={{ fontSize: 11, color: C.textMuted }} />
                <Line type="monotone" dataKey="home" name={match.home.name} stroke={C.emerald} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="away" name={match.away.name} stroke={C.blue} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty msg="No ELO history" />}
        </Panel>
        <Panel title="Elo Breakdown with Modifiers">
          {(elo_h || elo_a) ? (
            <div className="grid grid-cols-2 gap-8">
              {[{ elo: elo_h, name: match.home.name, color: C.emerald }, { elo: elo_a, name: match.away.name, color: C.blue }].map(({ elo, name, color }) => elo && (
                <div key={name}>
                  <div className="text-xs font-bold mb-3" style={{ color }}>{name}</div>
                  {[
                    { label: "Team Rating", value: fmtInt(elo.rating), color: C.textPrimary },
                    { label: "Δ Last Game", value: (elo.rating_change ?? 0) >= 0 ? `+${fmt(elo.rating_change, 1)}` : fmt(elo.rating_change, 1), color: (elo.rating_change ?? 0) >= 0 ? C.emerald : C.red },
                    elo.home_advantage_applied != null ? { label: "Home Adv", value: `+${fmtInt(elo.home_advantage_applied)}`, color: C.amber } : null,
                    elo.pitcher_adj != null ? { label: "SP Adj", value: elo.pitcher_adj >= 0 ? `+${fmt(elo.pitcher_adj, 1)}` : fmt(elo.pitcher_adj, 1), color: elo.pitcher_adj >= 0 ? C.emerald : C.red } : null,
                    elo.park_factor_applied != null ? { label: "Park Factor", value: elo.park_factor_applied > 0 ? `+${fmt(elo.park_factor_applied, 0)}` : fmt(elo.park_factor_applied, 0), color: C.amber } : null,
                    elo.bullpen_fatigue_adj != null ? { label: "Bullpen Adj", value: fmt(elo.bullpen_fatigue_adj, 1), color: elo.bullpen_fatigue_adj < 0 ? C.red : C.textMuted } : null,
                    elo.implied_win_prob != null ? { label: "Elo Win Prob", value: fmtPct(elo.implied_win_prob, 1), color, bold: true } : null,
                  ].filter(Boolean).map((row: any) => (
                    <div key={row.label} className="flex justify-between py-1.5 text-xs" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                      <span style={{ color: C.textSubtle }}>{row.label}</span>
                      <span className={cn("font-mono", row.bold ? "font-black text-sm" : "font-semibold")} style={{ color: row.color }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : <Empty msg="No ELO data" />}
        </Panel>
      </Main>
      <Side>
        {[{ elo: elo_h, name: match.home.name, color: C.emerald }, { elo: elo_a, name: match.away.name, color: C.blue }].map(({ elo, name, color }) => elo?.last_10_ratings?.length ? (
          <Panel key={name} title={`Elo Last 10 — ${name}`}>
            <div className="flex flex-col gap-2">
              {elo.last_10_ratings.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] w-3 tabular-nums" style={{ color: C.textSubtle }}>{i + 1}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, (r - 1300) / 4))}%`, background: `${color}70` }} />
                  </div>
                  <span className="font-mono text-[10px] w-12 text-right" style={{ color: C.textMuted }}>{r}</span>
                </div>
              ))}
            </div>
          </Panel>
        ) : null)}
      </Side>
    </Grid>
  );
}

// ─── MODEL TAB ────────────────────────────────────────────────────────────────
function ModelTab({ match }: { match: TMatch }) {
  const p = match.probabilities;
  const m = match.model;
  return (
    <Grid>
      <Main>
        {p && (
          <Panel title="Win Probabilities" accent="emerald" glow>
            <div className="flex flex-col gap-5">
              {[
                { label: match.home.name, prob: p.home_win, color: C.emerald },
                { label: match.away.name, prob: p.away_win, color: C.blue },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold" style={{ color: row.color }}>{row.label}</span>
                    <span className="text-3xl font-black font-mono tabular-nums" style={{ color: row.color }}>{fmtPct(row.prob, 1)}</span>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${row.prob * 100}%`, background: `linear-gradient(90deg, ${row.color}cc, ${row.color}66)` }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {match.key_drivers && match.key_drivers.length > 0 && (
          <Panel title="Feature Drivers" accent="blue">
            <div className="flex flex-col gap-3">
              {match.key_drivers.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-36 text-xs truncate shrink-0" style={{ color: C.textMuted }}>{d.feature}</div>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full" style={{
                      width: `${d.importance * 100}%`,
                      background: d.direction === "home" ? `${C.emerald}88` : d.direction === "away" ? `${C.blue}88` : `${C.amber}70`,
                    }} />
                  </div>
                  <div className="text-[10px] font-mono w-8 text-right shrink-0" style={{ color: C.textSubtle }}>{Math.round(d.importance * 100)}%</div>
                  {d.value != null && <div className="text-[10px] font-mono w-10 text-right shrink-0" style={{ color: C.textSubtle }}>{fmt(d.value, 1)}</div>}
                </div>
              ))}
            </div>
          </Panel>
        )}
      </Main>
      <Side>
        {m && (
          <Panel title="Model Metadata">
            {[
              { label: "Version", value: m.version },
              m.algorithm ? { label: "Algorithm", value: m.algorithm } : null,
              m.n_train_samples ? { label: "Train Samples", value: m.n_train_samples.toLocaleString() } : null,
              m.accuracy != null ? { label: "Accuracy", value: fmtPct(m.accuracy, 1) } : null,
              m.brier_score != null ? { label: "Brier Score", value: m.brier_score.toFixed(4) } : null,
            ].filter(Boolean).map((s: any) => (
              <div key={s.label} className="flex justify-between py-2 text-xs" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                <span style={{ color: C.textSubtle }}>{s.label}</span>
                <span className="font-mono font-semibold" style={{ color: C.textMuted }}>{s.value}</span>
              </div>
            ))}
          </Panel>
        )}
        {match.fair_odds && (
          <Panel title="Fair Odds">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: match.home.name, value: match.fair_odds.home_win?.toFixed(2) ?? "—", color: C.emerald },
                { label: match.away.name, value: match.fair_odds.away_win?.toFixed(2) ?? "—", color: C.blue },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
                  <div className="text-[10px] uppercase tracking-widest mb-1 truncate" style={{ color: C.textSubtle }}>{s.label}</div>
                  <div className="text-2xl font-black font-mono" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </Panel>
        )}
        {(match as any).betting && (
          <Panel title="Market Odds">
            {(() => {
              const bet = (match as any).betting as Record<string, any>;
              return (
                <div className="flex flex-col gap-2 text-xs">
                  {bet.run_line != null && <div className="flex justify-between py-1.5" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}><span style={{ color: C.textSubtle }}>Run line</span><span className="font-mono font-semibold" style={{ color: C.textMuted }}>{bet.run_line >= 0 ? "+" : ""}{bet.run_line}</span></div>}
                  {bet.total != null && <div className="flex justify-between py-1.5" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}><span style={{ color: C.textSubtle }}>Total (O/U)</span><span className="font-mono font-semibold" style={{ color: C.textMuted }}>{bet.total}</span></div>}
                  {bet.home_ml != null && <div className="flex justify-between py-1.5" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}><span style={{ color: C.textSubtle }}>{match.home.name} ML</span><span className="font-mono font-semibold" style={{ color: C.emerald }}>{bet.home_ml >= 0 ? "+" : ""}{bet.home_ml}</span></div>}
                  {bet.away_ml != null && <div className="flex justify-between py-1.5"><span style={{ color: C.textSubtle }}>{match.away.name} ML</span><span className="font-mono font-semibold" style={{ color: C.blue }}>{bet.away_ml >= 0 ? "+" : ""}{bet.away_ml}</span></div>}
                </div>
              );
            })()}
          </Panel>
        )}
      </Side>
    </Grid>
  );
}

// ─── CONTEXT TAB ──────────────────────────────────────────────────────────────
function ContextTab({ match }: { match: TMatch }) {
  const dc = match.data_completeness;
  const mi = match.match_info;
  const weather = mi?.weather;

  return (
    <Grid>
      <Main>
        {/* Venue & Park */}
        <Panel title="Venue & Park Factor">
          <div className="grid grid-cols-2 gap-3 mb-4">
            {mi?.ballpark && <div className="rounded-lg p-3" style={{ background: C.surface2 }}><div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: C.textSubtle }}>Ballpark</div><div className="text-xs font-semibold" style={{ color: C.textMuted }}>{mi.ballpark}</div></div>}
            {mi?.city && <div className="rounded-lg p-3" style={{ background: C.surface2 }}><div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: C.textSubtle }}>City</div><div className="text-xs font-semibold" style={{ color: C.textMuted }}>{mi.city}</div></div>}
            {mi?.attendance != null && <div className="rounded-lg p-3" style={{ background: C.surface2 }}><div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: C.textSubtle }}>Attendance</div><div className="text-xs font-mono font-bold" style={{ color: C.textMuted }}>{mi.attendance.toLocaleString()}</div></div>}
          </div>
          {mi?.park_factor != null && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs">
                <span style={{ color: C.textSubtle }}>Park Factor</span>
                <span className="font-mono font-black" style={{ color: mi.park_factor > 10 ? C.amber : mi.park_factor < -5 ? C.purple : C.textMuted }}>
                  {mi.park_factor >= 0 ? "+" : ""}{fmtInt(mi.park_factor)} Elo pts
                </span>
              </div>
              <div className="relative h-4 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: "rgba(255,255,255,0.15)" }} />
                {mi.park_factor > 0 ? (
                  <div className="absolute inset-y-0 rounded-r-full" style={{ left: "50%", width: `${Math.min(50, (mi.park_factor / 30) * 50)}%`, background: `${C.amber}80` }} />
                ) : (
                  <div className="absolute inset-y-0 rounded-l-full" style={{ right: "50%", width: `${Math.min(50, (Math.abs(mi.park_factor) / 30) * 50)}%`, background: `${C.purple}80` }} />
                )}
              </div>
              <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider">
                <span style={{ color: C.purple }}>Pitcher-friendly</span>
                <span style={{ color: C.textSubtle }}>Neutral</span>
                <span style={{ color: C.amber }}>Hitter-friendly</span>
              </div>
            </div>
          )}
        </Panel>

        {/* Weather */}
        {weather && (
          <Panel title="Weather Conditions" accent="blue">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Temperature", value: weather.temperature_f != null ? `${weather.temperature_f}°F` : "—" },
                { label: "Wind Speed", value: weather.wind_speed_mph != null ? `${weather.wind_speed_mph} mph` : "—" },
                { label: "Direction", value: weather.wind_direction ?? "—" },
                { label: "Conditions", value: weather.conditions ?? "—" },
                { label: "Humidity", value: weather.humidity_pct != null ? `${weather.humidity_pct}%` : "—" },
              ].map(s => (
                <div key={s.label} className="rounded-lg p-3" style={{ background: C.surface2 }}>
                  <div className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.textSubtle }}>{s.label}</div>
                  <div className="text-xs font-mono font-bold" style={{ color: C.textMuted }}>{s.value}</div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Umpire */}
        {match.umpire && (
          <Panel title="Home Plate Umpire">
            <div className="text-sm font-bold mb-3" style={{ color: C.textPrimary }}>{match.umpire.name}</div>
            {[
              match.umpire.games_called != null ? { label: "Games Called", value: String(match.umpire.games_called) } : null,
              match.umpire.k_zone_size != null ? { label: "K-Zone Size", value: `${(match.umpire.k_zone_size * 100).toFixed(0)}%`, color: match.umpire.k_zone_size > 1.02 ? C.amber : match.umpire.k_zone_size < 0.98 ? C.emerald : undefined } : null,
              match.umpire.strikeouts_per_game != null ? { label: "K/Game", value: fmt(match.umpire.strikeouts_per_game, 1) } : null,
              match.umpire.walks_per_game != null ? { label: "BB/Game", value: fmt(match.umpire.walks_per_game, 1) } : null,
              match.umpire.home_win_pct != null ? { label: "Home Win%", value: fmtPct(match.umpire.home_win_pct, 1) } : null,
              match.umpire.over_record ? { label: "Over Record", value: match.umpire.over_record, color: C.emerald } : null,
              match.umpire.run_scoring_impact != null ? { label: "Run Impact", value: `${match.umpire.run_scoring_impact >= 0 ? "+" : ""}${fmt(match.umpire.run_scoring_impact, 2)}/g`, color: match.umpire.run_scoring_impact > 0 ? C.amber : C.emerald } : null,
            ].filter(Boolean).map((s: any) => (
              <div key={s.label} className="flex justify-between py-2 text-xs" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                <span style={{ color: C.textSubtle }}>{s.label}</span>
                <span className="font-mono font-semibold" style={{ color: s.color ?? C.textMuted }}>{s.value}</span>
              </div>
            ))}
          </Panel>
        )}

        {/* Season Records */}
        {(mi?.home_record || mi?.away_record) && (
          <Panel title="Season Records">
            {[
              { name: match.home.name, record: mi?.home_record, streak: mi?.home_streak, color: C.emerald },
              { name: match.away.name, record: mi?.away_record, streak: mi?.away_streak, color: C.blue },
            ].map(({ name, record, streak, color }) => record ? (
              <div key={name} className="flex items-center justify-between py-2.5 text-xs" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                <span style={{ color: C.textSubtle }}>{name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black" style={{ color }}>{record}</span>
                  {streak && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{
                      background: streak.startsWith("W") ? `${C.emerald}25` : `${C.red}25`,
                      color: streak.startsWith("W") ? C.emerald : C.red,
                    }}>{streak}</span>
                  )}
                </div>
              </div>
            ) : null)}
          </Panel>
        )}
      </Main>
      <Side>
        {dc && (
          <Panel title="Data Completeness">
            {Object.entries(dc).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2 text-xs" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                <span className="capitalize" style={{ color: C.textSubtle }}>{k.replace(/_/g, " ")}</span>
                <span className="font-bold" style={{ color: v ? C.emerald : C.textSubtle }}>{v ? "✓" : "○"}</span>
              </div>
            ))}
          </Panel>
        )}
      </Side>
    </Grid>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
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
    <div className="flex flex-col max-w-[1440px] mx-auto w-full px-4 py-4 gap-0">
      <BaseballMatchHeader match={match} />

      {/* KPI strip */}
      <div className="rounded-[16px] border overflow-hidden my-3" style={{ background: C.surface, borderColor: C.border }}>
        <div className="flex flex-wrap gap-0 divide-x" style={{ divideColor: C.border }}>
          {[
            match.probabilities && { label: `${match.home.name} Win`, value: fmtPct(match.probabilities.home_win, 1), color: C.emerald },
            match.probabilities && { label: `${match.away.name} Win`, value: fmtPct(match.probabilities.away_win, 1), color: C.blue },
            match.elo_home && match.elo_away && { label: "Elo Diff", value: (match.elo_home.rating - match.elo_away.rating) >= 0 ? `+${Math.round(match.elo_home.rating - match.elo_away.rating)}` : String(Math.round(match.elo_home.rating - match.elo_away.rating)), color: match.elo_home.rating > match.elo_away.rating ? C.emerald : C.blue },
            match.confidence != null && { label: "Confidence", value: `${match.confidence}%`, color: match.confidence >= 65 ? C.emerald : match.confidence >= 55 ? C.amber : C.textMuted },
            match.bullpen_home?.fatigue_score != null && { label: "Bullpen (H)", value: `${match.bullpen_home.fatigue_score.toFixed(1)}/10`, color: match.bullpen_home.fatigue_score > 6 ? C.red : match.bullpen_home.fatigue_score > 4 ? C.amber : C.emerald },
            match.bullpen_away?.fatigue_score != null && { label: "Bullpen (A)", value: `${match.bullpen_away.fatigue_score.toFixed(1)}/10`, color: match.bullpen_away.fatigue_score > 6 ? C.red : match.bullpen_away.fatigue_score > 4 ? C.amber : C.emerald },
            match.match_info?.park_factor != null && { label: "Park Factor", value: match.match_info.park_factor >= 0 ? `+${fmtInt(match.match_info.park_factor)}` : fmtInt(match.match_info.park_factor), color: match.match_info.park_factor > 0 ? C.amber : match.match_info.park_factor < 0 ? C.purple : C.textMuted },
          ].filter(Boolean).map((k: any) => (
            <div key={k.label} className="flex flex-col items-center justify-center px-5 py-3 min-w-[110px] flex-1">
              <span className="text-[10px] uppercase tracking-widest mb-1" style={{ color: C.textSubtle }}>{k.label}</span>
              <span className="text-lg font-black font-mono tabular-nums" style={{ color: k.color }}>{k.value}</span>
            </div>
          ))}
        </div>
      </div>

      {isLive && <div className="mb-3"><BaseballLivePanel match={match as any} /></div>}

      {/* Tab bar */}
      <div className="flex items-center gap-0 overflow-x-auto rounded-[14px] p-1 mb-3" style={{ background: C.surface, border: `1px solid ${C.border}`, scrollbarWidth: "none" }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-shrink-0 px-4 py-2 rounded-[10px] text-[12px] font-semibold transition-all whitespace-nowrap"
            style={{
              background: activeTab === tab ? C.emeraldDim : "transparent",
              color: activeTab === tab ? C.emerald : C.textSubtle,
              border: activeTab === tab ? `1px solid ${C.emeraldBorder}` : "1px solid transparent",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
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
