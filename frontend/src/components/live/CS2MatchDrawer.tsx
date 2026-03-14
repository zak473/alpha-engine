"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, RefreshCw, Loader2, Shield, Crosshair, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Cs2Match,
  Cs2MatchMap,
  Cs2RoundStat,
  Cs2PlayerMapStat,
  getCS2Maps,
  getCS2MapStats,
  getCS2PlayerMapStats,
  isMatchLive,
  isMatchFinished,
  calcKd,
  fmtRating,
  getBestOfLabel,
  isFirstHalf,
} from "@/lib/balldontlie-cs2";

// ─── Helpers ──────────────────────────────────────────────────────────────

function LivePulse() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
    </span>
  );
}

function StatCell({ value, highlight = false }: { value: string | number; highlight?: boolean }) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 text-center font-mono text-[12px] tabular-nums",
        highlight ? "font-bold text-white" : "text-white/60"
      )}
    >
      {value}
    </td>
  );
}

// ─── Scoreboard hero ──────────────────────────────────────────────────────

function MatchHero({
  match,
  maps,
}: {
  match: Cs2Match;
  maps: Cs2MatchMap[];
}) {
  const live = isMatchLive(match.status);
  const finished = isMatchFinished(match.status);
  const t1 = match.team1;
  const t2 = match.team2;
  const s1 = match.team1_score ?? 0;
  const s2 = match.team2_score ?? 0;

  const sortedMaps = [...maps].sort((a, b) => a.order - b.order);

  return (
    <div
      className={cn(
        "rounded-[20px] border p-5",
        live
          ? "border-emerald-400/20 bg-[linear-gradient(160deg,rgba(54,242,143,0.09),rgba(255,255,255,0.025))]"
          : "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))]"
      )}
    >
      {/* Tournament + status */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
            <LivePulse />
            Live
          </span>
        ) : finished ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/40">
            Final
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/40">
            Upcoming
          </span>
        )}
        <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/40">
          {getBestOfLabel(match.best_of)}
        </span>
        <span className="text-[11px] text-white/35">{match.tournament?.name}</span>
        {match.league && (
          <span className="text-[11px] text-white/25">{match.league.name}</span>
        )}
      </div>

      {/* Teams + series score */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div>
          {t1?.image_url ? (
            <img src={t1.image_url} alt={t1.name} className="mb-2 h-10 w-10 rounded-xl border border-white/10 bg-white/5 object-contain p-1" />
          ) : (
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-[11px] font-bold text-white/70">
              {(t1?.name ?? "?").slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="text-base font-bold text-white">{t1?.acronym ?? t1?.name ?? "TBD"}</div>
          {t1?.acronym && <div className="text-[11px] text-white/40">{t1.name}</div>}
        </div>

        <div className="text-center">
          <div className="flex items-baseline gap-3 font-mono text-4xl font-bold tracking-tight tabular-nums">
            <span className={cn(s1 > s2 ? "text-white" : "text-white/35")}>{s1}</span>
            <span className="text-xl text-white/20">–</span>
            <span className={cn(s2 > s1 ? "text-white" : "text-white/35")}>{s2}</span>
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-white/25">series</div>
        </div>

        <div className="text-right">
          {t2?.image_url ? (
            <img src={t2.image_url} alt={t2.name} className="mb-2 ml-auto h-10 w-10 rounded-xl border border-white/10 bg-white/5 object-contain p-1" />
          ) : (
            <div className="mb-2 ml-auto flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-[11px] font-bold text-white/70">
              {(t2?.name ?? "?").slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="text-base font-bold text-white">{t2?.acronym ?? t2?.name ?? "TBD"}</div>
          {t2?.acronym && <div className="text-[11px] text-white/40">{t2.name}</div>}
        </div>
      </div>

      {/* Map row */}
      {sortedMaps.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {sortedMaps.map((map) => {
            const ms1 = map.team1_score ?? 0;
            const ms2 = map.team2_score ?? 0;
            const mfin = map.status === "finished";
            const mlive = map.status === "running";
            return (
              <div
                key={map.id}
                className={cn(
                  "flex flex-col items-center rounded-xl border px-3 py-2",
                  mlive
                    ? "border-emerald-400/30 bg-emerald-400/[0.07]"
                    : mfin
                    ? "border-white/8 bg-white/[0.03]"
                    : "border-white/5 bg-transparent"
                )}
              >
                <div className="text-[9px] uppercase tracking-widest text-white/35">{map.map_name}</div>
                <div className="mt-0.5 font-mono text-[13px] font-bold tabular-nums">
                  <span className={cn(mfin && ms1 > ms2 ? "text-white" : "text-white/50")}>{map.status === "upcoming" ? "–" : ms1}</span>
                  <span className="mx-1 text-white/20">:</span>
                  <span className={cn(mfin && ms2 > ms1 ? "text-white" : "text-white/50")}>{map.status === "upcoming" ? "–" : ms2}</span>
                </div>
                {mlive && <div className="mt-0.5 text-[8px] text-emerald-300/80">live</div>}
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
  team,
  teamId,
}: {
  players: Cs2PlayerMapStat[];
  team?: { name: string; acronym?: string };
  teamId: number;
}) {
  const teamPlayers = players
    .filter((p) => p.team_id === teamId)
    .sort((a, b) => b.rating - a.rating);

  if (!teamPlayers.length) return null;

  const teamName = team?.acronym ?? team?.name ?? "Team";

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Shield size={11} className="text-white/40" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">{teamName}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/6">
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-white/30">
                Player
              </th>
              <th className="px-3 py-2 text-center text-[10px] uppercase tracking-widest text-white/30">K</th>
              <th className="px-3 py-2 text-center text-[10px] uppercase tracking-widest text-white/30">D</th>
              <th className="px-3 py-2 text-center text-[10px] uppercase tracking-widest text-white/30">A</th>
              <th className="px-3 py-2 text-center text-[10px] uppercase tracking-widest text-white/30">K/D</th>
              <th className="px-3 py-2 text-center text-[10px] uppercase tracking-widest text-white/30">ADR</th>
              <th className="px-3 py-2 text-center text-[10px] uppercase tracking-widest text-white/30">KAST%</th>
              <th className="px-3 py-2 text-center text-[10px] uppercase tracking-widest text-white/30">HS%</th>
              <th className="px-3 py-2 text-center text-[10px] uppercase tracking-widest text-white/30">FK</th>
              <th className="px-3 py-2 text-center text-[10px] uppercase tracking-widest text-white/30">FD</th>
              <th className="px-3 py-2 text-center text-[10px] uppercase tracking-widest text-emerald-300/60">Rating</th>
            </tr>
          </thead>
          <tbody>
            {teamPlayers.map((p) => {
              const kd = parseFloat(calcKd(p.kills, p.deaths));
              const isTopFragger = teamPlayers[0]?.player_id === p.player_id;
              return (
                <tr
                  key={p.id}
                  className={cn(
                    "border-b border-white/4 last:border-0 transition-colors hover:bg-white/[0.025]",
                    isTopFragger && "bg-white/[0.02]"
                  )}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {p.player.image_url ? (
                        <img src={p.player.image_url} alt={p.player.name} className="h-6 w-6 rounded-full border border-white/10 bg-white/5 object-cover" />
                      ) : (
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[9px] font-bold text-white/60">
                          {p.player.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="text-[12px] font-semibold text-white">{p.player.name}</span>
                      {p.player.nationality && (
                        <span className="text-[10px] text-white/25">{p.player.nationality}</span>
                      )}
                    </div>
                  </td>
                  <StatCell value={p.kills} highlight={p.kills >= 20} />
                  <StatCell value={p.deaths} />
                  <StatCell value={p.assists} />
                  <StatCell
                    value={calcKd(p.kills, p.deaths)}
                    highlight={kd >= 1.2}
                  />
                  <StatCell value={Math.round(p.adr)} highlight={p.adr >= 80} />
                  <StatCell value={`${Math.round(p.kast)}%`} highlight={p.kast >= 70} />
                  <StatCell value={`${Math.round(p.headshot_percentage)}%`} />
                  <StatCell value={p.first_kills} />
                  <StatCell value={p.first_deaths} />
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={cn(
                        "font-mono text-[12px] font-bold tabular-nums",
                        p.rating >= 7
                          ? "text-emerald-300"
                          : p.rating >= 5
                          ? "text-white"
                          : "text-white/40"
                      )}
                    >
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

// ─── Round strip ─────────────────────────────────────────────────────────

function RoundStrip({
  rounds,
  team1Id,
  team2Id,
  team1Name,
  team2Name,
}: {
  rounds: Cs2RoundStat[];
  team1Id: number;
  team2Id: number;
  team1Name: string;
  team2Name: string;
}) {
  // Group by round_number, separate T and CT sides
  const byRound = new Map<number, { t1?: Cs2RoundStat; t2?: Cs2RoundStat }>();
  for (const r of rounds) {
    if (!byRound.has(r.round_number)) byRound.set(r.round_number, {});
    const entry = byRound.get(r.round_number)!;
    if (r.team_id === team1Id) entry.t1 = r;
    else if (r.team_id === team2Id) entry.t2 = r;
  }

  const roundNums = Array.from(byRound.keys()).sort((a, b) => a - b);
  if (!roundNums.length) return null;

  // Split into halves (MR12)
  const half1 = roundNums.filter((r) => isFirstHalf(r));
  const half2 = roundNums.filter((r) => !isFirstHalf(r));

  function RoundChip({ n }: { n: number }) {
    const entry = byRound.get(n);
    if (!entry) return null;
    const { t1, t2 } = entry;
    const winner = t1?.won ? "t1" : t2?.won ? "t2" : null;
    const isPistol = t1?.is_pistol_round || t2?.is_pistol_round;
    const winningSide = winner === "t1" ? t1?.team_side : t2?.team_side;

    return (
      <div
        title={`Round ${n}${isPistol ? " · Pistol" : ""}`}
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[9px] font-bold transition-all",
          isPistol && "ring-1 ring-inset ring-white/20",
          winner === null
            ? "border-white/8 bg-white/[0.04] text-white/30"
            : winningSide === "T"
            ? "border-amber-500/30 bg-amber-500/15 text-amber-300"
            : "border-sky-400/30 bg-sky-400/15 text-sky-300"
        )}
      >
        {n}
      </div>
    );
  }

  // Scoreline for each team per half
  function halfScore(team: "t1" | "t2", halfRounds: number[]) {
    return halfRounds.filter((n) => {
      const e = byRound.get(n);
      return team === "t1" ? e?.t1?.won : e?.t2?.won;
    }).length;
  }

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px]">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded border border-amber-500/30 bg-amber-500/15" />
          <span className="text-white/35">T-side win</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded border border-sky-400/30 bg-sky-400/15" />
          <span className="text-white/35">CT-side win</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded border border-white/8 bg-white/[0.04] ring-1 ring-inset ring-white/20" />
          <span className="text-white/35">Pistol round</span>
        </div>
      </div>

      {half1.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[10px] text-white/30">
            <span>First half · R1–R12</span>
            <span>
              {team1Name} {halfScore("t1", half1)} – {halfScore("t2", half1)} {team2Name}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {half1.map((n) => <RoundChip key={n} n={n} />)}
          </div>
        </div>
      )}

      {half2.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[10px] text-white/30">
            <span>Second half · R13+</span>
            <span>
              {team1Name} {halfScore("t1", half2)} – {halfScore("t2", half2)} {team2Name}
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
  team1Id,
  team2Id,
  team1Name,
  team2Name,
}: {
  rounds: Cs2RoundStat[];
  team1Id: number;
  team2Id: number;
  team1Name: string;
  team2Name: string;
}) {
  const t1Rounds = rounds.filter((r) => r.team_id === team1Id);
  const t2Rounds = rounds.filter((r) => r.team_id === team2Id);

  if (!t1Rounds.length && !t2Rounds.length) return null;

  function avg(arr: number[]) {
    if (!arr.length) return 0;
    return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
  }

  const t1AvgEq = avg(t1Rounds.map((r) => r.equipment_value));
  const t2AvgEq = avg(t2Rounds.map((r) => r.equipment_value));
  const t1AvgSpend = avg(t1Rounds.map((r) => r.money_spent));
  const t2AvgSpend = avg(t2Rounds.map((r) => r.money_spent));
  const t1AvgDmg = avg(t1Rounds.map((r) => r.damage));
  const t2AvgDmg = avg(t2Rounds.map((r) => r.damage));

  function Row({
    label,
    v1,
    v2,
    prefix = "",
  }: {
    label: string;
    v1: number;
    v2: number;
    prefix?: string;
  }) {
    const total = v1 + v2 || 1;
    const pct1 = Math.round((v1 / total) * 100);
    const pct2 = 100 - pct1;
    return (
      <div>
        <div className="mb-1 flex justify-between text-[10px] text-white/30">
          <span>{label}</span>
          <span>
            {prefix}{v1.toLocaleString()} vs {prefix}{v2.toLocaleString()}
          </span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full">
          <div
            className="h-full bg-emerald-400/60 transition-all"
            style={{ width: `${pct1}%` }}
          />
          <div
            className="h-full bg-sky-400/60 transition-all"
            style={{ width: `${pct2}%` }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[9px] text-white/20">
          <span>{team1Name}</span>
          <span>{team2Name}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/8 bg-white/[0.025] p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-white/60">
        <TrendingUp size={12} />
        Economy averages per round
      </div>
      <Row label="Equipment value" v1={t1AvgEq} v2={t2AvgEq} prefix="$" />
      <Row label="Money spent" v1={t1AvgSpend} v2={t2AvgSpend} prefix="$" />
      <Row label="Damage" v1={t1AvgDmg} v2={t2AvgDmg} />
    </div>
  );
}

// ─── Map panel (tab content) ──────────────────────────────────────────────

interface MapPanelProps {
  map: Cs2MatchMap;
  match: Cs2Match;
}

function MapPanel({ map, match }: MapPanelProps) {
  const [players, setPlayers] = useState<Cs2PlayerMapStat[]>([]);
  const [rounds, setRounds] = useState<Cs2RoundStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getCS2PlayerMapStats(map.id),
      getCS2MapStats(map.id),
    ]).then(([pStats, rStats]) => {
      setPlayers(pStats);
      setRounds(rStats);
      setLoading(false);
    });
  }, [map.id]);

  const t1 = match.team1;
  const t2 = match.team2;
  const t1Id = t1?.id ?? 0;
  const t2Id = t2?.id ?? 0;
  const t1Name = t1?.acronym ?? t1?.name ?? "T1";
  const t2Name = t2?.acronym ?? t2?.name ?? "T2";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={18} className="animate-spin text-emerald-400" />
      </div>
    );
  }

  const hasPlayers = players.length > 0;
  const hasRounds = rounds.length > 0;

  if (!hasPlayers && !hasRounds) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Crosshair size={22} className="text-white/20" />
        <div className="mt-3 text-sm text-white/35">No stats available for this map yet</div>
        <div className="mt-1 text-[11px] text-white/20">Data may appear once the map begins</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Player tables */}
      {hasPlayers && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">
            <Crosshair size={12} />
            Player Performance
          </div>
          <PlayerStatsTable players={players} team={t1} teamId={t1Id} />
          <PlayerStatsTable players={players} team={t2} teamId={t2Id} />
        </div>
      )}

      {/* Round strip */}
      {hasRounds && (
        <div>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">
            Round History
          </div>
          <RoundStrip
            rounds={rounds}
            team1Id={t1Id}
            team2Id={t2Id}
            team1Name={t1Name}
            team2Name={t2Name}
          />
        </div>
      )}

      {/* Economy */}
      {hasRounds && (
        <EconomyPanel
          rounds={rounds}
          team1Id={t1Id}
          team2Id={t2Id}
          team1Name={t1Name}
          team2Name={t2Name}
        />
      )}
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────

interface CS2MatchDrawerProps {
  match: Cs2Match | null;
  onClose: () => void;
}

export function CS2MatchDrawer({ match, onClose }: CS2MatchDrawerProps) {
  const [maps, setMaps] = useState<Cs2MatchMap[]>([]);
  const [activeMapId, setActiveMapId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [mounted, setMounted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const fetchMaps = useCallback(
    async (quiet = false) => {
      if (!match) return;
      if (quiet) setSyncing(true);
      else setLoading(true);
      try {
        const data = await getCS2Maps([match.id]);
        const sorted = data.sort((a, b) => a.order - b.order);
        setMaps(sorted);
        // Auto-select the running map first, then first map
        if (!quiet || activeMapId === null) {
          const running = sorted.find((m) => m.status === "running");
          setActiveMapId(running?.id ?? sorted[0]?.id ?? null);
        }
        setLastSynced(new Date());
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [match?.id]
  );

  useEffect(() => {
    if (!match) {
      setMaps([]);
      setActiveMapId(null);
      return;
    }
    fetchMaps();

    // Poll every 20s when live
    if (isMatchLive(match.status)) {
      intervalRef.current = setInterval(() => fetchMaps(true), 20_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [match, fetchMaps]);

  // Keyboard close
  useEffect(() => {
    if (!match) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [match, onClose]);

  if (!mounted || !match) return null;

  const live = isMatchLive(match.status);
  const activeMap = maps.find((m) => m.id === activeMapId) ?? null;
  const t1Name = match.team1?.acronym ?? match.team1?.name ?? "T1";
  const t2Name = match.team2?.acronym ?? match.team2?.name ?? "T2";

  const drawer = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col bg-[#080c10] shadow-[−24px_0_80px_rgba(0,0,0,0.7)]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-6 py-4">
          <div className="flex items-center gap-3">
            {live && <LivePulse />}
            <div>
              <div className="text-base font-bold text-white">
                {t1Name} vs {t2Name}
              </div>
              <div className="text-[11px] text-white/35">
                {match.tournament?.name}
                {live && (
                  <>
                    {" "}·{" "}
                    <span className="text-emerald-300/80">
                      {syncing ? "Syncing…" : `Updated ${lastSynced.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {live && (
              <button
                onClick={() => fetchMaps(true)}
                className="rounded-xl border border-white/8 bg-white/[0.05] p-2 text-white/50 transition hover:text-white"
              >
                <RefreshCw size={13} className={cn(syncing && "animate-spin")} />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-xl border border-white/8 bg-white/[0.05] p-2 text-white/50 transition hover:text-white"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 size={22} className="animate-spin text-emerald-400" />
              <div className="mt-3 text-sm text-white/40">Loading match data…</div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Hero scoreboard */}
              <MatchHero match={match} maps={maps} />

              {/* Map tabs */}
              {maps.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {maps.map((m) => {
                      const isActive = m.id === activeMapId;
                      const isLiveMap = m.status === "running";
                      return (
                        <button
                          key={m.id}
                          onClick={() => setActiveMapId(m.id)}
                          className={cn(
                            "flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12px] font-semibold transition-all",
                            isActive
                              ? "border-emerald-400/30 bg-emerald-400/[0.12] text-emerald-200"
                              : "border-white/8 bg-white/[0.04] text-white/45 hover:border-white/14 hover:text-white/70"
                          )}
                        >
                          {isLiveMap && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                          <span>{m.map_name}</span>
                          {m.status !== "upcoming" && (
                            <span className={cn("font-mono text-[11px]", isActive ? "text-emerald-100" : "text-white/30")}>
                              {m.team1_score ?? 0}:{m.team2_score ?? 0}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Map panel content */}
                  {activeMap && (
                    <MapPanel key={activeMap.id} map={activeMap} match={match} />
                  )}
                </div>
              )}

              {/* No maps yet */}
              {maps.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] py-12 text-center">
                  <Crosshair size={22} className="text-white/20" />
                  <div className="mt-3 text-sm text-white/35">No map data yet</div>
                  <div className="mt-1 text-[11px] text-white/20">
                    {live ? "Maps will appear once the match begins" : "Check back when the match is live"}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(drawer, document.body);
}
