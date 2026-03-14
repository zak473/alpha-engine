"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, RefreshCw, Loader2, Trophy, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BdlGame,
  BdlBoxScore,
  BdlPlay,
  BdlPlayerBoxScore,
  BdlTeamBoxScore,
  getNBABoxScore,
  getNBAPlays,
  calcTeamTotals,
  isDNP,
  parseMins,
  fmtShotLine,
  fmtShotPct,
  getClockDisplay,
  getPeriodLabel,
  isGameLive,
  isGameFinished,
  isGameScheduled,
} from "@/lib/balldontlie";

type Tab = "boxscore" | "plays";

// ─── Micro components ─────────────────────────────────────────────────────

function LivePulse() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
    </span>
  );
}

function TeamAvatar({ abbr, size = 48 }: { abbr: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] font-bold text-white/80"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.27) }}
    >
      {abbr.slice(0, 3)}
    </div>
  );
}

// ─── Scoreboard hero ──────────────────────────────────────────────────────

function ScoreboardHero({ game }: { game: BdlGame }) {
  const live = isGameLive(game.status);
  const finished = isGameFinished(game.status);
  const homeLeading = game.home_team_score > game.visitor_team_score;
  const awayLeading = game.visitor_team_score > game.home_team_score;

  const periods = [
    { label: "Q1", home: game.home_q1, away: game.visitor_q1 },
    { label: "Q2", home: game.home_q2, away: game.visitor_q2 },
    { label: "Q3", home: game.home_q3, away: game.visitor_q3 },
    { label: "Q4", home: game.home_q4, away: game.visitor_q4 },
  ];
  if (game.home_ot1 != null || game.visitor_ot1 != null) {
    periods.push({ label: "OT", home: game.home_ot1, away: game.visitor_ot1 });
  }
  const hasQuarters = periods.some((p) => p.home != null || p.away != null);

  return (
    <div className="border-b border-white/8 p-5">
      {/* Status */}
      <div className="mb-5 flex items-center justify-center gap-2.5">
        {live ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-300">
              <LivePulse />
              Live
            </span>
            <span className="font-mono text-[13px] font-medium text-emerald-200">
              {getClockDisplay(game)}
            </span>
          </>
        ) : finished ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-white/50">
            <Trophy size={10} />
            Final
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-white/50">
            {getPeriodLabel(game)}
          </span>
        )}
        {game.postseason && (
          <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-amber-300">
            Playoffs
          </span>
        )}
      </div>

      {/* Teams + Score */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 flex-col items-center gap-2">
          <TeamAvatar abbr={game.home_team.abbreviation} size={52} />
          <div className="text-center">
            <div className="text-[11px] text-white/45">{game.home_team.city}</div>
            <div className="font-semibold text-white">{game.home_team.name}</div>
          </div>
        </div>

        {isGameScheduled(game.status) ? (
          <div className="flex flex-col items-center gap-1">
            <div className="text-2xl font-bold text-white/40">vs</div>
            <div className="text-[11px] text-white/35">{getPeriodLabel(game)}</div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-baseline gap-3 font-mono font-bold tabular-nums">
              <span
                className={cn(
                  "text-5xl tracking-tight",
                  homeLeading ? "text-white" : "text-white/40"
                )}
              >
                {game.home_team_score}
              </span>
              <span className="text-xl text-white/20">–</span>
              <span
                className={cn(
                  "text-5xl tracking-tight",
                  awayLeading ? "text-white" : "text-white/40"
                )}
              >
                {game.visitor_team_score}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-1 flex-col items-center gap-2">
          <TeamAvatar abbr={game.visitor_team.abbreviation} size={52} />
          <div className="text-center">
            <div className="text-[11px] text-white/45">{game.visitor_team.city}</div>
            <div className="font-semibold text-white">{game.visitor_team.name}</div>
          </div>
        </div>
      </div>

      {/* Quarter scores */}
      {hasQuarters && (
        <div className="mt-5 overflow-x-auto rounded-xl border border-white/6 bg-white/[0.025]">
          <table className="w-full text-center" style={{ borderCollapse: "separate" }}>
            <thead>
              <tr className="border-b border-white/6">
                <th className="py-2 pl-4 text-left text-[10px] uppercase tracking-widest text-white/30">
                  Team
                </th>
                {periods.map((p) => (
                  <th
                    key={p.label}
                    className="min-w-[3rem] px-2 py-2 text-[10px] uppercase tracking-widest text-white/30"
                  >
                    {p.label}
                  </th>
                ))}
                <th className="min-w-[3rem] px-2 py-2 pr-4 text-[10px] uppercase tracking-widest text-white/30">
                  T
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/[0.04]">
                <td className="py-2.5 pl-4 text-left text-[11px] font-bold text-white">
                  {game.home_team.abbreviation}
                </td>
                {periods.map((p, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-2 py-2.5 font-mono text-[13px]",
                      p.home != null && p.away != null
                        ? p.home > p.away
                          ? "font-bold text-white"
                          : "text-white/50"
                        : "text-white/20"
                    )}
                  >
                    {p.home ?? "–"}
                  </td>
                ))}
                <td className="px-2 py-2.5 pr-4 font-mono text-[13px] font-bold text-white">
                  {game.home_team_score}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pl-4 text-left text-[11px] font-bold text-white">
                  {game.visitor_team.abbreviation}
                </td>
                {periods.map((p, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-2 py-2.5 font-mono text-[13px]",
                      p.home != null && p.away != null
                        ? p.away > p.home
                          ? "font-bold text-white"
                          : "text-white/50"
                        : "text-white/20"
                    )}
                  >
                    {p.away ?? "–"}
                  </td>
                ))}
                <td className="px-2 py-2.5 pr-4 font-mono text-[13px] font-bold text-white">
                  {game.visitor_team_score}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Live: timeout + bonus context */}
      {live &&
        (game.home_timeouts_remaining != null ||
          game.visitor_timeouts_remaining != null) && (
          <div className="mt-3 flex items-center justify-between text-[11px] text-white/40">
            <span>
              {game.home_team.abbreviation} · {game.home_timeouts_remaining ?? "?"} TO
              {game.home_in_bonus ? (
                <span className="ml-2 text-amber-300/80">In Bonus</span>
              ) : null}
            </span>
            <span>
              {game.visitor_team.abbreviation} · {game.visitor_timeouts_remaining ?? "?"} TO
              {game.visitor_in_bonus ? (
                <span className="ml-2 text-amber-300/80">In Bonus</span>
              ) : null}
            </span>
          </div>
        )}
    </div>
  );
}

// ─── Player box score table ───────────────────────────────────────────────

function PlayerBoxScoreTable({
  teamBox,
  label,
}: {
  teamBox: BdlTeamBoxScore;
  label: string;
}) {
  const sorted = [...teamBox.players].sort((a, b) => {
    if (isDNP(a) && !isDNP(b)) return 1;
    if (!isDNP(a) && isDNP(b)) return -1;
    const mDiff = parseMins(b.min) - parseMins(a.min);
    if (Math.abs(mDiff) > 0.3) return mDiff;
    return (b.pts ?? 0) - (a.pts ?? 0);
  });

  const totals = calcTeamTotals(teamBox.players);
  const maxPts = Math.max(...sorted.filter((p) => !isDNP(p)).map((p) => p.pts ?? 0), 0);

  const fmtN = (n: number | null) => (n == null ? "—" : String(n));

  const COLS = ["MIN", "PTS", "REB", "AST", "STL", "BLK", "TO", "FG", "3PT", "FT", "+/-"];

  return (
    <div className="mb-8">
      {/* Team header */}
      <div
        className="sticky top-[49px] z-10 flex items-end justify-between px-1 pb-2 pt-3"
        style={{ background: "var(--drawer-bg, #0a1810)" }}
      >
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">
          {label}
        </div>
        <div className="text-[10px] text-white/30">
          {fmtShotLine(totals.fgm, totals.fga)} FG ({fmtShotPct(totals.fgm, totals.fga)}) ·{" "}
          {fmtShotLine(totals.fg3m, totals.fg3a)} 3PT · {totals.reb} REB ·{" "}
          {totals.ast} AST · {totals.turnover} TO
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/6">
        <table className="w-full min-w-[680px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.025)" }}>
              <th
                className="sticky left-0 z-10 py-2 pl-3 pr-3 text-left text-[9px] uppercase tracking-[0.2em] text-white/35"
                style={{ background: "rgba(255,255,255,0.025)" }}
              >
                Player
              </th>
              {COLS.map((h) => (
                <th
                  key={h}
                  className={cn(
                    "px-1.5 py-2 text-right text-[9px] uppercase tracking-[0.2em]",
                    ["PTS", "REB", "AST"].includes(h) ? "text-white/55" : "text-white/30"
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const dnp = isDNP(p);
              const isTopScorer = !dnp && (p.pts ?? 0) === maxPts && maxPts > 0;
              return (
                <tr
                  key={p.player.id}
                  className={cn(
                    "border-t border-white/[0.04] transition-colors hover:bg-white/[0.025]",
                    dnp && "opacity-30"
                  )}
                >
                  {/* Player name — sticky */}
                  <td
                    className="sticky left-0 z-10 py-2.5 pl-3 pr-3"
                    style={{ background: "var(--drawer-bg, #0a1810)" }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "text-[12px] font-semibold",
                          isTopScorer ? "text-emerald-300" : "text-white"
                        )}
                      >
                        {p.player.first_name[0]}. {p.player.last_name}
                      </span>
                      {p.player.position && (
                        <span className="text-[9px] text-white/30">{p.player.position}</span>
                      )}
                    </div>
                  </td>
                  {/* MIN */}
                  <td className="px-1.5 py-2.5 text-right font-mono text-[11px] text-white/40">
                    {dnp ? "DNP" : (p.min ?? "—")}
                  </td>
                  {/* PTS */}
                  <td
                    className={cn(
                      "px-1.5 py-2.5 text-right font-mono text-[13px] font-bold",
                      (p.pts ?? 0) >= 30
                        ? "text-emerald-300"
                        : (p.pts ?? 0) >= 20
                        ? "text-emerald-400/90"
                        : "text-white"
                    )}
                  >
                    {fmtN(p.pts)}
                  </td>
                  {/* REB */}
                  <td className="px-1.5 py-2.5 text-right font-mono text-[12px] text-white/80">
                    {fmtN(p.reb)}
                  </td>
                  {/* AST */}
                  <td className="px-1.5 py-2.5 text-right font-mono text-[12px] text-white/80">
                    {fmtN(p.ast)}
                  </td>
                  {/* STL */}
                  <td className="px-1.5 py-2.5 text-right font-mono text-[12px] text-white/55">
                    {fmtN(p.stl)}
                  </td>
                  {/* BLK */}
                  <td className="px-1.5 py-2.5 text-right font-mono text-[12px] text-white/55">
                    {fmtN(p.blk)}
                  </td>
                  {/* TO */}
                  <td className={cn(
                    "px-1.5 py-2.5 text-right font-mono text-[12px]",
                    (p.turnover ?? 0) >= 4 ? "text-red-400/80" : "text-white/55"
                  )}>
                    {fmtN(p.turnover)}
                  </td>
                  {/* FG */}
                  <td className="px-1.5 py-2.5 text-right font-mono text-[11px] text-white/65">
                    {dnp ? "—" : fmtShotLine(p.fgm, p.fga)}
                  </td>
                  {/* 3PT */}
                  <td className="px-1.5 py-2.5 text-right font-mono text-[11px] text-white/65">
                    {dnp ? "—" : fmtShotLine(p.fg3m, p.fg3a)}
                  </td>
                  {/* FT */}
                  <td className="px-1.5 py-2.5 text-right font-mono text-[11px] text-white/65">
                    {dnp ? "—" : fmtShotLine(p.ftm, p.fta)}
                  </td>
                  {/* +/- */}
                  <td
                    className={cn(
                      "px-1.5 py-2.5 pr-3 text-right font-mono text-[12px] font-semibold",
                      p.plus_minus_points == null
                        ? "text-white/25"
                        : p.plus_minus_points > 0
                        ? "text-emerald-400"
                        : p.plus_minus_points < 0
                        ? "text-red-400"
                        : "text-white/40"
                    )}
                  >
                    {p.plus_minus_points == null
                      ? "—"
                      : (p.plus_minus_points > 0 ? "+" : "") + p.plus_minus_points}
                  </td>
                </tr>
              );
            })}

            {/* Team totals */}
            <tr className="border-t-2 border-white/10" style={{ background: "rgba(255,255,255,0.025)" }}>
              <td
                className="sticky left-0 z-10 py-2.5 pl-3 pr-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40"
                style={{ background: "rgba(255,255,255,0.025)" }}
              >
                Totals
              </td>
              <td className="px-1.5 py-2.5 text-right font-mono text-[11px] text-white/30">—</td>
              <td className="px-1.5 py-2.5 text-right font-mono text-[13px] font-bold text-white">
                {totals.pts}
              </td>
              <td className="px-1.5 py-2.5 text-right font-mono text-[12px] font-semibold text-white/80">
                {totals.reb}
              </td>
              <td className="px-1.5 py-2.5 text-right font-mono text-[12px] font-semibold text-white/80">
                {totals.ast}
              </td>
              <td className="px-1.5 py-2.5 text-right font-mono text-[12px] text-white/55">
                {totals.stl}
              </td>
              <td className="px-1.5 py-2.5 text-right font-mono text-[12px] text-white/55">
                {totals.blk}
              </td>
              <td className="px-1.5 py-2.5 text-right font-mono text-[12px] text-white/55">
                {totals.turnover}
              </td>
              <td className="px-1.5 py-2.5 text-right font-mono text-[11px] text-white/65">
                <span className="font-semibold">{fmtShotLine(totals.fgm, totals.fga)}</span>
                <span className="ml-1 text-[10px] text-white/30">
                  {fmtShotPct(totals.fgm, totals.fga)}
                </span>
              </td>
              <td className="px-1.5 py-2.5 text-right font-mono text-[11px] text-white/65">
                <span className="font-semibold">{fmtShotLine(totals.fg3m, totals.fg3a)}</span>
                <span className="ml-1 text-[10px] text-white/30">
                  {fmtShotPct(totals.fg3m, totals.fg3a)}
                </span>
              </td>
              <td className="px-1.5 py-2.5 text-right font-mono text-[11px] text-white/65">
                <span className="font-semibold">{fmtShotLine(totals.ftm, totals.fta)}</span>
                <span className="ml-1 text-[10px] text-white/30">
                  {fmtShotPct(totals.ftm, totals.fta)}
                </span>
              </td>
              <td className="px-1.5 py-2.5 pr-3 text-right font-mono text-[12px] text-white/25">
                —
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Plays log ────────────────────────────────────────────────────────────

function PlaysLog({ plays, game }: { plays: BdlPlay[]; game: BdlGame }) {
  if (!plays.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Radio size={28} className="text-white/25" />
        <div className="mt-4 text-sm font-semibold text-white/45">No play-by-play data yet</div>
        <div className="mt-1 text-xs text-white/30">
          Plays will appear once the game is in progress
        </div>
      </div>
    );
  }

  const reversed = [...plays].reverse();

  return (
    <div className="divide-y divide-white/[0.04]">
      {reversed.map((play) => {
        const isHome = play.team_id === game.home_team.id;
        const isAway = play.team_id === game.visitor_team.id;
        const teamAbbr = isHome
          ? game.home_team.abbreviation
          : isAway
          ? game.visitor_team.abbreviation
          : null;
        const isScore =
          /makes|scores|\d+ PTS/i.test(play.description) && play.team_id != null;

        return (
          <div
            key={play.id}
            className="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.02]"
          >
            {/* Period + clock */}
            <div className="w-14 shrink-0 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
                Q{play.period}
              </div>
              <div className="font-mono text-[11px] text-white/45">{play.clock}</div>
            </div>

            {/* Team chip */}
            <div className="w-9 shrink-0 pt-0.5">
              {teamAbbr ? (
                <span
                  className={cn(
                    "inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                    isHome
                      ? "bg-emerald-400/10 text-emerald-300"
                      : "bg-blue-400/10 text-blue-300"
                  )}
                >
                  {teamAbbr}
                </span>
              ) : (
                <span className="inline-block rounded px-1.5 py-0.5 text-[9px] text-white/20">
                  —
                </span>
              )}
            </div>

            {/* Description */}
            <div
              className={cn(
                "flex-1 text-[12px] leading-relaxed",
                isScore ? "font-medium text-white" : "text-white/55"
              )}
            >
              {play.description}
            </div>

            {/* Score at time of play */}
            <div className="shrink-0 font-mono text-[11px] text-white/35">
              {play.score_home}–{play.score_away}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main drawer ──────────────────────────────────────────────────────────

interface NBABoxScoreDrawerProps {
  game: BdlGame | null;
  onClose: () => void;
}

export function NBABoxScoreDrawer({ game, onClose }: NBABoxScoreDrawerProps) {
  const [tab, setTab] = useState<Tab>("boxscore");
  const [boxScore, setBoxScore] = useState<BdlBoxScore | null>(null);
  const [plays, setPlays] = useState<BdlPlay[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const fetchData = useCallback(async (gId: number, quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const [bs, pl] = await Promise.all([getNBABoxScore(gId), getNBAPlays(gId)]);
      setBoxScore(bs);
      setPlays(pl);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!game) {
      setBoxScore(null);
      setPlays([]);
      return;
    }
    setTab("boxscore");
    fetchData(game.id);

    if (isGameLive(game.status)) {
      const iv = setInterval(() => fetchData(game.id, true), 20_000);
      return () => clearInterval(iv);
    }
  }, [game?.id, fetchData]);

  useEffect(() => {
    if (!game) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [game, onClose]);

  if (!mounted) return null;

  const isOpen = game !== null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-250",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={cn(
          "fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-2xl flex-col transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        style={{
          background: "linear-gradient(180deg,#0b1d12 0%,#070e09 100%)",
          borderLeft: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "-32px 0 100px rgba(0,0,0,0.6)",
        }}
      >
        {game && (
          <>
            {/* Drawer header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                  {game.postseason ? "NBA Playoffs" : "NBA Regular Season"}
                </div>
                <div className="mt-0.5 truncate text-[13px] font-semibold text-white">
                  {game.home_team.full_name} vs {game.visitor_team.full_name}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {refreshing && (
                  <Loader2 size={12} className="animate-spin text-white/35" />
                )}
                <button
                  onClick={() => fetchData(game.id, true)}
                  title="Refresh"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/40 transition hover:bg-white/[0.09] hover:text-white"
                >
                  <RefreshCw size={12} />
                </button>
                <button
                  onClick={onClose}
                  title="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/40 transition hover:bg-white/[0.09] hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto" style={{ "--drawer-bg": "#07120a" } as React.CSSProperties}>
              {/* Scoreboard hero */}
              <ScoreboardHero game={game} />

              {/* Tabs */}
              <div
                className="sticky top-0 z-20 flex shrink-0 border-b border-white/8"
                style={{ background: "#0b1d12" }}
              >
                {(["boxscore", "plays"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      "flex-1 py-3.5 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors",
                      tab === t
                        ? "border-b-2 border-emerald-400 text-emerald-300"
                        : "border-b-2 border-transparent text-white/35 hover:text-white/60"
                    )}
                  >
                    {t === "boxscore" ? "Box Score" : "Recent Plays"}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <Loader2 size={28} className="animate-spin text-emerald-400" />
                  <div className="mt-4 text-sm text-white/45">Loading box score…</div>
                </div>
              ) : tab === "boxscore" ? (
                <div className="p-5">
                  {boxScore ? (
                    <>
                      <PlayerBoxScoreTable
                        teamBox={boxScore.home_team}
                        label={boxScore.home_team.team.full_name}
                      />
                      <PlayerBoxScoreTable
                        teamBox={boxScore.visitor_team}
                        label={boxScore.visitor_team.team.full_name}
                      />
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="text-4xl">📊</div>
                      <div className="mt-4 text-sm font-semibold text-white/45">
                        {isGameScheduled(game.status)
                          ? "Box score available once the game tips off"
                          : "Box score not available"}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <PlaysLog plays={plays} game={game} />
              )}
            </div>
          </>
        )}
      </div>
    </>,
    document.body
  );
}
