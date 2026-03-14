"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Trophy,
  Clock3,
  MapPin,
  Calendar,
  ChevronLeft,
  Shield,
  Crosshair,
  TrendingUp,
  Zap,
  Users,
  BarChart2,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Cs2Match,
  type Cs2MatchMap,
  type Cs2RoundStat,
  type Cs2PlayerMapStat,
  type EloPoint,
  type EloResult,
  type Cs2PlayerAccuracyStat,
  getCS2Match,
  getCS2Maps,
  getCS2MapStats,
  getCS2PlayerMapStats,
  getCS2H2HMatches,
  getCS2TeamMatches,
  getCS2PlayerAccuracy,
  computeElo,
  eloWinProbability,
  isMatchLive,
  isMatchFinished,
  isMatchUpcoming,
  getBestOfLabel,
  calcKd,
  fmtRating,
  isFirstHalf,
} from "@/lib/balldontlie-cs2";

// ─── Types ────────────────────────────────────────────────────────────────

interface MapBundle {
  map: Cs2MatchMap;
  players: Cs2PlayerMapStat[];
  rounds: Cs2RoundStat[];
}

// ─── Micro helpers ────────────────────────────────────────────────────────

function LivePulse({ color = "emerald" }: { color?: "emerald" | "orange" }) {
  const c = color === "orange" ? "bg-orange-400" : "bg-emerald-400";
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${c} opacity-75`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${c}`} />
    </span>
  );
}

function TierBadge({ tier }: { tier?: string | null }) {
  if (!tier) return null;
  const map: Record<string, string> = {
    s: "bg-yellow-400/15 text-yellow-300 border-yellow-400/25",
    a: "bg-orange-400/15 text-orange-300 border-orange-400/25",
    b: "bg-blue-400/15 text-blue-300 border-blue-400/25",
    c: "bg-white/[0.06] text-white/40 border-white/10",
  };
  const cls = map[tier.toLowerCase()] ?? map.c;
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider", cls)}>
      Tier {tier.toUpperCase()}
    </span>
  );
}

function TeamLogo({ name, imgUrl, size = "md" }: { name: string; imgUrl?: string | null; size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? "h-16 w-16" : size === "sm" ? "h-8 w-8" : "h-12 w-12";
  const text = size === "lg" ? "text-base" : size === "sm" ? "text-[9px]" : "text-[11px]";
  if (imgUrl) {
    return (
      <img
        src={imgUrl}
        alt={name}
        className={cn(dim, "shrink-0 rounded-xl border border-white/10 bg-white/5 object-contain p-1")}
      />
    );
  }
  return (
    <div className={cn(dim, "flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]", text, "font-bold text-white/70")}>
      {(name ?? "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

function StatPill({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2.5 text-center">
      <div className="text-[9px] uppercase tracking-widest text-white/30">{label}</div>
      <div className={cn("mt-1 font-mono text-[14px] font-bold tabular-nums", accent ? "text-emerald-300" : "text-white")}>
        {value}
      </div>
    </div>
  );
}

// ─── Tournament banner ────────────────────────────────────────────────────

function TournamentBanner({ match }: { match: Cs2Match }) {
  const t = match.tournament;
  const prizeStr = t.prizepool
    ? `$${Number(t.prizepool).toLocaleString()}`
    : null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3">
      <div className="flex items-center gap-2">
        <Crosshair size={13} className="shrink-0 text-emerald-300/60" />
        <span className="text-[13px] font-semibold text-white">{t.name}</span>
      </div>
      <TierBadge tier={t.tier} />
      {prizeStr && (
        <div className="flex items-center gap-1.5 text-[11px] text-white/40">
          <Trophy size={10} />
          {prizeStr}
        </div>
      )}
      {(t as { is_online?: boolean }).is_online !== undefined && (
        <div className="flex items-center gap-1.5 text-[11px] text-white/35">
          <MapPin size={10} />
          {(t as { is_online?: boolean }).is_online ? "Online" : "LAN"}
        </div>
      )}
      {(t as { start_date?: string }).start_date && (
        <div className="flex items-center gap-1.5 text-[11px] text-white/30">
          <Calendar size={10} />
          {(t as { start_date?: string; end_date?: string }).start_date}
          {(t as { start_date?: string; end_date?: string }).end_date &&
           (t as { start_date?: string; end_date?: string }).end_date !== (t as { start_date?: string; end_date?: string }).start_date
            ? ` – ${(t as { start_date?: string; end_date?: string }).end_date}` : ""}
        </div>
      )}
      <div className="ml-auto">
        <Link
          href="/live"
          className="flex items-center gap-1.5 text-[11px] text-white/35 transition hover:text-white/70"
        >
          <ChevronLeft size={12} />
          Back to Live
        </Link>
      </div>
    </div>
  );
}

// ─── Match hero ───────────────────────────────────────────────────────────

function MatchHero({
  match,
  maps,
  syncing,
  lastSynced,
  onRefresh,
}: {
  match: Cs2Match;
  maps: Cs2MatchMap[];
  syncing: boolean;
  lastSynced: Date;
  onRefresh: () => void;
}) {
  const live = isMatchLive(match.status);
  const finished = isMatchFinished(match.status);
  const upcoming = isMatchUpcoming(match.status);
  const t1 = match.team1;
  const t2 = match.team2;
  const s1 = match.team1_score ?? 0;
  const s2 = match.team2_score ?? 0;

  const timeStr = (() => {
    const src = live || finished ? match.begin_at : match.scheduled_at;
    if (!src) return null;
    return new Date(src).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    }) + " ET";
  })();

  const endStr = finished && match.end_at
    ? new Date(match.end_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      }) + " ET"
    : null;

  const sortedMaps = [...maps].sort((a, b) => a.order - b.order);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[24px] border p-6 lg:p-8",
        live
          ? "border-emerald-400/20 bg-[radial-gradient(ellipse_at_top,rgba(54,242,143,0.10),transparent_55%),linear-gradient(160deg,rgba(54,242,143,0.06),rgba(255,255,255,0.025))]"
          : finished
          ? "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]"
          : "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))]"
      )}
    >
      {/* Status row */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
              <LivePulse />
              Live
            </span>
          ) : finished ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white/50">
              <Trophy size={10} />
              Final
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white/50">
              <Clock3 size={10} />
              Upcoming
            </span>
          )}
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/45">
            {getBestOfLabel(match.best_of)}
          </span>
          {live && (
            <span className="font-mono text-[11px] text-emerald-200/60">
              {syncing ? "Syncing…" : lastSynced.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {timeStr && (
            <span className="text-[11px] text-white/35">
              {finished ? "Started " : ""}
              {timeStr}
              {endStr && ` · Ended ${endStr}`}
            </span>
          )}
          {live && (
            <button
              onClick={onRefresh}
              className="rounded-xl border border-white/8 bg-white/[0.05] p-2 text-white/40 transition hover:text-white"
            >
              <RefreshCw size={13} className={cn(syncing && "animate-spin")} />
            </button>
          )}
        </div>
      </div>

      {/* Teams + series score */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 lg:gap-8">
        {/* Team 1 */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
          <TeamLogo name={t1?.name ?? "TBD"} imgUrl={t1?.image_url} size="lg" />
          <div className="min-w-0">
            <div className="text-xl font-bold leading-tight text-white lg:text-2xl">
              {t1?.acronym ?? t1?.name ?? "TBD"}
            </div>
            {t1?.acronym && (
              <div className="mt-0.5 text-sm text-white/40">{t1.name}</div>
            )}
          </div>
        </div>

        {/* Series score */}
        <div className="flex flex-col items-center gap-1">
          {upcoming ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 px-8 py-5 text-center">
              <div className="text-lg font-medium text-white/30">vs</div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/25 px-6 py-4 text-center">
              <div className="flex items-baseline gap-3 font-mono text-[2.5rem] font-bold tracking-tight tabular-nums lg:text-[3rem]">
                <span className={cn(s1 > s2 ? "text-white" : "text-white/30")}>{s1}</span>
                <span className="text-2xl text-white/15">–</span>
                <span className={cn(s2 > s1 ? "text-white" : "text-white/30")}>{s2}</span>
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-widest text-white/25">series</div>
            </div>
          )}
          {(match as { winner?: { id: number; name: string; short_name?: string } }).winner && (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300/80">
              <Trophy size={10} />
              {(match as { winner?: { id: number; name: string; short_name?: string } }).winner!.short_name ??
               (match as { winner?: { id: number; name: string; short_name?: string } }).winner!.name} wins
            </div>
          )}
        </div>

        {/* Team 2 */}
        <div className="flex flex-col items-end gap-2 lg:flex-row-reverse lg:items-center lg:gap-4">
          <TeamLogo name={t2?.name ?? "TBD"} imgUrl={t2?.image_url} size="lg" />
          <div className="min-w-0 text-right">
            <div className="text-xl font-bold leading-tight text-white lg:text-2xl">
              {t2?.acronym ?? t2?.name ?? "TBD"}
            </div>
            {t2?.acronym && (
              <div className="mt-0.5 text-sm text-white/40">{t2.name}</div>
            )}
          </div>
        </div>
      </div>

      {/* Map scores row */}
      {sortedMaps.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {sortedMaps.map((m) => {
            const ms1 = m.team1_score ?? 0;
            const ms2 = m.team2_score ?? 0;
            const mfin = m.status === "finished";
            const mlive = m.status === "running";
            const t1won = mfin && ms1 > ms2;
            const t2won = mfin && ms2 > ms1;
            return (
              <div
                key={m.id}
                className={cn(
                  "flex flex-col items-center rounded-2xl border px-4 py-2",
                  mlive
                    ? "border-emerald-400/25 bg-emerald-400/[0.07]"
                    : mfin
                    ? "border-white/10 bg-white/[0.04]"
                    : "border-white/6 bg-transparent"
                )}
              >
                <div className="text-[9px] uppercase tracking-widest text-white/30">{m.map_name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[14px] font-bold tabular-nums">
                  <span className={cn(t1won ? "text-white" : mfin ? "text-white/35" : "text-white/50")}>
                    {m.status === "upcoming" ? "–" : ms1}
                  </span>
                  <span className="text-white/20">:</span>
                  <span className={cn(t2won ? "text-white" : mfin ? "text-white/35" : "text-white/50")}>
                    {m.status === "upcoming" ? "–" : ms2}
                  </span>
                </div>
                {mlive && (
                  <div className="mt-0.5 flex items-center gap-1 text-[8px] text-emerald-300/70">
                    <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                    live
                  </div>
                )}
                {mfin && m.team1_side_first && (
                  <div className="mt-0.5 text-[8px] text-white/20">
                    {t1?.acronym ?? "T1"} started {m.team1_side_first}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Player stats table ───────────────────────────────────────────────────

function PlayerStatsTable({
  players,
  teamId,
  teamName,
  highlightTop = true,
}: {
  players: Cs2PlayerMapStat[];
  teamId: number;
  teamName: string;
  highlightTop?: boolean;
}) {
  const teamPlayers = players
    .filter((p) => p.team_id === teamId)
    .sort((a, b) => b.rating - a.rating);

  if (!teamPlayers.length) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Shield size={11} className="text-white/35" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">{teamName}</span>
        <span className="text-[10px] text-white/20">{teamPlayers.length} players</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/6 bg-white/[0.02]">
              <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-widest text-white/30">Player</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">K</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">D</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">A</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">K/D</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">ADR</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">KAST%</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">HS%</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">FK</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">FD</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">Clutch</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-emerald-300/50">Rating</th>
            </tr>
          </thead>
          <tbody>
            {teamPlayers.map((p, idx) => {
              const kd = parseFloat(calcKd(p.kills, p.deaths));
              const isTop = highlightTop && idx === 0;
              return (
                <tr
                  key={p.id}
                  className={cn(
                    "border-b border-white/4 last:border-0 transition-colors hover:bg-white/[0.025]",
                    isTop && "bg-white/[0.02]"
                  )}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      {p.player.image_url ? (
                        <img
                          src={p.player.image_url}
                          alt={p.player.name}
                          className="h-7 w-7 shrink-0 rounded-full border border-white/10 bg-white/5 object-cover"
                        />
                      ) : (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[9px] font-bold text-white/60">
                          {p.player.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className={cn("text-[12px] font-semibold", isTop ? "text-white" : "text-white/90")}>
                          {p.player.name}
                        </div>
                        {p.player.nationality && (
                          <div className="text-[9px] text-white/25">{p.player.nationality}</div>
                        )}
                      </div>
                      {isTop && (
                        <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-300">
                          MVP
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={cn("px-3 py-3 text-center font-mono text-[12px] tabular-nums", p.kills >= 20 ? "font-bold text-white" : "text-white/60")}>{p.kills}</td>
                  <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-white/50">{p.deaths}</td>
                  <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-white/50">{p.assists}</td>
                  <td className={cn("px-3 py-3 text-center font-mono text-[12px] tabular-nums", kd >= 1.2 ? "font-bold text-emerald-300" : kd < 0.8 ? "text-red-400/70" : "text-white/60")}>
                    {calcKd(p.kills, p.deaths)}
                  </td>
                  <td className={cn("px-3 py-3 text-center font-mono text-[12px] tabular-nums", p.adr >= 80 ? "font-bold text-white" : "text-white/55")}>{Math.round(p.adr)}</td>
                  <td className={cn("px-3 py-3 text-center font-mono text-[12px] tabular-nums", p.kast >= 70 ? "text-white" : "text-white/50")}>{Math.round(p.kast)}%</td>
                  <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-white/50">{Math.round(p.headshot_percentage)}%</td>
                  <td className={cn("px-3 py-3 text-center font-mono text-[12px] tabular-nums", p.first_kills >= 3 ? "font-bold text-white" : "text-white/55")}>{p.first_kills}</td>
                  <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-white/50">{p.first_deaths}</td>
                  <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-white/50">{p.clutches_won}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={cn(
                      "font-mono text-[13px] font-bold tabular-nums",
                      p.rating >= 7 ? "text-emerald-300" : p.rating >= 5.5 ? "text-white" : "text-white/35"
                    )}>
                      {fmtRating(p.rating)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Team summary bar ─────────────────────────────────────────────────────

function TeamSummaryBar({
  players,
  t1Id,
  t2Id,
  t1Name,
  t2Name,
}: {
  players: Cs2PlayerMapStat[];
  t1Id: number;
  t2Id: number;
  t1Name: string;
  t2Name: string;
}) {
  const t1p = players.filter((p) => p.team_id === t1Id);
  const t2p = players.filter((p) => p.team_id === t2Id);
  if (!t1p.length && !t2p.length) return null;

  function sum(arr: Cs2PlayerMapStat[], key: keyof Cs2PlayerMapStat): number {
    return arr.reduce((acc, p) => acc + ((p[key] as number) ?? 0), 0);
  }
  function avg(arr: Cs2PlayerMapStat[], key: keyof Cs2PlayerMapStat): number {
    if (!arr.length) return 0;
    return sum(arr, key) / arr.length;
  }

  const stats = [
    { label: "Total Kills", t1: sum(t1p, "kills"), t2: sum(t2p, "kills"), fmt: (v: number) => v.toString() },
    { label: "Total Deaths", t1: sum(t1p, "deaths"), t2: sum(t2p, "deaths"), fmt: (v: number) => v.toString(), invert: true },
    { label: "Avg ADR", t1: avg(t1p, "adr"), t2: avg(t2p, "adr"), fmt: (v: number) => v.toFixed(1) },
    { label: "Avg KAST%", t1: avg(t1p, "kast"), t2: avg(t2p, "kast"), fmt: (v: number) => v.toFixed(0) + "%" },
    { label: "Avg Rating", t1: avg(t1p, "rating"), t2: avg(t2p, "rating"), fmt: (v: number) => v.toFixed(2) },
    { label: "Entry Kills", t1: sum(t1p, "first_kills"), t2: sum(t2p, "first_kills"), fmt: (v: number) => v.toString() },
    { label: "Clutches", t1: sum(t1p, "clutches_won"), t2: sum(t2p, "clutches_won"), fmt: (v: number) => v.toString() },
    { label: "HS%", t1: avg(t1p, "headshot_percentage"), t2: avg(t2p, "headshot_percentage"), fmt: (v: number) => v.toFixed(0) + "%" },
  ];

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
      <div className="mb-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-white/35">
        <span>{t1Name}</span>
        <span className="text-white/20">Team comparison</span>
        <span>{t2Name}</span>
      </div>
      <div className="space-y-2.5">
        {stats.map(({ label, t1, t2, fmt, invert }) => {
          const total = t1 + t2 || 1;
          const t1pct = Math.round((t1 / total) * 100);
          const t2pct = 100 - t1pct;
          const t1better = invert ? t1 < t2 : t1 > t2;
          const t2better = invert ? t2 < t1 : t2 > t1;
          return (
            <div key={label}>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className={cn("font-mono font-semibold tabular-nums", t1better ? "text-white" : "text-white/45")}>
                  {fmt(t1)}
                </span>
                <span className="text-[9px] uppercase tracking-widest text-white/25">{label}</span>
                <span className={cn("font-mono font-semibold tabular-nums", t2better ? "text-white" : "text-white/45")}>
                  {fmt(t2)}
                </span>
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-full">
                <div className="h-full bg-emerald-400/50 transition-all" style={{ width: `${t1pct}%` }} />
                <div className="h-full bg-sky-400/50 transition-all" style={{ width: `${t2pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Round strip ─────────────────────────────────────────────────────────

function RoundStrip({
  rounds,
  t1Id,
  t2Id,
  t1Name,
  t2Name,
}: {
  rounds: Cs2RoundStat[];
  t1Id: number;
  t2Id: number;
  t1Name: string;
  t2Name: string;
}) {
  const byRound = new Map<number, { t1?: Cs2RoundStat; t2?: Cs2RoundStat }>();
  for (const r of rounds) {
    if (!byRound.has(r.round_number)) byRound.set(r.round_number, {});
    const entry = byRound.get(r.round_number)!;
    if (r.team_id === t1Id) entry.t1 = r;
    else if (r.team_id === t2Id) entry.t2 = r;
  }

  const roundNums = Array.from(byRound.keys()).sort((a, b) => a - b);
  if (!roundNums.length) return null;

  const half1 = roundNums.filter((r) => isFirstHalf(r));
  const half2 = roundNums.filter((r) => !isFirstHalf(r));

  function halfScore(team: "t1" | "t2", rNums: number[]) {
    return rNums.filter((n) => {
      const e = byRound.get(n);
      return team === "t1" ? e?.t1?.won : e?.t2?.won;
    }).length;
  }

  function RoundChip({ n }: { n: number }) {
    const entry = byRound.get(n)!;
    const { t1, t2 } = entry;
    const winner = t1?.won ? "t1" : t2?.won ? "t2" : null;
    const isPistol = t1?.is_pistol_round || t2?.is_pistol_round;
    const winningSide = winner === "t1" ? t1?.team_side : t2?.team_side;

    const t1kills = t1?.kills ?? 0;
    const t2kills = t2?.kills ?? 0;
    const totalDmg = (t1?.damage ?? 0) + (t2?.damage ?? 0);

    return (
      <div className="group relative">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[9px] font-bold transition-all",
            isPistol && "ring-1 ring-inset ring-white/25",
            winner === null
              ? "border-white/8 bg-white/[0.04] text-white/30"
              : winningSide === "T"
              ? "border-amber-500/35 bg-amber-500/15 text-amber-300"
              : "border-sky-400/35 bg-sky-400/15 text-sky-300"
          )}
        >
          {n}
        </div>
        {/* Tooltip */}
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 rounded-lg border border-white/10 bg-[#0d1117] px-2.5 py-1.5 text-[10px] whitespace-nowrap group-hover:block z-10 shadow-xl">
          <div className="text-white/40">Round {n}{isPistol ? " · Pistol" : ""}</div>
          <div className="mt-0.5 text-[10px] text-white/70">
            {t1Name}: {t1kills}K {t1?.damage ?? 0}dmg
          </div>
          <div className="text-[10px] text-white/70">
            {t2Name}: {t2kills}K {t2?.damage ?? 0}dmg
          </div>
          {totalDmg > 0 && (
            <div className="mt-0.5 text-[9px] text-white/30">Total dmg: {totalDmg}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-[10px]">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded border border-amber-500/35 bg-amber-500/15" />
          <span className="text-white/30">T-side win</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded border border-sky-400/35 bg-sky-400/15" />
          <span className="text-white/30">CT-side win</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded border border-white/8 ring-1 ring-inset ring-white/25" />
          <span className="text-white/30">Pistol round</span>
        </div>
        <span className="text-white/20">· hover for details</span>
      </div>

      {half1.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between text-[10px] text-white/30">
            <span>First half · R1–R12</span>
            <span className="font-mono font-semibold text-white/50">
              {t1Name} {halfScore("t1", half1)} – {halfScore("t2", half1)} {t2Name}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {half1.map((n) => <RoundChip key={n} n={n} />)}
          </div>
        </div>
      )}

      {half2.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between text-[10px] text-white/30">
            <span>Second half · R13+</span>
            <span className="font-mono font-semibold text-white/50">
              {t1Name} {halfScore("t1", half2)} – {halfScore("t2", half2)} {t2Name}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {half2.map((n) => <RoundChip key={n} n={n} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Economy panel ────────────────────────────────────────────────────────

function EconomyPanel({
  rounds,
  t1Id,
  t2Id,
  t1Name,
  t2Name,
}: {
  rounds: Cs2RoundStat[];
  t1Id: number;
  t2Id: number;
  t1Name: string;
  t2Name: string;
}) {
  const t1r = rounds.filter((r) => r.team_id === t1Id);
  const t2r = rounds.filter((r) => r.team_id === t2Id);
  if (!t1r.length && !t2r.length) return null;

  function avg(arr: Cs2RoundStat[], key: keyof Cs2RoundStat): number {
    if (!arr.length) return 0;
    return arr.reduce((s, v) => s + ((v[key] as number) ?? 0), 0) / arr.length;
  }

  const rows = [
    { label: "Avg Equipment Value", t1: avg(t1r, "equipment_value"), t2: avg(t2r, "equipment_value"), prefix: "$" },
    { label: "Avg Money Spent", t1: avg(t1r, "money_spent"), t2: avg(t2r, "money_spent"), prefix: "$" },
    { label: "Avg Damage / Round", t1: avg(t1r, "damage"), t2: avg(t2r, "damage"), prefix: "" },
    { label: "Avg Entry Kills", t1: avg(t1r, "first_kills"), t2: avg(t2r, "first_kills"), prefix: "" },
    { label: "Avg Trade Kills", t1: avg(t1r, "trade_kills"), t2: avg(t2r, "trade_kills"), prefix: "" },
  ];

  // Pistol round performance
  const t1Pistol = t1r.filter((r) => r.is_pistol_round);
  const t2Pistol = t2r.filter((r) => r.is_pistol_round);
  const t1PistolWins = t1Pistol.filter((r) => r.won).length;
  const t2PistolWins = t2Pistol.filter((r) => r.won).length;

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
      <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">
        <TrendingUp size={12} />
        Economy & Round Context
      </div>
      <div className="space-y-3">
        {rows.map(({ label, t1, t2, prefix }) => {
          const total = t1 + t2 || 1;
          const t1pct = Math.round((t1 / total) * 100);
          return (
            <div key={label}>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className={cn("font-mono font-semibold tabular-nums", t1 >= t2 ? "text-white" : "text-white/45")}>
                  {prefix}{Math.round(t1).toLocaleString()}
                </span>
                <span className="text-[9px] uppercase tracking-widest text-white/25">{label}</span>
                <span className={cn("font-mono font-semibold tabular-nums", t2 >= t1 ? "text-white" : "text-white/45")}>
                  {prefix}{Math.round(t2).toLocaleString()}
                </span>
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-full">
                <div className="h-full bg-emerald-400/50 transition-all" style={{ width: `${t1pct}%` }} />
                <div className="h-full bg-sky-400/50 transition-all" style={{ width: `${100 - t1pct}%` }} />
              </div>
              <div className="mt-0.5 flex justify-between text-[9px] text-white/20">
                <span>{t1Name}</span>
                <span>{t2Name}</span>
              </div>
            </div>
          );
        })}
      </div>

      {(t1PistolWins > 0 || t2PistolWins > 0) && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-widest text-white/25">Pistol rounds</div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-400/60" />
              <span className="text-[11px] font-mono text-white/60">{t1Name} {t1PistolWins}W</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-sky-400/60" />
              <span className="text-[11px] font-mono text-white/60">{t2Name} {t2PistolWins}W</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Map score card ───────────────────────────────────────────────────────

function MapScoreCard({
  map,
  t1,
  t2,
}: {
  map: Cs2MatchMap;
  t1: { id: number; name: string; acronym?: string } | undefined;
  t2: { id: number; name: string; acronym?: string } | undefined;
}) {
  const ms1 = map.team1_score ?? 0;
  const ms2 = map.team2_score ?? 0;
  const mfin = map.status === "finished";
  const mlive = map.status === "running";
  const t1won = mfin && ms1 > ms2;
  const t2won = mfin && ms2 > ms1;
  const t1Name = t1?.acronym ?? t1?.name ?? "T1";
  const t2Name = t2?.acronym ?? t2?.name ?? "T2";

  return (
    <div className={cn(
      "flex items-center justify-between rounded-2xl border px-5 py-4",
      mlive
        ? "border-emerald-400/20 bg-[linear-gradient(160deg,rgba(54,242,143,0.05),rgba(255,255,255,0.02))]"
        : "border-white/8 bg-white/[0.03]"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn("text-[13px] font-bold", t1won ? "text-white" : mfin ? "text-white/35" : "text-white/70")}>
          {t1Name}
        </div>
        {map.team1_side_first && (
          <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold uppercase text-white/30">
            {map.team1_side_first} start
          </span>
        )}
      </div>

      <div className="text-center">
        <div className={cn(
          "flex items-baseline gap-3 font-mono text-2xl font-bold tracking-tight tabular-nums",
          map.status === "upcoming" && "text-white/25"
        )}>
          <span className={cn(t1won ? "text-white" : mfin ? "text-white/30" : "text-white/60")}>
            {map.status === "upcoming" ? "–" : ms1}
          </span>
          <span className="text-base text-white/15">:</span>
          <span className={cn(t2won ? "text-white" : mfin ? "text-white/30" : "text-white/60")}>
            {map.status === "upcoming" ? "–" : ms2}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[10px] text-white/25">
          {mlive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          {mlive ? "live" : mfin ? "final" : "upcoming"}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {map.team1_side_first && (
          <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold uppercase text-white/30">
            {map.team1_side_first === "T" ? "CT" : "T"} start
          </span>
        )}
        <div className={cn("text-[13px] font-bold", t2won ? "text-white" : mfin ? "text-white/35" : "text-white/70")}>
          {t2Name}
        </div>
      </div>
    </div>
  );
}

// ─── Series aggregated stats ──────────────────────────────────────────────

interface AggPlayer {
  player: Cs2PlayerMapStat["player"];
  team_id: number;
  maps_played: number;
  kills: number;
  deaths: number;
  assists: number;
  first_kills: number;
  first_deaths: number;
  clutches_won: number;
  adr_avg: number;
  kast_avg: number;
  rating_avg: number;
  hs_avg: number;
}

function aggregateSeries(bundles: MapBundle[]): AggPlayer[] {
  const map = new Map<number, AggPlayer>();
  for (const { players } of bundles) {
    for (const p of players) {
      if (!map.has(p.player_id)) {
        map.set(p.player_id, {
          player: p.player,
          team_id: p.team_id,
          maps_played: 0,
          kills: 0, deaths: 0, assists: 0,
          first_kills: 0, first_deaths: 0, clutches_won: 0,
          adr_avg: 0, kast_avg: 0, rating_avg: 0, hs_avg: 0,
        });
      }
      const agg = map.get(p.player_id)!;
      agg.maps_played += 1;
      agg.kills += p.kills;
      agg.deaths += p.deaths;
      agg.assists += p.assists;
      agg.first_kills += p.first_kills;
      agg.first_deaths += p.first_deaths;
      agg.clutches_won += p.clutches_won;
      // Running averages for rate stats
      agg.adr_avg = (agg.adr_avg * (agg.maps_played - 1) + p.adr) / agg.maps_played;
      agg.kast_avg = (agg.kast_avg * (agg.maps_played - 1) + p.kast) / agg.maps_played;
      agg.rating_avg = (agg.rating_avg * (agg.maps_played - 1) + p.rating) / agg.maps_played;
      agg.hs_avg = (agg.hs_avg * (agg.maps_played - 1) + p.headshot_percentage) / agg.maps_played;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.rating_avg - a.rating_avg);
}

function SeriesPlayerTable({
  aggPlayers,
  teamId,
  teamName,
}: {
  aggPlayers: AggPlayer[];
  teamId: number;
  teamName: string;
}) {
  const players = aggPlayers.filter((p) => p.team_id === teamId);
  if (!players.length) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Shield size={11} className="text-white/35" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">{teamName}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/6 bg-white/[0.02]">
              <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-widest text-white/30">Player</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">Maps</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">K</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">D</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">A</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">K/D</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">ADR</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">KAST%</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">HS%</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">FK</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">FD</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-white/30">Clutch</th>
              <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-widest text-emerald-300/50">Avg Rating</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, idx) => {
              const kd = p.deaths > 0 ? p.kills / p.deaths : p.kills;
              return (
                <tr key={p.player.id} className="border-b border-white/4 last:border-0 transition-colors hover:bg-white/[0.025]">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      {p.player.image_url ? (
                        <img src={p.player.image_url} alt={p.player.name} className="h-7 w-7 rounded-full border border-white/10 bg-white/5 object-cover" />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[9px] font-bold text-white/60">
                          {p.player.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-[12px] font-semibold text-white/90">{p.player.name}</div>
                        {p.player.nationality && <div className="text-[9px] text-white/25">{p.player.nationality}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-white/40">{p.maps_played}</td>
                  <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-white/70">{p.kills}</td>
                  <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-white/50">{p.deaths}</td>
                  <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-white/50">{p.assists}</td>
                  <td className={cn("px-3 py-3 text-center font-mono text-[12px] tabular-nums", kd >= 1.2 ? "font-bold text-emerald-300" : kd < 0.8 ? "text-red-400/60" : "text-white/60")}>
                    {kd.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-white/60">{p.adr_avg.toFixed(1)}</td>
                  <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-white/55">{p.kast_avg.toFixed(0)}%</td>
                  <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-white/50">{p.hs_avg.toFixed(0)}%</td>
                  <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-white/55">{p.first_kills}</td>
                  <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-white/50">{p.first_deaths}</td>
                  <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-white/50">{p.clutches_won}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={cn("font-mono text-[13px] font-bold tabular-nums", p.rating_avg >= 7 ? "text-emerald-300" : p.rating_avg >= 5.5 ? "text-white" : "text-white/35")}>
                      {p.rating_avg.toFixed(2)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Map tab content ──────────────────────────────────────────────────────

function MapTabContent({
  bundle,
  match,
}: {
  bundle: MapBundle;
  match: Cs2Match;
}) {
  const { map, players, rounds } = bundle;
  const t1 = match.team1;
  const t2 = match.team2;
  const t1Id = t1?.id ?? 0;
  const t2Id = t2?.id ?? 0;
  const t1Name = t1?.acronym ?? t1?.name ?? "T1";
  const t2Name = t2?.acronym ?? t2?.name ?? "T2";

  const hasPlayers = players.length > 0;
  const hasRounds = rounds.length > 0;
  const totalRounds = rounds.length > 0 ? Math.max(...rounds.map((r) => r.round_number)) : 0;

  // Quick map stats
  const t1rounds = rounds.filter((r) => r.team_id === t1Id);
  const t2rounds = rounds.filter((r) => r.team_id === t2Id);
  const t1wins = t1rounds.filter((r) => r.won).length;
  const t2wins = t2rounds.filter((r) => r.won).length;

  return (
    <div className="space-y-5">
      {/* Map scoreboard */}
      <MapScoreCard map={map} t1={t1} t2={t2} />

      {/* Quick stats strip */}
      {(hasPlayers || hasRounds) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {totalRounds > 0 && <StatPill label="Total Rounds" value={totalRounds} />}
          {hasRounds && <StatPill label={`${t1Name} Rounds`} value={t1wins} accent />}
          {hasRounds && <StatPill label={`${t2Name} Rounds`} value={t2wins} />}
          {hasPlayers && (() => {
            const t1p = players.filter((p) => p.team_id === t1Id);
            const t2p = players.filter((p) => p.team_id === t2Id);
            const top = [...t1p, ...t2p].sort((a, b) => b.rating - a.rating)[0];
            return top ? (
              <>
                <StatPill label="Top Rating" value={fmtRating(top.rating)} accent />
                <StatPill label="Top Fragger" value={top.player.name} />
              </>
            ) : null;
          })()}
          {hasPlayers && (() => {
            const allPlayers = players;
            const maxKills = Math.max(...allPlayers.map((p) => p.kills));
            return <StatPill label="Most Kills" value={maxKills} />;
          })()}
        </div>
      )}

      {/* Player stats */}
      {hasPlayers ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/35">
            <Users size={12} />
            Player Performance
          </div>
          <PlayerStatsTable players={players} teamId={t1Id} teamName={t1Name} />
          <PlayerStatsTable players={players} teamId={t2Id} teamName={t2Name} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/8 py-10 text-center">
          <Crosshair size={18} className="text-white/20" />
          <div className="mt-2 text-sm text-white/30">No player stats yet</div>
          <div className="mt-0.5 text-[11px] text-white/20">Stats appear once the map is underway</div>
        </div>
      )}

      {/* Team comparison */}
      {hasPlayers && (
        <TeamSummaryBar players={players} t1Id={t1Id} t2Id={t2Id} t1Name={t1Name} t2Name={t2Name} />
      )}

      {/* Round history */}
      {hasRounds && (
        <div>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/35">
            Round History
          </div>
          <RoundStrip rounds={rounds} t1Id={t1Id} t2Id={t2Id} t1Name={t1Name} t2Name={t2Name} />
        </div>
      )}

      {/* Economy */}
      {hasRounds && (
        <EconomyPanel rounds={rounds} t1Id={t1Id} t2Id={t2Id} t1Name={t1Name} t2Name={t2Name} />
      )}
    </div>
  );
}

// ─── Series overview tab ──────────────────────────────────────────────────

function SeriesOverviewTab({
  match,
  bundles,
}: {
  match: Cs2Match;
  bundles: MapBundle[];
}) {
  const t1 = match.team1;
  const t2 = match.team2;
  const t1Id = t1?.id ?? 0;
  const t2Id = t2?.id ?? 0;
  const t1Name = t1?.acronym ?? t1?.name ?? "T1";
  const t2Name = t2?.acronym ?? t2?.name ?? "T2";

  const allPlayers = bundles.flatMap((b) => b.players);
  const aggPlayers = aggregateSeries(bundles);
  const hasData = aggPlayers.length > 0;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-white/8 py-16 text-center">
        <Zap size={22} className="text-white/20" />
        <div className="mt-3 text-base font-semibold text-white/35">No series data yet</div>
        <div className="mt-1 text-sm text-white/25">
          {isMatchUpcoming(match.status)
            ? "Stats will populate as maps are played"
            : "No map stats available for this match"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Series KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatPill label="Maps Played" value={bundles.filter((b) => b.map.status !== "upcoming").length} />
        <StatPill label="Total Rounds" value={bundles.reduce((acc, b) => acc + (b.rounds.length > 0 ? Math.max(...b.rounds.map((r) => r.round_number)) : 0), 0)} />
        <StatPill label={`${t1Name} Maps`} value={match.team1_score ?? 0} accent />
        <StatPill label={`${t2Name} Maps`} value={match.team2_score ?? 0} />
      </div>

      {/* Series player tables */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/35">
          <Users size={12} />
          Series Totals
        </div>
        <SeriesPlayerTable aggPlayers={aggPlayers} teamId={t1Id} teamName={t1Name} />
        <SeriesPlayerTable aggPlayers={aggPlayers} teamId={t2Id} teamName={t2Name} />
      </div>

      {/* Top performers */}
      {aggPlayers.length > 0 && (() => {
        const t1agg = aggPlayers.filter((p) => p.team_id === t1Id);
        const t2agg = aggPlayers.filter((p) => p.team_id === t2Id);
        const mvp = aggPlayers.sort((a, b) => b.rating_avg - a.rating_avg)[0];
        const topFragger = [...aggPlayers].sort((a, b) => b.kills - a.kills)[0];
        return (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mvp && (
              <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] px-4 py-3.5">
                <div className="text-[9px] uppercase tracking-widest text-emerald-300/60">Series MVP</div>
                <div className="mt-1 text-[14px] font-bold text-white">{mvp.player.name}</div>
                <div className="mt-0.5 font-mono text-[12px] text-emerald-300/80">
                  {mvp.rating_avg.toFixed(2)} avg rating · {mvp.kills}K
                </div>
              </div>
            )}
            {topFragger && topFragger !== mvp && (
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3.5">
                <div className="text-[9px] uppercase tracking-widest text-white/30">Top Fragger</div>
                <div className="mt-1 text-[14px] font-bold text-white">{topFragger.player.name}</div>
                <div className="mt-0.5 font-mono text-[12px] text-white/50">
                  {topFragger.kills} kills · {topFragger.kills / (topFragger.deaths || 1) >= 1 ? "+" : ""}{((topFragger.kills / (topFragger.deaths || 1)) - 1).toFixed(2)} K/D diff
                </div>
              </div>
            )}
            {aggPlayers.filter((p) => p.clutches_won > 0).sort((a, b) => b.clutches_won - a.clutches_won)[0] && (() => {
              const clutchKing = aggPlayers.filter((p) => p.clutches_won > 0).sort((a, b) => b.clutches_won - a.clutches_won)[0];
              return (
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3.5">
                  <div className="text-[9px] uppercase tracking-widest text-white/30">Clutch Player</div>
                  <div className="mt-1 text-[14px] font-bold text-white">{clutchKing.player.name}</div>
                  <div className="mt-0.5 font-mono text-[12px] text-white/50">
                    {clutchKing.clutches_won} clutch{clutchKing.clutches_won !== 1 ? "es" : ""} won
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Upcoming match preview ───────────────────────────────────────────────

function UpcomingPreview({ match }: { match: Cs2Match }) {
  const t = match.tournament;
  const t1 = match.team1;
  const t2 = match.team2;

  const timeStr = match.scheduled_at
    ? new Date(match.scheduled_at).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      }) + " ET"
    : null;

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-white/35">Match Info</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <div className="text-[9px] uppercase tracking-widest text-white/25">Tournament</div>
            <div className="mt-1 text-[13px] font-semibold text-white">{t.name}</div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <div className="text-[9px] uppercase tracking-widest text-white/25">Format</div>
            <div className="mt-1 text-[13px] font-semibold text-white">{getBestOfLabel(match.best_of)}</div>
          </div>
          {timeStr && (
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
              <div className="text-[9px] uppercase tracking-widest text-white/25">Scheduled</div>
              <div className="mt-1 text-[13px] font-semibold text-white">{timeStr}</div>
            </div>
          )}
          {t.prizepool && (
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
              <div className="text-[9px] uppercase tracking-widest text-white/25">Prize Pool</div>
              <div className="mt-1 text-[13px] font-semibold text-white">${Number(t.prizepool).toLocaleString()}</div>
            </div>
          )}
          {(t as {is_online?: boolean}).is_online !== undefined && (
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
              <div className="text-[9px] uppercase tracking-widest text-white/25">Venue</div>
              <div className="mt-1 text-[13px] font-semibold text-white">
                {(t as {is_online?: boolean}).is_online ? "Online" : "LAN"}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <div className="text-[9px] uppercase tracking-widest text-white/25">Tier</div>
            <div className="mt-1">
              <TierBadge tier={t.tier} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-[120px] items-center justify-center rounded-[20px] border border-dashed border-white/8 bg-white/[0.015] p-6 text-center">
        <div>
          <Clock3 size={18} className="mx-auto text-white/20" />
          <div className="mt-2 text-sm text-white/30">Match stats will appear once play begins</div>
          {timeStr && <div className="mt-0.5 text-[11px] text-white/20">{timeStr}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Intel tab types & components ─────────────────────────────────────────

interface IntelData {
  h2hMatches: Cs2Match[];
  team1Recent: Cs2Match[];
  team2Recent: Cs2Match[];
  team1Elo: EloResult;
  team2Elo: EloResult;
  playerAccuracy: Record<number, Cs2PlayerAccuracyStat[]>;
}

function EloSparkline({ history }: { history: EloPoint[] }) {
  const recent = history.slice(-12);
  if (recent.length < 2) return <span className="text-[10px] text-white/20">—</span>;
  const ratings = recent.map((h) => h.rating);
  const min = Math.min(...ratings) - 3;
  const max = Math.max(...ratings) + 3;
  const range = Math.max(max - min, 1);
  const W = 130, H = 36, pad = 3;
  const toX = (i: number) => pad + (i / (recent.length - 1)) * (W - pad * 2);
  const toY = (r: number) => H - pad - ((r - min) / range) * (H - pad * 2);
  const line = recent
    .map((h, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(h.rating).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={W} height={H} className="overflow-visible">
      <path d={line} fill="none" stroke="rgba(52,211,153,0.45)" strokeWidth={1.5} />
      {recent.map((h, i) => (
        <circle
          key={i}
          cx={toX(i)}
          cy={toY(h.rating)}
          r={2.5}
          fill={h.result === "W" ? "rgb(52,211,153)" : "rgb(248,113,113)"}
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={0.5}
        />
      ))}
    </svg>
  );
}

function AccuracySection({
  match,
  playerAccuracy,
}: {
  match: Cs2Match;
  playerAccuracy: Record<number, Cs2PlayerAccuracyStat[]>;
}) {
  const allTeams = [
    { team: match.team1, label: match.team1?.acronym ?? match.team1?.name ?? "T1" },
    { team: match.team2, label: match.team2?.acronym ?? match.team2?.name ?? "T2" },
  ];

  const HIT_ORDER = ["head", "chest", "stomach", "left_arm", "right_arm", "left_leg", "right_leg"];
  const HIT_LABEL: Record<string, string> = {
    head: "Head", chest: "Chest", stomach: "Stomach",
    left_arm: "L Arm", right_arm: "R Arm", left_leg: "L Leg", right_leg: "R Leg",
  };

  // Collect all player IDs we have accuracy for
  const playerIds = Object.keys(playerAccuracy).map(Number).filter((id) => playerAccuracy[id]?.length > 0);
  if (playerIds.length === 0) return null;

  // Find player names from match bundles — we need player info from somewhere
  // Players are embedded in Cs2PlayerMapStat which we don't have here. Use team data.
  return (
    <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
      <div className="mb-4 flex items-center gap-2">
        <Target size={12} className="text-emerald-300/60" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Career Accuracy</span>
        <span className="ml-auto text-[9px] text-white/20">{playerIds.length} players</span>
      </div>
      <div className="space-y-4">
        {allTeams.map(({ team, label }) => {
          if (!team) return null;
          return (
            <div key={team.id}>
              <div className="mb-2 text-[10px] font-semibold text-white/50">{label}</div>
              {/* We don't have per-player names without bundles — show aggregate accuracy per hit group */}
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                {HIT_ORDER.map((hg) => {
                  // Aggregate across all players for this team
                  const rows = playerIds.flatMap((id) =>
                    (playerAccuracy[id] ?? []).filter((s) => s.hit_group === hg)
                  );
                  const totalHits = rows.reduce((s, r) => s + r.hits, 0);
                  const totalShots = rows.reduce((s, r) => s + r.total_shots, 0);
                  const acc = totalShots > 0 ? (totalHits / totalShots) * 100 : 0;
                  return (
                    <div key={hg} className="flex flex-col items-center gap-1 rounded-xl border border-white/6 bg-white/[0.02] p-2">
                      <div className="text-[9px] text-white/30">{HIT_LABEL[hg]}</div>
                      <div className="text-[12px] font-bold text-white">{acc.toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IntelTabContent({
  match,
  intelData,
  intelLoading,
}: {
  match: Cs2Match;
  intelData: IntelData | null;
  intelLoading: boolean;
}) {
  const t1 = match.team1;
  const t2 = match.team2;
  const t1Id = t1?.id ?? 0;
  const t2Id = t2?.id ?? 0;
  const t1Name = t1?.acronym ?? t1?.name ?? "T1";
  const t2Name = t2?.acronym ?? t2?.name ?? "T2";

  if (intelLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 size={18} className="animate-spin text-emerald-400" />
        <div className="mt-3 text-[11px] text-white/35">Loading intel…</div>
      </div>
    );
  }

  if (!intelData) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-white/30">
        <BarChart2 size={20} className="text-white/15" />
        <div className="mt-2 text-[12px]">Intel data unavailable</div>
      </div>
    );
  }

  // H2H wins
  const finishedH2H = intelData.h2hMatches.filter((m) => isMatchFinished(m.status));
  let t1Wins = 0, t2Wins = 0;
  for (const m of finishedH2H) {
    const mt1 = m.team1?.id;
    const mt2 = m.team2?.id;
    const s1 = m.team1_score ?? 0;
    const s2 = m.team2_score ?? 0;
    if (mt1 === t1Id) { s1 > s2 ? t1Wins++ : t2Wins++; }
    else if (mt2 === t1Id) { s2 > s1 ? t1Wins++ : t2Wins++; }
    else if (mt1 === t2Id) { s1 > s2 ? t2Wins++ : t1Wins++; }
    else if (mt2 === t2Id) { s2 > s1 ? t2Wins++ : t1Wins++; }
  }
  const total = t1Wins + t2Wins;
  const t1Pct = total > 0 ? (t1Wins / total) * 100 : 50;

  const { team1Elo, team2Elo } = intelData;
  const winProb = eloWinProbability(team1Elo.rating, team2Elo.rating);

  const recentMeetings = [...finishedH2H]
    .sort(
      (a, b) =>
        new Date(b.end_at ?? b.scheduled_at ?? "").getTime() -
        new Date(a.end_at ?? a.scheduled_at ?? "").getTime()
    )
    .slice(0, 6);

  return (
    <div className="space-y-4">
      {/* ── ELO Analysis ─────────────────────────────────────────────────── */}
      <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
        <div className="mb-5 flex items-center gap-2">
          <TrendingUp size={12} className="text-emerald-300/60" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">ELO Analysis</span>
          <span className="ml-auto text-[9px] text-white/20">Derived from recent match history · K=32</span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-6">
          {/* Team 1 ELO */}
          <div className="space-y-3">
            <div className="text-[11px] font-semibold text-white/60">{t1Name}</div>
            <div>
              <div className="text-4xl font-bold tabular-nums text-white">{team1Elo.rating}</div>
              <div className={cn(
                "mt-1 text-[11px] font-semibold tabular-nums",
                team1Elo.delta30d >= 0 ? "text-emerald-300" : "text-red-300"
              )}>
                {team1Elo.delta30d >= 0 ? "+" : ""}{team1Elo.delta30d}
                <span className="ml-1 font-normal text-white/25">30d</span>
              </div>
            </div>
            <EloSparkline history={team1Elo.history} />
            <div className="text-[9px] text-white/25">{team1Elo.gamesPlayed} matches analysed</div>
          </div>

          {/* Win probability column */}
          <div className="flex flex-col items-center gap-2 pt-6">
            <div className="text-[9px] uppercase tracking-widest text-white/20">Win prob</div>
            <div className="relative h-24 w-4 overflow-hidden rounded-full bg-white/8">
              <div
                className="absolute bottom-0 w-full rounded-b-full bg-emerald-400/55 transition-all duration-500"
                style={{ height: `${winProb * 100}%` }}
              />
            </div>
            <div className="space-y-0.5 text-center">
              <div className="text-[12px] font-bold text-white">{(winProb * 100).toFixed(0)}%</div>
              <div className="text-[9px] text-white/30">{t1Name}</div>
              <div className="text-[9px] text-white/15">–</div>
              <div className="text-[9px] text-white/30">{t2Name}</div>
              <div className="text-[12px] font-bold text-white">{((1 - winProb) * 100).toFixed(0)}%</div>
            </div>
          </div>

          {/* Team 2 ELO */}
          <div className="space-y-3 text-right">
            <div className="text-[11px] font-semibold text-white/60">{t2Name}</div>
            <div>
              <div className="text-4xl font-bold tabular-nums text-white">{team2Elo.rating}</div>
              <div className={cn(
                "mt-1 text-[11px] font-semibold tabular-nums",
                team2Elo.delta30d >= 0 ? "text-emerald-300" : "text-red-300"
              )}>
                {team2Elo.delta30d >= 0 ? "+" : ""}{team2Elo.delta30d}
                <span className="ml-1 font-normal text-white/25">30d</span>
              </div>
            </div>
            <div className="flex justify-end">
              <EloSparkline history={team2Elo.history} />
            </div>
            <div className="text-[9px] text-white/25">{team2Elo.gamesPlayed} matches analysed</div>
          </div>
        </div>

        {/* ELO diff bar */}
        <div className="mt-5 space-y-1.5">
          <div className="flex justify-between text-[9px] text-white/25">
            <span>{t1Name} {team1Elo.rating > team2Elo.rating ? "▲" : ""}</span>
            <span>ELO Δ {Math.abs(team1Elo.rating - team2Elo.rating)}</span>
            <span>{team2Elo.rating > team1Elo.rating ? "▲" : ""} {t2Name}</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full bg-emerald-400/50 transition-all duration-500"
              style={{ width: `${(winProb * 100).toFixed(1)}%` }}
            />
            <div className="h-full flex-1 bg-sky-400/30" />
          </div>
        </div>
      </div>

      {/* ── H2H Record ───────────────────────────────────────────────────── */}
      <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
        <div className="mb-4 flex items-center gap-2">
          <Shield size={12} className="text-emerald-300/60" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Head-to-Head</span>
          <span className="ml-auto text-[9px] text-white/20">{total} all-time meetings</span>
        </div>
        {total > 0 ? (
          <div className="grid grid-cols-[1fr_2fr_1fr] items-center gap-4">
            <div className="text-center">
              <div className="text-5xl font-bold text-white">{t1Wins}</div>
              <div className="mt-1.5 text-[10px] text-white/40">{t1Name}</div>
            </div>
            <div className="space-y-2 text-center">
              <div className="text-[9px] uppercase tracking-widest text-white/20">series wins</div>
              <div className="mx-auto flex h-2 max-w-[160px] overflow-hidden rounded-full bg-white/8">
                <div className="h-full bg-emerald-400/60" style={{ width: `${t1Pct.toFixed(0)}%` }} />
                <div className="h-full flex-1 bg-sky-400/30" />
              </div>
              <div className="text-[10px] text-white/30">
                {t1Pct.toFixed(0)}% — {(100 - t1Pct).toFixed(0)}%
              </div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-white">{t2Wins}</div>
              <div className="mt-1.5 text-[10px] text-white/40">{t2Name}</div>
            </div>
          </div>
        ) : (
          <div className="py-5 text-center text-[12px] text-white/25">No previous meetings found in dataset</div>
        )}
      </div>

      {/* ── Recent Meetings ──────────────────────────────────────────────── */}
      {recentMeetings.length > 0 && (
        <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-5">
          <div className="mb-3 flex items-center gap-2">
            <Clock3 size={12} className="text-emerald-300/60" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Recent Meetings</span>
          </div>
          <div className="space-y-2">
            {recentMeetings.map((m) => {
              const mt1Id = m.team1?.id;
              const isT1asTeam1 = mt1Id === t1Id;
              const myScore = isT1asTeam1 ? (m.team1_score ?? 0) : (m.team2_score ?? 0);
              const oppScore = isT1asTeam1 ? (m.team2_score ?? 0) : (m.team1_score ?? 0);
              const t1Won = myScore > oppScore;
              const date = m.end_at ?? m.scheduled_at;
              return (
                <Link
                  key={m.id}
                  href={`/sports/esports/cs2/${m.id}`}
                  className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2.5 transition hover:bg-white/[0.04]"
                >
                  <span className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                    t1Won ? "bg-emerald-400/20 text-emerald-300" : "bg-red-400/20 text-red-300"
                  )}>
                    {t1Won ? "W" : "L"}
                  </span>
                  <span className="font-mono text-[12px] font-bold text-white">
                    {t1Name} {myScore}–{oppScore} {t2Name}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-white/35">{m.tournament?.name}</span>
                  {date && (
                    <span className="shrink-0 text-[10px] text-white/25">
                      {new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Recent Form ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { teamId: t1Id, name: t1Name, matches: intelData.team1Recent },
          { teamId: t2Id, name: t2Name, matches: intelData.team2Recent },
        ].map(({ teamId: tid, name, matches }) => {
          const finished = matches
            .filter((m) => isMatchFinished(m.status))
            .sort(
              (a, b) =>
                new Date(b.end_at ?? b.scheduled_at ?? "").getTime() -
                new Date(a.end_at ?? a.scheduled_at ?? "").getTime()
            )
            .slice(0, 8);

          // Compute current streak
          let streakCount = 0, streakType = "";
          for (const m of finished) {
            const isT1 = m.team1?.id === tid;
            const myS = isT1 ? (m.team1_score ?? 0) : (m.team2_score ?? 0);
            const oppS = isT1 ? (m.team2_score ?? 0) : (m.team1_score ?? 0);
            const r = myS > oppS ? "W" : "L";
            if (streakCount === 0) { streakType = r; streakCount = 1; }
            else if (r === streakType) streakCount++;
            else break;
          }

          const winsInLast = finished.filter((m) => {
            const isT1 = m.team1?.id === tid;
            const myS = isT1 ? (m.team1_score ?? 0) : (m.team2_score ?? 0);
            const oppS = isT1 ? (m.team2_score ?? 0) : (m.team1_score ?? 0);
            return myS > oppS;
          }).length;

          return (
            <div key={tid} className="rounded-[20px] border border-white/8 bg-white/[0.025] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-white/60">{name}</span>
                <div className="flex items-center gap-2">
                  {streakCount >= 2 && (
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                      streakType === "W"
                        ? "bg-emerald-400/15 text-emerald-300"
                        : "bg-red-400/15 text-red-300"
                    )}>
                      {streakCount}{streakType}
                    </span>
                  )}
                  <span className="text-[10px] text-white/25">
                    {winsInLast}W–{finished.length - winsInLast}L
                  </span>
                </div>
              </div>
              {finished.length === 0 ? (
                <div className="text-[10px] text-white/20">No recent data</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {finished.map((m) => {
                    const isT1 = m.team1?.id === tid;
                    const myS = isT1 ? (m.team1_score ?? 0) : (m.team2_score ?? 0);
                    const oppS = isT1 ? (m.team2_score ?? 0) : (m.team1_score ?? 0);
                    const won = myS > oppS;
                    const opp = isT1 ? m.team2 : m.team1;
                    return (
                      <Link key={m.id} href={`/sports/esports/cs2/${m.id}`}>
                        <div
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold transition hover:opacity-75",
                            won ? "bg-emerald-400/20 text-emerald-300" : "bg-red-400/20 text-red-300"
                          )}
                          title={`vs ${opp?.name ?? "?"}: ${myS}–${oppS} · ${m.tournament?.name ?? ""}`}
                        >
                          {won ? "W" : "L"}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Player Career Accuracy ───────────────────────────────────────── */}
      <AccuracySection match={match} playerAccuracy={intelData.playerAccuracy} />
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────

interface CS2MatchDetailPageProps {
  matchId: string;
}

export function CS2MatchDetailPage({ matchId }: CS2MatchDetailPageProps) {
  const [match, setMatch] = useState<Cs2Match | null>(null);
  const [maps, setMaps] = useState<Cs2MatchMap[]>([]);
  const [bundles, setBundles] = useState<MapBundle[]>([]);
  const [activeTab, setActiveTab] = useState<"series" | "intel" | number>("series");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [intelData, setIntelData] = useState<IntelData | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intelLoadedRef = useRef(false);

  const fetchIntelData = useCallback(async (t1Id: number, t2Id: number, allPlayers: number[]) => {
    if (intelLoadedRef.current) return;
    intelLoadedRef.current = true;
    setIntelLoading(true);
    try {
      const [h2hMatches, team1Recent, team2Recent, ...accuracyResults] = await Promise.all([
        getCS2H2HMatches(t1Id, t2Id),
        getCS2TeamMatches(t1Id),
        getCS2TeamMatches(t2Id),
        ...allPlayers.map((pid) => getCS2PlayerAccuracy(pid)),
      ]);

      const team1Elo = computeElo(team1Recent, t1Id);
      const team2Elo = computeElo(team2Recent, t2Id);

      const playerAccuracy: Record<number, Cs2PlayerAccuracyStat[]> = {};
      allPlayers.forEach((pid, i) => {
        playerAccuracy[pid] = accuracyResults[i] as Cs2PlayerAccuracyStat[];
      });

      setIntelData({ h2hMatches, team1Recent, team2Recent, team1Elo, team2Elo, playerAccuracy });
    } catch {
      // Intel is non-critical; silently fail
    } finally {
      setIntelLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async (quiet = false) => {
    if (quiet) setSyncing(true);
    else setLoading(true);
    try {
      const matchData = await getCS2Match(matchId);
      if (!matchData) {
        setError("Match not found");
        return;
      }
      setMatch(matchData);

      const mapData = await getCS2Maps([matchData.id]);
      const sortedMaps = mapData.sort((a, b) => a.order - b.order);
      setMaps(sortedMaps);

      // Fetch all per-map stats in parallel
      const bundleData = await Promise.all(
        sortedMaps.map(async (m): Promise<MapBundle> => {
          const [players, rounds] = await Promise.all([
            getCS2PlayerMapStats(m.id),
            getCS2MapStats(m.id),
          ]);
          return { map: m, players, rounds };
        })
      );
      setBundles(bundleData);

      // Auto-select first map with data, or "series" (upcoming defaults to "intel")
      setActiveTab((prev) => {
        if (prev !== "series") return prev; // keep user selection
        if (isMatchUpcoming(matchData.status)) return "intel";
        const firstWithData = sortedMaps.find((_, i) => bundleData[i]?.players.length > 0);
        return firstWithData?.id ?? "series";
      });

      // Kick off intel fetch once we have both team IDs
      const t1Id = matchData.team1?.id;
      const t2Id = matchData.team2?.id;
      if (t1Id && t2Id) {
        // Collect all unique player IDs from bundles
        const playerIds = Array.from(
          new Set(bundleData.flatMap((b) => b.players.map((p) => p.player_id)))
        ).slice(0, 12); // cap at 12 players to avoid too many requests
        fetchIntelData(t1Id, t2Id, playerIds);
      }

      setLastSynced(new Date());
    } catch {
      setError("Failed to load match data");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [matchId, fetchIntelData]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Poll every 20s when live
  useEffect(() => {
    if (!match || !isMatchLive(match.status)) return;
    intervalRef.current = setInterval(() => fetchAll(true), 20_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [match?.status, fetchAll]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-28">
        <Loader2 size={24} className="animate-spin text-emerald-400" />
        <div className="mt-4 text-sm text-white/40">Loading match data…</div>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 py-24 text-center">
        <AlertCircle size={22} className="text-red-400/60" />
        <div className="mt-3 text-base font-semibold text-white/50">{error ?? "Match not found"}</div>
        <Link href="/live" className="mt-4 rounded-xl border border-white/8 bg-white/[0.04] px-4 py-2 text-sm text-white/50 transition hover:text-white">
          Back to Live
        </Link>
      </div>
    );
  }

  const t1 = match.team1;
  const t2 = match.team2;
  const t1Name = t1?.acronym ?? t1?.name ?? "T1";
  const t2Name = t2?.acronym ?? t2?.name ?? "T2";
  const live = isMatchLive(match.status);
  const upcoming = isMatchUpcoming(match.status);

  const activeBundleIdx = typeof activeTab === "number"
    ? bundles.findIndex((b) => b.map.id === activeTab)
    : -1;
  const activeBundle = activeBundleIdx >= 0 ? bundles[activeBundleIdx] : null;

  return (
    <div className="space-y-4 pb-14">
      {/* Tournament banner */}
      <TournamentBanner match={match} />

      {/* Match hero */}
      <MatchHero
        match={match}
        maps={maps}
        syncing={syncing}
        lastSynced={lastSynced}
        onRefresh={() => fetchAll(true)}
      />

      {/* Content */}
      <>
        {/* Tab bar */}
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex min-w-max items-center gap-1.5 rounded-[20px] border border-white/8 bg-white/[0.025] p-1.5">
            {/* Intel tab */}
            <button
              onClick={() => setActiveTab("intel")}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-semibold transition-all",
                activeTab === "intel"
                  ? "bg-emerald-400/15 text-emerald-200 shadow-sm"
                  : "text-white/45 hover:bg-white/[0.05] hover:text-white/70"
              )}
            >
              <BarChart2 size={11} />
              Intel
              {intelLoading && <Loader2 size={9} className="animate-spin opacity-60" />}
            </button>

            {/* Series tab — only for non-upcoming */}
            {!upcoming && (
              <button
                onClick={() => setActiveTab("series")}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-semibold transition-all",
                  activeTab === "series"
                    ? "bg-white/[0.10] text-white shadow-sm"
                    : "text-white/45 hover:bg-white/[0.05] hover:text-white/70"
                )}
              >
                <Zap size={11} />
                Series
              </button>
            )}

            {/* Map tabs */}
            {!upcoming && bundles.map((b) => {
                const isActive = activeTab === b.map.id;
                const isLiveMap = b.map.status === "running";
                const ms1 = b.map.team1_score ?? 0;
                const ms2 = b.map.team2_score ?? 0;
                const hasStats = b.players.length > 0 || b.rounds.length > 0;
                return (
                  <button
                    key={b.map.id}
                    onClick={() => setActiveTab(b.map.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-semibold transition-all",
                      isActive
                        ? live && isLiveMap
                          ? "bg-emerald-400/15 text-emerald-200 shadow-sm"
                          : "bg-white/[0.10] text-white shadow-sm"
                        : "text-white/45 hover:bg-white/[0.05] hover:text-white/70"
                    )}
                  >
                    {isLiveMap && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                    <span>{b.map.map_name}</span>
                    {b.map.status !== "upcoming" && (
                      <span className={cn(
                        "font-mono text-[11px]",
                        isActive ? "text-current opacity-80" : "text-white/30"
                      )}>
                        {ms1}:{ms2}
                      </span>
                    )}
                    {!hasStats && b.map.status !== "upcoming" && (
                      <span className="text-[9px] text-white/20">—</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content */}
          <div>
            {activeTab === "intel" ? (
              <IntelTabContent match={match} intelData={intelData} intelLoading={intelLoading} />
            ) : upcoming ? (
              <UpcomingPreview match={match} />
            ) : activeTab === "series" ? (
              <SeriesOverviewTab match={match} bundles={bundles} />
            ) : activeBundle ? (
              <MapTabContent bundle={activeBundle} match={match} />
            ) : (
              <div className="flex items-center justify-center py-16 text-white/30">
                <Loader2 size={16} className="animate-spin" />
              </div>
            )}
          </div>
        </>


      {/* Data attribution */}
      <div className="flex items-center justify-end gap-2 pt-2 text-[10px] text-white/20">
        <span className="h-1 w-1 rounded-full bg-emerald-400/40" />
        BallDontLie GOAT · Updated {lastSynced.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </div>
    </div>
  );
}
