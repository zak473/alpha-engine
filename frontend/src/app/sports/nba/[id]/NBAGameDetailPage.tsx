"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Trophy,
  Clock3,
  Zap,
  TrendingUp,
  Shield,
  Users,
  BarChart2,
  ChevronLeft,
  Activity,
  Target,
  Crosshair,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BdlGame,
  BdlTeam,
  BdlPlayerBoxScore,
  BdlTeamBoxScore,
  BdlBoxScore,
  BdlPlay,
  TeamTotals,
  isGameLive,
  isGameFinished,
  isGameScheduled,
  getPeriodLabel,
  getClockDisplay,
  isDNP,
  parseMins,
  getTopScorer,
  calcTeamTotals,
  fmtShotLine,
  fmtShotPct,
} from "@/lib/balldontlie";

// ─── Local types ─────────────────────────────────────────────────────────────

interface BdlOdds {
  id: number;
  game_id: number;
  bookmaker_title: string;
  spread: number | null;
  over_under: number | null;
  over_price: number | null;
  under_price: number | null;
  home_moneyline: number | null;
  away_moneyline: number | null;
}

interface BdlInjury {
  player: { id: number; first_name: string; last_name: string; position: string };
  team: BdlTeam;
  status: string;
  return_date: string | null;
  description: string | null;
}

interface BdlStanding {
  team: BdlTeam;
  season?: number;
  wins?: number;
  losses?: number;
  conference?: string;
  conference_rank?: number;
  division_rank?: number;
  home_record?: string;
  visitor_record?: string;
  road_record?: string;
  last_10_record?: string;
  win_percentage?: number;
  win_pct?: number;
  streak?: string;
  current_streak?: string;
  points_per_game?: number;
  opponent_points_per_game?: number;
  // Alternative field names BDL sometimes uses
  [key: string]: unknown;
}

interface BdlAdvancedStat {
  player: { id: number; first_name: string; last_name: string; position: string };
  team: BdlTeam;
  game: { id: number };
  min: string;
  pie: number | null;
  pace: number | null;
  effective_field_goal_percentage: number | null;
  true_shooting_percentage: number | null;
  usage: number | null;
  offensive_rating: number | null;
  defensive_rating: number | null;
  net_rating: number | null;
  assist_percentage: number | null;
  assist_to_turnover: number | null;
  rebound_percentage: number | null;
  offensive_rebound_percentage: number | null;
  defensive_rebound_percentage: number | null;
  turnover_ratio: number | null;
}

interface BdlPlayerProp {
  id: number;
  player: { id: number; first_name: string; last_name: string };
  team: BdlTeam;
  game_id: number;
  line_score: number;
  stat: string;
  over_price: number | null;
  under_price: number | null;
  bookmaker: string;
}

type TabId = "overview" | "boxscore" | "plays" | "teamstats" | "odds" | "h2h" | "trends" | "injuries";
type PlayFilter = "all" | "scoring" | "fouls" | "turnovers";

// ─── Micro-components ─────────────────────────────────────────────────────────

function LivePulse() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
    </span>
  );
}

function TeamAvatar({ abbr, size = "md" }: { abbr: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "lg" ? "h-14 w-14 text-lg" : size === "sm" ? "h-7 w-7 text-[10px]" : "h-10 w-10 text-xs";
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full border border-white/15 bg-white/[0.06] font-bold tracking-wider text-white/80",
        sz
      )}
    >
      {abbr}
    </div>
  );
}

function StatusBadge({ game }: { game: BdlGame }) {
  if (isGameLive(game.status)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-emerald-300">
        <LivePulse />
        Live
      </span>
    );
  }
  if (isGameFinished(game.status)) {
    return (
      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/50">
        Final
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/50">
      <Clock3 className="h-3 w-3" />
      Upcoming
    </span>
  );
}

function MlDisplay({ ml }: { ml: number | null }) {
  if (ml == null) return <span className="text-white/30">—</span>;
  const pos = ml >= 0;
  return (
    <span className={cn("font-mono text-sm tabular-nums", pos ? "text-emerald-300" : "text-white/80")}>
      {pos ? `+${ml}` : ml}
    </span>
  );
}

interface StatCompBarProps {
  label: string;
  homeVal: number;
  awayVal: number;
  homeAbbr: string;
  awayAbbr: string;
  fmt?: (n: number) => string;
  higher?: "home" | "away" | "neither";
  pct?: boolean;
}

function StatCompBar({ label, homeVal, awayVal, homeAbbr, awayAbbr, fmt, pct }: StatCompBarProps) {
  const fmtVal = fmt ?? ((n: number) => (pct ? (n * 100).toFixed(1) + "%" : n.toFixed(1)));
  const total = homeVal + awayVal;
  const homeWidth = total > 0 ? (homeVal / total) * 100 : 50;
  const homeLeads = homeVal > awayVal;
  const awayLeads = awayVal > homeVal;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1.5">
      <div className="flex items-center justify-end gap-2">
        <span className={cn("font-mono text-sm tabular-nums", homeLeads ? "text-white" : "text-white/50")}>
          {fmtVal(homeVal)}
        </span>
      </div>
      <div className="flex w-28 flex-col items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">{label}</span>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={cn("absolute inset-y-0 left-0 rounded-full transition-all", homeLeads ? "bg-emerald-400" : "bg-white/25")}
            style={{ width: `${homeWidth}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("font-mono text-sm tabular-nums", awayLeads ? "text-white" : "text-white/50")}>
          {fmtVal(awayVal)}
        </span>
      </div>
    </div>
  );
}

function FormPip({ won, opp, score }: { won: boolean; opp: string; score: string }) {
  return (
    <div className="group relative flex h-7 w-7 cursor-default items-center justify-center rounded text-[10px] font-bold"
      style={{ background: won ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)", color: won ? "#86efac" : "#fca5a5", border: `1px solid ${won ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}` }}>
      {won ? "W" : "L"}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-[#1a1a2e] px-2 py-1 text-[10px] text-white/70 opacity-0 transition-opacity group-hover:opacity-100">
        {opp} · {score}
      </div>
    </div>
  );
}

function PlayIcon({ description }: { description: string }) {
  const d = description.toLowerCase();
  if (d.includes("3-pointer") || d.includes("three")) return <span className="text-[11px]">🎯</span>;
  if (d.includes("dunk")) return <span className="text-[11px]">💥</span>;
  if (d.includes("free throw")) return <span className="text-[11px]">⚪</span>;
  if (d.includes("makes") || d.includes("layup") || d.includes("jumper") || d.includes("hook")) return <span className="text-[11px]">🏀</span>;
  if (d.includes("foul")) return <span className="text-[11px]">✋</span>;
  if (d.includes("turnover") || d.includes("stolen")) return <span className="text-[11px]">↩</span>;
  if (d.includes("block")) return <span className="text-[11px]">🚫</span>;
  if (d.includes("steal")) return <span className="text-[11px]">⚡</span>;
  if (d.includes("timeout")) return <span className="text-[11px]">⏱</span>;
  if (d.includes("rebound")) return <span className="text-[11px]">🔄</span>;
  if (d.includes("substitut") || d.includes("enters") || d.includes("replaces")) return <span className="text-[11px]">🔀</span>;
  return <span className="text-[11px]">•</span>;
}

function InlineSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-white/30" />
    </div>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-white/25">
      {icon}
      <span className="text-sm">{message}</span>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRecord(standings: BdlStanding[], teamId: number): string {
  const s = standings.find((x) => x.team.id === teamId);
  if (!s) return "";
  return `${s.wins}-${s.losses}`;
}

function getStanding(standings: BdlStanding[], teamId: number): BdlStanding | null {
  return standings.find((x) => x.team.id === teamId) ?? null;
}

function mlToImpliedProb(ml: number): number {
  if (ml < 0) return (-ml) / (-ml + 100);
  return 100 / (ml + 100);
}

function fmtSpread(spread: number | null): string {
  if (spread == null) return "—";
  if (spread > 0) return `+${spread}`;
  return `${spread}`;
}

function fmtML(ml: number | null): string {
  if (ml == null) return "—";
  if (ml >= 0) return `+${ml}`;
  return `${ml}`;
}

function getPlayColor(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("3-pointer") || d.includes("three point")) return "text-yellow-300";
  if (
    d.includes("makes") ||
    d.includes("dunk") ||
    d.includes("layup") ||
    d.includes("jumper") ||
    d.includes("hook shot") ||
    d.includes("tip shot")
  )
    return "text-emerald-300";
  if (d.includes("free throw")) return "text-white/80";
  if (d.includes("foul")) return "text-amber-300/70";
  if (d.includes("turnover") || d.includes("stolen")) return "text-red-400/70";
  if (d.includes("block") || d.includes("steal")) return "text-sky-300";
  if (d.includes("substitut") || d.includes("enters") || d.includes("replaces")) return "text-white/40";
  if (d.includes("timeout")) return "text-blue-300/70";
  return "text-white/60";
}

function isPlayScoring(d: string): boolean {
  const l = d.toLowerCase();
  return (
    l.includes("makes") ||
    l.includes("dunk") ||
    l.includes("layup") ||
    l.includes("jumper") ||
    l.includes("free throw made") ||
    l.includes("3-pointer") ||
    l.includes("hook shot") ||
    l.includes("tip shot")
  );
}

function isPlayFoul(d: string): boolean {
  return d.toLowerCase().includes("foul");
}

function isPlayTurnover(d: string): boolean {
  return d.toLowerCase().includes("turnover") || d.toLowerCase().includes("stolen");
}

function getTopRebounder(teamBox: BdlTeamBoxScore): BdlPlayerBoxScore | null {
  const active = teamBox.players.filter((p) => !isDNP(p));
  if (!active.length) return null;
  return active.reduce((best, p) => ((p.reb ?? 0) > (best.reb ?? 0) ? p : best));
}

function getTopAssister(teamBox: BdlTeamBoxScore): BdlPlayerBoxScore | null {
  const active = teamBox.players.filter((p) => !isDNP(p));
  if (!active.length) return null;
  return active.reduce((best, p) => ((p.ast ?? 0) > (best.ast ?? 0) ? p : best));
}

function calcEFG(fgm: number, fg3m: number, fga: number): number {
  if (!fga) return 0;
  return (fgm + 0.5 * fg3m) / fga;
}

function getRecentForm(
  games: BdlGame[],
  teamId: number
): { won: boolean; opp: string; score: string }[] {
  const finished = games
    .filter((g) => isGameFinished(g.status))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
  return finished.map((g) => {
    const isHome = g.home_team.id === teamId;
    const teamScore = isHome ? g.home_team_score : g.visitor_team_score;
    const oppScore = isHome ? g.visitor_team_score : g.home_team_score;
    const opp = isHome ? g.visitor_team.abbreviation : g.home_team.abbreviation;
    const won = teamScore > oppScore;
    return { won, opp, score: `${teamScore}-${oppScore}` };
  });
}

function daysSinceLastGame(games: BdlGame[], teamId: number): number | null {
  const finished = games
    .filter((g) => isGameFinished(g.status))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  if (!finished.length) return null;
  const last = finished[0];
  const diff = Date.now() - new Date(last.date).getTime();
  return Math.floor(diff / 86400000);
}

// ─── Quarter score table ──────────────────────────────────────────────────────

function QuarterScoreTable({ game }: { game: BdlGame }) {
  const hasOT = (game.home_ot1 ?? 0) > 0 || (game.visitor_ot1 ?? 0) > 0;
  const hasOT2 = (game.home_ot2 ?? 0) > 0 || (game.visitor_ot2 ?? 0) > 0;
  const hasOT3 = (game.home_ot3 ?? 0) > 0 || (game.visitor_ot3 ?? 0) > 0;

  const cols: { label: string; home: number | null; away: number | null }[] = [
    { label: "Q1", home: game.home_q1, away: game.visitor_q1 },
    { label: "Q2", home: game.home_q2, away: game.visitor_q2 },
    { label: "Q3", home: game.home_q3, away: game.visitor_q3 },
    { label: "Q4", home: game.home_q4, away: game.visitor_q4 },
  ];
  if (hasOT) cols.push({ label: "OT", home: game.home_ot1, away: game.visitor_ot1 });
  if (hasOT2) cols.push({ label: "OT2", home: game.home_ot2, away: game.visitor_ot2 });
  if (hasOT3) cols.push({ label: "OT3", home: game.home_ot3, away: game.visitor_ot3 });
  cols.push({ label: "T", home: game.home_team_score, away: game.visitor_team_score });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] text-center">
        <thead>
          <tr>
            <th className="w-16 pb-1 text-left text-[10px] font-semibold uppercase tracking-widest text-white/35" />
            {cols.map((c) => (
              <th
                key={c.label}
                className={cn(
                  "min-w-[32px] pb-1 text-[10px] font-semibold uppercase tracking-widest",
                  c.label === "T" ? "text-white/60" : "text-white/35"
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            { abbr: game.visitor_team.abbreviation, vals: cols.map((c) => c.away), total: game.visitor_team_score },
            { abbr: game.home_team.abbreviation, vals: cols.map((c) => c.home), total: game.home_team_score },
          ].map((row, ri) => (
            <tr key={ri}>
              <td className="py-0.5 text-left text-xs font-semibold text-white/60">{row.abbr}</td>
              {cols.map((c, ci) => {
                const val = row.vals[ci];
                const isTotal = c.label === "T";
                const wins = isTotal && row.total > (ri === 0 ? game.home_team_score : game.visitor_team_score);
                return (
                  <td
                    key={ci}
                    className={cn(
                      "py-0.5 font-mono text-sm tabular-nums",
                      isTotal ? (wins ? "font-bold text-white" : "font-bold text-white/70") : "text-white/55"
                    )}
                  >
                    {val ?? (isTotal ? 0 : "—")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── GameHero ─────────────────────────────────────────────────────────────────

interface GameHeroProps {
  game: BdlGame;
  boxScore: BdlBoxScore | null;
  odds: BdlOdds[];
  standings: BdlStanding[];
  syncing: boolean;
  lastSynced: Date;
  onRefresh: () => void;
}

function GameHero({ game, boxScore, odds, standings, syncing, lastSynced, onRefresh }: GameHeroProps) {
  const live = isGameLive(game.status);
  const finished = isGameFinished(game.status);
  const scheduled = isGameScheduled(game.status);
  const homeRecord = getRecord(standings, game.home_team.id);
  const awayRecord = getRecord(standings, game.visitor_team.id);
  const firstOdds = odds[0] ?? null;

  const homeScore = game.home_team_score;
  const awayScore = game.visitor_team_score;
  const homeWins = finished && homeScore > awayScore;
  const awayWins = finished && awayScore > homeScore;

  const homeTopScorer = boxScore ? getTopScorer(boxScore.home_team) : null;
  const awayTopScorer = boxScore ? getTopScorer(boxScore.visitor_team) : null;
  const homeTopReb = boxScore ? getTopRebounder(boxScore.home_team) : null;
  const awayTopReb = boxScore ? getTopRebounder(boxScore.visitor_team) : null;
  const homeTopAst = boxScore ? getTopAssister(boxScore.home_team) : null;
  const awayTopAst = boxScore ? getTopAssister(boxScore.visitor_team) : null;

  return (
    <div className={cn(
      "sticky top-0 z-20 rounded-[20px] border bg-[#0a0f1a]/95 backdrop-blur-xl",
      live ? "border-emerald-400/25" : "border-white/8"
    )}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-4">
        <Link
          href="/sports/nba"
          className="inline-flex items-center gap-1 text-[11px] text-white/40 transition-colors hover:text-white/70"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Live games
        </Link>
        <div className="flex items-center gap-3">
          {live && (
            <span className="text-[10px] text-white/35">
              Synced {lastSynced.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/80"
          >
            <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main score area */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Away team */}
          <div className={cn("flex flex-1 flex-col items-center gap-2", awayWins && "opacity-100", finished && !awayWins && "opacity-50")}>
            <TeamAvatar abbr={game.visitor_team.abbreviation} size="lg" />
            <div className="text-center">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{game.visitor_team.city}</div>
              <div className="text-base font-bold text-white">{game.visitor_team.name}</div>
              {awayRecord && <div className="text-[11px] text-white/35">{awayRecord}</div>}
            </div>
          </div>

          {/* Score / vs */}
          <div className="flex flex-col items-center gap-2">
            {scheduled ? (
              <>
                <StatusBadge game={game} />
                <div className="text-2xl font-bold text-white/25">vs</div>
                <div className="text-xs text-white/40">{getPeriodLabel(game)}</div>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-3">
                  <span className={cn("font-mono text-4xl font-bold tabular-nums", awayWins ? "text-white" : finished ? "text-white/45" : "text-white")}>
                    {awayScore}
                  </span>
                  <span className="text-xl text-white/20">–</span>
                  <span className={cn("font-mono text-4xl font-bold tabular-nums", homeWins ? "text-white" : finished ? "text-white/45" : "text-white")}>
                    {homeScore}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge game={game} />
                  {live && game.time && (
                    <span className="text-[11px] font-semibold text-emerald-300">{getClockDisplay(game)}</span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Home team */}
          <div className={cn("flex flex-1 flex-col items-center gap-2", homeWins && "opacity-100", finished && !homeWins && "opacity-50")}>
            <TeamAvatar abbr={game.home_team.abbreviation} size="lg" />
            <div className="text-center">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{game.home_team.city}</div>
              <div className="text-base font-bold text-white">{game.home_team.name}</div>
              {homeRecord && <div className="text-[11px] text-white/35">{homeRecord}</div>}
            </div>
          </div>
        </div>

        {/* Quarter scores */}
        {!scheduled && (
          <div className="mt-4 border-t border-white/6 pt-4">
            <QuarterScoreTable game={game} />
          </div>
        )}

        {/* Live context */}
        {live && (
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/6 pt-3">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Away TOs</span>
              <span className="font-mono text-sm text-white">{game.visitor_timeouts_remaining ?? "—"}</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Bonus</span>
              <div className="flex gap-2">
                <span className={cn("text-xs", game.visitor_in_bonus ? "text-amber-300" : "text-white/30")}>
                  {game.visitor_team.abbreviation}: {game.visitor_in_bonus ? "YES" : "NO"}
                </span>
                <span className={cn("text-xs", game.home_in_bonus ? "text-amber-300" : "text-white/30")}>
                  {game.home_team.abbreviation}: {game.home_in_bonus ? "YES" : "NO"}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Home TOs</span>
              <span className="font-mono text-sm text-white">{game.home_timeouts_remaining ?? "—"}</span>
            </div>
          </div>
        )}

        {/* Odds strip */}
        {firstOdds && (
          <div className="mt-3 flex items-center justify-center gap-6 border-t border-white/6 pt-3">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Spread</span>
              <span className="font-mono text-sm text-white/70">{fmtSpread(firstOdds.spread)}</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Total</span>
              <span className="font-mono text-sm text-white/70">{firstOdds.over_under ?? "—"}</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                ML ({game.visitor_team.abbreviation})
              </span>
              <MlDisplay ml={firstOdds.away_moneyline} />
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                ML ({game.home_team.abbreviation})
              </span>
              <MlDisplay ml={firstOdds.home_moneyline} />
            </div>
          </div>
        )}

        {/* Leaders strip */}
        {boxScore && (
          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-white/6 pt-3">
            {[
              {
                label: "Top Scorer",
                icon: <Trophy className="h-3 w-3 text-yellow-400/70" />,
                home: homeTopScorer,
                away: awayTopScorer,
                valFn: (p: BdlPlayerBoxScore) => `${p.pts ?? 0} PTS`,
              },
              {
                label: "Top Rebounder",
                icon: <Activity className="h-3 w-3 text-sky-400/70" />,
                home: homeTopReb,
                away: awayTopReb,
                valFn: (p: BdlPlayerBoxScore) => `${p.reb ?? 0} REB`,
              },
              {
                label: "Top Assister",
                icon: <Zap className="h-3 w-3 text-purple-400/70" />,
                home: homeTopAst,
                away: awayTopAst,
                valFn: (p: BdlPlayerBoxScore) => `${p.ast ?? 0} AST`,
              },
            ].map(({ label, icon, home, away, valFn }) => (
              <div key={label} className="flex flex-col gap-1 rounded-xl border border-white/6 bg-white/[0.02] p-2.5">
                <div className="flex items-center gap-1">
                  {icon}
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{label}</span>
                </div>
                {home && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/70">{home.player.last_name}</span>
                    <span className="font-mono text-xs text-white">{valFn(home)}</span>
                  </div>
                )}
                {away && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/70">{away.player.last_name}</span>
                    <span className="font-mono text-xs text-white">{valFn(away)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <BarChart2 className="h-3.5 w-3.5" /> },
  { id: "boxscore", label: "Box Score", icon: <Users className="h-3.5 w-3.5" /> },
  { id: "plays", label: "Plays", icon: <Activity className="h-3.5 w-3.5" /> },
  { id: "teamstats", label: "Team Stats", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: "odds", label: "Odds", icon: <Target className="h-3.5 w-3.5" /> },
  { id: "h2h", label: "H2H", icon: <Crosshair className="h-3.5 w-3.5" /> },
  { id: "trends", label: "Trends", icon: <Zap className="h-3.5 w-3.5" /> },
  { id: "injuries", label: "Injuries", icon: <Shield className="h-3.5 w-3.5" /> },
];

function TabBar({
  active,
  onChange,
  live,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  live: boolean;
}) {
  return (
    <div className="scrollbar-none flex overflow-x-auto rounded-[20px] border border-white/8 bg-white/[0.025] p-1">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-[14px] px-4 py-2 text-[11px] font-semibold uppercase tracking-widest transition-all",
            active === tab.id
              ? live
                ? "bg-emerald-400/15 text-emerald-200"
                : "bg-white/[0.10] text-white"
              : "text-white/40 hover:text-white/70"
          )}
        >
          {tab.icon}
          <span className="hidden sm:inline">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

interface OverviewTabProps {
  game: BdlGame;
  boxScore: BdlBoxScore | null;
  plays: BdlPlay[];
  odds: BdlOdds[];
  homeGames: BdlGame[];
  awayGames: BdlGame[];
  h2hGames: BdlGame[];
  injuries: BdlInjury[];
  secondaryLoading: boolean;
}

function OverviewTab({
  game,
  boxScore,
  plays,
  odds,
  homeGames,
  awayGames,
  h2hGames,
  injuries,
  secondaryLoading,
}: OverviewTabProps) {
  const homeTotals = boxScore ? calcTeamTotals(boxScore.home_team.players) : null;
  const awayTotals = boxScore ? calcTeamTotals(boxScore.visitor_team.players) : null;
  const firstOdds = odds[0] ?? null;

  const homeForm = getRecentForm(homeGames, game.home_team.id);
  const awayForm = getRecentForm(awayGames, game.visitor_team.id);

  const homeWinsH2H = h2hGames.filter((g) => {
    const finished = isGameFinished(g.status);
    if (!finished) return false;
    return (g.home_team.id === game.home_team.id && g.home_team_score > g.visitor_team_score) ||
      (g.visitor_team.id === game.home_team.id && g.visitor_team_score > g.home_team_score);
  }).length;
  const awayWinsH2H = h2hGames.filter((g) => {
    const finished = isGameFinished(g.status);
    if (!finished) return false;
    return (g.home_team.id === game.visitor_team.id && g.home_team_score > g.visitor_team_score) ||
      (g.visitor_team.id === game.visitor_team.id && g.visitor_team_score > g.home_team_score);
  }).length;

  const recentPlays = [...plays].reverse().slice(0, 6);

  const homeInjuries = injuries.filter((i) => i.team.id === game.home_team.id);
  const awayInjuries = injuries.filter((i) => i.team.id === game.visitor_team.id);

  return (
    <div className="space-y-4">
      {/* Team stat comparison */}
      <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Team Comparison</span>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-white/50">{game.visitor_team.abbreviation}</span>
            <span className="text-white/20">vs</span>
            <span className="text-white/50">{game.home_team.abbreviation}</span>
          </div>
        </div>
        {homeTotals && awayTotals ? (
          <div className="space-y-0.5">
            <StatCompBar label="PTS" homeVal={homeTotals.pts} awayVal={awayTotals.pts} homeAbbr={game.home_team.abbreviation} awayAbbr={game.visitor_team.abbreviation} fmt={(n) => String(Math.round(n))} />
            <StatCompBar label="FG%" homeVal={homeTotals.fga > 0 ? homeTotals.fgm / homeTotals.fga : 0} awayVal={awayTotals.fga > 0 ? awayTotals.fgm / awayTotals.fga : 0} homeAbbr={game.home_team.abbreviation} awayAbbr={game.visitor_team.abbreviation} pct />
            <StatCompBar label="3PT%" homeVal={homeTotals.fg3a > 0 ? homeTotals.fg3m / homeTotals.fg3a : 0} awayVal={awayTotals.fg3a > 0 ? awayTotals.fg3m / awayTotals.fg3a : 0} homeAbbr={game.home_team.abbreviation} awayAbbr={game.visitor_team.abbreviation} pct />
            <StatCompBar label="REB" homeVal={homeTotals.reb} awayVal={awayTotals.reb} homeAbbr={game.home_team.abbreviation} awayAbbr={game.visitor_team.abbreviation} fmt={(n) => String(Math.round(n))} />
            <StatCompBar label="AST" homeVal={homeTotals.ast} awayVal={awayTotals.ast} homeAbbr={game.home_team.abbreviation} awayAbbr={game.visitor_team.abbreviation} fmt={(n) => String(Math.round(n))} />
            <StatCompBar label="TOV" homeVal={homeTotals.turnover} awayVal={awayTotals.turnover} homeAbbr={game.home_team.abbreviation} awayAbbr={game.visitor_team.abbreviation} fmt={(n) => String(Math.round(n))} />
            <StatCompBar label="STL" homeVal={homeTotals.stl} awayVal={awayTotals.stl} homeAbbr={game.home_team.abbreviation} awayAbbr={game.visitor_team.abbreviation} fmt={(n) => String(Math.round(n))} />
            <StatCompBar label="BLK" homeVal={homeTotals.blk} awayVal={awayTotals.blk} homeAbbr={game.home_team.abbreviation} awayAbbr={game.visitor_team.abbreviation} fmt={(n) => String(Math.round(n))} />
          </div>
        ) : (
          <EmptyState icon={<BarChart2 className="h-8 w-8" />} message="Box score data unavailable" />
        )}
      </div>

      {/* Top performers */}
      {boxScore && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { team: boxScore.home_team, label: game.home_team.name },
            { team: boxScore.visitor_team, label: game.visitor_team.name },
          ].map(({ team, label }) => {
            const scorer = getTopScorer(team);
            const rebounder = getTopRebounder(team);
            const assister = getTopAssister(team);
            return (
              <div key={label} className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
                <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/35">{label} — Key Performers</div>
                <div className="space-y-2">
                  {[
                    { icon: <Trophy className="h-3.5 w-3.5 text-yellow-400/70" />, label: "Scorer", player: scorer, val: `${scorer?.pts ?? 0} PTS` },
                    { icon: <Activity className="h-3.5 w-3.5 text-sky-400/70" />, label: "Rebounder", player: rebounder, val: `${rebounder?.reb ?? 0} REB` },
                    { icon: <Zap className="h-3.5 w-3.5 text-purple-400/70" />, label: "Assist", player: assister, val: `${assister?.ast ?? 0} AST` },
                  ].map(({ icon, label: lbl, player, val }) => (
                    <div key={lbl} className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2">
                      {icon}
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-xs font-medium text-white/80">
                          {player ? `${player.player.first_name[0]}. ${player.player.last_name}` : "—"}
                        </div>
                        <div className="text-[10px] text-white/35">{lbl}</div>
                      </div>
                      <span className="font-mono text-sm font-bold text-white">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent plays + odds snapshot */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/35">Recent Plays</div>
          {recentPlays.length > 0 ? (
            <div className="space-y-1.5">
              {recentPlays.map((play) => {
                const isHome = play.team_id === game.home_team.id;
                const teamAbbr = play.team_id
                  ? isHome
                    ? game.home_team.abbreviation
                    : game.visitor_team.abbreviation
                  : null;
                return (
                  <div key={play.id} className="flex items-start gap-2 rounded-xl border border-white/4 bg-white/[0.015] px-3 py-2">
                    <span className="mt-0.5 shrink-0 rounded bg-white/8 px-1 py-0.5 text-[10px] font-semibold text-white/40">
                      Q{play.period}
                    </span>
                    <span className="mt-0.5 w-10 shrink-0 text-right font-mono text-[10px] text-white/35">{play.clock}</span>
                    {teamAbbr && (
                      <span className={cn("mt-0.5 shrink-0 text-[10px] font-semibold", isHome ? "text-sky-300/70" : "text-orange-300/70")}>
                        {teamAbbr}
                      </span>
                    )}
                    <span className={cn("flex-1 text-xs", getPlayColor(play.description))}>{play.description}</span>
                    <span className="shrink-0 font-mono text-[10px] text-white/30">
                      {play.score_away}–{play.score_home}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<Activity className="h-6 w-6" />} message="No plays yet" />
          )}
        </div>

        <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/35">Odds Snapshot</div>
          {firstOdds ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Book</span>
                <span className="text-xs font-medium text-white/70">{firstOdds.bookmaker_title}</span>
              </div>
              <div className="border-t border-white/6 pt-3 space-y-2.5">
                {[
                  { label: "Spread", val: fmtSpread(firstOdds.spread) },
                  { label: "Total (O/U)", val: firstOdds.over_under != null ? String(firstOdds.over_under) : "—" },
                  { label: `ML ${game.visitor_team.abbreviation}`, val: fmtML(firstOdds.away_moneyline) },
                  { label: `ML ${game.home_team.abbreviation}`, val: fmtML(firstOdds.home_moneyline) },
                ].map(({ label, val }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[11px] text-white/40">{label}</span>
                    <span className="font-mono text-sm text-white">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : secondaryLoading ? (
            <InlineSpinner />
          ) : (
            <EmptyState icon={<Target className="h-6 w-6" />} message="No odds available" />
          )}
        </div>
      </div>

      {/* Form strips + H2H */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/35">Recent Form (Last 5)</div>
          {secondaryLoading ? (
            <InlineSpinner />
          ) : (
            <div className="space-y-3">
              {[
                { abbr: game.home_team.abbreviation, form: homeForm },
                { abbr: game.visitor_team.abbreviation, form: awayForm },
              ].map(({ abbr, form }) => (
                <div key={abbr} className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-xs font-semibold text-white/50">{abbr}</span>
                  <div className="flex gap-1.5">
                    {form.length > 0 ? (
                      form.map((f, i) => <FormPip key={i} won={f.won} opp={f.opp} score={f.score} />)
                    ) : (
                      <span className="text-xs text-white/25">No recent data</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/35">H2H Record</div>
          {secondaryLoading ? (
            <InlineSpinner />
          ) : h2hGames.length > 0 ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-baseline gap-3">
                <div className="flex flex-col items-center">
                  <span className="font-mono text-3xl font-bold text-white">{homeWinsH2H}</span>
                  <span className="text-[10px] text-white/35">{game.home_team.abbreviation}</span>
                </div>
                <span className="text-xl text-white/20">–</span>
                <div className="flex flex-col items-center">
                  <span className="font-mono text-3xl font-bold text-white">{awayWinsH2H}</span>
                  <span className="text-[10px] text-white/35">{game.visitor_team.abbreviation}</span>
                </div>
              </div>
              <div className="text-[10px] text-white/30">Last {h2hGames.length} meetings</div>
            </div>
          ) : (
            <EmptyState icon={<Crosshair className="h-6 w-6" />} message="No H2H history" />
          )}
        </div>
      </div>

      {/* Injuries quick view */}
      {(homeInjuries.length > 0 || awayInjuries.length > 0) && (
        <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/35">Injury Report</div>
          <div className="flex flex-wrap gap-2">
            {[...homeInjuries, ...awayInjuries].map((inj, i) => {
              const statusColor =
                inj.status === "Out"
                  ? "border-red-400/25 bg-red-400/10 text-red-300"
                  : inj.status === "Doubtful"
                  ? "border-orange-400/25 bg-orange-400/10 text-orange-300"
                  : inj.status === "Questionable"
                  ? "border-yellow-400/25 bg-yellow-400/10 text-yellow-300"
                  : "border-white/10 bg-white/[0.04] text-white/50";
              return (
                <div key={i} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]", statusColor)}>
                  <span className="font-semibold">{inj.team.abbreviation}</span>
                  <span>{inj.player.last_name}</span>
                  <span className="opacity-70">· {inj.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Box Score Tab ────────────────────────────────────────────────────────────

function BoxScoreTab({ boxScore }: { boxScore: BdlBoxScore | null }) {
  if (!boxScore) {
    return <EmptyState icon={<Users className="h-10 w-10" />} message="Box score unavailable" />;
  }

  function TeamTable({ teamBox }: { teamBox: BdlTeamBoxScore }) {
    const active = [...teamBox.players]
      .filter((p) => !isDNP(p))
      .sort((a, b) => parseMins(b.min) - parseMins(a.min));
    const dnp = teamBox.players.filter((p) => isDNP(p));
    const totals = calcTeamTotals(teamBox.players);

    const fgPct = totals.fga > 0 ? (totals.fgm / totals.fga * 100).toFixed(1) + "%" : "—";
    const fg3Pct = totals.fg3a > 0 ? (totals.fg3m / totals.fg3a * 100).toFixed(1) + "%" : "—";
    const ftPct = totals.fta > 0 ? (totals.ftm / totals.fta * 100).toFixed(1) + "%" : "—";

    return (
      <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold text-white">{teamBox.team.full_name}</span>
          <div className="flex gap-3 text-[11px] text-white/40">
            <span>FG {fgPct}</span>
            <span>3PT {fg3Pct}</span>
            <span>FT {ftPct}</span>
            <span>REB {totals.reb}</span>
            <span>AST {totals.ast}</span>
            <span>TOV {totals.turnover}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-white/6">
                {["PLAYER", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TO", "PF", "FG", "3PT", "FT", "+/-"].map((h) => (
                  <th
                    key={h}
                    className={cn(
                      "py-2 text-[10px] font-semibold uppercase tracking-widest text-white/30",
                      h === "PLAYER" ? "text-left pr-3" : "text-center px-1.5"
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map((p, i) => {
                const ptsColor =
                  (p.pts ?? 0) >= 30
                    ? "text-emerald-300"
                    : (p.pts ?? 0) >= 20
                    ? "text-emerald-400/80"
                    : "text-white";
                return (
                  <tr key={p.player.id} className={cn("border-b border-white/4", i % 2 === 0 ? "" : "bg-white/[0.012]")}>
                    <td className="py-2 pr-3">
                      <div className="text-sm font-medium text-white/80">
                        {p.player.first_name[0]}. {p.player.last_name}
                      </div>
                      <div className="text-[10px] text-white/30">{p.player.position}</div>
                    </td>
                    <td className="px-1.5 text-center font-mono text-xs text-white/50">{p.min ?? "—"}</td>
                    <td className={cn("px-1.5 text-center font-mono text-sm font-bold", ptsColor)}>{p.pts ?? 0}</td>
                    <td className="px-1.5 text-center font-mono text-xs text-white/70">{p.reb ?? 0}</td>
                    <td className="px-1.5 text-center font-mono text-xs text-white/70">{p.ast ?? 0}</td>
                    <td className="px-1.5 text-center font-mono text-xs text-white/70">{p.stl ?? 0}</td>
                    <td className="px-1.5 text-center font-mono text-xs text-white/70">{p.blk ?? 0}</td>
                    <td className="px-1.5 text-center font-mono text-xs text-white/70">{p.turnover ?? 0}</td>
                    <td className="px-1.5 text-center font-mono text-xs text-white/70">{p.pf ?? 0}</td>
                    <td className="px-1.5 text-center font-mono text-xs text-white/55">{fmtShotLine(p.fgm, p.fga)}</td>
                    <td className="px-1.5 text-center font-mono text-xs text-white/55">{fmtShotLine(p.fg3m, p.fg3a)}</td>
                    <td className="px-1.5 text-center font-mono text-xs text-white/55">{fmtShotLine(p.ftm, p.fta)}</td>
                    <td className={cn("px-1.5 text-center font-mono text-xs",
                      (p.plus_minus_points ?? 0) > 0 ? "text-emerald-400" : (p.plus_minus_points ?? 0) < 0 ? "text-red-400" : "text-white/40"
                    )}>
                      {(p.plus_minus_points ?? 0) > 0 ? `+${p.plus_minus_points}` : (p.plus_minus_points ?? 0)}
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr className="border-t border-white/10 bg-white/[0.03]">
                <td className="py-2 pr-3 text-[11px] font-bold uppercase tracking-widest text-white/60">TOTALS</td>
                <td className="px-1.5 text-center font-mono text-xs text-white/40">—</td>
                <td className="px-1.5 text-center font-mono text-sm font-bold text-white">{totals.pts}</td>
                <td className="px-1.5 text-center font-mono text-xs font-bold text-white/80">{totals.reb}</td>
                <td className="px-1.5 text-center font-mono text-xs font-bold text-white/80">{totals.ast}</td>
                <td className="px-1.5 text-center font-mono text-xs font-bold text-white/80">{totals.stl}</td>
                <td className="px-1.5 text-center font-mono text-xs font-bold text-white/80">{totals.blk}</td>
                <td className="px-1.5 text-center font-mono text-xs font-bold text-white/80">{totals.turnover}</td>
                <td className="px-1.5 text-center font-mono text-xs font-bold text-white/80">{totals.pf}</td>
                <td className="px-1.5 text-center font-mono text-xs font-bold text-white/55">
                  {fmtShotLine(totals.fgm, totals.fga)} ({fmtShotPct(totals.fgm, totals.fga)})
                </td>
                <td className="px-1.5 text-center font-mono text-xs font-bold text-white/55">
                  {fmtShotLine(totals.fg3m, totals.fg3a)} ({fmtShotPct(totals.fg3m, totals.fg3a)})
                </td>
                <td className="px-1.5 text-center font-mono text-xs font-bold text-white/55">
                  {fmtShotLine(totals.ftm, totals.fta)} ({fmtShotPct(totals.ftm, totals.fta)})
                </td>
                <td className="px-1.5" />
              </tr>
              {/* DNP row */}
              {dnp.length > 0 && (
                <tr className="border-t border-white/4">
                  <td colSpan={13} className="py-2 text-[10px] text-white/30">
                    <span className="font-semibold uppercase tracking-widest">DNP:</span>{" "}
                    {dnp.map((p) => `${p.player.first_name[0]}. ${p.player.last_name}`).join(", ")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TeamTable teamBox={boxScore.visitor_team} />
      <TeamTable teamBox={boxScore.home_team} />
    </div>
  );
}

// ─── Plays Tab ────────────────────────────────────────────────────────────────

function PlaysTab({
  plays,
  game,
  playFilter,
  setPlayFilter,
}: {
  plays: BdlPlay[];
  game: BdlGame;
  playFilter: PlayFilter;
  setPlayFilter: (f: PlayFilter) => void;
}) {
  const filtered = [...plays]
    .reverse()
    .filter((p) => {
      if (playFilter === "all") return true;
      if (playFilter === "scoring") return isPlayScoring(p.description);
      if (playFilter === "fouls") return isPlayFoul(p.description);
      if (playFilter === "turnovers") return isPlayTurnover(p.description);
      return true;
    });

  const filterButtons: { id: PlayFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "scoring", label: "Scoring" },
    { id: "fouls", label: "Fouls" },
    { id: "turnovers", label: "Turnovers" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {filterButtons.map((btn) => (
          <button
            key={btn.id}
            onClick={() => setPlayFilter(btn.id)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-semibold transition-all",
              playFilter === btn.id
                ? "border-white/20 bg-white/[0.10] text-white"
                : "border-white/8 bg-white/[0.025] text-white/40 hover:text-white/70"
            )}
          >
            {btn.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-white/25 self-center">{filtered.length} plays</span>
      </div>

      {filtered.length > 0 ? (
        <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
          <div className="space-y-1">
            {filtered.map((play) => {
              const isHome = play.team_id === game.home_team.id;
              const teamAbbr = play.team_id
                ? isHome
                  ? game.home_team.abbreviation
                  : game.visitor_team.abbreviation
                : null;
              return (
                <div
                  key={play.id}
                  className="flex items-start gap-2.5 rounded-xl border border-transparent py-1.5 px-2 transition-colors hover:border-white/6 hover:bg-white/[0.02]"
                >
                  <span className="mt-0.5 w-6 shrink-0 rounded bg-white/8 px-1 py-0.5 text-center text-[10px] font-bold text-white/40">
                    Q{play.period}
                  </span>
                  <span className="mt-0.5 w-12 shrink-0 text-right font-mono text-[10px] text-white/30">{play.clock}</span>
                  <div className="mt-0.5 flex w-8 shrink-0 justify-center">
                    <PlayIcon description={play.description} />
                  </div>
                  {teamAbbr && (
                    <span
                      className={cn(
                        "mt-0.5 w-8 shrink-0 text-center text-[10px] font-semibold",
                        isHome ? "text-sky-300/70" : "text-orange-300/70"
                      )}
                    >
                      {teamAbbr}
                    </span>
                  )}
                  <span className={cn("flex-1 text-xs leading-relaxed", getPlayColor(play.description))}>
                    {play.description}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-white/25 self-center">
                    {play.score_away}–{play.score_home}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState icon={<Activity className="h-10 w-10" />} message="No plays match this filter" />
      )}
    </div>
  );
}

// ─── Team Stats Tab ───────────────────────────────────────────────────────────

function TeamStatsTab({
  game,
  boxScore,
  advancedStats,
}: {
  game: BdlGame;
  boxScore: BdlBoxScore | null;
  advancedStats: BdlAdvancedStat[];
}) {
  if (!boxScore) {
    return <EmptyState icon={<BarChart2 className="h-10 w-10" />} message="Box score data unavailable" />;
  }

  const ht = calcTeamTotals(boxScore.home_team.players);
  const at = calcTeamTotals(boxScore.visitor_team.players);
  const hAbbr = game.home_team.abbreviation;
  const aAbbr = game.visitor_team.abbreviation;

  const hEFG = calcEFG(ht.fgm, ht.fg3m, ht.fga);
  const aEFG = calcEFG(at.fgm, at.fg3m, at.fga);

  // Advanced stats aggregated by team
  const homeAdv = advancedStats.filter((s) => s.team.id === game.home_team.id);
  const awayAdv = advancedStats.filter((s) => s.team.id === game.visitor_team.id);
  const avgAdv = (arr: BdlAdvancedStat[], key: keyof BdlAdvancedStat): number => {
    const vals = arr.map((s) => s[key] as number | null).filter((v): v is number => v != null);
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const pctFmt = (n: number) => (n * 100).toFixed(1) + "%";
  const numFmt = (n: number) => n.toFixed(1);
  const intFmt = (n: number) => String(Math.round(n));

  type StatRow = { label: string; homeVal: number; awayVal: number; fmt?: (n: number) => string; pct?: boolean };

  const groups: { title: string; rows: StatRow[] }[] = [
    {
      title: "Shooting",
      rows: [
        { label: "FG%", homeVal: ht.fga > 0 ? ht.fgm / ht.fga : 0, awayVal: at.fga > 0 ? at.fgm / at.fga : 0, pct: true },
        { label: "3PT%", homeVal: ht.fg3a > 0 ? ht.fg3m / ht.fg3a : 0, awayVal: at.fg3a > 0 ? at.fg3m / at.fg3a : 0, pct: true },
        { label: "FT%", homeVal: ht.fta > 0 ? ht.ftm / ht.fta : 0, awayVal: at.fta > 0 ? at.ftm / at.fta : 0, pct: true },
        { label: "eFG%", homeVal: hEFG, awayVal: aEFG, pct: true },
      ],
    },
    {
      title: "Scoring",
      rows: [
        { label: "PTS", homeVal: ht.pts, awayVal: at.pts, fmt: intFmt },
        { label: "2nd Chance (est)", homeVal: Math.round(ht.oreb * 1.1), awayVal: Math.round(at.oreb * 1.1), fmt: intFmt },
      ],
    },
    {
      title: "Rebounding",
      rows: [
        { label: "Total REB", homeVal: ht.reb, awayVal: at.reb, fmt: intFmt },
        { label: "OREB", homeVal: ht.oreb, awayVal: at.oreb, fmt: intFmt },
        { label: "DREB", homeVal: ht.dreb, awayVal: at.dreb, fmt: intFmt },
      ],
    },
    {
      title: "Defense",
      rows: [
        { label: "STL", homeVal: ht.stl, awayVal: at.stl, fmt: intFmt },
        { label: "BLK", homeVal: ht.blk, awayVal: at.blk, fmt: intFmt },
        { label: "Fouls", homeVal: ht.pf, awayVal: at.pf, fmt: intFmt },
      ],
    },
    {
      title: "Other",
      rows: [
        { label: "AST", homeVal: ht.ast, awayVal: at.ast, fmt: intFmt },
        { label: "TOV", homeVal: ht.turnover, awayVal: at.turnover, fmt: intFmt },
      ],
    },
  ];

  if (homeAdv.length > 0 || awayAdv.length > 0) {
    groups.push({
      title: "Advanced",
      rows: [
        { label: "ORtg", homeVal: avgAdv(homeAdv, "offensive_rating"), awayVal: avgAdv(awayAdv, "offensive_rating"), fmt: numFmt },
        { label: "DRtg", homeVal: avgAdv(homeAdv, "defensive_rating"), awayVal: avgAdv(awayAdv, "defensive_rating"), fmt: numFmt },
        { label: "TS%", homeVal: avgAdv(homeAdv, "true_shooting_percentage"), awayVal: avgAdv(awayAdv, "true_shooting_percentage"), fmt: (n) => (n * 100).toFixed(1) + "%" },
        { label: "Usage%", homeVal: avgAdv(homeAdv, "usage"), awayVal: avgAdv(awayAdv, "usage"), fmt: (n) => (n * 100).toFixed(1) + "%" },
      ],
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-[20px] border border-white/8 bg-white/[0.025] px-5 py-3">
        <span className="text-sm font-semibold text-white/50">{aAbbr}</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25">vs</span>
        <span className="text-sm font-semibold text-white/50">{hAbbr}</span>
      </div>

      {groups.map((group) => (
        <div key={group.title} className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/35">{group.title}</div>
          <div className="space-y-0.5">
            {group.rows.map((row) => (
              <StatCompBar
                key={row.label}
                label={row.label}
                homeVal={row.homeVal}
                awayVal={row.awayVal}
                homeAbbr={hAbbr}
                awayAbbr={aAbbr}
                fmt={row.fmt}
                pct={row.pct}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Odds Tab ─────────────────────────────────────────────────────────────────

function OddsTab({
  game,
  odds,
  playerProps,
  loading,
}: {
  game: BdlGame;
  odds: BdlOdds[];
  playerProps: BdlPlayerProp[];
  loading: boolean;
}) {
  if (loading) return <InlineSpinner />;
  if (odds.length === 0 && playerProps.length === 0) {
    return <EmptyState icon={<Target className="h-10 w-10" />} message="No odds data available" />;
  }

  const primaryOdds = odds[0] ?? null;
  const homeML = primaryOdds?.home_moneyline ?? null;
  const awayML = primaryOdds?.away_moneyline ?? null;
  const homeImplied = homeML != null ? mlToImpliedProb(homeML) : null;
  const awayImplied = awayML != null ? mlToImpliedProb(awayML) : null;

  // Normalize vig
  const totalImplied = (homeImplied ?? 0) + (awayImplied ?? 0);
  const homeNorm = totalImplied > 0 && homeImplied != null ? homeImplied / totalImplied : null;
  const awayNorm = totalImplied > 0 && awayImplied != null ? awayImplied / totalImplied : null;

  return (
    <div className="space-y-4">
      {/* Current lines */}
      {primaryOdds && (
        <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Current Lines</span>
            <span className="text-xs text-white/40">{primaryOdds.bookmaker_title}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Spread", val: fmtSpread(primaryOdds.spread), sub: `${game.home_team.abbreviation} home` },
              { label: "Total (O/U)", val: primaryOdds.over_under != null ? String(primaryOdds.over_under) : "—", sub: primaryOdds.over_price != null ? `O ${fmtML(primaryOdds.over_price)} / U ${fmtML(primaryOdds.under_price)}` : "" },
              { label: `${game.home_team.abbreviation} ML`, val: fmtML(primaryOdds.home_moneyline), sub: homeImplied != null ? `${(homeImplied * 100).toFixed(1)}% implied` : "" },
              { label: `${game.visitor_team.abbreviation} ML`, val: fmtML(primaryOdds.away_moneyline), sub: awayImplied != null ? `${(awayImplied * 100).toFixed(1)}% implied` : "" },
            ].map(({ label, val, sub }) => (
              <div key={label} className="flex flex-col gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-3">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{label}</span>
                <span className="font-mono text-xl font-bold text-white">{val}</span>
                {sub && <span className="text-[10px] text-white/35">{sub}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Implied probability bar */}
      {homeNorm != null && awayNorm != null && (
        <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
          <div className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-white/35">Implied Win Probability</div>
          <div className="flex items-center gap-3">
            <span className="w-12 text-right text-xs font-semibold text-white/60">{game.visitor_team.abbreviation}</span>
            <div className="relative flex-1 overflow-hidden rounded-full bg-white/8 h-4">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-400/60 to-orange-400/30 transition-all"
                style={{ width: `${awayNorm * 100}%` }}
              />
            </div>
            <span className="w-12 text-left text-xs font-semibold text-white/60">{game.home_team.abbreviation}</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="w-12 text-right font-mono text-sm text-white">{(awayNorm * 100).toFixed(1)}%</span>
            <div className="flex-1" />
            <span className="w-12 text-left font-mono text-sm text-white">{(homeNorm * 100).toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* Multiple books */}
      {odds.length > 1 && (
        <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
          <div className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-white/35">All Books</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-white/6">
                  {["Book", "Spread", "Total", `ML ${game.home_team.abbreviation}`, `ML ${game.visitor_team.abbreviation}`].map((h) => (
                    <th key={h} className={cn("pb-2 text-[10px] font-semibold uppercase tracking-widest text-white/30", h === "Book" ? "text-left" : "text-center")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {odds.map((o) => (
                  <tr key={o.id} className="border-b border-white/4">
                    <td className="py-2 text-sm text-white/60">{o.bookmaker_title}</td>
                    <td className="py-2 text-center font-mono text-sm text-white/70">{fmtSpread(o.spread)}</td>
                    <td className="py-2 text-center font-mono text-sm text-white/70">{o.over_under ?? "—"}</td>
                    <td className="py-2 text-center"><MlDisplay ml={o.home_moneyline} /></td>
                    <td className="py-2 text-center"><MlDisplay ml={o.away_moneyline} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Player props */}
      {playerProps.length > 0 && (
        <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
          <div className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-white/35">Player Props</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-white/6">
                  {["Player", "Stat", "Line", "Over", "Under", "Book"].map((h) => (
                    <th key={h} className={cn("pb-2 text-[10px] font-semibold uppercase tracking-widest text-white/30", h === "Player" ? "text-left" : "text-center")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {playerProps.map((prop) => (
                  <tr key={prop.id} className="border-b border-white/4 hover:bg-white/[0.02]">
                    <td className="py-2">
                      <div className="text-sm text-white/70">{prop.player.first_name[0]}. {prop.player.last_name}</div>
                      <div className="text-[10px] text-white/30">{prop.team.abbreviation}</div>
                    </td>
                    <td className="py-2 text-center">
                      <span className="rounded bg-white/8 px-2 py-0.5 text-[11px] font-semibold uppercase text-white/50">{prop.stat}</span>
                    </td>
                    <td className="py-2 text-center font-mono text-sm text-white">{prop.line_score}</td>
                    <td className="py-2 text-center"><MlDisplay ml={prop.over_price} /></td>
                    <td className="py-2 text-center"><MlDisplay ml={prop.under_price} /></td>
                    <td className="py-2 text-center text-xs text-white/35">{prop.bookmaker}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── H2H Tab ──────────────────────────────────────────────────────────────────

function H2HTab({
  game,
  h2hGames,
  loading,
}: {
  game: BdlGame;
  h2hGames: BdlGame[];
  loading: boolean;
}) {
  if (loading) return <InlineSpinner />;
  if (h2hGames.length === 0) {
    return <EmptyState icon={<Crosshair className="h-10 w-10" />} message="No H2H history found" />;
  }

  const finishedGames = h2hGames.filter((g) => isGameFinished(g.status));
  const homeWins = finishedGames.filter((g) => {
    const isHome = g.home_team.id === game.home_team.id;
    return isHome
      ? g.home_team_score > g.visitor_team_score
      : g.visitor_team_score > g.home_team_score;
  }).length;
  const awayWins = finishedGames.filter((g) => {
    const isAway = g.visitor_team.id === game.visitor_team.id || g.home_team.id === game.visitor_team.id;
    const vsHome = g.home_team.id === game.visitor_team.id;
    return vsHome
      ? g.home_team_score > g.visitor_team_score
      : g.visitor_team_score > g.home_team_score;
  }).length;
  const total = homeWins + awayWins;
  const homeWinPct = total > 0 ? homeWins / total : 0.5;

  const avgHomeScore = finishedGames.length > 0
    ? finishedGames.reduce((acc, g) => {
        const s = g.home_team.id === game.home_team.id ? g.home_team_score : g.visitor_team_score;
        return acc + s;
      }, 0) / finishedGames.length
    : 0;
  const avgAwayScore = finishedGames.length > 0
    ? finishedGames.reduce((acc, g) => {
        const s = g.visitor_team.id === game.visitor_team.id ? g.visitor_team_score : g.home_team_score;
        return acc + s;
      }, 0) / finishedGames.length
    : 0;

  const recent = [...finishedGames]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-4">
      {/* Big record */}
      <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
        <div className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-white/35">All-Time H2H Record ({finishedGames.length} games)</div>
        <div className="flex items-center justify-center gap-8">
          <div className="flex flex-col items-center gap-1">
            <TeamAvatar abbr={game.home_team.abbreviation} size="md" />
            <span className="font-mono text-4xl font-bold text-white">{homeWins}</span>
            <span className="text-[11px] text-white/40">{game.home_team.name}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl text-white/15">vs</span>
            <span className="text-[10px] text-white/25">avg pts</span>
            <span className="font-mono text-sm text-white/50">{avgHomeScore.toFixed(1)}–{avgAwayScore.toFixed(1)}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <TeamAvatar abbr={game.visitor_team.abbreviation} size="md" />
            <span className="font-mono text-4xl font-bold text-white">{awayWins}</span>
            <span className="text-[11px] text-white/40">{game.visitor_team.name}</span>
          </div>
        </div>
        {/* Win pct bar */}
        <div className="mt-5">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/8">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-400/70 to-sky-400/40 transition-all"
              style={{ width: `${homeWinPct * 100}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-white/30">
            <span>{(homeWinPct * 100).toFixed(0)}% {game.home_team.abbreviation}</span>
            <span>{((1 - homeWinPct) * 100).toFixed(0)}% {game.visitor_team.abbreviation}</span>
          </div>
        </div>
      </div>

      {/* Recent meetings */}
      <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
        <div className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-white/35">Recent Meetings</div>
        <div className="space-y-1.5">
          {recent.map((g) => {
            const homeTeam = g.home_team;
            const awayTeam = g.visitor_team;
            const homeWon = g.home_team_score > g.visitor_team_score;
            const winnerAbbr = homeWon ? homeTeam.abbreviation : awayTeam.abbreviation;
            const isOurHome = g.home_team.id === game.home_team.id;
            return (
              <div key={g.id} className="flex items-center gap-3 rounded-xl border border-white/4 bg-white/[0.015] px-3 py-2.5">
                <span className="w-20 shrink-0 text-[11px] text-white/35">
                  {new Date(g.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                </span>
                <div className="flex flex-1 items-center gap-2">
                  <span className="text-xs text-white/50">{awayTeam.abbreviation}</span>
                  <span className="text-[10px] text-white/25">@</span>
                  <span className="text-xs text-white/50">{homeTeam.abbreviation}</span>
                </div>
                <span className="font-mono text-sm font-bold text-white">
                  {g.visitor_team_score}–{g.home_team_score}
                </span>
                <span className={cn(
                  "w-16 text-right text-[11px] font-semibold",
                  (isOurHome && homeWon) || (!isOurHome && !homeWon) ? "text-emerald-300" : "text-red-300/70"
                )}>
                  {winnerAbbr} W
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Trends Tab ───────────────────────────────────────────────────────────────

function TrendsTab({
  game,
  homeGames,
  awayGames,
  standings,
  loading,
}: {
  game: BdlGame;
  homeGames: BdlGame[];
  awayGames: BdlGame[];
  standings: BdlStanding[];
  loading: boolean;
}) {
  if (loading) return <InlineSpinner />;

  function TeamTrends({ teamId, games, abbr }: { teamId: number; games: BdlGame[]; abbr: string }) {
    const standing = getStanding(standings, teamId);
    const form = getRecentForm(games, teamId);
    const daysSince = daysSinceLastGame(games, teamId);
    const isB2B = daysSince != null && daysSince <= 1;

    const recentFive = [...games]
      .filter((g) => isGameFinished(g.status))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    return (
      <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
        <div className="mb-4 flex items-center gap-2">
          <TeamAvatar abbr={abbr} size="sm" />
          <span className="font-bold text-white">{abbr}</span>
          {isB2B && (
            <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
              B2B
            </span>
          )}
        </div>

        {standing ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Record", val: `${standing.wins ?? 0}-${standing.losses ?? 0}` },
                { label: "Win%", val: ((standing.win_percentage ?? standing.win_pct ?? ((standing.wins ?? 0) / Math.max((standing.wins ?? 0) + (standing.losses ?? 0), 1))) * 100).toFixed(1) + "%" },
                { label: "Conf Rank", val: `#${standing.conference_rank ?? standing.division_rank ?? "—"} ${standing.conference ?? ""}` },
                { label: "Streak", val: String(standing.streak ?? standing.current_streak ?? "—") },
              ].map(({ label, val }) => (
                <div key={label} className="flex flex-col gap-0.5 rounded-xl border border-white/6 bg-white/[0.02] p-2.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{label}</span>
                  <span className="font-mono text-sm font-bold text-white">{val}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Home", val: standing.home_record ?? "—" },
                { label: "Away", val: standing.visitor_record ?? standing.road_record ?? "—" },
                { label: "Last 10", val: standing.last_10_record ?? "—" },
              ].map(({ label, val }) => (
                <div key={label} className="flex flex-col gap-0.5 rounded-xl border border-white/6 bg-white/[0.02] p-2.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{label}</span>
                  <span className="font-mono text-sm text-white">{val}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5 rounded-xl border border-white/6 bg-white/[0.02] p-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">PPG</span>
                <span className="font-mono text-sm text-white">{standing.points_per_game?.toFixed(1) ?? "—"}</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-xl border border-white/6 bg-white/[0.02] p-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Opp PPG</span>
                <span className="font-mono text-sm text-white">{standing.opponent_points_per_game?.toFixed(1) ?? "—"}</span>
              </div>
            </div>

            {daysSince != null && (
              <div className="flex items-center gap-2 rounded-xl border border-white/6 bg-white/[0.02] p-2.5">
                <Clock3 className="h-3.5 w-3.5 text-white/30" />
                <span className="text-xs text-white/50">
                  {daysSince === 0 ? "Played today" : `${daysSince}d since last game`}
                  {isB2B ? " — back-to-back" : ""}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-white/30">No standings data</div>
        )}

        {form.length > 0 && (
          <div className="mt-4 border-t border-white/6 pt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/30">Last 5 Results</div>
            <div className="flex gap-1.5">
              {form.map((f, i) => <FormPip key={i} won={f.won} opp={f.opp} score={f.score} />)}
            </div>
          </div>
        )}

        {recentFive.length > 0 && (
          <div className="mt-4 border-t border-white/6 pt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/30">Recent Games</div>
            <div className="space-y-1">
              {recentFive.map((g) => {
                const isHome = g.home_team.id === teamId;
                const teamScore = isHome ? g.home_team_score : g.visitor_team_score;
                const oppScore = isHome ? g.visitor_team_score : g.home_team_score;
                const opp = isHome ? g.visitor_team.abbreviation : g.home_team.abbreviation;
                const won = teamScore > oppScore;
                return (
                  <div key={g.id} className="flex items-center justify-between rounded border border-white/4 bg-white/[0.01] px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-4 text-xs font-bold", won ? "text-emerald-400" : "text-red-400/70")}>
                        {won ? "W" : "L"}
                      </span>
                      <span className="text-[11px] text-white/45">
                        {isHome ? "vs" : "@"} {opp}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-white/60">{teamScore}–{oppScore}</span>
                    <span className="text-[10px] text-white/25">
                      {new Date(g.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TeamTrends teamId={game.visitor_team.id} games={awayGames} abbr={game.visitor_team.abbreviation} />
      <TeamTrends teamId={game.home_team.id} games={homeGames} abbr={game.home_team.abbreviation} />
    </div>
  );
}

// ─── Injuries Tab ─────────────────────────────────────────────────────────────

function InjuriesTab({
  game,
  injuries,
  loading,
}: {
  game: BdlGame;
  injuries: BdlInjury[];
  loading: boolean;
}) {
  if (loading) return <InlineSpinner />;

  function statusColor(status: string): string {
    switch (status) {
      case "Out": return "text-red-400";
      case "Doubtful": return "text-orange-400";
      case "Questionable": return "text-yellow-400";
      default: return "text-white/50";
    }
  }

  function TeamInjuries({ teamId, teamName }: { teamId: number; teamName: string }) {
    const teamInjuries = injuries.filter((i) => i.team.id === teamId);
    return (
      <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
        <div className="mb-4 text-sm font-bold text-white">{teamName}</div>
        {teamInjuries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/6">
                  {["Player", "Pos", "Status", "Description"].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        "pb-2 text-[10px] font-semibold uppercase tracking-widest text-white/30",
                        h === "Player" || h === "Description" ? "text-left" : "text-center"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teamInjuries.map((inj, i) => (
                  <tr key={i} className="border-b border-white/4 hover:bg-white/[0.015]">
                    <td className="py-2 text-sm text-white/70">
                      {inj.player.first_name} {inj.player.last_name}
                    </td>
                    <td className="py-2 text-center">
                      <span className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[10px] text-white/45">
                        {inj.player.position || "—"}
                      </span>
                    </td>
                    <td className="py-2 text-center">
                      <span className={cn("text-xs font-semibold", statusColor(inj.status))}>
                        {inj.status}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-white/40 max-w-[200px] truncate">
                      {inj.description ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-4 text-sm text-white/25">
            <Shield className="h-4 w-4" />
            No injuries reported
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TeamInjuries teamId={game.visitor_team.id} teamName={game.visitor_team.full_name} />
      <TeamInjuries teamId={game.home_team.id} teamName={game.home_team.full_name} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NBAGameDetailPage({ gameId }: { gameId: string }) {
  const [boxScore, setBoxScore] = useState<BdlBoxScore | null>(null);
  const [fallbackGame, setFallbackGame] = useState<BdlGame | null>(null);
  const [plays, setPlays] = useState<BdlPlay[]>([]);
  const [odds, setOdds] = useState<BdlOdds[]>([]);
  const [injuries, setInjuries] = useState<BdlInjury[]>([]);
  const [standings, setStandings] = useState<BdlStanding[]>([]);
  const [homeGames, setHomeGames] = useState<BdlGame[]>([]);
  const [awayGames, setAwayGames] = useState<BdlGame[]>([]);
  const [h2hGames, setH2hGames] = useState<BdlGame[]>([]);
  const [advancedStats, setAdvancedStats] = useState<BdlAdvancedStat[]>([]);
  const [playerProps, setPlayerProps] = useState<BdlPlayerProp[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(new Date());
  const [playFilter, setPlayFilter] = useState<PlayFilter>("all");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondaryFetchedRef = useRef(false);

  const game = boxScore?.game ?? fallbackGame ?? null;
  const live = game != null && isGameLive(game.status);

  const fetchPrimary = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setSyncing(true);
    try {
      const [bsRes, plRes, gameRes] = await Promise.all([
        fetch(`/api/balldontlie/nba/boxscore?game_id=${gameId}`, { cache: "no-store" }),
        fetch(`/api/balldontlie/nba/plays?game_id=${gameId}`, { cache: "no-store" }),
        fetch(`/api/balldontlie/nba/game/${gameId}`, { cache: "no-store" }),
      ]);
      if (bsRes.ok) {
        const bsJson = await bsRes.json() as { data: BdlBoxScore[] };
        setBoxScore(bsJson.data?.[0] ?? null);
      }
      if (plRes.ok) {
        const plJson = await plRes.json() as { data: BdlPlay[] };
        setPlays(plJson.data ?? []);
      }
      // Always fetch basic game data as fallback when box scores require higher tier
      if (gameRes.ok) {
        const gJson = await gameRes.json() as { data: BdlGame };
        if (gJson.data) setFallbackGame(gJson.data);
      }
      setLastSynced(new Date());
      if (!quiet) setError(null);
    } catch (e) {
      if (!quiet) setError("Failed to load game data.");
    } finally {
      if (!quiet) setLoading(false);
      setSyncing(false);
    }
  }, [gameId]);

  const fetchSecondary = useCallback(async (homeId: number, awayId: number, gId: number) => {
    setSecondaryLoading(true);
    try {
      const [oddsRes, injRes, standRes, hGamesRes, aGamesRes, h2hRes, advRes, propsRes] = await Promise.all([
        fetch(`/api/balldontlie/nba/odds?game_id=${gId}`, { cache: "no-store" }),
        fetch(`/api/balldontlie/nba/injuries?team_ids=${homeId},${awayId}`, { cache: "no-store" }),
        fetch(`/api/balldontlie/nba/standings?season=2024`, { cache: "no-store" }),
        fetch(`/api/balldontlie/nba/team-games?team_id=${homeId}&season=2024`, { cache: "no-store" }),
        fetch(`/api/balldontlie/nba/team-games?team_id=${awayId}&season=2024`, { cache: "no-store" }),
        fetch(`/api/balldontlie/nba/h2h-games?team1_id=${homeId}&team2_id=${awayId}`, { cache: "no-store" }),
        fetch(`/api/balldontlie/nba/advanced-stats?game_id=${gId}`, { cache: "no-store" }),
        fetch(`/api/balldontlie/nba/player-props?game_id=${gId}`, { cache: "no-store" }),
      ]);

      if (oddsRes.ok) {
        const j = await oddsRes.json() as { data: BdlOdds[] };
        setOdds(j.data ?? []);
      }
      if (injRes.ok) {
        const j = await injRes.json() as { data: BdlInjury[] };
        setInjuries(j.data ?? []);
      }
      if (standRes.ok) {
        const j = await standRes.json() as { data: BdlStanding[] };
        setStandings(j.data ?? []);
      }
      if (hGamesRes.ok) {
        const j = await hGamesRes.json() as { data: BdlGame[] };
        setHomeGames(j.data ?? []);
      }
      if (aGamesRes.ok) {
        const j = await aGamesRes.json() as { data: BdlGame[] };
        setAwayGames(j.data ?? []);
      }
      if (h2hRes.ok) {
        const j = await h2hRes.json() as { data: BdlGame[] };
        setH2hGames(j.data ?? []);
      }
      if (advRes.ok) {
        const j = await advRes.json() as { data: BdlAdvancedStat[] };
        setAdvancedStats(j.data ?? []);
      }
      if (propsRes.ok) {
        const j = await propsRes.json() as { data: BdlPlayerProp[] };
        setPlayerProps(j.data ?? []);
      }
    } finally {
      setSecondaryLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchPrimary(false);
  }, [fetchPrimary]);

  // Trigger secondary fetch from ANY game data — boxScore or fallback
  useEffect(() => {
    if (secondaryFetchedRef.current) return;
    const g = boxScore?.game ?? fallbackGame;
    if (!g) return;
    secondaryFetchedRef.current = true;
    fetchSecondary(g.home_team.id, g.visitor_team.id, g.id);
  }, [boxScore, fallbackGame, fetchSecondary]);

  // Live polling
  useEffect(() => {
    if (live) {
      intervalRef.current = setInterval(() => {
        fetchPrimary(true);
      }, 30000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [live, fetchPrimary]);

  const handleRefresh = useCallback(() => {
    fetchPrimary(true);
    if (game) {
      fetchSecondary(game.home_team.id, game.visitor_team.id, game.id);
    }
  }, [fetchPrimary, fetchSecondary, game]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-white/40">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">Loading game data…</span>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-white/40">
        <AlertCircle className="h-8 w-8" />
        <span className="text-sm">{error ?? "Game not found"}</span>
        <button
          onClick={() => fetchPrimary(false)}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/60 transition-colors hover:bg-white/[0.08]"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero */}
      <GameHero
        game={game}
        boxScore={boxScore}
        odds={odds}
        standings={standings}
        syncing={syncing}
        lastSynced={lastSynced}
        onRefresh={handleRefresh}
      />

      {/* Tab bar */}
      <TabBar active={activeTab} onChange={setActiveTab} live={live} />

      {/* Tab content */}
      <div>
        {activeTab === "overview" && (
          <OverviewTab
            game={game}
            boxScore={boxScore}
            plays={plays}
            odds={odds}
            homeGames={homeGames}
            awayGames={awayGames}
            h2hGames={h2hGames}
            injuries={injuries}
            secondaryLoading={secondaryLoading}
          />
        )}
        {activeTab === "boxscore" && <BoxScoreTab boxScore={boxScore} />}
        {activeTab === "plays" && (
          <PlaysTab
            plays={plays}
            game={game}
            playFilter={playFilter}
            setPlayFilter={setPlayFilter}
          />
        )}
        {activeTab === "teamstats" && (
          <TeamStatsTab game={game} boxScore={boxScore} advancedStats={advancedStats} />
        )}
        {activeTab === "odds" && (
          <OddsTab
            game={game}
            odds={odds}
            playerProps={playerProps}
            loading={secondaryLoading}
          />
        )}
        {activeTab === "h2h" && (
          <H2HTab game={game} h2hGames={h2hGames} loading={secondaryLoading} />
        )}
        {activeTab === "trends" && (
          <TrendsTab
            game={game}
            homeGames={homeGames}
            awayGames={awayGames}
            standings={standings}
            loading={secondaryLoading}
          />
        )}
        {activeTab === "injuries" && (
          <InjuriesTab game={game} injuries={injuries} loading={secondaryLoading} />
        )}
      </div>
    </div>
  );
}
