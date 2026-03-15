"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowRight, Clock3, Trophy } from "lucide-react";
import {
  BdlGame,
  BdlBoxScore,
  getTopScorer,
  getPeriodLabel,
  getClockDisplay,
  isGameLive,
  isGameFinished,
  isGameScheduled,
  fmtShotLine,
  calcTeamTotals,
} from "@/lib/balldontlie";

// ─── Micro components ─────────────────────────────────────────────────────

function LivePulse() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
    </span>
  );
}

function TeamAvatar({ abbr }: { abbr: string }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-xs font-bold text-white/80">
      {abbr.slice(0, 3)}
    </div>
  );
}

function QuarterBar({ game }: { game: BdlGame }) {
  const periods = [
    { label: "Q1", home: game.home_q1, away: game.visitor_q1 },
    { label: "Q2", home: game.home_q2, away: game.visitor_q2 },
    { label: "Q3", home: game.home_q3, away: game.visitor_q3 },
    { label: "Q4", home: game.home_q4, away: game.visitor_q4 },
  ];
  if (game.home_ot1 != null || game.visitor_ot1 != null) {
    periods.push({ label: "OT", home: game.home_ot1, away: game.visitor_ot1 });
  }
  if (!periods.some((p) => p.home != null || p.away != null)) return null;

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-center" style={{ borderCollapse: "separate" }}>
        <thead>
          <tr>
            <th className="w-20 py-1 text-left text-[10px] uppercase tracking-widest text-white/30">
              Team
            </th>
            {periods.map((p) => (
              <th
                key={p.label}
                className="min-w-[2.5rem] py-1 text-[10px] uppercase tracking-widest text-white/30"
              >
                {p.label}
              </th>
            ))}
            <th className="min-w-[2.5rem] py-1 text-[10px] uppercase tracking-widest text-white/30">
              T
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-1 text-left text-[11px] font-semibold text-white">
              {game.home_team.abbreviation}
            </td>
            {periods.map((p, i) => (
              <td
                key={i}
                className={cn(
                  "py-1 font-mono text-[12px]",
                  p.home != null && p.away != null
                    ? p.home > p.away
                      ? "font-bold text-white"
                      : "text-white/45"
                    : "text-white/20"
                )}
              >
                {p.home ?? "–"}
              </td>
            ))}
            <td className="py-1 font-mono text-[13px] font-bold text-white">
              {game.home_team_score}
            </td>
          </tr>
          <tr>
            <td className="py-1 text-left text-[11px] font-semibold text-white">
              {game.visitor_team.abbreviation}
            </td>
            {periods.map((p, i) => (
              <td
                key={i}
                className={cn(
                  "py-1 font-mono text-[12px]",
                  p.home != null && p.away != null
                    ? p.away > p.home
                      ? "font-bold text-white"
                      : "text-white/45"
                    : "text-white/20"
                )}
              >
                {p.away ?? "–"}
              </td>
            ))}
            <td className="py-1 font-mono text-[13px] font-bold text-white">
              {game.visitor_team_score}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────

interface NBALiveGameCardProps {
  game: BdlGame;
  boxScore?: BdlBoxScore | null;
  onClick?: () => void;
}

export function NBALiveGameCard({ game, boxScore, onClick }: NBALiveGameCardProps) {
  const live = isGameLive(game.status);
  const finished = isGameFinished(game.status);
  const scheduled = isGameScheduled(game.status);

  const homeTop = boxScore ? getTopScorer(boxScore.home_team) : null;
  const awayTop = boxScore ? getTopScorer(boxScore.visitor_team) : null;
  const homeTotals = boxScore ? calcTeamTotals(boxScore.home_team.players) : null;
  const awayTotals = boxScore ? calcTeamTotals(boxScore.visitor_team.players) : null;

  const homeLeading = game.home_team_score > game.visitor_team_score;
  const awayLeading = game.visitor_team_score > game.home_team_score;

  return (
    <Link
      href={`/sports/basketball/matches/${game.id}`}
      onClick={onClick}
      className={cn(
        "group block w-full rounded-[24px] border p-5 text-left transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(0,0,0,0.35)]",
        live
          ? "border-emerald-400/25 bg-[linear-gradient(160deg,rgba(54,242,143,0.08),rgba(255,255,255,0.03))] hover:border-emerald-400/40"
          : "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] hover:border-white/14"
      )}
    >
      {/* Header row */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
              <LivePulse />
              Live
            </span>
          ) : finished ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/40">
              <Trophy size={9} />
              Final
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/40">
              <Clock3 size={9} />
              {getPeriodLabel(game)}
            </span>
          )}
          {live && game.time && (
            <span className="font-mono text-[12px] font-semibold text-emerald-200/90">
              {getClockDisplay(game)}
            </span>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-widest text-white/25">
          {game.postseason ? "Playoffs" : "NBA"}
        </span>
      </div>

      {/* Scoreboard */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* Home */}
        <div className="flex items-center gap-3">
          <TeamAvatar abbr={game.home_team.abbreviation} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold leading-tight text-white">
              {game.home_team.city}
            </div>
            <div className="text-[11px] text-white/45">{game.home_team.name}</div>
          </div>
        </div>

        {/* Score */}
        <div className="flex flex-col items-center">
          {scheduled ? (
            <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-2.5 text-center">
              <div className="text-[11px] text-white/35">vs</div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-2 text-center">
              <div className="flex items-baseline gap-2 font-mono text-3xl font-bold tracking-tight tabular-nums">
                <span className={cn(homeLeading ? "text-white" : "text-white/45")}>
                  {game.home_team_score}
                </span>
                <span className="text-base text-white/20">–</span>
                <span className={cn(awayLeading ? "text-white" : "text-white/45")}>
                  {game.visitor_team_score}
                </span>
              </div>
              {live && (
                <div className="mt-0.5 font-mono text-[10px] text-emerald-300/70">
                  {getPeriodLabel(game)}
                  {game.time ? ` · ${game.time}` : ""}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Away */}
        <div className="flex items-center justify-end gap-3">
          <div className="min-w-0 text-right">
            <div className="truncate text-[13px] font-semibold leading-tight text-white">
              {game.visitor_team.city}
            </div>
            <div className="text-[11px] text-white/45">{game.visitor_team.name}</div>
          </div>
          <TeamAvatar abbr={game.visitor_team.abbreviation} />
        </div>
      </div>

      {/* Quarter scores */}
      {!scheduled && <QuarterBar game={game} />}

      {/* Team shooting summary (finished/live with data) */}
      {(homeTotals || awayTotals) && !scheduled && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-white/6 bg-white/[0.025] px-3 py-2.5">
          {homeTotals ? (
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-white/25">
                {game.home_team.abbreviation} shooting
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-white/60">
                {fmtShotLine(homeTotals.fgm, homeTotals.fga)} FG ·{" "}
                {fmtShotLine(homeTotals.fg3m, homeTotals.fg3a)} 3PT
              </div>
            </div>
          ) : <div />}
          {awayTotals ? (
            <div className="min-w-0 text-right">
              <div className="text-[10px] uppercase tracking-widest text-white/25">
                {game.visitor_team.abbreviation} shooting
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-white/60">
                {fmtShotLine(awayTotals.fgm, awayTotals.fga)} FG ·{" "}
                {fmtShotLine(awayTotals.fg3m, awayTotals.fg3a)} 3PT
              </div>
            </div>
          ) : <div />}
        </div>
      )}

      {/* Top performers */}
      {(homeTop || awayTop) && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {homeTop ? (
            <div className="rounded-xl border border-white/6 bg-white/[0.025] px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-white/25">
                {game.home_team.abbreviation} leader
              </div>
              <div className="mt-0.5 truncate text-[12px] font-semibold text-white">
                {homeTop.player.first_name[0]}. {homeTop.player.last_name}
              </div>
              <div className="font-mono text-[11px] text-emerald-300/90">
                {homeTop.pts ?? 0}pts · {homeTop.reb ?? 0}reb · {homeTop.ast ?? 0}ast
              </div>
            </div>
          ) : <div />}
          {awayTop ? (
            <div className="rounded-xl border border-white/6 bg-white/[0.025] px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-white/25">
                {game.visitor_team.abbreviation} leader
              </div>
              <div className="mt-0.5 truncate text-[12px] font-semibold text-white">
                {awayTop.player.first_name[0]}. {awayTop.player.last_name}
              </div>
              <div className="font-mono text-[11px] text-emerald-300/90">
                {awayTop.pts ?? 0}pts · {awayTop.reb ?? 0}reb · {awayTop.ast ?? 0}ast
              </div>
            </div>
          ) : <div />}
        </div>
      )}

      {/* Live context: bonus / timeouts */}
      {live &&
        (game.home_timeouts_remaining != null ||
          game.home_in_bonus ||
          game.visitor_in_bonus) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[10px] text-white/35">
            {game.home_timeouts_remaining != null && (
              <span>
                {game.home_team.abbreviation} · {game.home_timeouts_remaining} TO
              </span>
            )}
            {game.visitor_timeouts_remaining != null && (
              <span>
                {game.visitor_team.abbreviation} · {game.visitor_timeouts_remaining} TO
              </span>
            )}
            {game.home_in_bonus && (
              <span className="text-amber-300/70">
                {game.home_team.abbreviation} in bonus
              </span>
            )}
            {game.visitor_in_bonus && (
              <span className="text-amber-300/70">
                {game.visitor_team.abbreviation} in bonus
              </span>
            )}
          </div>
        )}

      {/* CTA */}
      <div className="mt-4 flex items-center justify-between border-t border-white/6 pt-3.5">
        <span className="text-[11px] text-white/35">
          {live
            ? "Live stats + play-by-play"
            : finished
            ? "Full box score available"
            : "Game preview"}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/50 transition-colors group-hover:text-white">
          {live ? "Live box score" : "View box score"}
          <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  );
}
