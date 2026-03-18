"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BrainCircuit, Zap, ChevronRight, Eye, EyeOff, Users, Sparkles, Loader2,
} from "lucide-react";
import { SPORT_LEAGUES, fetchSGOEvents, sgoEventToMatch, LEAGUE_LABELS } from "@/lib/sgo";
import type { BettingMatch } from "@/lib/betting-types";
import type { SportSlug, TipsterProfile } from "@/lib/api";
import { getTipsters, getMatchReasoning } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────────────────────────

const SPORT_META: { value: string; label: string; icon: string }[] = [
  { value: "all",        label: "All",        icon: "🏆" },
  { value: "soccer",     label: "Soccer",     icon: "⚽" },
  { value: "tennis",     label: "Tennis",     icon: "🎾" },
  { value: "basketball", label: "Basketball", icon: "🏀" },
  { value: "baseball",   label: "Baseball",   icon: "⚾" },
  { value: "hockey",     label: "Hockey",     icon: "🏒" },
];

const SPORT_ICONS: Record<string, string> = Object.fromEntries(
  SPORT_META.map(({ value, icon }) => [value, icon])
);

const CONF_THRESHOLDS = [
  { value: "0",   label: "All"  },
  { value: "0.5", label: "50%+" },
  { value: "0.6", label: "60%+" },
  { value: "0.7", label: "70%+" },
  { value: "0.8", label: "80%+" },
];

// ── Backend merge ────────────────────────────────────────────────────────────

interface BackendItem {
  id: string;
  home_name: string;
  away_name: string;
  p_home: number | null;
  p_away: number | null;
  p_draw?: number | null;
  confidence: number | null;
  kickoff_utc: string;
  elo_home?: number | null;
  elo_away?: number | null;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|cf|ac|as|sc|cd|afc|rsc|fk|sk|bk|hc|hv)\b/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamsMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.length > 3 && nb.includes(na)) return true;
  if (nb.length > 3 && na.includes(nb)) return true;
  return false;
}

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("alpha_engine_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchBackendForSport(sport: SportSlug): Promise<BackendItem[]> {
  try {
    const now = new Date();
    const dateTo = new Date(now.getTime() + 48 * 3600_000).toISOString();
    const res = await fetch(
      `/api/v1/sports/${sport}/matches?date_from=${encodeURIComponent(now.toISOString())}&date_to=${encodeURIComponent(dateTo)}&limit=200`,
      { cache: "no-store", headers: getAuthHeaders() }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

async function fetchPreview(sport: SportSlug, home: string, away: string): Promise<BackendItem | null> {
  try {
    const res = await fetch(
      `/api/v1/sports/${sport}/matches/preview?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`,
      { cache: "no-store", headers: getAuthHeaders() }
    );
    if (!res.ok) return null;
    const d = await res.json();
    if (!d.probabilities) return null;
    return {
      home_name: d.home?.name ?? home,
      away_name: d.away?.name ?? away,
      p_home: d.probabilities.home_win ?? null,
      p_away: d.probabilities.away_win ?? null,
      p_draw: d.probabilities.draw ?? null,
      confidence: d.confidence ?? null,
      kickoff_utc: d.kickoff_utc ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function eloProb(eloHome: number, eloAway: number): { pHome: number; pAway: number } {
  const p = 1 / (1 + Math.pow(10, -(eloHome - eloAway) / 400));
  return { pHome: Math.round(p * 10000) / 10000, pAway: Math.round((1 - p) * 10000) / 10000 };
}

function mergeBackend(match: BettingMatch, items: BackendItem[]): BettingMatch {
  const found = items.find(
    (b) =>
      teamsMatch(match.home.name, b.home_name) &&
      teamsMatch(match.away.name, b.away_name) &&
      Math.abs(new Date(match.startTime).getTime() - new Date(b.kickoff_utc).getTime()) < 6 * 3600_000
  );
  if (!found) return match;

  const backendId = found.id;

  // ML prediction exists — use it directly
  if (found.p_home != null) {
    return {
      ...match,
      backendId,
      pHome: found.p_home,
      pAway: found.p_away ?? undefined,
      pDraw: found.p_draw ?? undefined,
      modelConfidence: found.confidence != null ? found.confidence / 100 : undefined,
    };
  }

  // No ML prediction but ELO data available — compute ELO probability
  if (found.elo_home != null && found.elo_away != null) {
    const { pHome, pAway } = eloProb(found.elo_home, found.elo_away);
    return { ...match, backendId, pHome, pAway };
  }

  return { ...match, backendId };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " UTC";
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowStr = new Date(now.getTime() + 86400_000).toISOString().slice(0, 10);
  const matchStr = d.toISOString().slice(0, 10);
  if (matchStr === todayStr) return "Today";
  if (matchStr === tomorrowStr) return "Tomorrow";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({
  label, sub, count, action,
}: {
  label: string;
  sub?: string;
  count?: number;
  action?: { label: string; href: string };
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/65">{label}</span>
      {count != null && (
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-1.5 py-px text-[10px] font-semibold tabular-nums text-white/38">
          {count}
        </span>
      )}
      {sub && <span className="text-[11px] text-white/28">{sub}</span>}
      <div className="h-px flex-1 bg-white/[0.06]" />
      {action && (
        <Link
          href={action.href}
          className="flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-[var(--accent)] transition-opacity hover:opacity-75"
        >
          {action.label} <ChevronRight size={11} />
        </Link>
      )}
    </div>
  );
}

// ── Featured pick card ────────────────────────────────────────────────────────

type MatchWithSport = BettingMatch & { sport: SportSlug; backendId?: string };

function FeaturedPickCard({ match }: { match: MatchWithSport }) {
  const href = `/sports/${match.sport}/matches/${match.id}`;
  const conf = match.modelConfidence ?? 0;
  const confPct = Math.round(conf * 100);
  const hPct = match.pHome != null ? Math.round(match.pHome * 100) : null;
  const aPct = match.pAway != null ? Math.round(match.pAway * 100) : null;
  const leagueLabel = LEAGUE_LABELS[match.league] ?? match.league;
  const isTop = conf >= 0.75;
  const isMid = conf >= 0.65 && conf < 0.75;

  const confBadge = isTop
    ? { border: "rgba(52,211,153,0.28)", bg: "rgba(52,211,153,0.09)", color: "#6ee7b7" }
    : isMid
    ? { border: "rgba(251,191,36,0.25)", bg: "rgba(251,191,36,0.08)", color: "#fcd34d" }
    : { border: "rgba(255,255,255,0.10)", bg: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.55)" };

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-4 overflow-hidden rounded-2xl border p-4 transition-all duration-150 hover:-translate-y-px",
        isTop
          ? "border-emerald-400/[0.18] bg-[linear-gradient(135deg,rgba(54,242,143,0.05),rgba(255,255,255,0.02))] hover:border-emerald-400/[0.28]"
          : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.12]"
      )}
    >
      {isTop && (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(54,242,143,0.07),transparent_55%)]" />
      )}

      <span className="relative shrink-0 text-xl leading-none">{SPORT_ICONS[match.sport] ?? "🏆"}</span>

      <div className="relative min-w-0 flex-1">
        <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/28">
          {leagueLabel}
        </div>
        <div className="flex items-baseline gap-2">
          <span className={cn(
            "max-w-[130px] truncate text-[14px] font-semibold leading-tight",
            hPct != null && hPct >= (aPct ?? 0) ? "text-white" : "text-white/60"
          )}>
            {match.home.name}
          </span>
          <span className="shrink-0 text-[10px] text-white/22">vs</span>
          <span className={cn(
            "max-w-[130px] truncate text-[14px] font-semibold leading-tight",
            aPct != null && aPct > (hPct ?? 0) ? "text-white" : "text-white/60"
          )}>
            {match.away.name}
          </span>
        </div>

        {hPct != null && aPct != null && (
          <div className="mt-2.5 flex items-center gap-2">
            <span className={cn(
              "w-9 shrink-0 text-right font-mono text-[12px] font-bold tabular-nums",
              hPct > aPct ? "text-emerald-300" : "text-white/38"
            )}>
              {hPct}%
            </span>
            <div className="relative flex-1 overflow-hidden rounded-full" style={{ height: 8, background: "rgba(255,255,255,0.05)" }}>
              <div
                className="absolute left-0 top-0 h-full"
                style={{
                  width: `${hPct}%`,
                  background: hPct > aPct ? "linear-gradient(90deg, #34d399, #10b981)" : "linear-gradient(90deg, #f97316, #fb923c)",
                  boxShadow: hPct > aPct ? "0 0 10px rgba(52,211,153,0.5)" : "0 0 10px rgba(249,115,22,0.4)",
                }}
              />
              <div
                className="absolute right-0 top-0 h-full"
                style={{
                  width: `${aPct}%`,
                  background: aPct > hPct ? "linear-gradient(270deg, #34d399, #10b981)" : "linear-gradient(270deg, #f97316, #fb923c)",
                  boxShadow: aPct > hPct ? "0 0 10px rgba(52,211,153,0.5)" : "0 0 10px rgba(249,115,22,0.4)",
                }}
              />
            </div>
            <span className={cn(
              "w-9 shrink-0 font-mono text-[12px] font-bold tabular-nums",
              aPct > hPct ? "text-emerald-300" : "text-orange-300/70"
            )}>
              {aPct}%
            </span>
          </div>
        )}
      </div>

      <div className="relative flex shrink-0 flex-col items-end gap-1.5">
        <div
          className="min-w-[58px] rounded-xl border px-3 py-1.5 text-center"
          style={{ borderColor: confBadge.border, background: confBadge.bg }}
        >
          <div className="mb-0.5 text-[8px] uppercase tracking-[0.14em] text-white/28">Conf</div>
          <div className="font-mono text-[18px] font-bold tabular-nums leading-none" style={{ color: confBadge.color }}>
            {confPct}%
          </div>
        </div>
        <div className="font-mono text-[10px] text-white/25">{fmtTime(match.startTime)}</div>
      </div>

      <ChevronRight
        size={13}
        className="relative shrink-0 text-white/18 opacity-0 transition-opacity group-hover:opacity-100"
      />
    </Link>
  );
}

// ── Tipster card ──────────────────────────────────────────────────────────────

function avatarColor(name: string): string {
  const palette = ["#6ee7b7", "#93c5fd", "#c4b5fd", "#fca5a5", "#fcd34d", "#67e8f9"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length];
}

function TipsterCard({ tipster }: { tipster: TipsterProfile }) {
  const winPct = Math.round(tipster.weekly_win_rate * 100);
  const col = avatarColor(tipster.username);
  const isHot = winPct >= 65;
  const winColor = winPct >= 65 ? "text-emerald-300" : winPct >= 55 ? "text-amber-300" : "text-white/50";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 transition-colors hover:border-white/[0.12]">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold uppercase"
        style={{ background: `${col}1a`, color: col, border: `1px solid ${col}35` }}
      >
        {tipster.username.slice(0, 2)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-white">{tipster.username}</span>
          {isHot && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px text-[8px] font-bold uppercase tracking-wider"
              style={{ borderColor: "rgba(251,191,36,0.28)", background: "rgba(251,191,36,0.08)", color: "#fcd34d" }}
            >
              <Zap size={7} /> Hot
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1">
          {tipster.recent_results.slice(0, 5).map((r, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold",
                r === "W" ? "bg-emerald-400/15 text-emerald-400" : "bg-red-400/12 text-red-400"
              )}
            >
              {r}
            </span>
          ))}
          {tipster.active_tips_count > 0 && (
            <span className="ml-1 text-[10px] text-white/28">{tipster.active_tips_count} active</span>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className={cn("font-mono text-[20px] font-bold tabular-nums leading-none", winColor)}>
          {winPct}%
        </div>
        <div className="mt-0.5 text-[9px] uppercase tracking-[0.10em] text-white/28">win rate</div>
      </div>
    </div>
  );
}

// ── Pill group ────────────────────────────────────────────────────────────────

function PillGroup<T extends string>({
  label, options, active, onChange, badges,
}: {
  label: string;
  options: { value: T; label: string }[];
  active: T;
  onChange: (v: T) => void;
  badges?: Partial<Record<string, number>>;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38 shrink-0">{label}</span>
      <div className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
        {options.map((o) => {
          const badge = badges?.[o.value];
          const isActive = active === o.value;
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className={cn(
                "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all",
                isActive
                  ? "bg-[#2edb6c] text-[#07110d] shadow-sm"
                  : "text-white/55 hover:bg-white/[0.06] hover:text-white"
              )}
            >
              {o.label}
              {badge != null && badge > 0 && (
                <span className={cn(
                  "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums leading-none",
                  isActive
                    ? "bg-[#07110d]/30 text-[#07110d]"
                    : "bg-emerald-400/20 text-emerald-300"
                )}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Match card (full predictions feed) ───────────────────────────────────────

function MatchCard({ match }: { match: MatchWithSport }) {
  const href = `/sports/${match.sport}/matches/${match.id}`;
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [loadingReasoning, setLoadingReasoning] = useState(false);

  async function handleAnalysis(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (reasoning) { setReasoningOpen((v) => !v); return; }
    setReasoningOpen(true);
    setLoadingReasoning(true);
    const r = await getMatchReasoning(match.backendId ?? match.id);
    setReasoning(r);
    setLoadingReasoning(false);
  }

  const hasModelProbs = match.pHome != null;
  const hasConfidence = match.modelConfidence != null;
  const conf = match.modelConfidence ?? 0;

  const ml = match.featuredMarkets?.[0];
  const homeOdds = ml?.selections[0]?.odds;
  const drawSel = ml?.selections.find((s) => s.id === "draw");
  const awayOdds = ml?.selections[ml.selections.length - 1]?.odds;

  // Compute implied probability from market odds if no model prediction
  let hPct: number | null = hasModelProbs ? Math.round((match.pHome ?? 0) * 100) : null;
  let aPct: number | null = hasModelProbs ? Math.round((match.pAway ?? 0) * 100) : null;
  let dPct: number | null = hasModelProbs && match.pDraw != null ? Math.round(match.pDraw * 100) : null;
  let isMarketImplied = false;
  if (!hasModelProbs && homeOdds && awayOdds && homeOdds > 1 && awayOdds > 1) {
    const impHome = 1 / homeOdds;
    const impDraw = drawSel ? 1 / drawSel.odds : 0;
    const impAway = 1 / awayOdds;
    const total = impHome + impDraw + impAway;
    hPct = Math.round((impHome / total) * 100);
    aPct = Math.round((impAway / total) * 100);
    dPct = impDraw > 0 ? 100 - hPct - aPct : null;
    isMarketImplied = true;
  }
  const hasProbabilities = hPct != null && aPct != null;

  const isHighConf = hasConfidence && conf >= 0.7;
  const confBarBg = conf >= 0.7 ? "bg-emerald-400" : conf >= 0.5 ? "bg-amber-400" : "bg-red-400";

  const leagueLabel = LEAGUE_LABELS[match.league] ?? match.league;
  const sportIcon = SPORT_ICONS[match.sport] ?? "🏆";

  return (
    <div className={cn(
      "group relative overflow-hidden rounded-[28px] border transition-all duration-200",
      isHighConf
        ? "border-emerald-400/25 bg-[linear-gradient(135deg,rgba(54,242,143,0.08),rgba(54,242,143,0.03))]"
        : "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]"
    )}>
      {isHighConf && (
        <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_top_left,rgba(54,242,143,0.08),transparent_60%)]" />
      )}

      {/* Main clickable area */}
      <Link href={href} className="relative block p-5 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(0,0,0,0.32)] transition-all duration-200">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">{sportIcon}</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              {leagueLabel}
            </span>
            {isHighConf && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                <Zap size={9} />
                High confidence
              </span>
            )}
          </div>
          <span className="shrink-0 font-mono text-[11px] text-white/30">{fmtTime(match.startTime)}</span>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_32px_1fr] items-start gap-2">
          <div>
            <p className="text-[13px] font-semibold leading-snug text-white">{match.home.name}</p>
            {hasProbabilities && (
              <p className={cn(
                "mt-1.5 font-mono text-[26px] font-bold tabular-nums leading-none",
                isMarketImplied
                  ? ((hPct ?? 0) >= (aPct ?? 0) ? "text-sky-300" : "text-sky-300/50")
                  : ((hPct ?? 0) >= (aPct ?? 0) ? "text-emerald-300" : "text-white/50")
              )}>{hPct}%</p>
            )}
            {homeOdds && (
              <p className="mt-0.5 font-mono text-[11px] text-white/30">{homeOdds.toFixed(2)}</p>
            )}
          </div>

          <div className="flex h-full flex-col items-center pt-1">
            <span className="text-[11px] font-medium text-white/25">vs</span>
            {dPct != null && (
              <div className="mt-2 rounded-xl border border-white/8 bg-black/20 px-1.5 py-2 text-center">
                <p className="text-[9px] font-semibold uppercase text-white/35">D</p>
                <p className="font-mono text-xs font-bold text-amber-300/70 tabular-nums">{dPct}%</p>
              </div>
            )}
          </div>

          <div className="text-right">
            <p className="text-[13px] font-semibold leading-snug text-white">{match.away.name}</p>
            {hasProbabilities && (
              <p className={cn(
                "mt-1.5 font-mono text-[26px] font-bold tabular-nums leading-none",
                isMarketImplied
                  ? ((aPct ?? 0) > (hPct ?? 0) ? "text-sky-300" : "text-sky-300/50")
                  : ((aPct ?? 0) > (hPct ?? 0) ? "text-orange-300" : "text-white/50")
              )}>{aPct}%</p>
            )}
            {awayOdds && (
              <p className="mt-0.5 font-mono text-[11px] text-white/30">{awayOdds.toFixed(2)}</p>
            )}
          </div>
        </div>

        {hasProbabilities && (
          <div className="mt-4 overflow-hidden rounded-full" style={{ height: 12, background: "rgba(255,255,255,0.05)" }}>
            <div className="relative h-full">
              <div
                className="absolute left-0 top-0 h-full transition-all"
                style={{
                  width: `${(hPct ?? 0) - (dPct != null ? dPct / 2 : 0)}%`,
                  background: isMarketImplied
                    ? "linear-gradient(90deg, rgba(56,189,248,0.9), rgba(56,189,248,0.6))"
                    : "linear-gradient(90deg, #34d399, #10b981)",
                  boxShadow: isMarketImplied ? "0 0 16px rgba(56,189,248,0.55)" : "0 0 16px rgba(52,211,153,0.55)",
                }}
              />
              {dPct != null && (
                <div className="absolute top-0 h-full" style={{
                  left: `${(hPct ?? 0) - dPct / 2}%`,
                  width: `${dPct}%`,
                  background: "rgba(251,191,36,0.55)",
                }} />
              )}
              <div
                className="absolute right-0 top-0 h-full transition-all"
                style={{
                  width: `${(aPct ?? 0) - (dPct != null ? dPct / 2 : 0)}%`,
                  background: isMarketImplied
                    ? "linear-gradient(270deg, rgba(56,189,248,0.9), rgba(56,189,248,0.6))"
                    : "linear-gradient(270deg, #f97316, #fb923c)",
                  boxShadow: isMarketImplied ? "0 0 16px rgba(56,189,248,0.55)" : "0 0 16px rgba(249,115,22,0.45)",
                }}
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          {hasConfidence ? (
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Confidence</span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn("h-full rounded-full shadow-sm", confBarBg,
                      conf >= 0.7 ? "shadow-emerald-400/40" : conf >= 0.5 ? "shadow-amber-400/40" : "shadow-red-400/40"
                    )}
                    style={{ width: `${Math.round(conf * 100)}%` }}
                  />
                </div>
                <span className={cn(
                  "rounded-full border px-2 py-0.5 font-mono text-[12px] font-bold tabular-nums",
                  conf >= 0.7
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : conf >= 0.5
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                    : "border-red-400/30 bg-red-400/10 text-red-400"
                )}>
                  {Math.round(conf * 100)}%
                </span>
              </div>
            </div>
          ) : isMarketImplied ? (
            <span className="text-[11px] text-white/25">Market implied</span>
          ) : hasProbabilities ? (
            <span className="text-[11px] text-white/25">ELO estimate</span>
          ) : (
            <span className="text-[11px] text-white/20">No prediction</span>
          )}

          <span className="flex items-center gap-1 text-[11px] font-semibold text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
            View <ChevronRight size={12} />
          </span>
        </div>
      </Link>

      {/* AI Analysis toggle — only for matches tracked in backend DB */}
      {match.backendId && <div className="relative border-t border-white/[0.05]">
        <button
          onClick={handleAnalysis}
          className={cn(
            "flex w-full items-center gap-2 px-5 py-2.5 text-left text-[11px] font-semibold transition-colors",
            reasoningOpen
              ? "text-purple-300"
              : "text-white/30 hover:text-white/55"
          )}
        >
          {loadingReasoning
            ? <Loader2 size={11} className="animate-spin text-purple-400" />
            : <Sparkles size={11} className={reasoningOpen ? "text-purple-400" : "text-white/25"} />
          }
          {loadingReasoning ? "Generating analysis…" : reasoningOpen ? "Hide pre-match analysis" : "Pre-match analysis"}
        </button>

        {reasoningOpen && (
          <div className="px-5 pb-4">
            {loadingReasoning ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 size={12} className="animate-spin text-purple-400/60" />
                <span className="text-[12px] text-white/30">Analysing match data…</span>
              </div>
            ) : reasoning ? (
              <p className="text-[12px] leading-relaxed text-white/55 border-l-2 border-purple-400/30 pl-3">
                {reasoning}
              </p>
            ) : (
              <p className="text-[12px] text-white/40">Analysis not yet available — check back shortly.</p>
            )}
          </div>
        )}
      </div>}
    </div>
  );
}

// ── Day section ───────────────────────────────────────────────────────────────

function DaySection({ label, matches }: { label: string; matches: MatchWithSport[] }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-[13px] font-bold text-white/60">{label}</h3>
        <div className="h-px flex-1 bg-white/[0.06]" />
        <span className="text-[11px] text-white/30">{matches.length} fixture{matches.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {matches.map((m) => <MatchCard key={m.id} match={m} />)}
      </div>
    </div>
  );
}

// ── Main shell ────────────────────────────────────────────────────────────────

const ALL_SPORT_LEAGUES: { sport: SportSlug; leagueID: string }[] = Object.entries(SPORT_LEAGUES)
  .flatMap(([sport, leagues]) =>
    (leagues as string[]).map((leagueID) => ({ sport: sport as SportSlug, leagueID }))
  );

export function PredictionsShell({ initialSport }: { initialSport: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  type MatchWithSportLocal = BettingMatch & { sport: SportSlug; backendId?: string };
  const [matches, setMatches] = useState<MatchWithSportLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [minConf, setMinConf] = useState("0");
  const [showAll, setShowAll] = useState(true);
  const [tipsters, setTipsters] = useState<TipsterProfile[]>([]);
  const [tipstersLoading, setTipstersLoading] = useState(true);

  const sport = searchParams.get("sport") ?? initialSport;

  function navigate(updates: Record<string, string>) {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === "all") p.delete(k); else p.set(k, v);
    });
    router.replace(`/predictions${p.size ? `?${p}` : ""}`, { scroll: false });
  }

  // Load matches
  useEffect(() => {
    setLoading(true);
    const leagues = sport === "all"
      ? ALL_SPORT_LEAGUES
      : ALL_SPORT_LEAGUES.filter((l) => l.sport === sport);

    if (!leagues.length) { setLoading(false); return; }

    const sportSlugs = Array.from(new Set(leagues.map((l) => l.sport)));

    Promise.all([
      Promise.all(leagues.map(({ leagueID, sport: s }) =>
        fetchSGOEvents(leagueID).then((events) =>
          events
            .filter((e) => !e.status.started && !e.status.ended && !e.status.cancelled)
            .map((e) => ({ ...sgoEventToMatch(e, s), sport: s }))
        )
      )).then((res) => res.flat()),
      Promise.all(sportSlugs.map((s) => fetchBackendForSport(s).then((items) => ({ sport: s, items })))),
    ]).then(async ([sgoMatches, backendBySport]) => {
      const backendMap = Object.fromEntries(backendBySport.map(({ sport: s, items }) => [s, items]));
      const now = Date.now();
      const cutoff = now + 48 * 3600_000;

      // First pass: merge with backend DB matches
      const firstPass: MatchWithSportLocal[] = sgoMatches
        .filter((m) => {
          const t = new Date(m.startTime).getTime();
          return t >= now && t <= cutoff;
        })
        .map((m) => ({ ...mergeBackend(m, backendMap[m.sport] ?? []), sport: m.sport }))
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

      setMatches(firstPass);
      setLoading(false);

      // Second pass: call preview for matches missing probabilities OR missing draw on draw-capable sports
      const needsPreview = (m: MatchWithSportLocal) => {
        if (m.status === "finished") return false;
        if (m.pHome == null) return true;
        // Also re-fetch for draw sports (soccer, mls, etc.) that have a draw market but no pDraw yet
        const hasDrawMarket = m.featuredMarkets?.[0]?.selections.some((s) => s.id === "draw");
        return hasDrawMarket && m.pDraw == null;
      };
      const unmatched = firstPass.filter(needsPreview);
      if (unmatched.length > 0) {
        const previews = await Promise.all(
          unmatched.map((m) => fetchPreview(m.sport, m.home.name, m.away.name))
        );
        setMatches((prev) =>
          prev.map((m) => {
            if (!needsPreview(m)) return m;
            const idx = unmatched.findIndex((u) => u.id === m.id);
            const p = idx >= 0 ? previews[idx] : null;
            if (!p) return m;
            return {
              ...m,
              pHome: p.p_home ?? m.pHome ?? undefined,
              pAway: p.p_away ?? m.pAway ?? undefined,
              pDraw: p.p_draw ?? undefined,
              modelConfidence: p.confidence != null ? p.confidence / 100 : (m.modelConfidence ?? undefined),
            };
          })
        );
      }
    });
  }, [sport]);

  // Load tipsters
  useEffect(() => {
    getTipsters()
      .then((data) => {
        setTipsters(
          [...data]
            .sort((a, b) => b.weekly_win_rate - a.weekly_win_rate)
            .slice(0, 5)
        );
      })
      .catch(() => {})
      .finally(() => setTipstersLoading(false));
  }, []);

  const threshold = parseFloat(minConf);
  const base = showAll ? matches : matches.filter((m) => m.pHome != null);
  const items = threshold > 0
    ? base.filter((m) => (m.modelConfidence ?? 0) >= threshold)
    : base;

  const withConf = matches.filter((m) => m.modelConfidence != null).length;
  const highConf = matches.filter((m) => (m.modelConfidence ?? 0) >= 0.7).length;

  // Per-sport signal count (confidence >= 60%) for sport pill badges
  const sportSignals: Partial<Record<string, number>> = {};
  let totalSignals = 0;
  for (const m of matches) {
    if ((m.modelConfidence ?? 0) >= 0.6) {
      sportSignals[m.sport] = (sportSignals[m.sport] ?? 0) + 1;
      totalSignals++;
    }
  }
  if (totalSignals > 0) sportSignals["all"] = totalSignals;

  // Featured picks: top 5 by confidence, min 60%, from ALL matches regardless of filters
  const featuredPicks = matches
    .filter((m) => (m.modelConfidence ?? 0) >= 0.6)
    .sort((a, b) => (b.modelConfidence ?? 0) - (a.modelConfidence ?? 0))
    .slice(0, 5);

  // Group remaining by day
  const grouped: { label: string; matches: MatchWithSportLocal[] }[] = [];
  for (const m of items) {
    const label = dayLabel(m.startTime);
    const existing = grouped.find((g) => g.label === label);
    if (existing) existing.matches.push(m);
    else grouped.push({ label, matches: [m] });
  }

  return (
    <div className="space-y-6 pb-12">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-bold tracking-[-0.03em] text-white">
              Today&apos;s Intelligence
            </h1>
            <p className="mt-0.5 text-[12px] text-white/35">
              Best model picks · Top tipsters · Next 48 hours
            </p>
          </div>

          {!loading && (withConf > 0 || highConf > 0) && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-center">
                <div className="font-mono text-[18px] font-bold tabular-nums text-white leading-none">{withConf}</div>
                <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-white/30">Predictions</div>
              </div>
              {highConf > 0 && (
                <div className="rounded-xl border px-3 py-1.5 text-center"
                  style={{ borderColor: "rgba(52,211,153,0.25)", background: "rgba(52,211,153,0.08)" }}>
                  <div className="font-mono text-[18px] font-bold tabular-nums text-emerald-300 leading-none">{highConf}</div>
                  <div className="mt-1 text-[9px] uppercase tracking-[0.14em]" style={{ color: "rgba(52,211,153,0.5)" }}>High conf</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/[0.05] pt-4">
          <PillGroup
            label="Sport"
            options={SPORT_META}
            active={sport}
            onChange={(v) => navigate({ sport: v })}
            badges={sportSignals}
          />
          <PillGroup
            label="Confidence"
            options={CONF_THRESHOLDS}
            active={minConf}
            onChange={setMinConf}
          />
          <button
            onClick={() => setShowAll((v) => !v)}
            className={cn(
              "ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-all",
              showAll
                ? "border-white/15 bg-white/[0.06] text-white/70"
                : "border-white/[0.08] text-white/40 hover:text-white/60"
            )}
          >
            {showAll ? <Eye size={13} /> : <EyeOff size={13} />}
            {showAll ? "Showing all" : "Predictions only"}
          </button>
        </div>
      </div>

      {/* ── Two-column: Featured picks + Top tipsters ──────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">

        {/* Featured picks */}
        <div>
          <SectionLabel
            label="Top Picks"
            sub={loading ? "Loading…" : "Highest confidence today"}
            count={loading ? undefined : featuredPicks.length}
          />
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[88px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" />
              ))}
            </div>
          ) : featuredPicks.length === 0 ? (
            <div className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02] p-6 text-center">
              <BrainCircuit size={24} className="text-white/25" />
              <p className="mt-3 text-[13px] text-white/40">No high-confidence picks yet</p>
              <p className="mt-1 text-[11px] text-white/22">
                Lower the confidence filter to see more matches
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {featuredPicks.map((m) => (
                <FeaturedPickCard key={m.id} match={m} />
              ))}
            </div>
          )}
        </div>

        {/* Top tipsters */}
        <div>
          <SectionLabel
            label="Top Tipsters"
            sub="Best win rates this week"
            action={{ label: "View all", href: "/tipsters" }}
          />
          {tipstersLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[60px] animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]" />
              ))}
            </div>
          ) : tipsters.length === 0 ? (
            <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.10] bg-white/[0.02] p-6 text-center">
              <Users size={22} className="text-white/25" />
              <p className="mt-3 text-[13px] text-white/40">No tipsters yet</p>
              <Link href="/tipsters" className="mt-2 text-[11px] text-[var(--accent)] hover:opacity-75 transition-opacity">
                Go to tipsters →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {tipsters.map((t) => (
                <TipsterCard key={t.id} tipster={t} />
              ))}
              <Link
                href="/tipsters"
                className="mt-1 flex w-full items-center justify-center gap-1 rounded-xl border border-white/[0.08] py-2.5 text-[11px] font-medium text-white/38 transition-colors hover:bg-white/[0.03] hover:text-white/60"
              >
                Full leaderboard <ChevronRight size={11} />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── All fixtures ──────────────────────────────────────────────────── */}
      <div>
        <SectionLabel
          label="All Fixtures"
          sub={loading ? "Loading…" : `${items.length} upcoming · sorted by kickoff`}
          count={loading ? undefined : items.length}
        />

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-52 animate-pulse rounded-[28px] border border-white/[0.06] bg-white/[0.02]" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
            <BrainCircuit size={28} className="text-white/30" />
            <div className="mt-4 text-xl font-semibold text-white">No predictions found</div>
            <div className="mt-2 text-sm text-white/40">
              {threshold > 0
                ? `No matches meet the ${Math.round(threshold * 100)}%+ confidence threshold.`
                : "No upcoming fixtures with model predictions in the next 48 hours."}
            </div>
            {!showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="mt-4 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[12px] text-white/50 hover:text-white/70 transition-colors"
              >
                <Eye size={13} /> Show all fixtures
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(({ label, matches: dayMatches }) => (
              <DaySection key={label} label={label} matches={dayMatches} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
