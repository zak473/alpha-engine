"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveRefresh } from "@/lib/hooks/useLiveRefresh";
import {
  ArrowLeft, Activity, TrendingUp, TrendingDown, BarChart2,
  CheckCircle2, XCircle, AlertTriangle, Info, Target, Layers,
  Award, Zap, Shield, Users, Wifi, Monitor, Globe, Calendar, Clock,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RechartTooltip,
  CartesianGrid, ResponsiveContainer, BarChart, Bar, Cell, Legend,
} from "recharts";
import type {
  EsportsMatchDetail as EsportsMatch,
  EsportsMapOut,
  EsportsPlayerStatsOut,
  EsportsGameOut,
  EsportsDraftPick,
  EsportsTeamFormOut,
  Cs2EconomyStatsOut,
  Cs2UtilityStatsOut,
  Cs2OpeningDuelOut,
  LolTeamCompOut,
  LolObjectiveControlOut,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { colors, chartDefaults } from "@/lib/tokens";
import { FormStreak } from "@/components/charts/FormStreak";
import { TeamRadarChart, norm } from "@/components/charts/TeamRadarChart";
import { EsportsLivePanel } from "@/components/live/LiveMatchPanel";
import { SportMatchHeader } from "@/components/match/SportMatchHeader";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EloPoint { date: string; rating: number }

interface Props {
  match: EsportsMatch;
  eloHomeHistory: EloPoint[];
  eloAwayHistory: EloPoint[];
}

type TabId = "overview" | "series" | "roster" | "h2h" | "elo" | "model" | "context";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview"      },
  { id: "series",   label: "Series/Maps"   },
  { id: "roster",   label: "Team/Roster"   },
  { id: "h2h",      label: "H2H"           },
  { id: "elo",      label: "ELO"           },
  { id: "model",    label: "Model"         },
  { id: "context",  label: "Context"       },
];

// ─── Utility ─────────────────────────────────────────────────────────────────

const n   = (v: number | null | undefined, d = 1) => v == null ? "—" : v.toFixed(d);
const pct = (v: number | null | undefined) => v == null ? "—" : `${(v * 100).toFixed(1)}%`;
const abs = (v: number | null | undefined) => v == null ? "—" : String(Math.round(v));

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " UTC";
}

function eloWinProb(rA: number, rB: number) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

// Game type helpers
function gameLabel(gameType: string | null | undefined) {
  const map: Record<string, string> = { cs2: "CS2", lol: "League of Legends", valorant: "Valorant", dota2: "Dota 2" };
  return map[gameType?.toLowerCase() || ""] || gameType || "Esports";
}
function gameColor(gameType: string | null | undefined) {
  switch (gameType?.toLowerCase()) {
    case "cs2":      return "text-amber-400";
    case "lol":      return "text-blue-400";
    case "valorant": return "text-rose-400";
    case "dota2":    return "text-red-400";
    default:         return "text-t2";
  }
}
function gameBg(gameType: string | null | undefined) {
  switch (gameType?.toLowerCase()) {
    case "cs2":      return "bg-amber-500/15 text-amber-400 border border-amber-500/25";
    case "lol":      return "bg-blue-500/15 text-blue-400 border border-blue-500/25";
    case "valorant": return "bg-rose-500/15 text-rose-400 border border-rose-500/25";
    case "dota2":    return "bg-red-500/15 text-red-400 border border-red-500/25";
    default:         return "bg-white/[0.04] text-white/50 border border-white/8";
  }
}

function mapWinnerColor(winner: "a" | "b" | null | undefined, side: "a" | "b") {
  if (!winner) return "text-t2";
  return winner === side ? "text-accent-green font-bold" : "text-t3";
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function Panel({ title, subtitle, badge, action, padded = true, children }: {
  title: string; subtitle?: string; badge?: React.ReactNode; action?: React.ReactNode;
  padded?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col">
      <div className="panel-header shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="panel-title truncate">{title}</span>
          {badge}
        </div>
        {(subtitle || action) && (
          <div className="flex items-center gap-2 shrink-0">
            {subtitle && <span className="text-2xs text-t2">{subtitle}</span>}
            {action}
          </div>
        )}
      </div>
      <div className={cn("flex-1", padded && "px-3 pb-3")}>{children}</div>
    </div>
  );
}

function MetricRow({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-b0 last:border-0">
      <span className="text-2xs text-t2 shrink-0">{label}</span>
      <div className="text-right">
        <span className={cn("text-xs font-mono font-medium", accent ? "text-accent-blue" : "text-t1")}>{value}</span>
        {sub && <div className="text-2xs text-t3">{sub}</div>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: "bg-bg2 text-t2 border border-b0",
    live:      "bg-positive/10 text-positive border border-positive/20",
    finished:  "bg-bg2 text-t2 border border-b0",
    cancelled: "bg-negative/10 text-negative border border-negative/20",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-medium uppercase tracking-wide", map[status] ?? map.scheduled)}>
      {status === "live" && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
      {status}
    </span>
  );
}

function Delta({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-t3">—</span>;
  const pos = v >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-2xs font-mono", pos ? "text-accent-green" : "text-accent-red")}>
      {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {pos ? "+" : ""}{v.toFixed(1)}
    </span>
  );
}

function FormPills({ w, l }: { w?: number | null; l?: number | null }) {
  const items = [...Array(w ?? 0).fill("W"), ...Array(l ?? 0).fill("L")].slice(0, 5) as Array<"W" | "L">;
  const cls = {
    W: "bg-positive/15 text-positive border border-positive/25",
    L: "bg-negative/15 text-negative border border-negative/25",
  };
  if (items.length === 0) return <span className="text-2xs text-t3">—</span>;
  return (
    <div className="flex items-center gap-1">
      {items.map((r, i) => (
        <span key={i} className={cn("inline-flex items-center justify-center w-5 h-5 rounded text-2xs font-bold", cls[r])}>{r}</span>
      ))}
    </div>
  );
}

function WinBar({ pA, pB, labelA, labelB }: { pA: number; pB: number; labelA: string; labelB: string }) {
  const hPct = Math.round(pA * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-2xs text-t2">
        <span className="truncate max-w-[45%]">{labelA} <span className="text-t1 font-mono font-medium">{hPct}%</span></span>
        <span className="truncate max-w-[45%] text-right"><span className="text-t1 font-mono font-medium">{100-hPct}%</span> {labelB}</span>
      </div>
      <div className="flex h-2 rounded overflow-hidden">
        <div className="bg-accent-blue" style={{ width: `${hPct}%` }} />
        <div className="bg-amber-500 flex-1" />
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center opacity-50">
      <Icon size={22} className="text-t3" />
      <p className="text-xs font-medium text-t2">{title}</p>
      {desc && <p className="text-2xs text-t3 max-w-[220px]">{desc}</p>}
    </div>
  );
}

function Countdown({ kickoff }: { kickoff: string }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    function update() {
      const diff = new Date(kickoff).getTime() - Date.now();
      if (diff <= 0) { setLabel(""); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setLabel(h > 0 ? `in ${h}h ${m}m` : `in ${m}m`);
    }
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, [kickoff]);
  if (!label) return null;
  return <span className="text-2xs text-accent-amber font-medium">{label}</span>;
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function SideGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">{children}</div>;
}
function MainCol({ children }: { children: React.ReactNode }) {
  return <div className="lg:col-span-8 flex flex-col gap-3">{children}</div>;
}
function SideCol({ children }: { children: React.ReactNode }) {
  return <div className="lg:col-span-4 flex flex-col gap-3">{children}</div>;
}

// ─── Team Block (header) ──────────────────────────────────────────────────────

function TeamBlock({ match, side }: { match: EsportsMatch; side: "home" | "away" }) {
  const isHome = side === "home";
  const name = isHome ? match.home.name : match.away.name;
  const elo = isHome ? match.elo_home : match.elo_away;
  const form = isHome ? match.form_home : match.form_away;
  const align = isHome ? "items-start text-left" : "items-end text-right";

  return (
    <div className={cn("flex flex-col gap-1.5 flex-1 min-w-0 px-3 py-2", align)}>
      <span className="text-sm font-semibold text-t1 leading-tight truncate max-w-full">{name}</span>
      {elo && (
        <div className={cn("flex items-center gap-2", isHome ? "" : "justify-end")}>
          <span className="text-xs font-mono text-accent-blue">{elo.overall_rating}</span>
          <Delta v={elo.rating_change} />
        </div>
      )}
      {form && (
        <div className={cn("flex flex-col gap-1", isHome ? "" : "items-end")}>
          <FormStreak
            results={[
              ...Array(form.series_won ?? 0).fill("W" as const),
              ...Array(Math.max(0, (form.series_played ?? 0) - (form.series_won ?? 0))).fill("L" as const),
            ].slice(0, 5)}
            size="sm"
          />
        </div>
      )}
      {form?.roster_stability_score != null && (
        <span className={cn("text-2xs px-1.5 py-0.5 rounded border",
          form.roster_stability_score >= 0.8 ? "bg-positive/15 text-positive border-positive/25"
          : form.roster_stability_score >= 0.6 ? "bg-warning/15 text-warning border-warning/25"
          : "bg-negative/15 text-negative border-negative/25"
        )}>
          {Math.round(form.roster_stability_score * 100)}% stable
        </span>
      )}
    </div>
  );
}

// ─── Center Match Block ───────────────────────────────────────────────────────

function CenterBlock({ match }: { match: EsportsMatch }) {
  const info = match.match_info;
  const status = match.status;

  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-2 min-w-0">
      <div className="text-center">
        <div className="text-xs font-semibold text-t1 leading-tight">{match.league}</div>
        {info?.stage && <div className="text-2xs text-t2">{info.stage}</div>}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {info?.game_type && (
          <span className={cn("text-2xs px-1.5 py-0.5 rounded border font-medium", gameBg(info.game_type))}>
            {gameLabel(info.game_type)}
          </span>
        )}
        {info?.series_format && (
          <span className="text-2xs text-t3 font-medium">{info.series_format.toUpperCase()}</span>
        )}
        {info?.is_lan && (
          <span className="text-2xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/25">
            LAN
          </span>
        )}
      </div>

      {status === "finished" || status === "live" ? (
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold font-mono text-t1 tabular-nums">{match.home_score ?? 0}</span>
            <span className="text-xs text-t3">{info?.game_type === "cs2" ? "maps" : "games"}</span>
            <span className="text-2xl font-bold font-mono text-t1 tabular-nums">{match.away_score ?? 0}</span>
          </div>
          {status === "live" && match.live_clock && (
            <span className="text-2xs font-mono font-semibold text-green-400">{match.live_clock}</span>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-0.5">
          <div className="text-sm font-mono text-t1">{fmtTime(match.kickoff_utc)}</div>
          <Countdown kickoff={match.kickoff_utc} />
        </div>
      )}

      <StatusBadge status={status} />
      {info?.patch_version && <span className="text-2xs text-t3">Patch {info.patch_version}</span>}

      {/* Win probability bar */}
      {match.probabilities && (
        <div className="w-full flex flex-col items-center gap-0.5 mt-1">
          <div className="flex h-1.5 w-full rounded-full overflow-hidden">
            <div className="bg-accent-blue h-full" style={{ width: `${Math.round(match.probabilities.home_win * 100)}%` }} />
            <div className="bg-amber-500 h-full flex-1" />
          </div>
          <div className="flex justify-between w-full text-2xs font-mono tabular-nums">
            <span className="text-accent-blue">{Math.round(match.probabilities.home_win * 100)}%</span>
            <span className="text-amber-400">{Math.round(match.probabilities.away_win * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 3-Col Header ────────────────────────────────────────────────────────────

function EsportsMatchHeader({ match }: { match: EsportsMatch }) {
  const info = match.match_info;
  return (
    <SportMatchHeader
      sport="esports"
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
      eloHome={match.elo_home ? { rating: match.elo_home.overall_rating, rating_change: match.elo_home.rating_change } : null}
      eloAway={match.elo_away ? { rating: match.elo_away.overall_rating, rating_change: match.elo_away.rating_change } : null}
      formHome={null}
      formAway={null}
      venue={undefined}
      centerExtras={info?.series_format ? (
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
          {info.series_format.toUpperCase()}{info.game_type ? ` · ${info.game_type.toUpperCase()}` : ""}
        </span>
      ) : undefined}
    />
  );
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiCell({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="min-w-[100px] rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{label}</p>
      <p className={cn("mt-1 font-mono text-[20px] font-bold leading-none tabular-nums truncate", accent ?? "text-white")}>{value}</p>
      {sub && <p className="mt-1 text-[10px] font-mono text-white/40">{sub}</p>}
    </div>
  );
}

function EsportsKpiStrip({ match }: { match: EsportsMatch }) {
  const p = match.probabilities;
  const fo = match.fair_odds;
  const eH = match.elo_home;
  const eA = match.elo_away;
  const fH = match.form_home;
  const fA = match.form_away;
  const info = match.match_info;

  let eloH = "—";
  let eloA = "—";
  if (eH && eA) {
    eloH = `${Math.round(eloWinProb(eH.overall_rating, eA.overall_rating) * 100)}%`;
    eloA = `${Math.round(eloWinProb(eA.overall_rating, eH.overall_rating) * 100)}%`;
  }

  const eloDiff = eH && eA ? (eH.overall_rating - eA.overall_rating).toFixed(0) : "—";

  const gameEdge =
    info?.game_type === "cs2"
      ? {
          label: "Map pool edge",
          value:
            fH && fA && fH.map_win_pct != null && fA.map_win_pct != null
              ? `${fH.map_win_pct - fA.map_win_pct > 0 ? "+" : ""}${((fH.map_win_pct - fA.map_win_pct) * 100).toFixed(1)}pp`
              : "—",
        }
      : { label: "Avg GD@15", value: "—" };

  return (
    <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.26)]">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCell label="Model P(A)" value={p ? `${Math.round(p.home_win * 100)}%` : "—"} sub={match.home.name.split(" ").slice(-1)[0]} accent={p ? "text-emerald-300" : undefined} />
        <KpiCell label="Model P(B)" value={p ? `${Math.round(p.away_win * 100)}%` : "—"} sub={match.away.name.split(" ").slice(-1)[0]} accent={p ? "text-violet-400" : undefined} />
        <KpiCell label="ELO P(A)" value={eloH} accent="text-emerald-300" />
        <KpiCell label="ELO P(B)" value={eloA} accent="text-violet-400" />
        <KpiCell label="Fair odds A" value={fo?.home_win ? fo.home_win.toFixed(2) : "—"} />
        <KpiCell label="Fair odds B" value={fo?.away_win ? fo.away_win.toFixed(2) : "—"} />
        <KpiCell label="Confidence" value={match.confidence != null ? `${match.confidence}%` : "—"} accent={match.confidence != null && match.confidence >= 65 ? "text-emerald-300" : match.confidence != null && match.confidence >= 45 ? "text-amber-400" : undefined} />
        <KpiCell label="ELO diff" value={eloDiff !== "—" ? `${Number(eloDiff) > 0 ? "+" : ""}${eloDiff}` : "—"} accent={Number(eloDiff) > 0 ? "text-emerald-300" : "text-violet-400"} />
        <KpiCell label="Series W% (A)" value={fH?.series_win_pct != null ? pct(fH.series_win_pct) : "—"} />
        <KpiCell label="Series W% (B)" value={fA?.series_win_pct != null ? pct(fA.series_win_pct) : "—"} />
        <KpiCell label="Map W% (A)" value={fH?.map_win_pct != null ? pct(fH.map_win_pct) : "—"} />
        <KpiCell label="Map W% (B)" value={fA?.map_win_pct != null ? pct(fA.map_win_pct) : "—"} />
        <KpiCell label="Roster stab A" value={fH?.roster_stability_score != null ? pct(fH.roster_stability_score) : "—"} />
        <KpiCell label={gameEdge.label} value={gameEdge.value} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CS2 PANELS
// ═══════════════════════════════════════════════════════════════════════════════

function Cs2VetoPanel({ match }: { match: EsportsMatch }) {
  if (match.veto.length === 0) return <EmptyState icon={Layers} title="No veto data" desc="Veto sequence will appear when available." />;
  const actionColor = { ban: "text-negative", pick: "text-positive", left_over: "text-t3" };
  const teamLabel = (t: string) => t === "a" ? match.home.name : t === "b" ? match.away.name : "Decider";
  return (
    <div className="divide-y divide-white/8">
      {match.veto.map((v, i) => (
        <div key={i} className="flex items-center gap-3 py-1.5 text-xs">
          <span className="text-t3 font-mono w-4 text-right shrink-0">{i+1}</span>
          <span className={cn("w-12 shrink-0 font-medium capitalize", actionColor[v.action as keyof typeof actionColor] ?? "text-t2")}>{v.action}</span>
          <span className="text-t2 w-24 truncate shrink-0">{teamLabel(v.team)}</span>
          <span className="text-t1 font-medium">{v.map_name}</span>
        </div>
      ))}
    </div>
  );
}

function Cs2MapCard({ m, teamA, teamB }: { m: EsportsMapOut; teamA: string; teamB: string }) {
  const total = (m.team_a_score ?? 0) + (m.team_b_score ?? 0);
  const aPct = total > 0 ? (m.team_a_score ?? 0) / total : 0.5;

  return (
    <div className={cn("card p-3 border", m.winner ? "border-white/10" : "border-white/8")}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xs text-t3 font-mono">Map {m.map_number}</span>
          <span className="text-xs font-bold text-t1">{m.map_name}</span>
          {m.overtime_rounds > 0 && <span className="text-2xs px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">OT</span>}
        </div>
        {m.winner && (
          <span className={cn("text-2xs font-medium", m.winner === "a" ? "text-accent-green" : "text-amber-400")}>
            {m.winner === "a" ? teamA : teamB} win
          </span>
        )}
      </div>

      {/* Score */}
      {m.team_a_score != null && (
        <div className="flex items-center justify-between mb-2">
          <span className={cn("text-lg font-bold font-mono tabular-nums", mapWinnerColor(m.winner, "a"))}>{m.team_a_score}</span>
          <div className="flex-1 mx-2 h-1.5 rounded overflow-hidden flex">
            <div className="bg-accent-blue" style={{ width: `${aPct * 100}%` }} />
            <div className="bg-amber-500 flex-1" />
          </div>
          <span className={cn("text-lg font-bold font-mono tabular-nums", mapWinnerColor(m.winner, "b"))}>{m.team_b_score}</span>
        </div>
      )}

      {/* CT/T split */}
      {m.team_a_ct_rounds != null && (
        <div className="grid grid-cols-2 gap-1 text-2xs text-t3">
          <div>
            CT: <span className="text-t1 font-mono">{m.team_a_ct_rounds}</span> · T: <span className="text-t1 font-mono">{m.team_a_t_rounds ?? 0}</span>
          </div>
          <div className="text-right">
            CT: <span className="text-t1 font-mono">{m.team_b_ct_rounds}</span> · T: <span className="text-t1 font-mono">{m.team_b_t_rounds ?? 0}</span>
          </div>
        </div>
      )}

      {/* Round proportion bar */}
      {m.team_a_score != null && m.team_b_score != null && (
        <div className="mt-1.5">
          <div className="text-2xs text-t3 text-center mb-0.5">{total} rounds total</div>
          <div className="flex h-1 rounded overflow-hidden">
            <div className="bg-accent-blue/60" style={{ width: `${aPct * 100}%` }} />
            <div className="bg-amber-500/60 flex-1" />
          </div>
        </div>
      )}
    </div>
  );
}

function Cs2PlayerTable({ players, teamName }: { players: EsportsPlayerStatsOut[]; teamName: string }) {
  if (players.length === 0) return <EmptyState icon={Users} title="No player data" />;
  const cols = ["Player", "K", "D", "A", "K/D", "ADR", "KAST", "Rating", "HS%", "FK"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-b0">
            <th className="text-left py-1.5 px-2 text-t3 font-medium">{teamName}</th>
            {cols.slice(1).map(c => <th key={c} className="text-center py-1.5 px-2 text-t3 font-medium">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {players.sort((a, b) => (b.rating_2 ?? 0) - (a.rating_2 ?? 0)).map((p, i) => (
            <tr key={i} className="border-b border-white/8 last:border-0 hover:bg-white/[0.04]">
              <td className="py-1.5 px-2 font-medium text-t1">{p.player_name}</td>
              <td className="py-1.5 px-2 text-center font-mono text-t1">{p.kills ?? "—"}</td>
              <td className="py-1.5 px-2 text-center font-mono text-t2">{p.deaths ?? "—"}</td>
              <td className="py-1.5 px-2 text-center font-mono text-t2">{p.assists ?? "—"}</td>
              <td className="py-1.5 px-2 text-center font-mono">{p.kd_ratio != null ? p.kd_ratio.toFixed(2) : "—"}</td>
              <td className="py-1.5 px-2 text-center font-mono text-amber-400">{p.adr != null ? p.adr.toFixed(0) : "—"}</td>
              <td className="py-1.5 px-2 text-center font-mono">{p.kast_pct != null ? `${(p.kast_pct * 100).toFixed(0)}%` : "—"}</td>
              <td className="py-1.5 px-2 text-center font-mono text-accent-blue font-bold">{p.rating_2 != null ? p.rating_2.toFixed(2) : "—"}</td>
              <td className="py-1.5 px-2 text-center font-mono">{p.headshot_pct != null ? `${(p.headshot_pct * 100).toFixed(0)}%` : "—"}</td>
              <td className="py-1.5 px-2 text-center font-mono">{p.first_kills ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cs2OverviewPanel({ match }: { match: EsportsMatch }) {
  const fH = match.form_home;
  const fA = match.form_away;
  return (
    <Panel title="Team Form Comparison" subtitle="Series form">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-1 pb-1 mb-1 border-b border-b0 text-2xs text-t3 font-medium">
        <span>{match.home.name}</span><span className="text-center">Stat</span><span className="text-right">{match.away.name}</span>
      </div>
      {[
        { label: "Series Win %",  vA: fH?.series_win_pct != null ? fH.series_win_pct * 100 : null, vB: fA?.series_win_pct != null ? fA.series_win_pct * 100 : null, unit: "%" },
        { label: "Map Win %",     vA: fH?.map_win_pct    != null ? fH.map_win_pct * 100 : null,    vB: fA?.map_win_pct    != null ? fA.map_win_pct * 100 : null,    unit: "%" },
        { label: "Avg ADR",       vA: fH?.avg_adr ?? null,        vB: fA?.avg_adr ?? null,        unit: ""  },
        { label: "Avg KAST",      vA: fH?.avg_kast != null ? fH.avg_kast * 100 : null,             vB: fA?.avg_kast != null ? fA.avg_kast * 100 : null,             unit: "%" },
        { label: "Avg Rating 2.0",vA: fH?.avg_rating ?? null,     vB: fA?.avg_rating ?? null,     unit: ""  },
        { label: "CT Win %",      vA: fH?.ct_win_pct != null ? fH.ct_win_pct * 100 : null,         vB: fA?.ct_win_pct != null ? fA.ct_win_pct * 100 : null,         unit: "%" },
        { label: "T Win %",       vA: fH?.t_win_pct  != null ? fH.t_win_pct  * 100 : null,         vB: fA?.t_win_pct  != null ? fA.t_win_pct  * 100 : null,         unit: "%" },
        { label: "LAN Win %",     vA: fH?.lan_win_pct != null ? fH.lan_win_pct * 100 : null,       vB: fA?.lan_win_pct != null ? fA.lan_win_pct * 100 : null,       unit: "%" },
      ].map(({ label, vA, vB, unit }) => {
        const aWins = vA != null && vB != null && vA > vB;
        const bWins = vA != null && vB != null && vB > vA;
        const fmt = (v: number | null) => v == null ? "—" : `${v.toFixed(1)}${unit}`;
        return (
          <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 py-1.5 border-b border-b0 last:border-0 text-xs font-mono">
            <span className={cn("font-medium", aWins ? "text-accent-green" : "text-t1")}>{fmt(vA)}</span>
            <span className="text-2xs text-t3 text-center whitespace-nowrap">{label}</span>
            <span className={cn("font-medium text-right", bWins ? "text-accent-green" : "text-t1")}>{fmt(vB)}</span>
          </div>
        );
      })}
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOL PANELS
// ═══════════════════════════════════════════════════════════════════════════════

function LolGameCard({ g, teamA, teamB }: { g: EsportsGameOut; teamA: string; teamB: string }) {
  const aObj = g.team_a_obj;
  const bObj = g.team_b_obj;
  const gd15 = g.gold_diff_at_15;

  return (
    <div className={cn("card p-3 border", g.winner ? "border-white/10" : "border-white/8")}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xs text-t3 font-mono">Game {g.game_number}</span>
          {g.duration_min != null && (
            <span className="text-2xs text-t3">{Math.floor(g.duration_min)}:{String(Math.round((g.duration_min % 1) * 60)).padStart(2, "0")}</span>
          )}
        </div>
        {g.winner && (
          <span className={cn("text-2xs font-medium", g.winner === "a" ? "text-accent-green" : "text-amber-400")}>
            {g.winner === "a" ? teamA : teamB} win
          </span>
        )}
      </div>

      {/* Kills + objectives */}
      <div className="grid grid-cols-3 gap-1 text-xs text-center mb-2">
        <div className={cn("font-mono font-bold", g.winner === "a" ? "text-accent-green" : "text-t1")}>{aObj?.kills ?? "?"} K</div>
        <div className="text-t3 text-2xs self-center">kills</div>
        <div className={cn("font-mono font-bold", g.winner === "b" ? "text-accent-green" : "text-t1")}>{bObj?.kills ?? "?"} K</div>

        <div className="text-t2 font-mono">{aObj?.towers ?? "—"} 🗼</div>
        <div className="text-t3 text-2xs self-center">towers</div>
        <div className="text-t2 font-mono">{bObj?.towers ?? "—"} 🗼</div>

        <div className="text-t2 font-mono">{aObj?.dragons ?? "—"} 🐉</div>
        <div className="text-t3 text-2xs self-center">dragons</div>
        <div className="text-t2 font-mono">{bObj?.dragons ?? "—"} 🐉</div>
      </div>

      {/* Gold diff at 15 */}
      {gd15 != null && (
        <div className={cn("text-2xs text-center font-mono", gd15 > 0 ? "text-accent-green" : gd15 < 0 ? "text-amber-400" : "text-t3")}>
          GD@15: {gd15 > 0 ? "+" : ""}{gd15.toLocaleString()}
        </div>
      )}
    </div>
  );
}

function LolDraftPanel({ game, teamA, teamB }: { game: EsportsGameOut; teamA: string; teamB: string }) {
  const bansA = game.draft_a.filter(d => d.phase.startsWith("ban")).slice(0, 5);
  const bansB = game.draft_b.filter(d => d.phase.startsWith("ban")).slice(0, 5);
  const picksA = game.draft_a.filter(d => d.phase.startsWith("pick")).slice(0, 5);
  const picksB = game.draft_b.filter(d => d.phase.startsWith("pick")).slice(0, 5);

  const ChampBadge = ({ name, role, isBan }: { name: string; role?: string | null; isBan?: boolean }) => (
    <div className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs border",
      isBan ? "bg-red-500/10 text-red-400 border-red-500/20 line-through opacity-60" : "bg-white/[0.06] text-white/70 border-white/8"
    )}>
      <span className="truncate max-w-[80px]">{name}</span>
      {role && !isBan && <span className="text-t3 text-2xs shrink-0">{role}</span>}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-2xs text-t3 mb-1 font-medium">{teamA} — Bans</div>
          <div className="flex flex-wrap gap-1">{bansA.map((d, i) => <ChampBadge key={i} name={d.champion} isBan />)}</div>
          <div className="text-2xs text-t3 mt-2 mb-1 font-medium">{teamA} — Picks</div>
          <div className="flex flex-col gap-1">{picksA.map((d, i) => <ChampBadge key={i} name={d.champion} role={d.role} />)}</div>
        </div>
        <div>
          <div className="text-2xs text-t3 mb-1 font-medium">{teamB} — Bans</div>
          <div className="flex flex-wrap gap-1">{bansB.map((d, i) => <ChampBadge key={i} name={d.champion} isBan />)}</div>
          <div className="text-2xs text-t3 mt-2 mb-1 font-medium">{teamB} — Picks</div>
          <div className="flex flex-col gap-1">{picksB.map((d, i) => <ChampBadge key={i} name={d.champion} role={d.role} />)}</div>
        </div>
      </div>
    </div>
  );
}

function LolPlayerTable({ players, teamName }: { players: EsportsPlayerStatsOut[]; teamName: string }) {
  if (players.length === 0) return <EmptyState icon={Users} title="No player data" />;
  const ROLE_ORDER = ["TOP", "JGL", "MID", "BOT", "SUP"];
  const sorted = [...players].sort((a, b) => ROLE_ORDER.indexOf(a.role ?? "") - ROLE_ORDER.indexOf(b.role ?? ""));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-b0">
            <th className="text-left py-1.5 px-2 text-t3 font-medium">{teamName}</th>
            <th className="text-center py-1.5 px-2 text-t3 font-medium">Role</th>
            <th className="text-center py-1.5 px-2 text-t3 font-medium">KDA</th>
            <th className="text-center py-1.5 px-2 text-t3 font-medium">KP%</th>
            <th className="text-center py-1.5 px-2 text-t3 font-medium">CS/m</th>
            <th className="text-center py-1.5 px-2 text-t3 font-medium">G/m</th>
            <th className="text-center py-1.5 px-2 text-t3 font-medium">Dmg%</th>
            <th className="text-center py-1.5 px-2 text-t3 font-medium">Vis/m</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={i} className="border-b border-white/8 last:border-0 hover:bg-white/[0.04]">
              <td className="py-1.5 px-2 font-medium text-t1">{p.player_name}</td>
              <td className="py-1.5 px-2 text-center">
                <span className="text-2xs px-1 py-0.5 rounded bg-white/[0.06] text-white/50">{p.role ?? "?"}</span>
              </td>
              <td className="py-1.5 px-2 text-center font-mono text-accent-blue font-bold">{p.kda != null ? p.kda.toFixed(1) : "—"}</td>
              <td className="py-1.5 px-2 text-center font-mono">{p.kill_participation_pct != null ? `${(p.kill_participation_pct * 100).toFixed(0)}%` : "—"}</td>
              <td className="py-1.5 px-2 text-center font-mono">{p.cs_per_min != null ? p.cs_per_min.toFixed(1) : "—"}</td>
              <td className="py-1.5 px-2 text-center font-mono text-amber-400">{p.gold_per_min != null ? p.gold_per_min.toFixed(0) : "—"}</td>
              <td className="py-1.5 px-2 text-center font-mono">{p.damage_pct != null ? `${(p.damage_pct * 100).toFixed(0)}%` : "—"}</td>
              <td className="py-1.5 px-2 text-center font-mono text-accent-purple">{p.vision_score_per_min != null ? p.vision_score_per_min.toFixed(2) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LolOverviewPanel({ match }: { match: EsportsMatch }) {
  const fH = match.form_home;
  const fA = match.form_away;

  // Aggregate GD@15 from games
  const gd15s = match.games.map(g => g.gold_diff_at_15).filter((v): v is number => v != null);
  const avgGd15 = gd15s.length > 0 ? Math.round(gd15s.reduce((a, b) => a + b, 0) / gd15s.length) : null;

  return (
    <Panel title="Team Style Metrics" subtitle="Series overview">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-1 pb-1 mb-1 border-b border-b0 text-2xs text-t3 font-medium">
        <span>{match.home.name}</span><span className="text-center">Stat</span><span className="text-right">{match.away.name}</span>
      </div>
      {[
        { label: "Series Win %", vA: fH?.series_win_pct != null ? fH.series_win_pct * 100 : null, vB: fA?.series_win_pct != null ? fA.series_win_pct * 100 : null, unit: "%" },
        { label: "Map Win %",    vA: fH?.map_win_pct   != null ? fH.map_win_pct * 100 : null,    vB: fA?.map_win_pct   != null ? fA.map_win_pct * 100 : null,    unit: "%" },
        { label: "LAN Win %",   vA: fH?.lan_win_pct   != null ? fH.lan_win_pct * 100 : null,    vB: fA?.lan_win_pct   != null ? fA.lan_win_pct * 100 : null,    unit: "%" },
      ].map(({ label, vA, vB, unit }) => {
        const aWins = vA != null && vB != null && vA > vB;
        const bWins = vA != null && vB != null && vB > vA;
        const fmt = (v: number | null) => v == null ? "—" : `${v.toFixed(1)}${unit}`;
        return (
          <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 py-1.5 border-b border-b0 last:border-0 text-xs font-mono">
            <span className={cn("font-medium", aWins ? "text-accent-green" : "text-t1")}>{fmt(vA)}</span>
            <span className="text-2xs text-t3 text-center whitespace-nowrap">{label}</span>
            <span className={cn("font-medium text-right", bWins ? "text-accent-green" : "text-t1")}>{fmt(vB)}</span>
          </div>
        );
      })}
      {avgGd15 != null && (
        <div className="mt-2 flex items-center justify-between text-xs py-1.5">
          <span className="text-t3">Avg GD@15 this series</span>
          <span className={cn("font-mono font-medium", avgGd15 > 0 ? "text-accent-green" : "text-amber-400")}>
            {avgGd15 > 0 ? "+" : ""}{avgGd15.toLocaleString()}
          </span>
        </div>
      )}
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════════════════════

function OverviewTab({ match }: { match: EsportsMatch }) {
  const gt = match.match_info?.game_type;
  const isLol = gt === "lol";
  const p = match.probabilities;

  return (
    <SideGrid>
      <MainCol>
        <Panel
          title={isLol ? "League of Legends Matchup" : "Counter-Strike Matchup"}
          subtitle="Primary matchup summary"
        >
          {isLol ? <LolOverviewPanel match={match} /> : <Cs2OverviewPanel match={match} />}
        </Panel>

        {p && (
          <Panel title="Series Win Probability" subtitle="Model projection">
            <WinBar pA={p.home_win} pB={p.away_win} labelA={match.home.name} labelB={match.away.name} />
          </Panel>
        )}
      </MainCol>

      <SideCol>
        <Panel title="Match Info" subtitle="Format and environment">
          <MetricRow label="Game" value={<span className={gameColor(gt)}>{gameLabel(gt)}</span>} />
          {match.match_info?.series_format && (
            <MetricRow label="Format" value={match.match_info.series_format.toUpperCase()} />
          )}
          <MetricRow label="Setting" value={match.match_info?.is_lan ? "LAN" : "Online"} />
          {match.match_info?.patch_version && (
            <MetricRow label="Patch" value={match.match_info.patch_version} />
          )}
          {match.match_info?.tournament_tier && (
            <MetricRow label="Tier" value={match.match_info.tournament_tier} />
          )}
        </Panel>

        {match.h2h && (
          <Panel title="H2H Summary" subtitle="Recent series history">
            <MetricRow label="Total" value={match.h2h.total_matches} />
            <MetricRow label={`${match.home.name} wins`} value={match.h2h.team_a_wins} accent />
            <MetricRow label={`${match.away.name} wins`} value={match.h2h.team_b_wins} />
          </Panel>
        )}

        <Panel title="Roster Stability" subtitle="Continuity signal">
          <MetricRow
            label={match.home.name}
            value={match.form_home?.roster_stability_score != null ? pct(match.form_home.roster_stability_score) : "—"}
          />
          <MetricRow
            label={match.away.name}
            value={match.form_away?.roster_stability_score != null ? pct(match.form_away.roster_stability_score) : "—"}
          />
        </Panel>
      </SideCol>
    </SideGrid>
  );
}

function SeriesTab({ match }: { match: EsportsMatch }) {
  const gt = match.match_info?.game_type;
  const isLol = gt === "lol";
  const [selectedGame, setSelectedGame] = useState(0);

  if (isLol) {
    const g = match.games[selectedGame];

    // Aggregate objectives across all games
    const totA = { towers: 0, dragons: 0, barons: 0, kills: 0 };
    const totB = { towers: 0, dragons: 0, barons: 0, kills: 0 };
    for (const gm of match.games) {
      if (gm.team_a_obj) {
        totA.towers  += gm.team_a_obj.towers  ?? 0;
        totA.dragons += gm.team_a_obj.dragons ?? 0;
        totA.barons  += gm.team_a_obj.barons  ?? 0;
        totA.kills   += gm.team_a_obj.kills   ?? 0;
      }
      if (gm.team_b_obj) {
        totB.towers  += gm.team_b_obj.towers  ?? 0;
        totB.dragons += gm.team_b_obj.dragons ?? 0;
        totB.barons  += gm.team_b_obj.barons  ?? 0;
        totB.kills   += gm.team_b_obj.kills   ?? 0;
      }
    }
    const hasObjData = match.games.some(gm => gm.team_a_obj || gm.team_b_obj);

    const objRows: { label: string; a: number; b: number }[] = [
      { label: "Towers",  a: totA.towers,  b: totB.towers  },
      { label: "Dragons", a: totA.dragons, b: totB.dragons },
      { label: "Barons",  a: totA.barons,  b: totB.barons  },
      { label: "Kills",   a: totA.kills,   b: totB.kills   },
    ];

    return (
      <SideGrid>
        <MainCol>
          <div className="flex gap-2 mb-1">
            {match.games.map((gm, i) => (
              <button key={i} onClick={() => setSelectedGame(i)}
                className={cn("text-xs px-3 py-1.5 rounded border transition-colors",
                  selectedGame === i ? "bg-accent-blue/20 border-accent-blue/40 text-accent-blue" : "border-white/8 text-white/35 hover:text-white/70"
                )}>
                Game {gm.game_number} {gm.winner ? (gm.winner === "a" ? "✓A" : "✓B") : ""}
              </button>
            ))}
          </div>
          {g ? (
            <>
              <LolGameCard g={g} teamA={match.home.name} teamB={match.away.name} />
              <Panel title={`Game ${g.game_number} Draft`}>
                <LolDraftPanel game={g} teamA={match.home.name} teamB={match.away.name} />
              </Panel>
            </>
          ) : (
            <Panel title="Games">
              <EmptyState icon={Activity} title="No game data yet" />
            </Panel>
          )}
        </MainCol>
        <SideCol>
          <Panel title="Series Summary">
            <MetricRow label="Series" value={`${match.home_score ?? 0}–${match.away_score ?? 0}`} accent />
            {match.games.map(g => (
              <MetricRow key={g.game_number} label={`Game ${g.game_number}`} value={g.winner === "a" ? match.home.name : g.winner === "b" ? match.away.name : "—"} />
            ))}
          </Panel>

          {hasObjData && (
            <Panel title="Objectives (Series Total)">
              <div className="flex justify-between text-2xs text-t3 mb-2 font-medium">
                <span className="text-accent-blue truncate max-w-[40%]">{match.home.name}</span>
                <span className="truncate max-w-[40%] text-right text-amber-400">{match.away.name}</span>
              </div>
              {objRows.map(({ label, a, b }) => {
                const total = a + b;
                const aPct = total > 0 ? (a / total) * 100 : 50;
                return (
                  <div key={label} className="py-1.5 border-b border-white/8 last:border-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-mono font-semibold text-accent-blue">{a}</span>
                      <span className="text-2xs text-t3">{label}</span>
                      <span className="font-mono font-semibold text-amber-400">{b}</span>
                    </div>
                    <div className="flex h-1.5 rounded overflow-hidden">
                      <div className="bg-accent-blue" style={{ width: `${aPct}%` }} />
                      <div className="bg-amber-500 flex-1" />
                    </div>
                  </div>
                );
              })}
            </Panel>
          )}

          <Panel title="Gold Diff @15">
            {match.games.some(g => g.gold_diff_at_15 != null) ? (
              <div className="space-y-1.5">
                {match.games.map(g => (
                  <div key={g.game_number} className="flex items-center justify-between text-xs py-1 border-b border-white/8 last:border-0">
                    <span className="text-t3">Game {g.game_number}</span>
                    <span className={cn("font-mono", g.gold_diff_at_15 != null && g.gold_diff_at_15 > 0 ? "text-accent-green" : "text-amber-400")}>
                      {g.gold_diff_at_15 != null ? `${g.gold_diff_at_15 > 0 ? "+" : ""}${g.gold_diff_at_15.toLocaleString()}` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon={TrendingUp} title="No GD@15 data" />}
          </Panel>

          {/* LoL Objectives Control */}
          {(() => {
            const objH = (match as any).lol_objectives_home as LolObjectiveControlOut | null;
            const objA = (match as any).lol_objectives_away as LolObjectiveControlOut | null;
            if (!objH && !objA) return null;
            const rows = [
              { label: "First Blood %",  h: objH?.first_blood_rate,   a: objA?.first_blood_rate,  isPct: true  },
              { label: "First Tower %",  h: objH?.first_tower_rate,   a: objA?.first_tower_rate,  isPct: true  },
              { label: "Dragon Soul",    h: objH?.dragon_soul_secured, a: objA?.dragon_soul_secured, isPct: true },
              { label: "Avg GD@10",      h: objH?.avg_gold_diff_at_10, a: objA?.avg_gold_diff_at_10, isPct: false },
              { label: "Avg GD@15",      h: objH?.avg_gold_diff_at_15, a: objA?.avg_gold_diff_at_15, isPct: false },
              { label: "Avg GD@20",      h: objH?.avg_gold_diff_at_20, a: objA?.avg_gold_diff_at_20, isPct: false },
            ];
            return (
              <Panel title="Objective Control">
                <div className="flex justify-between text-2xs text-t3 mb-1.5 font-medium">
                  <span className="text-accent-blue truncate max-w-[40%]">{match.home.name}</span>
                  <span className="text-amber-400 truncate max-w-[40%] text-right">{match.away.name}</span>
                </div>
                {rows.map(({ label, h, a, isPct }) => {
                  const fmt = (v: number | null | undefined) => {
                    if (v == null) return "—";
                    if (isPct) return `${Math.round(v * 100)}%`;
                    return `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString()}`;
                  };
                  const hWins = h != null && a != null && h > a;
                  const aWins = h != null && a != null && a > h;
                  return (
                    <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 py-1.5 border-b border-white/8 last:border-0 text-xs font-mono">
                      <span className={cn("font-medium", hWins ? "text-accent-green" : "text-t1")}>{fmt(h)}</span>
                      <span className="text-2xs text-t3 text-center whitespace-nowrap">{label}</span>
                      <span className={cn("font-medium text-right", aWins ? "text-accent-green" : "text-t1")}>{fmt(a)}</span>
                    </div>
                  );
                })}
              </Panel>
            );
          })()}

          {/* LoL Team Comp Tags */}
          {(() => {
            const compH = (match as any).lol_comp_home as LolTeamCompOut | null;
            const compA = (match as any).lol_comp_away as LolTeamCompOut | null;
            if (!compH && !compA) return null;
            return (
              <Panel title="Team Composition Style">
                {[
                  { team: match.home.name, comp: compH, color: "text-accent-blue" },
                  { team: match.away.name, comp: compA, color: "text-amber-400" },
                ].map(({ team, comp, color }) => comp ? (
                  <div key={team} className="mb-2 last:mb-0 pb-2 border-b border-white/8 last:border-0">
                    <div className={cn("text-2xs font-medium mb-1", color)}>{team}</div>
                    {comp.comp_tags && comp.comp_tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {comp.comp_tags.map((tag: string, i: number) => (
                          <span key={i} className="text-2xs px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50 border border-white/8">{tag}</span>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-1 text-2xs text-t3 mt-1">
                      {comp.early_game_win_pct != null && <span>Early: <span className="text-t1 font-mono">{Math.round(comp.early_game_win_pct * 100)}%</span></span>}
                      {comp.late_game_win_pct  != null && <span>Late:  <span className="text-t1 font-mono">{Math.round(comp.late_game_win_pct  * 100)}%</span></span>}
                    </div>
                  </div>
                ) : null)}
              </Panel>
            );
          })()}
        </SideCol>
      </SideGrid>
    );
  }

  // CS2
  return (
    <SideGrid>
      <MainCol>
        {match.maps.length > 0 ? (
          <div className="space-y-3">
            {match.maps.map(m => (
              <Cs2MapCard key={m.map_number} m={m} teamA={match.home.name} teamB={match.away.name} />
            ))}
          </div>
        ) : (
          <Panel title="Map Results">
            <EmptyState icon={Layers} title="No map data yet" desc="Map results will appear after the series is played." />
          </Panel>
        )}
      </MainCol>
      <SideCol>
        <Panel title="Veto Sequence" subtitle={`${match.veto.length} steps`}>
          <Cs2VetoPanel match={match} />
        </Panel>
        <Panel title="Series Score">
          <MetricRow label={match.home.name} value={match.home_score ?? 0} accent />
          <MetricRow label={match.away.name} value={match.away_score ?? 0} />
          <MetricRow label="Maps played" value={match.maps.length} />
        </Panel>

        {/* CS2 Economy Breakdown */}
        {(() => {
          const ecoH = (match as any).cs2_economy_home as Cs2EconomyStatsOut[] | null;
          const ecoA = (match as any).cs2_economy_away as Cs2EconomyStatsOut[] | null;
          if (!ecoH && !ecoA) return null;
          const rows: { label: string; h: number | null; a: number | null }[] = [];
          if (ecoH && ecoH.length > 0) {
            const avg = (fn: (e: Cs2EconomyStatsOut) => number | null | undefined) => {
              const vals = ecoH.map(fn).filter((v): v is number => v != null);
              return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            };
            const avgA = (fn: (e: Cs2EconomyStatsOut) => number | null | undefined) => {
              if (!ecoA) return null;
              const vals = ecoA.map(fn).filter((v): v is number => v != null);
              return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            };
            rows.push(
              { label: "Pistol Win %",   h: avg(e => e.pistol_win_pct),   a: avgA(e => e.pistol_win_pct) },
              { label: "Eco Win %",      h: avg(e => e.eco_win_pct),      a: avgA(e => e.eco_win_pct) },
              { label: "Force Buy W%",   h: avg(e => e.force_buy_win_pct), a: avgA(e => e.force_buy_win_pct) },
              { label: "Full Buy W%",    h: avg(e => e.full_buy_win_pct),  a: avgA(e => e.full_buy_win_pct) },
            );
          }
          if (rows.length === 0) return null;
          return (
            <Panel title="Economy Breakdown">
              <div className="flex justify-between text-2xs text-t3 mb-1.5 font-medium">
                <span className="text-accent-blue truncate max-w-[40%]">{match.home.name}</span>
                <span className="text-amber-400 truncate max-w-[40%] text-right">{match.away.name}</span>
              </div>
              {rows.map(({ label, h, a }) => {
                const hPct = h != null ? Math.round(h * 100) : null;
                const aPct = a != null ? Math.round(a * 100) : null;
                const hWins = hPct != null && aPct != null && hPct > aPct;
                const aWins = hPct != null && aPct != null && aPct > hPct;
                return (
                  <div key={label} className="py-1.5 border-b border-white/8 last:border-0">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className={cn("font-mono font-medium", hWins ? "text-accent-green" : "text-t1")}>{hPct != null ? `${hPct}%` : "—"}</span>
                      <span className="text-2xs text-t3">{label}</span>
                      <span className={cn("font-mono font-medium", aWins ? "text-accent-green" : "text-t1")}>{aPct != null ? `${aPct}%` : "—"}</span>
                    </div>
                    {hPct != null && aPct != null && (
                      <div className="flex h-1 rounded overflow-hidden">
                        <div className="bg-accent-blue/70" style={{ width: `${hPct / (hPct + aPct) * 100}%` }} />
                        <div className="bg-amber-500/70 flex-1" />
                      </div>
                    )}
                  </div>
                );
              })}
            </Panel>
          );
        })()}

        {/* CS2 Opening Duels */}
        {(() => {
          const odH = (match as any).cs2_opening_duels_home as Cs2OpeningDuelOut | null;
          const odA = (match as any).cs2_opening_duels_away as Cs2OpeningDuelOut | null;
          if (!odH && !odA) return null;
          return (
            <Panel title="Opening Duels">
              <div className="flex justify-between text-2xs text-t3 mb-1.5 font-medium">
                <span className="text-accent-blue truncate max-w-[40%]">{match.home.name}</span>
                <span className="text-amber-400 truncate max-w-[40%] text-right">{match.away.name}</span>
              </div>
              {[
                { label: "Opening Win %", h: odH?.opening_win_pct, a: odA?.opening_win_pct, pct: true },
                { label: "Attempts/Rnd",  h: odH?.opening_attempts_per_round, a: odA?.opening_attempts_per_round, pct: false },
              ].map(({ label, h, a, pct: isPct }) => {
                const hV = h != null ? (isPct ? Math.round(h * 100) : +h.toFixed(2)) : null;
                const aV = a != null ? (isPct ? Math.round(a * 100) : +a.toFixed(2)) : null;
                const hWins = hV != null && aV != null && hV > aV;
                const aWins = hV != null && aV != null && aV > hV;
                return (
                  <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 py-1.5 border-b border-white/8 last:border-0 text-xs font-mono">
                    <span className={cn("font-medium", hWins ? "text-accent-green" : "text-t1")}>{hV != null ? `${hV}${isPct ? "%" : ""}` : "—"}</span>
                    <span className="text-2xs text-t3 text-center whitespace-nowrap">{label}</span>
                    <span className={cn("font-medium text-right", aWins ? "text-accent-green" : "text-t1")}>{aV != null ? `${aV}${isPct ? "%" : ""}` : "—"}</span>
                  </div>
                );
              })}
              {odH?.top_opener && (
                <div className="mt-1.5 text-2xs text-t3">
                  <span className="text-t2 font-medium">{match.home.name} star:</span> {odH.top_opener}
                  {odH.top_opener_win_pct != null && <span className="text-accent-blue ml-1">{Math.round(odH.top_opener_win_pct * 100)}% W</span>}
                </div>
              )}
              {odA?.top_opener && (
                <div className="mt-1 text-2xs text-t3">
                  <span className="text-t2 font-medium">{match.away.name} star:</span> {odA.top_opener}
                  {odA.top_opener_win_pct != null && <span className="text-amber-400 ml-1">{Math.round(odA.top_opener_win_pct * 100)}% W</span>}
                </div>
              )}
            </Panel>
          );
        })()}
      </SideCol>
    </SideGrid>
  );
}

function RosterTab({ match }: { match: EsportsMatch }) {
  const gt = match.match_info?.game_type;
  const isLol = gt === "lol";
  const isCs2 = gt === "cs2";
  const ph = match.players_home;
  const pa = match.players_away;

  const fH = match.form_home;
  const fA = match.form_away;
  const cs2Radar = isCs2 && (fH || fA) ? [
    { label: "Map Win%",   home: norm(fH?.map_win_pct    != null ? fH.map_win_pct    * 100 : null, 30, 80), away: norm(fA?.map_win_pct    != null ? fA.map_win_pct    * 100 : null, 30, 80) },
    { label: "Avg ADR",    home: norm(fH?.avg_adr,  60, 90),  away: norm(fA?.avg_adr,  60, 90) },
    { label: "KAST%",      home: norm(fH?.avg_kast  != null ? fH.avg_kast  * 100 : null, 60, 85), away: norm(fA?.avg_kast  != null ? fA.avg_kast  * 100 : null, 60, 85) },
    { label: "CT Win%",    home: norm(fH?.ct_win_pct != null ? fH.ct_win_pct * 100 : null, 40, 70), away: norm(fA?.ct_win_pct != null ? fA.ct_win_pct * 100 : null, 40, 70) },
    { label: "T Win%",     home: norm(fH?.t_win_pct  != null ? fH.t_win_pct  * 100 : null, 40, 70), away: norm(fA?.t_win_pct  != null ? fA.t_win_pct  * 100 : null, 40, 70) },
    { label: "Stability",  home: norm(fH?.roster_stability_score != null ? fH.roster_stability_score * 100 : null, 60, 100), away: norm(fA?.roster_stability_score != null ? fA.roster_stability_score * 100 : null, 60, 100) },
  ] : null;

  return (
    <SideGrid>
      <MainCol>
        {cs2Radar && (
          <Panel title="Team Profile Radar" subtitle="CS2 · Normalised 0–100">
            <TeamRadarChart
              metrics={cs2Radar}
              homeLabel={match.home.name}
              awayLabel={match.away.name}
              homeColor={colors.accentBlue}
              awayColor={colors.accentAmber}
              height={220}
            />
          </Panel>
        )}
        <Panel title={`${match.home.name}`} padded={false}>
          {isLol
            ? <LolPlayerTable players={ph.filter(p => p.team === "a")} teamName={match.home.name} />
            : <Cs2PlayerTable players={ph.filter(p => p.team === "a")} teamName={match.home.name} />
          }
        </Panel>
        <Panel title={`${match.away.name}`} padded={false}>
          {isLol
            ? <LolPlayerTable players={pa.filter(p => p.team === "b")} teamName={match.away.name} />
            : <Cs2PlayerTable players={pa.filter(p => p.team === "b")} teamName={match.away.name} />
          }
        </Panel>
      </MainCol>
      <SideCol>
        <Panel title="Roster Stability">
          <MetricRow label={match.home.name} value={match.form_home?.roster_stability_score != null ? pct(match.form_home.roster_stability_score) : "—"} />
          <MetricRow label={match.away.name} value={match.form_away?.roster_stability_score != null ? pct(match.form_away.roster_stability_score) : "—"} />
          <p className="text-2xs text-t3 mt-2">Stability scores recent roster changes within a 90-day window. Lower = more uncertainty in predictions.</p>
        </Panel>
        <Panel title="Win Streaks">
          <MetricRow label={`${match.home.name} streak`} value={match.form_home?.current_win_streak ? `+${match.form_home.current_win_streak}W` : "—"} />
          <MetricRow label={`${match.away.name} streak`} value={match.form_away?.current_win_streak ? `+${match.form_away.current_win_streak}W` : "—"} />
        </Panel>

        {/* CS2 pistol/eco form stats */}
        {isCs2 && (fH || fA) && (
          <Panel title="Round Economy Form">
            {[
              { label: "Pistol Win %", hV: fH?.pistol_round_win_pct, aV: fA?.pistol_round_win_pct },
              { label: "Eco Win %",    hV: fH?.eco_win_pct,          aV: fA?.eco_win_pct          },
            ].map(({ label, hV, aV }) => {
              const hPct = hV != null ? Math.round(hV * 100) : null;
              const aPct = aV != null ? Math.round(aV * 100) : null;
              const hWins = hPct != null && aPct != null && hPct > aPct;
              const aWins = hPct != null && aPct != null && aPct > hPct;
              return (
                <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 py-1.5 border-b border-white/8 last:border-0 text-xs font-mono">
                  <span className={cn("font-medium", hWins ? "text-accent-green" : "text-t1")}>{hPct != null ? `${hPct}%` : "—"}</span>
                  <span className="text-2xs text-t3 text-center whitespace-nowrap">{label}</span>
                  <span className={cn("font-medium text-right", aWins ? "text-accent-green" : "text-t1")}>{aPct != null ? `${aPct}%` : "—"}</span>
                </div>
              );
            })}
          </Panel>
        )}
      </SideCol>
    </SideGrid>
  );
}

function H2HTab({ match }: { match: EsportsMatch }) {
  const h2h = match.h2h;
  if (!h2h || h2h.total_matches === 0) {
    return <Panel title="Head to Head"><EmptyState icon={Users} title="No H2H history" desc="No previous series between these teams." /></Panel>;
  }

  return (
    <SideGrid>
      <MainCol>
        <Panel title="H2H Record">
          <div className="grid grid-cols-3 gap-3 text-center py-2 mb-3">
            <div>
              <div className="text-2xl font-bold font-mono text-accent-blue">{h2h.team_a_wins}</div>
              <div className="text-2xs text-t2 truncate">{match.home.name}</div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-t3">{h2h.total_matches}</div>
              <div className="text-2xs text-t3">Total</div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-amber-400">{h2h.team_b_wins}</div>
              <div className="text-2xs text-t2 truncate">{match.away.name}</div>
            </div>
          </div>
          <WinBar pA={h2h.team_a_wins / h2h.total_matches} pB={h2h.team_b_wins / h2h.total_matches} labelA={match.home.name} labelB={match.away.name} />
        </Panel>

        <Panel title="Recent Series" padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-b0">
                  <th className="text-left py-2 px-3 text-t3 font-medium">Date</th>
                  <th className="text-center py-2 px-3 text-t3 font-medium">Score</th>
                  <th className="text-left py-2 px-3 text-t3 font-medium">Winner</th>
                </tr>
              </thead>
              <tbody>
                {h2h.recent_matches.map((m, i) => (
                  <tr key={i} className="border-b border-white/8 last:border-0 hover:bg-white/[0.04]">
                    <td className="py-2 px-3 text-t2">{m.date ? fmtDateShort(m.date) : "—"}</td>
                    <td className="py-2 px-3 text-center font-mono text-t1">{m.team_a_score ?? "?"} – {m.team_b_score ?? "?"}</td>
                    <td className="py-2 px-3">
                      <span className={cn("font-medium", m.winner === "a" ? "text-accent-blue" : "text-amber-400")}>
                        {m.winner === "a" ? (m.team_a_name || match.home.name) : (m.team_b_name || match.away.name)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </MainCol>
      <SideCol>
        <Panel title="Notes">
          <EmptyState icon={Info} title="Style matchup analysis" desc="Model-generated notes on head-to-head tendencies coming soon." />
        </Panel>
      </SideCol>
    </SideGrid>
  );
}

function EloTab({ match, eloHomeHistory, eloAwayHistory }: Props) {
  const eH = match.elo_home;
  const eA = match.elo_away;

  const allDates = new Set([...eloHomeHistory.map(p => p.date), ...eloAwayHistory.map(p => p.date)]);
  const homeMap = Object.fromEntries(eloHomeHistory.map(p => [p.date, p.rating]));
  const awayMap = Object.fromEntries(eloAwayHistory.map(p => [p.date, p.rating]));
  const chartData = Array.from(allDates).sort().map(date => ({
    date: new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    [match.home.name]: homeMap[date] ?? null,
    [match.away.name]: awayMap[date] ?? null,
  }));

  let pA = 0.5, pB = 0.5;
  if (eH && eA) {
    pA = eloWinProb(eH.overall_rating, eA.overall_rating);
    pB = 1 - pA;
  }

  return (
    <SideGrid>
      <MainCol>
        {eH && eA && (
          <Panel title="ELO-Implied Win Probability">
            <WinBar pA={pA} pB={pB} labelA={match.home.name} labelB={match.away.name} />
            {match.probabilities && (
              <div className="mt-2">
                <div className="text-2xs text-t3 mb-1">Model Prediction</div>
                <WinBar pA={match.probabilities.home_win} pB={match.probabilities.away_win} labelA={match.home.name} labelB={match.away.name} />
              </div>
            )}
          </Panel>
        )}
        <Panel title="ELO History">
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} {...chartDefaults}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border0} />
                <XAxis dataKey="date" tick={{ fill: colors.textMuted, fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: colors.textMuted, fontSize: 10 }} tickLine={false} width={45} domain={["auto", "auto"]} />
                <RechartTooltip
                  contentStyle={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", fontSize: "11px" }}
                  labelStyle={{ color: colors.textMuted }}
                />
                <Line dataKey={match.home.name} stroke={colors.accentBlue} dot={false} strokeWidth={2} connectNulls />
                <Line dataKey={match.away.name} stroke={colors.accentAmber} dot={false} strokeWidth={2} connectNulls />
                <Legend wrapperStyle={{ fontSize: "11px", color: colors.textMuted }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={TrendingUp} title="No ELO history" desc="ELO history populates after rated matches." />
          )}
        </Panel>
        {eH && eA && (
          <Panel title="ELO Breakdown">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-2xs text-t3 mb-1.5 font-medium">{match.home.name}</div>
                <MetricRow label="Overall" value={<span className="font-mono text-accent-blue">{eH.overall_rating}</span>} />
                <MetricRow label="Last match Δ" value={<Delta v={eH.rating_change} />} />
              </div>
              <div>
                <div className="text-2xs text-t3 mb-1.5 font-medium">{match.away.name}</div>
                <MetricRow label="Overall" value={<span className="font-mono text-amber-400">{eA.overall_rating}</span>} />
                <MetricRow label="Last match Δ" value={<Delta v={eA.rating_change} />} />
              </div>
            </div>
          </Panel>
        )}
      </MainCol>
      <SideCol>
        <Panel title="ELO Methodology">
          <div className="space-y-2 text-2xs text-t2">
            <p><span className="text-t1 font-medium">Base rating:</span> 1500</p>
            <p><span className="text-t1 font-medium">K-factor:</span> 40 × tournament tier × roster stability</p>
            <p><span className="text-t1 font-medium">Map ELO:</span> Per-map delta tracked separately from global</p>
            <p><span className="text-t1 font-medium">Tournament multipliers:</span><br/>Major 1.5 · S-Tier 1.3 · A-Tier 1.0 · B-Tier 0.7</p>
            <p><span className="text-t1 font-medium">Roster instability:</span> K boosted 40% for unstable rosters</p>
            <p><span className="text-t1 font-medium">Patch decay:</span> Time decay rate 0.85 — results from 45+ days ago are down-weighted</p>
            {match.match_info?.game_type === "lol" && (
              <p><span className="text-t1 font-medium">Patch era:</span> Major patches apply additional K-boost (hard meta reset)</p>
            )}
          </div>
        </Panel>
        {eH && eA && (
          <Panel title="ELO Delta">
            <MetricRow label="ELO diff" value={`${(eH.overall_rating - eA.overall_rating).toFixed(0)}`} accent />
            <MetricRow label={`${match.home.name} Δ`} value={<Delta v={eH.rating_change} />} />
            <MetricRow label={`${match.away.name} Δ`} value={<Delta v={eA.rating_change} />} />
          </Panel>
        )}
      </SideCol>
    </SideGrid>
  );
}

function ModelTab({ match }: { match: EsportsMatch }) {
  const p = match.probabilities;
  const fo = match.fair_odds;
  const drivers = match.key_drivers ?? [];
  const model = match.model;

  return (
    <SideGrid>
      <MainCol>
        {p ? (
          <Panel title="Win Probability">
            <WinBar pA={p.home_win} pB={p.away_win} labelA={match.home.name} labelB={match.away.name} />
          </Panel>
        ) : (
          <Panel title="Win Probability">
            <EmptyState icon={Target} title="No model prediction" desc="Using ELO-derived probabilities." />
          </Panel>
        )}

        {drivers.length > 0 ? (
          <Panel title="Feature Drivers">
            <div className="space-y-1.5">
              {drivers.slice(0, 10).map((d, i) => {
                const maxImp = Math.max(...drivers.map(x => Math.abs(x.importance)));
                const barW = maxImp > 0 ? (Math.abs(d.importance) / maxImp) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-2xs text-t2 w-36 shrink-0 truncate">{d.feature}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.08]">
                      <div className={cn("h-full rounded-full", d.importance > 0 ? "bg-accent-blue" : "bg-amber-500")} style={{ width: `${barW}%` }} />
                    </div>
                    <span className="text-2xs font-mono text-t3 w-12 text-right">{d.value != null ? d.value.toFixed(2) : "—"}</span>
                    <span className={cn("text-2xs font-mono w-12 text-right", d.importance > 0 ? "text-accent-blue" : "text-amber-400")}>
                      {d.importance > 0 ? "+" : ""}{d.importance.toFixed(3)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        ) : (
          <Panel title="Feature Drivers">
            <EmptyState icon={BarChart2} title="No driver data" desc="Feature importance data not available for this match." />
          </Panel>
        )}
      </MainCol>
      <SideCol>
        <Panel title="Model Info">
          {model ? (
            <>
              <MetricRow label="Version" value={model.version} />
              {model.algorithm && <MetricRow label="Algorithm" value={model.algorithm} />}
              {model.trained_at && <MetricRow label="Trained" value={fmtDate(model.trained_at)} />}
              {model.accuracy != null && <MetricRow label="Accuracy" value={`${(model.accuracy * 100).toFixed(1)}%`} accent />}
              {model.brier_score != null && <MetricRow label="Brier score" value={model.brier_score.toFixed(4)} />}
              {model.n_train_samples != null && <MetricRow label="Train samples" value={model.n_train_samples.toLocaleString()} />}
            </>
          ) : <EmptyState icon={Info} title="No model metadata" />}
        </Panel>
        {match.simulation?.distribution?.length ? (() => {
          const sim = match.simulation!;
          const top = [...sim.distribution].sort((a, b) => b.probability - a.probability).slice(0, 8);
          const maxProb = top[0]?.probability ?? 1;
          return (
            <Panel title="Score Simulation" subtitle={`${sim.n_simulations.toLocaleString()} simulations`}>
              <div className="space-y-1.5">
                {top.map((d) => (
                  <div key={d.score} className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold w-10 text-center" style={{ color: "var(--t1)" }}>{d.score}</span>
                    <div className="flex-1 h-4 rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div className="h-full rounded-lg bg-accent-blue/50" style={{ width: `${(d.probability / maxProb) * 100}%` }} />
                    </div>
                    <span className="text-[11px] font-mono w-10 text-right" style={{ color: "var(--t3)" }}>{(d.probability * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </Panel>
          );
        })() : null}
        {fo && (
          <Panel title="Fair Odds">
            <MetricRow label={match.home.name} value={fo.home_win?.toFixed(2) ?? "—"} accent />
            <MetricRow label={match.away.name} value={fo.away_win?.toFixed(2) ?? "—"} />
          </Panel>
        )}
        {match.betting && (match.betting.home_ml != null || match.betting.away_ml != null) && (
          <Panel title="Market Odds">
            <div className="flex gap-3">
              {[
                { label: 'Home', val: match.betting.home_ml, prob: match.probabilities?.home_win },
                { label: 'Away', val: match.betting.away_ml, prob: match.probabilities?.away_win },
              ].map(({ label, val, prob }) => {
                if (val == null) return null;
                const edge = prob != null ? (prob - 1 / Number(val)) * 100 : null;
                return (
                  <div key={label} className="flex-1 bg-white/[0.04] rounded border border-white/8 p-3 flex flex-col items-center gap-1">
                    <span className="text-2xs text-t2">{label}</span>
                    <span className="text-lg font-bold font-mono text-t0">{Number(val).toFixed(2)}</span>
                    {edge != null && (
                      <span className={cn("text-2xs font-semibold font-mono", edge > 0 ? "text-accent-green" : "text-accent-red")}>
                        {edge > 0 ? "+" : ""}{edge.toFixed(1)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
        <Panel title="Sensitivity">
          <EmptyState icon={Activity} title="Sensitivity analysis" desc="What-if analysis coming soon." />
        </Panel>
      </SideCol>
    </SideGrid>
  );
}

function ContextTab({ match }: { match: EsportsMatch }) {
  const info = match.match_info;
  const fH = match.form_home;
  const fA = match.form_away;

  const checks = [
    { label: "Match meta (game/format)",     ok: !!info                              },
    { label: "LAN/online flag",              ok: info?.is_lan !== undefined           },
    { label: "Patch version",                ok: !!info?.patch_version                },
    { label: "ELO (global)",                 ok: !!match.elo_home                    },
    { label: "Model prediction",             ok: !!match.probabilities               },
    { label: "Key drivers",                  ok: (match.key_drivers?.length ?? 0) > 0 },
    { label: "Team form",                    ok: !!match.form_home                   },
    { label: "Roster stability scores",      ok: fH?.roster_stability_score != null  },
    { label: "Per-map results",              ok: match.maps.length > 0               },
    { label: "Veto sequence (CS2)",          ok: match.veto.length > 0               },
    { label: "Player stats",                 ok: match.players_home.length > 0       },
    { label: "H2H history",                  ok: (match.h2h?.total_matches ?? 0) > 0 },
  ];

  const flags: string[] = [];
  if (!info) flags.push("Match metadata missing.");
  if (!match.probabilities) flags.push("No model prediction — showing ELO-derived odds.");
  if (!match.form_home) flags.push("Team form data not available.");
  if (fH?.roster_stability_score != null && fH.roster_stability_score < 0.6) flags.push(`${match.home.name} has recent roster changes (stability ${Math.round(fH.roster_stability_score * 100)}%).`);
  if (fA?.roster_stability_score != null && fA.roster_stability_score < 0.6) flags.push(`${match.away.name} has recent roster changes (stability ${Math.round(fA.roster_stability_score * 100)}%).`);

  return (
    <SideGrid>
      <MainCol>
        <Panel title="Match Conditions">
          <MetricRow label="Game" value={<span className={gameColor(info?.game_type)}>{gameLabel(info?.game_type)}</span>} />
          {info?.series_format && <MetricRow label="Format" value={info.series_format.toUpperCase()} />}
          <MetricRow label="Setting" value={info?.is_lan
            ? <span className="flex items-center gap-1"><Monitor size={11} className="text-purple-400" />LAN</span>
            : <span className="flex items-center gap-1"><Wifi size={11} className="text-blue-400" />Online</span>
          } />
          {info?.patch_version && <MetricRow label="Patch" value={`v${info.patch_version}`} />}
          {info?.tournament_tier && <MetricRow label="Tournament tier" value={info.tournament_tier} />}
        </Panel>

        {info?.game_type === "lol" && (
          <Panel title="Patch Notes Placeholder">
            <EmptyState icon={Layers} title="Patch impact analysis" desc="Patch-specific champion/meta shift analysis coming soon." />
          </Panel>
        )}

        {flags.length > 0 && (
          <Panel title="Data Flags">
            <div className="space-y-1.5">
              {flags.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                  <span className="text-t2">{f}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </MainCol>
      <SideCol>
        <Panel title="Data Completeness">
          <div className="space-y-1">
            {checks.map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-2 py-1 border-b border-white/8 last:border-0">
                {ok ? <CheckCircle2 size={11} className="text-accent-green shrink-0" /> : <XCircle size={11} className="text-white/25 shrink-0" />}
                <span className={cn("text-2xs", ok ? "text-t2" : "text-t3")}>{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-2xs text-t3">
            {checks.filter(c => c.ok).length}/{checks.length} fields populated
          </div>
        </Panel>
      </SideCol>
    </SideGrid>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function EsportsMatchDetail({ match, eloHomeHistory, eloAwayHistory }: Props) {
  const [tab, setTab] = useState<TabId>("overview");
  const router = useRouter();
  const isLive = match.status === "live";
  const tick = useLiveRefresh(isLive);
  useEffect(() => { if (tick > 0) router.refresh(); }, [tick, router]);

  return (
    <div className="match-page-shell match-page-shell--contained">
      <EsportsMatchHeader match={match} />
      <div className="match-kpi-strip match-kpi-strip--soft overflow-hidden"><EsportsKpiStrip match={match} /></div>

      {match.status === "live" && <div className="match-live-wrap px-1"><EsportsLivePanel match={match as any} /></div>}

      <div className="match-tabbar-wrap">
      <div className="match-tabbar mb-1 scrollbar-none">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="match-tab" data-active={tab === t.id}
          >
            {t.label}
          </button>
        ))}
      </div>
      </div>

      <div className="match-content-wrap">
        {tab === "overview" && <OverviewTab match={match} />}
        {tab === "series"   && <SeriesTab match={match} />}
        {tab === "roster"   && <RosterTab match={match} />}
        {tab === "h2h"      && <H2HTab match={match} />}
        {tab === "elo"      && <EloTab match={match} eloHomeHistory={eloHomeHistory} eloAwayHistory={eloAwayHistory} />}
        {tab === "model"    && <ModelTab match={match} />}
        {tab === "context"  && <ContextTab match={match} />}
      </div>
    </div>
  );
}
