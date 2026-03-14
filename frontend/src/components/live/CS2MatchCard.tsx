"use client";

import { cn } from "@/lib/utils";
import { Trophy, Clock3, Zap } from "lucide-react";
import {
  Cs2Match,
  Cs2MatchMap,
  isMatchLive,
  isMatchFinished,
  isMatchUpcoming,
  getBestOfLabel,
} from "@/lib/balldontlie-cs2";

// ─── Micro helpers ────────────────────────────────────────────────────────

function LivePulse() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
    </span>
  );
}

function TeamLogo({ name, imgUrl }: { name: string; imgUrl?: string | null }) {
  if (imgUrl) {
    return (
      <img
        src={imgUrl}
        alt={name}
        className="h-9 w-9 shrink-0 rounded-lg border border-white/10 bg-white/5 object-contain p-1"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-[10px] font-bold text-white/70">
      {(name ?? "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

// Score box per map
function MapPip({
  map,
  team1Id,
}: {
  map: Cs2MatchMap;
  team1Id?: number;
}) {
  const finished = map.status === "finished";
  const running = map.status === "running";
  const s1 = map.team1_score ?? 0;
  const s2 = map.team2_score ?? 0;
  const t1won = finished && s1 > s2;
  const t2won = finished && s2 > s1;

  return (
    <div
      className={cn(
        "flex min-w-[52px] flex-col items-center rounded-xl border px-2 py-1.5",
        running
          ? "border-emerald-400/30 bg-emerald-400/[0.06]"
          : finished
          ? "border-white/8 bg-white/[0.03]"
          : "border-white/5 bg-transparent"
      )}
    >
      <div className="text-[9px] uppercase tracking-widest text-white/30">{map.map_name}</div>
      <div className="mt-0.5 flex items-center gap-1 font-mono text-[13px] font-bold tabular-nums">
        <span className={cn(t1won ? "text-white" : finished ? "text-white/35" : "text-white/55")}>
          {map.status === "upcoming" ? "–" : s1}
        </span>
        <span className="text-white/20">:</span>
        <span className={cn(t2won ? "text-white" : finished ? "text-white/35" : "text-white/55")}>
          {map.status === "upcoming" ? "–" : s2}
        </span>
      </div>
      {running && (
        <div className="mt-0.5 flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[8px] text-emerald-300/80">live</span>
        </div>
      )}
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────

interface CS2MatchCardProps {
  match: Cs2Match;
  maps: Cs2MatchMap[];
  onClick: () => void;
}

export function CS2MatchCard({ match, maps, onClick }: CS2MatchCardProps) {
  const live = isMatchLive(match.status);
  const finished = isMatchFinished(match.status);
  const upcoming = isMatchUpcoming(match.status);

  const team1 = match.team1;
  const team2 = match.team2;
  const s1 = match.team1_score ?? 0;
  const s2 = match.team2_score ?? 0;

  const matchMaps = maps
    .filter((m) => m.match_id === match.id)
    .sort((a, b) => a.order - b.order);

  const scheduledStr = match.scheduled_at
    ? new Date(match.scheduled_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      }) + " ET"
    : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full rounded-[22px] border p-5 text-left transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(0,0,0,0.40)]",
        live
          ? "border-emerald-400/25 bg-[linear-gradient(160deg,rgba(54,242,143,0.07),rgba(255,255,255,0.025))] hover:border-emerald-400/40"
          : finished
          ? "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] hover:border-white/14"
          : "border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] hover:border-white/10"
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2">
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
              {scheduledStr ?? "Upcoming"}
            </span>
          )}
          <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/40">
            {getBestOfLabel(match.best_of)}
          </span>
        </div>
        <div className="min-w-0 text-right">
          <div className="truncate text-[10px] uppercase tracking-widest text-white/25">
            {match.tournament?.name}
          </div>
          {match.league && (
            <div className="truncate text-[9px] text-white/20">{match.league.name}</div>
          )}
        </div>
      </div>

      {/* Teams + Series score */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* Team 1 */}
        <div className="flex items-center gap-2.5">
          <TeamLogo name={team1?.name ?? "TBD"} imgUrl={team1?.image_url} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white">
              {team1?.acronym ?? team1?.name ?? "TBD"}
            </div>
            {team1?.name && team1?.acronym && (
              <div className="truncate text-[10px] text-white/35">{team1.name}</div>
            )}
          </div>
        </div>

        {/* Series score */}
        <div
          className={cn(
            "rounded-xl border px-5 py-2.5 text-center",
            live
              ? "border-emerald-400/20 bg-black/25"
              : "border-white/8 bg-black/20"
          )}
        >
          {upcoming ? (
            <div className="text-[11px] font-medium text-white/30">vs</div>
          ) : (
            <div className="flex items-baseline gap-2 font-mono text-2xl font-bold tracking-tight tabular-nums">
              <span className={cn(s1 > s2 ? "text-white" : "text-white/40")}>{s1}</span>
              <span className="text-sm text-white/20">–</span>
              <span className={cn(s2 > s1 ? "text-white" : "text-white/40")}>{s2}</span>
            </div>
          )}
          <div className="mt-0.5 text-[9px] uppercase tracking-widest text-white/25">series</div>
        </div>

        {/* Team 2 */}
        <div className="flex items-center justify-end gap-2.5">
          <div className="min-w-0 text-right">
            <div className="truncate text-[13px] font-semibold text-white">
              {team2?.acronym ?? team2?.name ?? "TBD"}
            </div>
            {team2?.name && team2?.acronym && (
              <div className="truncate text-[10px] text-white/35">{team2.name}</div>
            )}
          </div>
          <TeamLogo name={team2?.name ?? "TBD"} imgUrl={team2?.image_url} />
        </div>
      </div>

      {/* Map score breakdown */}
      {matchMaps.length > 0 && (
        <div className="mt-3.5 flex items-center gap-2 overflow-x-auto">
          {matchMaps.map((map) => (
            <MapPip key={map.id} map={map} team1Id={team1?.id} />
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="mt-4 flex items-center justify-between border-t border-white/6 pt-3.5">
        <span className="text-[11px] text-white/30">
          {live
            ? "Round stats · player performance · economy"
            : finished
            ? "Full match stats available"
            : "Match preview · odds"}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/45 transition group-hover:text-white">
          <Zap size={11} />
          {live ? "Live match center" : "Match center"}
        </span>
      </div>
    </button>
  );
}
