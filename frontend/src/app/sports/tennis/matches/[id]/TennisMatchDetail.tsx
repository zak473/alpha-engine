"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveRefresh } from "@/lib/hooks/useLiveRefresh";
import {
  ArrowLeft, Calendar, Clock, Activity, TrendingUp, TrendingDown,
  BarChart2, Wind, Zap, Shield, CheckCircle2, XCircle, AlertTriangle,
  Info, Target, Layers, Award, Waves, ChevronRight, Users,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RechartTooltip,
  CartesianGrid, ResponsiveContainer, BarChart, Bar, Cell, Legend,
} from "recharts";
import type {
  TennisMatchDetail as TennisMatch,
  TennisServeStatsOut,
  TennisPlayerFormOut,
  TennisSurfaceEloOut,
  TennisPlayerProfileOut,
  TennisTiebreakOut,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { chartDefaults, colors } from "@/lib/tokens";
import { FormStreak } from "@/components/charts/FormStreak";
import { TeamRadarChart, norm } from "@/components/charts/TeamRadarChart";
import { ScoringTimeline } from "@/components/charts/ScoringTimeline";
import { TennisLivePanel } from "@/components/live/LiveMatchPanel";
import { SportMatchHeader } from "@/components/match/SportMatchHeader";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EloPoint { date: string; rating: number }

interface Props {
  match: TennisMatch;
  eloHomeOverall: EloPoint[];
  eloAwayOverall: EloPoint[];
  eloHomeSurface: EloPoint[];
  eloAwaySurface: EloPoint[];
}

type TabId = "overview" | "serve" | "sets" | "h2h" | "surface" | "elo" | "model" | "context";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview"      },
  { id: "serve",    label: "Serve/Return"  },
  { id: "sets",     label: "Sets & Momentum" },
  { id: "h2h",      label: "H2H"           },
  { id: "surface",  label: "Surface"       },
  { id: "elo",      label: "ELO"           },
  { id: "model",    label: "Model"         },
  { id: "context",  label: "Context"       },
];

// ─── Utility ─────────────────────────────────────────────────────────────────

const n   = (v: number | null | undefined, d = 1) => v == null ? "—" : v.toFixed(d);
const pct = (v: number | null | undefined, already100 = false) => {
  if (v == null) return "—";
  const val = already100 ? v : v * 100;
  return `${val.toFixed(1)}%`;
};
const abs = (v: number | null | undefined) => v == null ? "—" : String(Math.round(v));

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " UTC";
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function eloWinProb(rA: number, rB: number) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

// Dominance Ratio: serve_hold% × (1 + break%) — higher = more dominant
function dominanceRatio(hold: number | null | undefined, breakPct: number | null | undefined) {
  if (hold == null || breakPct == null) return null;
  return ((hold * (1 + breakPct)) * 100).toFixed(1);
}

// Surface colour coding
function surfaceColor(s: string | null | undefined) {
  switch ((s || "").toLowerCase()) {
    case "clay":   return "text-amber-400";
    case "grass":  return "text-green-400";
    case "hard":   return "text-blue-400";
    case "carpet": return "text-purple-400";
    default:       return "text-t2";
  }
}
function surfaceBg(s: string | null | undefined) {
  switch ((s || "").toLowerCase()) {
    case "clay":   return "bg-amber-500/15 text-amber-400 border border-amber-500/25";
    case "grass":  return "bg-green-500/15 text-green-400 border border-green-500/25";
    case "hard":   return "bg-blue-500/15 text-blue-400 border border-blue-500/25";
    case "carpet": return "bg-purple-500/15 text-purple-400 border border-purple-500/25";
    default:       return "bg-bg2 text-t2 border border-b0";
  }
}

// Tournament level badge
function levelLabel(level: string | null | undefined) {
  const map: Record<string, string> = {
    grand_slam: "Grand Slam",
    masters_1000: "Masters 1000",
    masters: "Masters",
    atp_500: "ATP 500",
    atp_250: "ATP 250",
    challenger: "Challenger",
    itf: "ITF",
    wta_1000: "WTA 1000",
    wta_500: "WTA 500",
    wta_250: "WTA 250",
  };
  return map[level?.toLowerCase() || ""] || level || null;
}

// ─── Shared Micro-Components ─────────────────────────────────────────────────

function Panel({
  title, subtitle, badge, action, padded = true, children,
}: {
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

function Delta({ v, unit = "" }: { v: number | null | undefined; unit?: string }) {
  if (v == null) return <span className="text-t3">—</span>;
  const pos = v >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-2xs font-mono", pos ? "text-accent-green" : "text-accent-red")}>
      {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {pos ? "+" : ""}{v.toFixed(1)}{unit}
    </span>
  );
}

function FormPills({ wins, losses, label }: { wins?: number | null; losses?: number | null; label?: string }) {
  // Approximate form order: W first, then L
  const items: Array<"W" | "L"> = [
    ...Array(wins ?? 0).fill("W" as const),
    ...Array(losses ?? 0).fill("L" as const),
  ].slice(0, 5);
  const cls = {
    W: "bg-positive/15 text-positive border border-positive/25",
    L: "bg-negative/15 text-negative border border-negative/25",
  };
  return (
    <div className="flex items-center gap-1">
      {label && <span className="text-2xs text-t3 mr-1">{label}</span>}
      {items.length === 0
        ? <span className="text-2xs text-t3">—</span>
        : items.map((r, i) => (
          <span key={i} className={cn("inline-flex items-center justify-center w-5 h-5 rounded text-2xs font-bold", cls[r])}>
            {r}
          </span>
        ))}
    </div>
  );
}

function WinBar({ pA, pB, labelA, labelB }: { pA: number; pB: number; labelA: string; labelB: string }) {
  const hPct = Math.round(pA * 100);
  const aPct = Math.round(pB * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-2xs text-t2">
        <span className="truncate max-w-[45%]">{labelA} <span className="text-t1 font-mono font-medium">{hPct}%</span></span>
        <span className="truncate max-w-[45%] text-right"><span className="text-t1 font-mono font-medium">{aPct}%</span> {labelB}</span>
      </div>
      <div className="flex h-2 rounded overflow-hidden">
        <div className="bg-accent-blue transition-all" style={{ width: `${hPct}%` }} />
        <div className="bg-amber-500 transition-all flex-1" />
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

function PlayerProfileCard({ profile, color, tiebreakRecord, tiebreakTotal }: {
  profile: TennisPlayerProfileOut;
  color: string;
  tiebreakRecord?: string;
  tiebreakTotal?: number;
}) {
  const flagCode = profile.nationality ? profile.nationality.toUpperCase().slice(0, 3) : null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-2">
        {flagCode && <span className="text-2xs text-t3 font-medium">{flagCode}</span>}
        {profile.ranking != null && (
          <span className={`text-sm font-bold font-mono ${color}`}>#{profile.ranking}</span>
        )}
        {profile.ranking_points != null && (
          <span className="text-2xs text-t3">{profile.ranking_points.toLocaleString()} pts</span>
        )}
        {profile.ranking_change_week != null && (
          <Delta v={-profile.ranking_change_week} unit="" />
        )}
      </div>
      {profile.age != null        && <MetricRow label="Age"          value={`${profile.age} yrs`} />}
      {profile.plays              && <MetricRow label="Plays"        value={profile.plays} />}
      {profile.backhand           && <MetricRow label="Backhand"     value={profile.backhand} />}
      {profile.coach              && <MetricRow label="Coach"        value={profile.coach} />}
      {profile.turned_pro != null && <MetricRow label="Turned pro"   value={profile.turned_pro.toString()} />}
      {profile.height_cm != null  && <MetricRow label="Height"       value={`${profile.height_cm} cm`} />}
      {profile.career_titles != null && <MetricRow label="Career titles" value={profile.career_titles.toString()} accent />}
      {profile.grand_slams != null   && <MetricRow label="Grand Slams"  value={profile.grand_slams.toString()} />}
      {(profile.season_wins != null || profile.season_losses != null) && (
        <MetricRow label="Season W-L" value={`${profile.season_wins ?? 0}–${profile.season_losses ?? 0}`} />
      )}
      {tiebreakRecord && tiebreakTotal != null && (
        <MetricRow label="TB record" value={`${tiebreakRecord} (${tiebreakTotal} total)`} />
      )}
      {profile.prize_money_ytd_usd != null && (
        <MetricRow label="Prize YTD" value={`$${(profile.prize_money_ytd_usd / 1000).toFixed(0)}k`} />
      )}
    </div>
  );
}

function StatDuel({
  label, vA, vB, higherBetter = true, unit = "",
}: { label: string; vA: number | null; vB: number | null; higherBetter?: boolean; unit?: string }) {
  const aWins = vA != null && vB != null && (higherBetter ? vA > vB : vA < vB);
  const bWins = vA != null && vB != null && (higherBetter ? vB > vA : vB < vA);
  const fmt = (v: number | null) => v == null ? "—" : `${v.toFixed(1)}${unit}`;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 py-1.5 border-b border-b0 last:border-0 text-xs font-mono">
      <span className={cn("font-medium", aWins ? "text-accent-green" : "text-t1")}>{fmt(vA)}</span>
      <span className="text-2xs text-t3 text-center whitespace-nowrap">{label}</span>
      <span className={cn("font-medium text-right", bWins ? "text-accent-green" : "text-t1")}>{fmt(vB)}</span>
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

// ─── Layout Helpers ───────────────────────────────────────────────────────────

function SideGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">{children}</div>;
}
function MainCol({ children }: { children: React.ReactNode }) {
  return <div className="lg:col-span-8 flex flex-col gap-3">{children}</div>;
}
function SideCol({ children }: { children: React.ReactNode }) {
  return <div className="lg:col-span-4 flex flex-col gap-3">{children}</div>;
}

const initials = (name: string) => name.split(" ").map(s => s[0]).slice(0,2).join("").toUpperCase();
const flagText = (profile?: TennisPlayerProfileOut | null) => profile?.nationality ? profile.nationality.toUpperCase().slice(0,3) : null;

// ─── Player Block (header) ────────────────────────────────────────────────────

function PlayerBlock({
  name, isHome, elo, form, info, side, profile,
}: {
  name: string;
  isHome: boolean;
  elo: TennisSurfaceEloOut | null;
  form: TennisPlayerFormOut | null;
  info: TennisMatch["tennis_info"];
  side: "home" | "away";
  profile?: TennisPlayerProfileOut | null;
}) {
  const daysRest = side === "home" ? info?.player_a_days_rest : info?.player_b_days_rest;
  const last14   = side === "home" ? info?.player_a_matches_last_14d : info?.player_b_matches_last_14d;
  const rank = profile?.ranking != null ? `#${profile.ranking}` : null;
  const nat = flagText(profile);

  return (
    <div className="match-hero-team" data-side={isHome ? "home" : "away"}>
      <div className="match-hero-id">
        <div className="match-avatar">{initials(name)}</div>
        <div className="min-w-0">
          <div className="match-hero-name truncate">{name}</div>
          <div className="match-hero-sub">{[nat, rank].filter(Boolean).join(" • ") || "Tour profile"}</div>
        </div>
      </div>

      <div className="match-meta-row">
        {elo && <span className="match-meta-chip match-meta-chip--green">ELO {Math.round(elo.surface_rating ?? elo.overall_rating)}</span>}
        {profile?.plays && <span className="match-meta-chip">{profile.plays}</span>}
        {info?.surface && <span className="match-meta-chip">{info.surface}</span>}
      </div>

      <div className="match-meta-row">
        {daysRest != null && <span className={cn("match-meta-chip", daysRest < 2 ? "match-meta-chip--amber" : "match-meta-chip--green")}>{daysRest}d rest</span>}
        {last14 != null && <span className="match-meta-chip">{last14} matches / 14d</span>}
        {form && <span className="match-meta-chip">{form.wins ?? 0}W · {form.losses ?? 0}L</span>}
      </div>
    </div>
  );
}

// ─── Match Block (header centre) ─────────────────────────────────────────────

function MatchBlock({ match }: { match: TennisMatch }) {
  const info = match.tennis_info;
  const status = match.status;
  const sets = info?.sets_detail ?? [];
  const liveClock = match.live_clock || (status === "live" ? "Live" : fmtTime(match.kickoff_utc));

  return (
    <div className="match-hero-center">
      <span className="match-hero-eyebrow">Never In Doubt</span>
      <div className="match-hero-centerMeta">
        <div className="text-base font-semibold text-t1 text-center">{match.league}</div>
        <div className="match-hero-subtle">{[info?.round_name, info?.surface, info?.is_indoor ? "Indoor" : null].filter(Boolean).join(" • ") || fmtDate(match.kickoff_utc)}</div>
      </div>

      {(status === "finished" || status === "live") ? (
        <div className="match-hero-score">
          <span className="match-hero-scoreNum">{match.home_score ?? 0}</span>
          <span className="match-hero-scoreDivider">–</span>
          <span className="match-hero-scoreNum">{match.away_score ?? 0}</span>
        </div>
      ) : (
        <div className="match-hero-centerMeta">
          <div className="match-hero-subtle text-sm font-semibold uppercase tracking-[0.2em]">Scheduled</div>
          <div className="match-hero-subtle">{fmtTime(match.kickoff_utc)}</div>
        </div>
      )}

      <div className="match-meta-row justify-center">
        <StatusBadge status={status} />
        {info?.best_of && <span className="match-meta-chip">Best of {info.best_of}</span>}
        <span className="match-meta-chip">{liveClock}</span>
      </div>

      {sets.length > 0 && (
        <div className="match-meta-row justify-center">
          {sets.map((s, i) => (
            <span key={i} className="match-meta-chip">S{s.set_num}: {s.a}-{s.b}</span>
          ))}
        </div>
      )}

      {match.probabilities && (
        <div className="match-hero-prob">
          <div className="match-hero-probBar">
            <div style={{ width: `${Math.round(match.probabilities.home_win * 100)}%` }} className="bg-[#2edb6c]" />
            <div className="bg-[#f0bf58] flex-1" />
          </div>
          <div className="match-hero-probLabel">
            <span>{Math.round(match.probabilities.home_win * 100)}%</span>
            <span>{Math.round(match.probabilities.away_win * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 3-Col Match Header ───────────────────────────────────────────────────────

function TennisMatchHeader({ match }: { match: TennisMatch }) {
  const info = match.tennis_info;
  return (
    <SportMatchHeader
      sport="tennis"
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
      eloHome={match.elo_home ? { rating: match.elo_home.surface_rating ?? match.elo_home.overall_rating, rating_change: match.elo_home.rating_change } : null}
      eloAway={match.elo_away ? { rating: match.elo_away.surface_rating ?? match.elo_away.overall_rating, rating_change: match.elo_away.rating_change } : null}
      formHome={null}
      formAway={null}
      venue={info?.surface ?? undefined}
      centerExtras={info?.surface ? (
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
          {info.surface}
        </span>
      ) : undefined}
    />
  );
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiCell({ label, value, sub, accent, tone = "soft" }: { label: string; value: React.ReactNode; sub?: string; accent?: string; tone?: "soft" | "mint" | "cream" }) {
  return (
    <div className={cn("detail-kpi-card", tone === "mint" && "detail-kpi-card--mint", tone === "cream" && "detail-kpi-card--cream", tone === "soft" && "detail-kpi-card--soft")}>
      <span className="detail-kpi-label block truncate">{label}</span>
      <span className={cn("detail-kpi-value block truncate", accent ?? "text-t1")}>{value}</span>
      {sub && <span className="detail-kpi-sub block truncate">{sub}</span>}
    </div>
  );
}

function TennisKpiStrip({ match }: { match: TennisMatch }) {
  const p = match.probabilities;
  const fo = match.fair_odds;
  const elo_h = match.elo_home;
  const elo_a = match.elo_away;
  const fH = match.form_home;
  const info = match.tennis_info;

  const surfaceHome = elo_h ? Math.round(elo_h.surface_rating ?? elo_h.overall_rating) : null;
  const surfaceAway = elo_a ? Math.round(elo_a.surface_rating ?? elo_a.overall_rating) : null;
  const eloDiff = surfaceHome != null && surfaceAway != null ? surfaceHome - surfaceAway : null;
  const edge = p && fo?.home_win ? ((p.home_win - (1 / fo.home_win)) * 100) : null;

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="detail-kpi-grid">
        <KpiCell label="Model Win" value={p ? `${Math.round(p.home_win * 100)}%` : "—"} sub={match.home.name} accent="text-[#178445]" tone="mint" />
        <KpiCell label="Fair Odds" value={fo?.home_win ? fo.home_win.toFixed(2) : "—"} sub={`${match.home.name} price`} tone="soft" />
        <KpiCell label="Confidence" value={match.confidence ? `${match.confidence}%` : "—"} sub="Model signal" tone="soft" />
        <KpiCell label="Value" value={edge != null ? `${edge >= 0 ? '+' : ''}${edge.toFixed(1)}%` : "—"} sub="Model edge" tone="cream" />
      </div>
      <div className="detail-kpi-grid">
        <KpiCell label="Surface ELO" value={surfaceHome != null ? `${surfaceHome}` : "—"} sub={match.home.name} tone="soft" />
        <KpiCell label="Surface ELO" value={surfaceAway != null ? `${surfaceAway}` : "—"} sub={match.away.name} tone="soft" />
        <KpiCell label="ELO Delta" value={eloDiff != null ? `${eloDiff >= 0 ? '+' : ''}${eloDiff}` : "—"} sub="Home − away" tone={eloDiff != null && eloDiff >= 0 ? "mint" : "cream"} />
        <KpiCell label="Rest / Form" value={`${info?.player_a_days_rest ?? "—"}d · ${fH?.wins ?? 0}-${fH?.losses ?? 0}`} sub={match.home.name.split(" ").slice(-1)[0]} tone="soft" />
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ match }: { match: TennisMatch }) {
  const fH = match.form_home;
  const fA = match.form_away;
  const info = match.tennis_info;

  const compareMetrics = [
    { label: "Win % (form)",        vA: fH?.win_pct,                 vB: fA?.win_pct,                 unit: "%", factor: 100 },
    { label: "Hold %",              vA: fH?.avg_service_hold_pct,    vB: fA?.avg_service_hold_pct,    unit: "%", factor: 100 },
    { label: "Break %",             vA: fH?.avg_bp_conversion_pct,   vB: fA?.avg_bp_conversion_pct,   unit: "%", factor: 100 },
    { label: "1st Serve In %",      vA: fH?.avg_first_serve_in_pct,  vB: fA?.avg_first_serve_in_pct,  unit: "%", factor: 100 },
    { label: "1st Serve Won %",     vA: fH?.avg_first_serve_won_pct, vB: fA?.avg_first_serve_won_pct, unit: "%", factor: 100 },
    { label: "Return Won %",        vA: fH?.avg_return_won_pct,      vB: fA?.avg_return_won_pct,      unit: "%", factor: 100 },
    { label: "Aces / match",        vA: fH?.avg_aces_per_match,      vB: fA?.avg_aces_per_match,      unit: "",  factor: 1   },
    { label: "DFs / match",         vA: fH?.avg_df_per_match,        vB: fA?.avg_df_per_match,        unit: "",  factor: 1, lower: true },
  ];

  return (
    <SideGrid>
      <MainCol>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="detail-soft-box">
            <div className="flex items-center gap-3">
              <div className="match-avatar">{initials(match.home.name)}</div>
              <div className="min-w-0">
                <div className="text-lg font-semibold text-t1 truncate">{match.home.name}</div>
                <div className="text-xs text-t2">{match.profile_home?.nationality ?? "Tour profile"}</div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-xl font-bold text-[#178445]">{match.profile_home?.ranking ? `#${match.profile_home.ranking}` : "—"}</div>
                <div className="text-xs text-t2">Rank</div>
              </div>
            </div>
          </div>
          <div className="detail-soft-box">
            <div className="flex items-center gap-3">
              <div className="match-avatar">{initials(match.away.name)}</div>
              <div className="min-w-0">
                <div className="text-lg font-semibold text-t1 truncate">{match.away.name}</div>
                <div className="text-xs text-t2">{match.profile_away?.nationality ?? "Tour profile"}</div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-xl font-bold text-[#178445]">{match.profile_away?.ranking ? `#${match.profile_away.ranking}` : "—"}</div>
                <div className="text-xs text-t2">Rank</div>
              </div>
            </div>
          </div>
        </div>

        {/* Player comparison */}
        <Panel title="Player Comparison" subtitle={`${info?.surface ?? "All surfaces"} · form avg`}>
          {/* Header */}
          <div className="detail-compare-head">
            <span>{match.home.name}</span>
            <span className="text-center">Metric</span>
            <span className="text-right">{match.away.name}</span>
          </div>
          {compareMetrics.map(({ label, vA, vB, unit, factor, lower }) => {
            const a = vA != null ? vA * factor : null;
            const b = vB != null ? vB * factor : null;
            return (
              <StatDuel
                key={label}
                label={label}
                vA={a}
                vB={b}
                higherBetter={!lower}
                unit={unit}
              />
            );
          })}
          {!fH && !fA && <EmptyState icon={BarChart2} title="No form data" desc="Rolling form stats not available" />}
        </Panel>

        {/* Win probability */}
        {match.probabilities && (
          <Panel title="Win Probability">
            <WinBar
              pA={match.probabilities.home_win}
              pB={match.probabilities.away_win}
              labelA={match.home.name}
              labelB={match.away.name}
            />
          </Panel>
        )}
      </MainCol>

      <SideCol>
        {/* Quick context */}
        <Panel title="Match Context">
          {info ? (
            <>
              <MetricRow label="Surface"         value={<span className={surfaceColor(info.surface)}>{info.surface}</span>} />
              <MetricRow label="Setting"         value={info.is_indoor ? "Indoor" : "Outdoor"} />
              {info.tournament_level && <MetricRow label="Level"     value={levelLabel(info.tournament_level) ?? info.tournament_level} />}
              {info.round_name        && <MetricRow label="Round"    value={info.round_name} />}
              <MetricRow label="Format"          value={`Best of ${info.best_of}`} />
              {info.match_duration_min && <MetricRow label="Duration" value={`${Math.floor(info.match_duration_min/60)}h ${info.match_duration_min%60}m`} />}
              {info.retired           && <MetricRow label="Note"     value={<span className="text-red-400">Retirement</span>} />}
            </>
          ) : (
            <EmptyState icon={Info} title="Match context unavailable" />
          )}
        </Panel>

        {/* Fatigue */}
        <Panel title="Fatigue Index">
          <MetricRow label={`${match.home.name} rest`}     value={info?.player_a_days_rest   != null ? `${info.player_a_days_rest}d`   : "—"} />
          <MetricRow label={`${match.away.name} rest`}     value={info?.player_b_days_rest   != null ? `${info.player_b_days_rest}d`   : "—"} />
          <MetricRow label={`${match.home.name} M/14d`}    value={info?.player_a_matches_last_14d != null ? `${info.player_a_matches_last_14d}` : "—"} />
          <MetricRow label={`${match.away.name} M/14d`}    value={info?.player_b_matches_last_14d != null ? `${info.player_b_matches_last_14d}` : "—"} />
        </Panel>

        {/* H2H summary */}
        {match.h2h && (
          <Panel title="H2H Summary">
            <MetricRow label="Total meetings"   value={match.h2h.total_matches} />
            <MetricRow label={`${match.home.name} wins`} value={match.h2h.player_a_wins} accent />
            <MetricRow label={`${match.away.name} wins`} value={match.h2h.player_b_wins} />
          </Panel>
        )}

        {/* Player profiles */}
        {(() => {
          const pH = (match as any).profile_home as TennisPlayerProfileOut | null;
          const pA = (match as any).profile_away as TennisPlayerProfileOut | null;
          const tb = (match as any).tiebreaks as TennisTiebreakOut | null;
          const fH = match.form_home;
          const fA = match.form_away;
          if (!pH && !pA) return null;
          return (
            <Panel title="Player Profiles">
              {pH && (
                <>
                  <div className="text-2xs font-medium text-t3 uppercase tracking-wide mb-1">{match.home.name}</div>
                  <PlayerProfileCard
                    profile={pH}
                    color="text-accent-blue"
                    tiebreakRecord={tb ? `${tb.player_a_tiebreaks_won}–${tb.player_b_tiebreaks_won}` : fH?.tiebreaks_won != null ? `${fH.tiebreaks_won}/${fH.tiebreaks_played}` : undefined}
                    tiebreakTotal={tb ? tb.player_a_tiebreaks_won + tb.player_b_tiebreaks_won : undefined}
                  />
                </>
              )}
              {pA && (
                <>
                  <div className="text-2xs font-medium text-t3 uppercase tracking-wide mt-3 mb-1">{match.away.name}</div>
                  <PlayerProfileCard
                    profile={pA}
                    color="text-amber-400"
                    tiebreakRecord={tb ? `${tb.player_b_tiebreaks_won}–${tb.player_a_tiebreaks_won}` : fA?.tiebreaks_won != null ? `${fA.tiebreaks_won}/${fA.tiebreaks_played}` : undefined}
                    tiebreakTotal={tb ? tb.player_a_tiebreaks_won + tb.player_b_tiebreaks_won : undefined}
                  />
                </>
              )}
            </Panel>
          );
        })()}
      </SideCol>
    </SideGrid>
  );
}

// ── Serve/Return Tab ──────────────────────────────────────────────────────────

function ServeReturnTab({ match }: { match: TennisMatch }) {
  const sH = match.stats_home;
  const sA = match.stats_away;
  const fH = match.form_home;
  const fA = match.form_away;

  if (!sH && !sA && !fH && !fA) {
    return (
      <Panel title="Serve / Return Stats">
        <EmptyState icon={Activity} title="No serve/return data" desc="Match stats are available after the match completes." />
      </Panel>
    );
  }

  const serveMetrics: Array<{ label: string; getA: (s: TennisServeStatsOut) => number | null; getB: (s: TennisServeStatsOut) => number | null; unit?: string; lower?: boolean }> = [
    { label: "Aces",              getA: s => s.aces,                 getB: s => s.aces                 },
    { label: "Double Faults",     getA: s => s.double_faults,        getB: s => s.double_faults,       lower: true },
    { label: "1st Serve In %",    getA: s => s.first_serve_in_pct != null ? s.first_serve_in_pct * 100 : null,
                                   getB: s => s.first_serve_in_pct != null ? s.first_serve_in_pct * 100 : null, unit: "%" },
    { label: "1st Serve Won %",   getA: s => s.first_serve_won_pct != null ? s.first_serve_won_pct * 100 : null,
                                   getB: s => s.first_serve_won_pct != null ? s.first_serve_won_pct * 100 : null, unit: "%" },
    { label: "2nd Serve Won %",   getA: s => s.second_serve_won_pct != null ? s.second_serve_won_pct * 100 : null,
                                   getB: s => s.second_serve_won_pct != null ? s.second_serve_won_pct * 100 : null, unit: "%" },
    { label: "Hold %",            getA: s => s.service_hold_pct != null ? s.service_hold_pct * 100 : null,
                                   getB: s => s.service_hold_pct != null ? s.service_hold_pct * 100 : null, unit: "%" },
  ];

  const returnMetrics: Array<{ label: string; getA: (s: TennisServeStatsOut) => number | null; getB: (s: TennisServeStatsOut) => number | null; unit?: string }> = [
    { label: "BP Faced",          getA: s => s.break_points_faced,      getB: s => s.break_points_faced        },
    { label: "BP Saved",          getA: s => s.break_points_saved,      getB: s => s.break_points_saved        },
    { label: "BP Created",        getA: s => s.break_points_created,    getB: s => s.break_points_created      },
    { label: "BP Converted",      getA: s => s.break_points_converted,  getB: s => s.break_points_converted    },
    { label: "Break %",           getA: s => s.bp_conversion_pct != null ? s.bp_conversion_pct * 100 : null,
                                   getB: s => s.bp_conversion_pct != null ? s.bp_conversion_pct * 100 : null, unit: "%" },
    { label: "1st Srv Ret Won %", getA: s => s.first_serve_return_won_pct != null ? s.first_serve_return_won_pct * 100 : null,
                                   getB: s => s.first_serve_return_won_pct != null ? s.first_serve_return_won_pct * 100 : null, unit: "%" },
    { label: "2nd Srv Ret Won %", getA: s => s.second_serve_return_won_pct != null ? s.second_serve_return_won_pct * 100 : null,
                                   getB: s => s.second_serve_return_won_pct != null ? s.second_serve_return_won_pct * 100 : null, unit: "%" },
  ];

  const radarMetrics = (fH || sH) ? [
    { label: "1st Srv %",    home: norm(sH?.first_serve_in_pct  != null ? sH.first_serve_in_pct * 100  : fH?.avg_first_serve_in_pct  != null ? fH.avg_first_serve_in_pct  * 100 : null, 0, 100),
                             away: norm(sA?.first_serve_in_pct  != null ? sA.first_serve_in_pct * 100  : fA?.avg_first_serve_in_pct  != null ? fA.avg_first_serve_in_pct  * 100 : null, 0, 100) },
    { label: "1st Srv Win",  home: norm(sH?.first_serve_won_pct != null ? sH.first_serve_won_pct * 100 : fH?.avg_first_serve_won_pct != null ? fH.avg_first_serve_won_pct * 100 : null, 0, 100),
                             away: norm(sA?.first_serve_won_pct != null ? sA.first_serve_won_pct * 100 : fA?.avg_first_serve_won_pct != null ? fA.avg_first_serve_won_pct * 100 : null, 0, 100) },
    { label: "2nd Srv Win",  home: norm(sH?.second_serve_won_pct != null ? sH.second_serve_won_pct * 100 : null, 0, 100),
                             away: norm(sA?.second_serve_won_pct != null ? sA.second_serve_won_pct * 100 : null, 0, 100) },
    { label: "Aces/Svc",     home: norm(sH?.aces != null && sH.service_games_played ? sH.aces / sH.service_games_played : null, 0, 5),
                             away: norm(sA?.aces != null && sA.service_games_played ? sA.aces / sA.service_games_played : null, 0, 5) },
    { label: "BP Saved %",   home: norm(sH?.break_points_faced != null && sH.break_points_saved != null && sH.break_points_faced > 0 ? (sH.break_points_saved / sH.break_points_faced) * 100 : null, 0, 100),
                             away: norm(sA?.break_points_faced != null && sA.break_points_saved != null && sA.break_points_faced > 0 ? (sA.break_points_saved / sA.break_points_faced) * 100 : null, 0, 100) },
    { label: "Hold %",       home: norm(sH?.service_hold_pct != null ? sH.service_hold_pct * 100 : fH?.avg_service_hold_pct != null ? fH.avg_service_hold_pct * 100 : null, 0, 100),
                             away: norm(sA?.service_hold_pct != null ? sA.service_hold_pct * 100 : fA?.avg_service_hold_pct != null ? fA.avg_service_hold_pct * 100 : null, 0, 100) },
  ] : null;

  return (
    <SideGrid>
      <MainCol>
        {radarMetrics && (
          <Panel title="Serve Profile Radar" subtitle="Normalised 0–100">
            <TeamRadarChart
              metrics={radarMetrics}
              homeLabel={match.home.name}
              awayLabel={match.away.name}
              homeColor={colors.accentBlue}
              awayColor={colors.accentAmber}
              height={220}
            />
          </Panel>
        )}
        {/* Serve profile */}
        {(sH || sA) && (
          <Panel title="Serve Profile" subtitle="This match">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-1 pb-1 mb-1 border-b border-b0 text-2xs text-t3 font-medium">
              <span>{match.home.name}</span>
              <span className="text-center">Stat</span>
              <span className="text-right">{match.away.name}</span>
            </div>
            {serveMetrics.map(({ label, getA, getB, unit, lower }) => (
              <StatDuel key={label} label={label} vA={sH ? getA(sH) : null} vB={sA ? getB(sA) : null} higherBetter={!lower} unit={unit ?? ""} />
            ))}
          </Panel>
        )}

        {/* Return / Break profile */}
        {(sH || sA) && (
          <Panel title="Return & Break Profile" subtitle="This match">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-1 pb-1 mb-1 border-b border-b0 text-2xs text-t3 font-medium">
              <span>{match.home.name}</span>
              <span className="text-center">Stat</span>
              <span className="text-right">{match.away.name}</span>
            </div>
            {returnMetrics.map(({ label, getA, getB, unit }) => (
              <StatDuel key={label} label={label} vA={sH ? getA(sH) : null} vB={sA ? getB(sA) : null} unit={unit ?? ""} />
            ))}
          </Panel>
        )}

        {/* Form averages comparison */}
        {(fH || fA) && (
          <Panel title="Form Averages" subtitle={`${match.form_home?.surface ?? "all surfaces"} · ${match.form_home?.window_days ?? 365}d window`}>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-1 pb-1 mb-1 border-b border-b0 text-2xs text-t3 font-medium">
              <span>{match.home.name}</span>
              <span className="text-center">Stat</span>
              <span className="text-right">{match.away.name}</span>
            </div>
            <StatDuel label="Hold % avg"      vA={fH?.avg_service_hold_pct   != null ? fH.avg_service_hold_pct   * 100 : null} vB={fA?.avg_service_hold_pct   != null ? fA.avg_service_hold_pct   * 100 : null} unit="%" />
            <StatDuel label="Break % avg"     vA={fH?.avg_bp_conversion_pct  != null ? fH.avg_bp_conversion_pct  * 100 : null} vB={fA?.avg_bp_conversion_pct  != null ? fA.avg_bp_conversion_pct  * 100 : null} unit="%" />
            <StatDuel label="1st Srv In % avg" vA={fH?.avg_first_serve_in_pct != null ? fH.avg_first_serve_in_pct * 100 : null} vB={fA?.avg_first_serve_in_pct != null ? fA.avg_first_serve_in_pct * 100 : null} unit="%" />
            <StatDuel label="1st Srv Won % avg" vA={fH?.avg_first_serve_won_pct != null ? fH.avg_first_serve_won_pct * 100 : null} vB={fA?.avg_first_serve_won_pct != null ? fA.avg_first_serve_won_pct * 100 : null} unit="%" />
            <StatDuel label="Ret Won % avg"   vA={fH?.avg_return_won_pct     != null ? fH.avg_return_won_pct     * 100 : null} vB={fA?.avg_return_won_pct     != null ? fA.avg_return_won_pct     * 100 : null} unit="%" />
            <StatDuel label="Aces / match"    vA={fH?.avg_aces_per_match ?? null} vB={fA?.avg_aces_per_match ?? null} />
            <StatDuel label="DFs / match"     vA={fH?.avg_df_per_match   ?? null} vB={fA?.avg_df_per_match   ?? null} higherBetter={false} />
          </Panel>
        )}
      </MainCol>

      <SideCol>
        {/* Serve speed */}
        {(sH?.first_serve_avg_mph != null || sA?.first_serve_avg_mph != null) && (
          <Panel title="Serve Speed">
            {[
              { label: "1st Srv avg", vH: sH?.first_serve_avg_mph, vA: sA?.first_serve_avg_mph },
              { label: "1st Srv max", vH: sH?.first_serve_max_mph, vA: sA?.first_serve_max_mph },
              { label: "2nd Srv avg", vH: sH?.second_serve_avg_mph, vA: sA?.second_serve_avg_mph },
            ].map(({ label, vH, vA: vAway }) => (
              <div key={label} className="py-1.5 border-b border-b0 last:border-0">
                <div className="text-2xs text-t3 mb-1">{label}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-accent-blue w-14">{vH != null ? `${vH.toFixed(0)} mph` : "—"}</span>
                  <div className="flex-1 flex gap-0.5">
                    {vH != null && <div className="bg-accent-blue/40 h-1.5 rounded" style={{ width: `${Math.min(100, (vH / 160) * 100)}%` }} />}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-mono text-amber-400 w-14">{vAway != null ? `${vAway.toFixed(0)} mph` : "—"}</span>
                  <div className="flex-1 flex gap-0.5">
                    {vAway != null && <div className="bg-amber-500/40 h-1.5 rounded" style={{ width: `${Math.min(100, (vAway / 160) * 100)}%` }} />}
                  </div>
                </div>
              </div>
            ))}
          </Panel>
        )}

        {/* Winners vs UE */}
        {(sH?.winners != null || sA?.winners != null) && (
          <Panel title="Winners vs Errors">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-1 pb-1 mb-1 border-b border-b0 text-2xs text-t3 font-medium">
              <span>{match.home.name}</span>
              <span className="text-center">Stat</span>
              <span className="text-right">{match.away.name}</span>
            </div>
            <StatDuel label="Winners" vA={sH?.winners ?? null} vB={sA?.winners ?? null} />
            <StatDuel label="Unforced Errors" vA={sH?.unforced_errors ?? null} vB={sA?.unforced_errors ?? null} higherBetter={false} />
            <StatDuel label="W/UE Ratio" vA={sH?.winner_ue_ratio ?? null} vB={sA?.winner_ue_ratio ?? null} />
            {(sH?.net_approaches != null || sA?.net_approaches != null) && (
              <>
                <StatDuel label="Net Approaches" vA={sH?.net_approaches ?? null} vB={sA?.net_approaches ?? null} />
                <StatDuel label="Net Win %" vA={sH?.net_win_pct != null ? sH.net_win_pct * 100 : null} vB={sA?.net_win_pct != null ? sA.net_win_pct * 100 : null} unit="%" />
              </>
            )}
          </Panel>
        )}

        {/* Rally length distribution */}
        {(sH?.rally_0_4_won_pct != null || sA?.rally_0_4_won_pct != null) && (
          <Panel title="Rally Length Win %">
            <p className="text-2xs text-t3 mb-2">% of points won by rally length bucket</p>
            {[
              { label: "0–4 shots", vH: sH?.rally_0_4_won_pct, vA: sA?.rally_0_4_won_pct },
              { label: "5–8 shots", vH: sH?.rally_5_8_won_pct, vA: sA?.rally_5_8_won_pct },
              { label: "9+ shots",  vH: sH?.rally_9plus_won_pct, vA: sA?.rally_9plus_won_pct },
            ].map(({ label, vH, vA: vAway }) => (
              <div key={label} className="py-1.5 border-b border-b0 last:border-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-2xs text-t3">{label}</span>
                </div>
                <div className="flex items-center gap-2 text-2xs font-mono">
                  <span className="text-accent-blue w-10">{vH != null ? `${(vH * 100).toFixed(0)}%` : "—"}</span>
                  <div className="flex-1 flex h-1.5 rounded overflow-hidden bg-zinc-800">
                    {vH != null && <div className="bg-accent-blue/60" style={{ width: `${(vH * 100).toFixed(0)}%` }} />}
                  </div>
                  <div className="flex-1 flex h-1.5 rounded overflow-hidden bg-zinc-800">
                    {vAway != null && <div className="bg-amber-500/60 ml-auto" style={{ width: `${(vAway * 100).toFixed(0)}%` }} />}
                  </div>
                  <span className="text-amber-400 w-10 text-right">{vAway != null ? `${(vAway * 100).toFixed(0)}%` : "—"}</span>
                </div>
              </div>
            ))}
          </Panel>
        )}

        {/* Dominance ratio */}
        <Panel title="Dominance Ratio">
          <p className="text-2xs text-t3 mb-2">Hold% × (1 + Break%) — higher = more dominant server</p>
          {fH && fA ? (
            <>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs text-t2">{match.home.name}</span>
                <span className="text-sm font-bold font-mono text-accent-blue">
                  {dominanceRatio(fH.avg_service_hold_pct, fH.avg_bp_conversion_pct) ?? "—"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-t2">{match.away.name}</span>
                <span className="text-sm font-bold font-mono text-amber-400">
                  {dominanceRatio(fA.avg_service_hold_pct, fA.avg_bp_conversion_pct) ?? "—"}
                </span>
              </div>
            </>
          ) : (
            <EmptyState icon={Target} title="No form data" />
          )}
        </Panel>

        {/* Key edges */}
        <Panel title="Key Edges">
          {(() => {
            const edges: Array<{ label: string; winner: string; magnitude: string }> = [];
            if (fH && fA) {
              const hold_h = fH.avg_service_hold_pct ?? 0;
              const hold_a = fA.avg_service_hold_pct ?? 0;
              const brk_h  = fH.avg_bp_conversion_pct ?? 0;
              const brk_a  = fA.avg_bp_conversion_pct ?? 0;
              const ret_h  = fH.avg_return_won_pct ?? 0;
              const ret_a  = fA.avg_return_won_pct ?? 0;

              if (Math.abs(hold_h - hold_a) > 0.03) edges.push({
                label: "Serve Hold",
                winner: hold_h > hold_a ? match.home.name : match.away.name,
                magnitude: `${(Math.abs(hold_h - hold_a) * 100).toFixed(1)}pp`,
              });
              if (Math.abs(brk_h - brk_a) > 0.03) edges.push({
                label: "Break Rate",
                winner: brk_h > brk_a ? match.home.name : match.away.name,
                magnitude: `${(Math.abs(brk_h - brk_a) * 100).toFixed(1)}pp`,
              });
              if (Math.abs(ret_h - ret_a) > 0.03) edges.push({
                label: "Return Points",
                winner: ret_h > ret_a ? match.home.name : match.away.name,
                magnitude: `${(Math.abs(ret_h - ret_a) * 100).toFixed(1)}pp`,
              });
            }
            if (edges.length === 0) return <EmptyState icon={Zap} title="No significant edges detected" />;
            return (
              <div className="divide-y divide-zinc-800/50">
                {edges.map((e, i) => (
                  <div key={i} className="flex items-center justify-between py-2 text-xs">
                    <span className="text-t2">{e.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-t1 font-medium">{e.winner}</span>
                      <span className="font-mono text-accent-green text-2xs">+{e.magnitude}</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </Panel>
      </SideCol>
    </SideGrid>
  );
}

// ── Sets & Momentum Tab ───────────────────────────────────────────────────────

function SetsTab({ match }: { match: TennisMatch }) {
  const sets = match.tennis_info?.sets_detail ?? [];
  const info = match.tennis_info;

  const timelinePeriods = sets.map(s => ({
    period: `Set ${s.set_num}`,
    home: s.a,
    away: s.b,
  }));

  return (
    <SideGrid>
      <MainCol>
        {timelinePeriods.length > 0 && (
          <Panel title="Games per Set" subtitle="Scoring timeline">
            <ScoringTimeline
              periods={timelinePeriods}
              homeLabel={match.home.name}
              awayLabel={match.away.name}
              showRunningTotal={false}
              height={180}
            />
          </Panel>
        )}
        {sets.length > 0 ? (
          <Panel title="Set-by-Set Breakdown">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-b0">
                    <th className="text-left py-2 text-t3 font-medium">Player</th>
                    {sets.map((s, i) => (
                      <th key={i} className="text-center py-2 text-t3 font-medium px-3">Set {s.set_num}</th>
                    ))}
                    <th className="text-center py-2 text-t3 font-medium px-3">Sets</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: match.home.name, sets: match.home_score, side: "a" as const },
                    { name: match.away.name, sets: match.away_score, side: "b" as const },
                  ].map(({ name, sets: setTotal, side }) => (
                    <tr key={side} className="border-b border-zinc-800/30 last:border-0">
                      <td className="py-2 font-medium text-t1 pr-3">{name}</td>
                      {sets.map((s, i) => {
                        const myScore = side === "a" ? s.a : s.b;
                        const oppScore = side === "a" ? s.b : s.a;
                        const tb = side === "a" ? s.tb_a : s.tb_b;
                        const won = myScore > oppScore || (myScore === 7 && oppScore === 6);
                        return (
                          <td key={i} className={cn("text-center px-3 py-2 font-mono", won ? "text-t1 font-semibold" : "text-t3")}>
                            {myScore}
                            {tb != null && <sup className="text-2xs ml-0.5 opacity-70">{tb}</sup>}
                          </td>
                        );
                      })}
                      <td className="text-center px-3 py-2 font-mono font-bold text-t1">{setTotal ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : (
          <Panel title="Set-by-Set Breakdown">
            <EmptyState icon={Layers} title="No set data available" desc="Set-by-set scores will appear here once available." />
          </Panel>
        )}

        {/* Game timeline placeholder */}
        <Panel title="Game Timeline">
          <EmptyState icon={Activity} title="Timeline not available" desc="Point-by-point timeline will be added in a future update." />
        </Panel>
      </MainCol>

      <SideCol>
        <Panel title="Tiebreak & Clutch">
          {info ? (
            <>
              {info.match_duration_min && (
                <MetricRow label="Match duration" value={`${Math.floor(info.match_duration_min / 60)}h ${info.match_duration_min % 60}m`} />
              )}
              <MetricRow label="Format"   value={`Best of ${info.best_of}`} />
              {info.retired && <MetricRow label="Result note" value={<span className="text-red-400">Retirement</span>} />}
              {/* Tiebreak data from new tiebreaks field */}
              {(() => {
                const tb = (match as any).tiebreaks as TennisTiebreakOut | null;
                const hasTbs = sets.some(s => s.tb_a != null || s.tb_b != null) || (tb && (tb.player_a_tiebreaks_won + tb.player_b_tiebreaks_won > 0));
                if (!hasTbs) return <div className="text-2xs text-t3 mt-2">No tiebreaks in this match</div>;
                return (
                  <>
                    <div className="mt-2 text-2xs text-t3 font-medium uppercase tracking-wide mb-1">Tiebreaks</div>
                    {tb && (
                      <>
                        <MetricRow label={`${match.home.name} TBs won`} value={<span className="text-accent-blue font-mono">{tb.player_a_tiebreaks_won}</span>} />
                        <MetricRow label={`${match.away.name} TBs won`} value={<span className="text-amber-400 font-mono">{tb.player_b_tiebreaks_won}</span>} />
                        {tb.tiebreaks.map(t => (
                          <MetricRow
                            key={t.set_num}
                            label={`Set ${t.set_num} TB`}
                            value={<span className={t.winner === "a" ? "text-accent-blue font-mono" : "text-amber-400 font-mono"}>{t.score_a}–{t.score_b}</span>}
                          />
                        ))}
                      </>
                    )}
                    {!tb && sets.filter(s => s.tb_a != null || s.tb_b != null).map(s => (
                      <MetricRow key={s.set_num} label={`Set ${s.set_num} TB`} value={`${s.tb_a ?? 0}–${s.tb_b ?? 0}`} />
                    ))}
                  </>
                );
              })()}
            </>
          ) : (
            <EmptyState icon={Award} title="No match data" />
          )}
        </Panel>

        {/* Form clutch stats */}
        {(match.form_home || match.form_away) && (
          <Panel title="Form Clutch Stats">
            <div className="text-2xs text-t3 uppercase tracking-wide mb-2">TB record (form)</div>
            {match.form_home?.tiebreaks_played != null && (
              <MetricRow
                label={match.home.name}
                value={`${match.form_home.tiebreaks_won ?? 0}/${match.form_home.tiebreaks_played}`}
                sub={match.form_home.tiebreak_win_pct != null ? `${(match.form_home.tiebreak_win_pct * 100).toFixed(0)}% win` : undefined}
              />
            )}
            {match.form_away?.tiebreaks_played != null && (
              <MetricRow
                label={match.away.name}
                value={`${match.form_away.tiebreaks_won ?? 0}/${match.form_away.tiebreaks_played}`}
                sub={match.form_away.tiebreak_win_pct != null ? `${(match.form_away.tiebreak_win_pct * 100).toFixed(0)}% win` : undefined}
              />
            )}
            <div className="text-2xs text-t3 uppercase tracking-wide mt-3 mb-2">Season results</div>
            {(match.form_home?.titles_ytd != null || match.form_home?.finals_ytd != null) && (
              <MetricRow label={`${match.home.name} titles/finals`} value={`${match.form_home.titles_ytd ?? 0}T / ${match.form_home.finals_ytd ?? 0}F`} />
            )}
            {(match.form_away?.titles_ytd != null || match.form_away?.finals_ytd != null) && (
              <MetricRow label={`${match.away.name} titles/finals`} value={`${match.form_away.titles_ytd ?? 0}T / ${match.form_away.finals_ytd ?? 0}F`} />
            )}
            {match.form_home?.three_setters_pct != null && (
              <MetricRow label={`${match.home.name} 3-setters`} value={pct(match.form_home.three_setters_pct)} />
            )}
            {match.form_away?.three_setters_pct != null && (
              <MetricRow label={`${match.away.name} 3-setters`} value={pct(match.form_away.three_setters_pct)} />
            )}
          </Panel>
        )}
      </SideCol>
    </SideGrid>
  );
}

// ── H2H Tab ───────────────────────────────────────────────────────────────────

function H2HTab({ match }: { match: TennisMatch }) {
  const h2h = match.h2h;
  if (!h2h || h2h.total_matches === 0) {
    return (
      <Panel title="Head to Head">
        <EmptyState icon={Users} title="No H2H history" desc="No previous meetings between these players." />
      </Panel>
    );
  }

  // Surface breakdown from recent matches
  const surfaceMap: Record<string, { a: number; b: number }> = {};
  for (const m of h2h.recent_matches) {
    const s = m.surface ?? "unknown";
    if (!surfaceMap[s]) surfaceMap[s] = { a: 0, b: 0 };
    if (m.winner === "a") surfaceMap[s].a++; else surfaceMap[s].b++;
  }

  return (
    <SideGrid>
      <MainCol>
        {/* Summary */}
        <Panel title="H2H Record">
          <div className="grid grid-cols-3 gap-3 text-center py-2">
            <div>
              <div className="text-2xl font-bold font-mono text-accent-blue">{h2h.player_a_wins}</div>
              <div className="text-2xs text-t2 mt-0.5 truncate">{match.home.name}</div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-t3">{h2h.total_matches}</div>
              <div className="text-2xs text-t3 mt-0.5">Total</div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-amber-400">{h2h.player_b_wins}</div>
              <div className="text-2xs text-t2 mt-0.5 truncate">{match.away.name}</div>
            </div>
          </div>
          {h2h.total_matches > 0 && (
            <WinBar pA={h2h.player_a_wins / h2h.total_matches} pB={h2h.player_b_wins / h2h.total_matches} labelA={match.home.name} labelB={match.away.name} />
          )}
        </Panel>

        {/* Recent meetings table */}
        <Panel title="Recent Meetings" padded={false}>
          {h2h.recent_matches.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-b0">
                    <th className="text-left py-2 px-3 text-t3 font-medium">Date</th>
                    <th className="text-left py-2 px-3 text-t3 font-medium">Surface</th>
                    <th className="text-left py-2 px-3 text-t3 font-medium">Round</th>
                    <th className="text-center py-2 px-3 text-t3 font-medium">Score</th>
                    <th className="text-left py-2 px-3 text-t3 font-medium">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {h2h.recent_matches.map((m, i) => (
                    <tr key={i} className="border-b border-zinc-800/30 last:border-0 hover:bg-zinc-800/20">
                      <td className="py-2 px-3 text-t2">{m.date ? fmtDateShort(m.date) : "—"}</td>
                      <td className="py-2 px-3">
                        {m.surface ? (
                          <span className={cn("text-2xs px-1.5 py-0.5 rounded border", surfaceBg(m.surface))}>{m.surface}</span>
                        ) : "—"}
                      </td>
                      <td className="py-2 px-3 text-t2">{m.round ?? "—"}</td>
                      <td className="py-2 px-3 text-center font-mono text-t1">
                        {m.player_a_sets ?? "?"} – {m.player_b_sets ?? "?"}
                      </td>
                      <td className="py-2 px-3">
                        <span className={cn("font-medium", m.winner === "a" ? "text-accent-blue" : "text-amber-400")}>
                          {m.winner === "a" ? (m.player_a_name || match.home.name) : (m.player_b_name || match.away.name)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-3"><EmptyState icon={Calendar} title="No recent meetings" /></div>
          )}
        </Panel>
      </MainCol>

      <SideCol>
        {/* Surface-specific H2H */}
        <Panel title="Surface Breakdown">
          {Object.keys(surfaceMap).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(surfaceMap).map(([surf, rec]) => (
                <div key={surf}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn("text-2xs px-1.5 py-0.5 rounded border", surfaceBg(surf))}>{surf}</span>
                    <span className="text-2xs text-t3">{rec.a + rec.b} matches</span>
                  </div>
                  <WinBar
                    pA={rec.a / (rec.a + rec.b)}
                    pB={rec.b / (rec.a + rec.b)}
                    labelA={match.home.name}
                    labelB={match.away.name}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Layers} title="Surface data unavailable" desc="Surface breakdown will appear when match history is populated." />
          )}
        </Panel>

        {/* Style matchup notes */}
        <Panel title="Style Matchup">
          <EmptyState icon={Target} title="Model-generated matchup notes" desc="Coming soon — stylistic analysis powered by the prediction model." />
        </Panel>
      </SideCol>
    </SideGrid>
  );
}

// ── Surface Tab ───────────────────────────────────────────────────────────────

function SurfaceTab({ match, eloHomeSurface, eloAwaySurface }: { match: TennisMatch; eloHomeSurface: EloPoint[]; eloAwaySurface: EloPoint[] }) {
  const info = match.tennis_info;
  const surface = info?.surface;
  const fH = match.form_home;
  const fA = match.form_away;

  // Merge ELO history for chart
  const allDates = new Set([...eloHomeSurface.map(p => p.date), ...eloAwaySurface.map(p => p.date)]);
  const homeMap = Object.fromEntries(eloHomeSurface.map(p => [p.date, p.rating]));
  const awayMap = Object.fromEntries(eloAwaySurface.map(p => [p.date, p.rating]));
  const chartData = Array.from(allDates).sort().map(date => ({
    date: fmtDateShort(date),
    [match.home.name]: homeMap[date] ?? null,
    [match.away.name]: awayMap[date] ?? null,
  }));

  return (
    <SideGrid>
      <MainCol>
        {/* Surface record panel */}
        <Panel title="Surface Form" subtitle={surface ? `${surface} surface` : "All surfaces"}>
          {fH || fA ? (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-1 pb-1 mb-1 border-b border-b0 text-2xs text-t3 font-medium">
                <span>{match.home.name}</span>
                <span className="text-center">Stat</span>
                <span className="text-right">{match.away.name}</span>
              </div>
              <StatDuel label="Matches played" vA={fH?.matches_played ?? null} vB={fA?.matches_played ?? null} />
              <StatDuel label="Win %" vA={fH?.win_pct != null ? fH.win_pct * 100 : null} vB={fA?.win_pct != null ? fA.win_pct * 100 : null} unit="%" />
              <StatDuel label="Hold %" vA={fH?.avg_service_hold_pct != null ? fH.avg_service_hold_pct * 100 : null} vB={fA?.avg_service_hold_pct != null ? fA.avg_service_hold_pct * 100 : null} unit="%" />
              <StatDuel label="Break %" vA={fH?.avg_bp_conversion_pct != null ? fH.avg_bp_conversion_pct * 100 : null} vB={fA?.avg_bp_conversion_pct != null ? fA.avg_bp_conversion_pct * 100 : null} unit="%" />
              <StatDuel label="1st Srv In %" vA={fH?.avg_first_serve_in_pct != null ? fH.avg_first_serve_in_pct * 100 : null} vB={fA?.avg_first_serve_in_pct != null ? fA.avg_first_serve_in_pct * 100 : null} unit="%" />
            </>
          ) : (
            <EmptyState icon={Waves} title="No surface form data" desc="Surface-specific form stats not yet available." />
          )}
        </Panel>

        {/* Surface ELO trend */}
        <Panel title={`${surface ? surface.charAt(0).toUpperCase() + surface.slice(1) : "Surface"} ELO History`}>
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} {...chartDefaults}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border0} />
                <XAxis dataKey="date" tick={{ fill: colors.textMuted, fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: colors.textMuted, fontSize: 10 }} tickLine={false} width={45} domain={["auto", "auto"]} />
                <RechartTooltip
                  contentStyle={{ background: "rgba(8,18,14,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", fontSize: "11px" }}
                  labelStyle={{ color: colors.textMuted }}
                />
                <Line dataKey={match.home.name} stroke={colors.accentBlue} dot={false} strokeWidth={2} connectNulls />
                <Line dataKey={match.away.name} stroke={colors.accentAmber} dot={false} strokeWidth={2} connectNulls />
                <Legend wrapperStyle={{ fontSize: "11px", color: colors.textMuted }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={TrendingUp} title="No surface ELO history" desc="Surface-specific ELO ratings are computed after matches on this surface." />
          )}
        </Panel>
      </MainCol>

      <SideCol>
        {/* Surface ELO snapshot */}
        <Panel title="Surface ELO">
          {match.elo_home && (
            <>
              <div className="text-2xs text-t3 mb-1.5">{match.home.name}</div>
              <MetricRow label="Overall ELO"  value={<span className="font-mono">{match.elo_home.overall_rating}</span>} />
              <MetricRow label="Surface ELO"  value={<span className="font-mono">{match.elo_home.surface_rating ?? "—"}</span>} />
              <MetricRow label="Surface Δ"    value={<Delta v={match.elo_home.surface_delta} />} />
            </>
          )}
          {match.elo_away && (
            <>
              <div className="text-2xs text-t3 mt-2 mb-1.5">{match.away.name}</div>
              <MetricRow label="Overall ELO"  value={<span className="font-mono">{match.elo_away.overall_rating}</span>} />
              <MetricRow label="Surface ELO"  value={<span className="font-mono">{match.elo_away.surface_rating ?? "—"}</span>} />
              <MetricRow label="Surface Δ"    value={<Delta v={match.elo_away.surface_delta} />} />
            </>
          )}
          {!match.elo_home && !match.elo_away && <EmptyState icon={Activity} title="No ELO data" />}
        </Panel>

        {/* Surface suitability */}
        <Panel title="Surface Suitability">
          {(fH || fA) ? (
            <>
              {info?.court_speed_index != null && (
                <div className="mb-3">
                  <div className="text-2xs text-t3 mb-1">Court Speed Index <span className="text-t2 font-mono">{info.court_speed_index.toFixed(1)}</span> / 100</div>
                  <div className="h-2 rounded-full bg-zinc-800/60 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", info.court_speed_index > 60 ? "bg-blue-400" : info.court_speed_index > 35 ? "bg-amber-400" : "bg-amber-700")}
                      style={{ width: `${info.court_speed_index}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-2xs text-t3 mt-0.5">
                    <span>Slow</span><span>Medium</span><span>Fast</span>
                  </div>
                </div>
              )}
              <div className="text-2xs text-t3 uppercase tracking-wide mb-2">Win % by Surface (form)</div>
              {[
                { surf: "Hard",  vH: fH?.win_pct_hard,  vA: fA?.win_pct_hard  },
                { surf: "Clay",  vH: fH?.win_pct_clay,  vA: fA?.win_pct_clay  },
                { surf: "Grass", vH: fH?.win_pct_grass, vA: fA?.win_pct_grass },
              ].map(({ surf, vH: vHome, vA: vAway }) => (vHome != null || vAway != null) ? (
                <div key={surf} className="py-1.5 border-b border-b0 last:border-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn("text-2xs px-1.5 py-0.5 rounded border", surfaceBg(surf.toLowerCase()))}>{surf}</span>
                    <div className="flex items-center gap-2 text-2xs font-mono">
                      <span className="text-accent-blue">{vHome != null ? `${(vHome * 100).toFixed(0)}%` : "—"}</span>
                      <span className="text-t3">/</span>
                      <span className="text-amber-400">{vAway != null ? `${(vAway * 100).toFixed(0)}%` : "—"}</span>
                    </div>
                  </div>
                  <div className="flex gap-0.5 h-1.5">
                    {vHome != null && <div className="flex-1 bg-zinc-800/60 rounded overflow-hidden"><div className="bg-accent-blue/50 h-full" style={{ width: `${(vHome * 100).toFixed(0)}%` }} /></div>}
                    {vAway != null && <div className="flex-1 bg-zinc-800/60 rounded overflow-hidden"><div className="bg-amber-500/50 h-full" style={{ width: `${(vAway * 100).toFixed(0)}%` }} /></div>}
                  </div>
                </div>
              ) : null)}
              {/* Ranking trend */}
              {(fH?.ranking_trend != null || fA?.ranking_trend != null) && (
                <>
                  <div className="text-2xs text-t3 uppercase tracking-wide mt-3 mb-2">Ranking Trend (positions)</div>
                  {fH?.ranking_trend != null && <MetricRow label={match.home.name} value={<Delta v={-fH.ranking_trend} unit=" pos" />} />}
                  {fA?.ranking_trend != null && <MetricRow label={match.away.name} value={<Delta v={-fA.ranking_trend} unit=" pos" />} />}
                </>
              )}
            </>
          ) : (
            <EmptyState icon={Shield} title="No form data" desc="Surface suitability requires rolling form data." />
          )}
        </Panel>
      </SideCol>
    </SideGrid>
  );
}

// ── ELO Tab ───────────────────────────────────────────────────────────────────

function EloTab({ match, eloHomeOverall, eloAwayOverall, eloHomeSurface, eloAwaySurface }: {
  match: TennisMatch;
  eloHomeOverall: EloPoint[];
  eloAwayOverall: EloPoint[];
  eloHomeSurface: EloPoint[];
  eloAwaySurface: EloPoint[];
}) {
  const [showSurface, setShowSurface] = useState(false);
  const eloH = match.elo_home;
  const eloA = match.elo_away;

  // Choose data set
  const homeHistory = showSurface && eloHomeSurface.length > 1 ? eloHomeSurface : eloHomeOverall;
  const awayHistory = showSurface && eloAwaySurface.length > 1 ? eloAwaySurface : eloAwayOverall;

  // Merge for chart
  const allDates = new Set([...homeHistory.map(p => p.date), ...awayHistory.map(p => p.date)]);
  const homeMap = Object.fromEntries(homeHistory.map(p => [p.date, p.rating]));
  const awayMap = Object.fromEntries(awayHistory.map(p => [p.date, p.rating]));
  const chartData = Array.from(allDates).sort().map(date => ({
    date: fmtDateShort(date),
    [match.home.name]: homeMap[date] ?? null,
    [match.away.name]: awayMap[date] ?? null,
  }));

  // ELO-implied probs
  let pEloPriH = 0.5, pEloPriA = 0.5;
  let pEloSurfH = 0.5, pEloSurfA = 0.5;
  if (eloH && eloA) {
    pEloPriH = eloWinProb(eloH.overall_rating, eloA.overall_rating);
    pEloPriA = 1 - pEloPriH;
    const rH = eloH.surface_rating ?? eloH.overall_rating;
    const rA = eloA.surface_rating ?? eloA.overall_rating;
    pEloSurfH = eloWinProb(rH, rA);
    pEloSurfA = 1 - pEloSurfH;
  }

  return (
    <SideGrid>
      <MainCol>
        {/* ELO implied probabilities */}
        {eloH && eloA && (
          <Panel title="ELO-Implied Win Probability">
            <div className="space-y-3">
              <div>
                <div className="text-2xs text-t3 mb-1">Overall ELO</div>
                <WinBar pA={pEloPriH} pB={pEloPriA} labelA={match.home.name} labelB={match.away.name} />
              </div>
              {(eloH.surface_rating || eloA.surface_rating) && (
                <div>
                  <div className="text-2xs text-t3 mb-1">Surface-Adjusted ELO</div>
                  <WinBar pA={pEloSurfH} pB={pEloSurfA} labelA={match.home.name} labelB={match.away.name} />
                </div>
              )}
              {match.probabilities && (
                <div>
                  <div className="text-2xs text-t3 mb-1">Model Prediction</div>
                  <WinBar pA={match.probabilities.home_win} pB={match.probabilities.away_win} labelA={match.home.name} labelB={match.away.name} />
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* ELO history chart */}
        <Panel
          title="ELO History"
          action={
            <button
              onClick={() => setShowSurface(v => !v)}
              className={cn("text-2xs px-2 py-0.5 rounded border transition-colors", showSurface ? surfaceBg(match.tennis_info?.surface) : "border-zinc-700 text-t3 hover:text-t1")}
            >
              {showSurface ? `${match.tennis_info?.surface ?? "Surface"} ELO` : "Overall ELO"}
            </button>
          }
        >
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} {...chartDefaults}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border0} />
                <XAxis dataKey="date" tick={{ fill: colors.textMuted, fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: colors.textMuted, fontSize: 10 }} tickLine={false} width={45} domain={["auto", "auto"]} />
                <RechartTooltip
                  contentStyle={{ background: "rgba(8,18,14,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", fontSize: "11px" }}
                  labelStyle={{ color: colors.textMuted }}
                />
                <Line dataKey={match.home.name} stroke={colors.accentBlue} dot={false} strokeWidth={2} connectNulls />
                <Line dataKey={match.away.name} stroke={colors.accentAmber} dot={false} strokeWidth={2} connectNulls />
                <Legend wrapperStyle={{ fontSize: "11px", color: colors.textMuted }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={TrendingUp} title="No ELO history" desc="ELO history will appear here once the player has rated matches." />
          )}
        </Panel>

        {/* ELO rating breakdown */}
        {(eloH || eloA) && (
          <Panel title="ELO Breakdown">
            <div className="grid grid-cols-2 gap-3">
              {eloH && (
                <div>
                  <div className="text-2xs text-t3 mb-1.5 font-medium">{match.home.name}</div>
                  <MetricRow label="Overall"     value={<span className="font-mono text-accent-blue">{eloH.overall_rating}</span>} />
                  <MetricRow label="Surface"     value={<span className="font-mono">{eloH.surface_rating ?? "—"}</span>} />
                  <MetricRow label="Surface Δ"   value={<Delta v={eloH.surface_delta} />} />
                  <MetricRow label="Last match Δ" value={<Delta v={eloH.rating_change} />} />
                </div>
              )}
              {eloA && (
                <div>
                  <div className="text-2xs text-t3 mb-1.5 font-medium">{match.away.name}</div>
                  <MetricRow label="Overall"     value={<span className="font-mono text-amber-400">{eloA.overall_rating}</span>} />
                  <MetricRow label="Surface"     value={<span className="font-mono">{eloA.surface_rating ?? "—"}</span>} />
                  <MetricRow label="Surface Δ"   value={<Delta v={eloA.surface_delta} />} />
                  <MetricRow label="Last match Δ" value={<Delta v={eloA.rating_change} />} />
                </div>
              )}
            </div>
          </Panel>
        )}
      </MainCol>

      <SideCol>
        <Panel title="ELO Methodology">
          <div className="space-y-2 text-2xs text-t2">
            <p><span className="text-t1 font-medium">Base rating:</span> 1500</p>
            <p><span className="text-t1 font-medium">Scale (K):</span> 32 × tournament × round</p>
            <p><span className="text-t1 font-medium">Surface weighting:</span> per-surface delta tracked separately from overall ELO</p>
            <p><span className="text-t1 font-medium">Tournament multipliers:</span><br />Grand Slam 1.5 · Masters 1.2 · ATP 500 1.0 · Challenger 0.5</p>
            <p><span className="text-t1 font-medium">Round multipliers:</span><br />Final 1.3 · SF 1.1 · QF 1.0 · R16 0.9</p>
            <p><span className="text-t1 font-medium">Retirement:</span> K reduced 80% (down-weighted)</p>
            <p><span className="text-t1 font-medium">Win prob formula:</span><br /><code className="font-mono text-accent-purple">E = 1 / (1 + 10^((rB - rA) / 400))</code></p>
          </div>
        </Panel>

        {/* Recent ELO changes */}
        <Panel title="Recent ELO Changes">
          {eloH && <MetricRow label={match.home.name} value={<Delta v={eloH.rating_change} />} sub="last match" />}
          {eloA && <MetricRow label={match.away.name} value={<Delta v={eloA.rating_change} />} sub="last match" />}
          {eloH && eloA && (
            <MetricRow
              label="ELO diff (overall)"
              value={`${(eloH.overall_rating - eloA.overall_rating).toFixed(0)}`}
              accent
            />
          )}
          {eloH && eloA && (eloH.surface_rating || eloA.surface_rating) && (
            <MetricRow
              label="ELO diff (surface)"
              value={`${((eloH.surface_rating ?? eloH.overall_rating) - (eloA.surface_rating ?? eloA.overall_rating)).toFixed(0)}`}
              accent
            />
          )}
        </Panel>
      </SideCol>
    </SideGrid>
  );
}

// ── Model Tab ─────────────────────────────────────────────────────────────────

function ModelTab({ match }: { match: TennisMatch }) {
  const p = match.probabilities;
  const fo = match.fair_odds;
  const drivers = match.key_drivers ?? [];
  const model = match.model;

  // Set score distribution for tennis: 2-0, 2-1 (best of 3) or 3-0, 3-1, 3-2 (best of 5)
  const best_of = match.tennis_info?.best_of ?? 3;
  const setDist = best_of === 5
    ? [
        { score: "3–0", pHome: p ? p.home_win * 0.45 : null, pAway: p ? p.away_win * 0.45 : null },
        { score: "3–1", pHome: p ? p.home_win * 0.35 : null, pAway: p ? p.away_win * 0.35 : null },
        { score: "3–2", pHome: p ? p.home_win * 0.20 : null, pAway: p ? p.away_win * 0.20 : null },
      ]
    : [
        { score: "2–0", pHome: p ? p.home_win * 0.58 : null, pAway: p ? p.away_win * 0.58 : null },
        { score: "2–1", pHome: p ? p.home_win * 0.42 : null, pAway: p ? p.away_win * 0.42 : null },
      ];

  const barData = [
    ...setDist.map(s => ({ name: `${match.home.name.split(" ").pop()} ${s.score}`, value: s.pHome != null ? Math.round(s.pHome * 100) : 0 })),
    ...setDist.map(s => ({ name: `${match.away.name.split(" ").pop()} ${s.score}`, value: s.pAway != null ? Math.round(s.pAway * 100) : 0 })).reverse(),
  ];

  return (
    <SideGrid>
      <MainCol>
        {/* Win probability */}
        {p ? (
          <Panel title="Win Probability">
            <WinBar pA={p.home_win} pB={p.away_win} labelA={match.home.name} labelB={match.away.name} />
          </Panel>
        ) : (
          <Panel title="Win Probability">
            <EmptyState icon={Target} title="No model prediction" desc="Model prediction is not yet available for this match." />
          </Panel>
        )}

        {/* Set-score distribution */}
        <Panel title="Set-Score Distribution" subtitle={p ? "Estimated from win probs" : undefined}>
          {p ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} layout="vertical" {...chartDefaults}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border0} horizontal={false} />
                <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} tickLine={false} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 10 }} tickLine={false} width={90} />
                <RechartTooltip
                  formatter={(v: unknown) => [`${v}%`, "Probability"]}
                  contentStyle={{ background: "rgba(8,18,14,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", fontSize: "11px" }}
                />
                <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                  {barData.map((_, i) => (
                    <Cell key={i} fill={i < setDist.length ? colors.accentBlue : colors.accentAmber} opacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={BarChart2} title="No distribution data" />
          )}
        </Panel>

        {/* Feature drivers */}
        {drivers.length > 0 && (
          <Panel title="Feature Drivers">
            <div className="space-y-1.5">
              {drivers.slice(0, 10).map((d, i) => {
                const maxImp = Math.max(...drivers.map(x => Math.abs(x.importance)));
                const barW = maxImp > 0 ? (Math.abs(d.importance) / maxImp) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-2xs text-t2 w-36 shrink-0 truncate">{d.feature}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-zinc-800/60">
                      <div
                        className={cn("h-full rounded-full", d.importance > 0 ? "bg-accent-blue" : "bg-amber-500")}
                        style={{ width: `${barW}%` }}
                      />
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
        )}
      </MainCol>

      <SideCol>
        {/* Model metadata */}
        <Panel title="Model Info">
          {model ? (
            <>
              <MetricRow label="Version"        value={model.version} />
              {model.algorithm      && <MetricRow label="Algorithm"    value={model.algorithm} />}
              {model.trained_at     && <MetricRow label="Trained"      value={fmtDate(model.trained_at)} />}
              {model.accuracy       != null && <MetricRow label="Accuracy"     value={pct(model.accuracy)} accent />}
              {model.brier_score    != null && <MetricRow label="Brier score"  value={n(model.brier_score, 4)} />}
              {model.n_train_samples != null && <MetricRow label="Train samples" value={model.n_train_samples.toLocaleString()} />}
            </>
          ) : (
            <EmptyState icon={Info} title="No model metadata" />
          )}
        </Panel>

        {/* Fair odds */}
        {fo && (
          <Panel title="Fair Odds (No-Vig)">
            <MetricRow label={match.home.name} value={fo.home_win?.toFixed(2) ?? "—"} accent />
            <MetricRow label={match.away.name} value={fo.away_win?.toFixed(2) ?? "—"} />
            <p className="text-2xs text-t3 mt-2">Computed from no-vig implied probability. Use as fair value reference, not wagering advice.</p>
          </Panel>
        )}

        {/* Calibration placeholder */}
        <Panel title="Calibration">
          <EmptyState icon={Activity} title="Calibration chart coming soon" desc="Reliability diagram for model confidence bins." />
        </Panel>

        {/* Market Odds */}
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
                  <div key={label} className="flex-1 bg-bg0 rounded border border-b0 p-3 flex flex-col items-center gap-1">
                    <span className="text-2xs text-t2">{label}</span>
                    <span className="text-lg font-bold font-mono text-t0">{Number(val).toFixed(2)}</span>
                    {edge != null && (
                      <span className={cn("text-2xs font-semibold font-mono", edge > 0 ? "text-positive" : "text-negative")}>
                        {edge > 0 ? "+" : ""}{edge.toFixed(1)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
      </SideCol>
    </SideGrid>
  );
}

// ── Context Tab ───────────────────────────────────────────────────────────────

function ContextTab({ match }: { match: TennisMatch }) {
  const info = match.tennis_info;

  // Data completeness checklist
  const checks = [
    { label: "Match meta (surface/round)",  ok: !!info                        },
    { label: "Set-by-set scores",           ok: (info?.sets_detail?.length ?? 0) > 0 },
    { label: "Fatigue (rest days)",         ok: info?.player_a_days_rest != null     },
    { label: "ELO (overall)",               ok: !!match.elo_home                 },
    { label: "ELO (surface)",               ok: match.elo_home?.surface_rating != null },
    { label: "Model prediction",            ok: !!match.probabilities            },
    { label: "Key drivers",                 ok: (match.key_drivers?.length ?? 0) > 0 },
    { label: "Serve stats (this match)",    ok: !!match.stats_home               },
    { label: "Return stats (this match)",   ok: !!match.stats_away               },
    { label: "Rolling form (all surfaces)", ok: !!match.form_home                },
    { label: "Rolling form (surface)",      ok: match.form_home?.surface !== "all" },
    { label: "H2H history",                 ok: (match.h2h?.total_matches ?? 0) > 0 },
  ];

  const flags: string[] = [];
  if (!info) flags.push("Missing match metadata — surface, round, fatigue unavailable.");
  if (!match.probabilities) flags.push("No model prediction — showing ELO-derived odds.");
  if (!match.stats_home) flags.push("Match serve/return stats not available.");
  if (!match.form_home) flags.push("Rolling form data not found for these players.");
  if ((match.h2h?.total_matches ?? 0) < 2) flags.push("Limited H2H history (< 2 meetings).");
  if (info && info.player_a_days_rest != null && info.player_a_days_rest < 2) flags.push(`${match.home.name} has very short rest (${info.player_a_days_rest}d).`);
  if (info && info.player_b_days_rest != null && info.player_b_days_rest < 2) flags.push(`${match.away.name} has very short rest (${info.player_b_days_rest}d).`);
  if (info?.retired) flags.push("Match ended via retirement — ELO impact is down-weighted.");

  return (
    <SideGrid>
      <MainCol>
        {/* Scheduling + fatigue */}
        <Panel title="Scheduling & Fatigue">
          <div className="grid grid-cols-2 gap-x-6">
            <div>
              <div className="text-2xs text-t3 mb-1.5 font-medium uppercase tracking-wide">{match.home.name}</div>
              <MetricRow label="Days rest"         value={info?.player_a_days_rest != null ? `${info.player_a_days_rest}d` : "—"} />
              <MetricRow label="Matches / 14d"     value={info?.player_a_matches_last_14d != null ? `${info.player_a_matches_last_14d}` : "—"} />
            </div>
            <div>
              <div className="text-2xs text-t3 mb-1.5 font-medium uppercase tracking-wide">{match.away.name}</div>
              <MetricRow label="Days rest"         value={info?.player_b_days_rest != null ? `${info.player_b_days_rest}d` : "—"} />
              <MetricRow label="Matches / 14d"     value={info?.player_b_matches_last_14d != null ? `${info.player_b_matches_last_14d}` : "—"} />
            </div>
          </div>
        </Panel>

        {/* Conditions */}
        <Panel title="Match Conditions">
          {info ? (
            <>
              <MetricRow label="Surface"       value={<span className={surfaceColor(info.surface)}>{info.surface}</span>} />
              <MetricRow label="Environment"   value={info.is_indoor ? "Indoor" : "Outdoor"} />
              {info.tournament_level && <MetricRow label="Tournament tier" value={levelLabel(info.tournament_level) ?? info.tournament_level} />}
              {info.round_name && <MetricRow label="Round"     value={info.round_name} />}
              <MetricRow label="Format"        value={`Best of ${info.best_of}`} />
              {info.match_duration_min && <MetricRow label="Duration" value={`${Math.floor(info.match_duration_min/60)}h ${info.match_duration_min%60}m`} />}
              {info.tournament_prize_pool_usd != null && (
                <MetricRow label="Prize pool" value={`$${(info.tournament_prize_pool_usd / 1_000_000).toFixed(1)}M`} />
              )}
              {info.points_on_offer != null && <MetricRow label="Points on offer" value={info.points_on_offer.toLocaleString()} />}
              {info.draw_size != null         && <MetricRow label="Draw size"      value={`${info.draw_size} players`} />}
              {info.balls_brand               && <MetricRow label="Balls"          value={info.balls_brand} />}
              {info.court_speed_index != null && (
                <MetricRow label="Court speed" value={`${info.court_speed_index.toFixed(1)} / 100`} />
              )}
            </>
          ) : (
            <EmptyState icon={Wind} title="Conditions data unavailable" />
          )}
        </Panel>

        {/* Betting lines */}
        {(() => {
          const bet = (match as any).betting as Record<string, any> | null;
          if (!bet) return null;
          return (
            <Panel title="Betting Lines">
              {bet.home_win_odds != null && <MetricRow label={`${match.home.name} odds`} value={bet.home_win_odds.toFixed(2)} accent />}
              {bet.away_win_odds != null && <MetricRow label={`${match.away.name} odds`} value={bet.away_win_odds.toFixed(2)} />}
              {bet.market_home_prob != null && <MetricRow label="Market P1 implied" value={pct(bet.market_home_prob)} />}
              {bet.market_away_prob != null && <MetricRow label="Market P2 implied" value={pct(bet.market_away_prob)} />}
              {match.probabilities && bet.market_home_prob != null && (
                <MetricRow
                  label="Model vs market"
                  value={
                    <span className={match.probabilities.home_win > bet.market_home_prob ? "text-accent-green" : "text-accent-red"}>
                      {match.probabilities.home_win > bet.market_home_prob ? "Model favours P1" : "Model favours P2"}
                    </span>
                  }
                />
              )}
              {bet.total_games_line != null && <MetricRow label="Total games line" value={`O/U ${bet.total_games_line}`} />}
            </Panel>
          );
        })()}

        {/* Flags */}
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
        {/* Data completeness */}
        <Panel title="Data Completeness">
          <div className="space-y-1">
            {checks.map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-2 py-1 border-b border-zinc-800/40 last:border-0">
                {ok ? (
                  <CheckCircle2 size={11} className="text-accent-green shrink-0" />
                ) : (
                  <XCircle size={11} className="text-zinc-600 shrink-0" />
                )}
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

export function TennisMatchDetail({ match, eloHomeOverall, eloAwayOverall, eloHomeSurface, eloAwaySurface }: Props) {
  const [tab, setTab] = useState<TabId>("overview");
  const router = useRouter();
  const isLive = match.status === "live";
  const tick = useLiveRefresh(isLive);
  useEffect(() => { if (tick > 0) router.refresh(); }, [tick, router]);

  return (
    <div className="match-page-shell match-page-shell--contained">
      <TennisMatchHeader match={match} />
      <div className="match-kpi-strip match-kpi-strip--soft overflow-hidden"><TennisKpiStrip match={match} /></div>

      {match.status === "live" && <div className="match-live-wrap px-1"><TennisLivePanel match={match as any} /></div>}

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

      {/* Tab content */}
      <div className="match-content-wrap">
        {tab === "overview" && <OverviewTab match={match} />}
        {tab === "serve"    && <ServeReturnTab match={match} />}
        {tab === "sets"     && <SetsTab match={match} />}
        {tab === "h2h"      && <H2HTab match={match} />}
        {tab === "surface"  && <SurfaceTab match={match} eloHomeSurface={eloHomeSurface} eloAwaySurface={eloAwaySurface} />}
        {tab === "elo"      && <EloTab match={match} eloHomeOverall={eloHomeOverall} eloAwayOverall={eloAwayOverall} eloHomeSurface={eloHomeSurface} eloAwaySurface={eloAwaySurface} />}
        {tab === "model"    && <ModelTab match={match} />}
        {tab === "context"  && <ContextTab match={match} />}
      </div>
    </div>
  );
}
