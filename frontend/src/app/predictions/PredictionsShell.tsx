"use client";

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  BrainCircuit,
  ChevronRight,
  Eye,
  EyeOff,
  Flame,
  Loader2,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";
import { SPORT_LEAGUES, fetchSGOEvents, sgoEventToMatch, LEAGUE_LABELS } from "@/lib/sgo";
import type { BettingMatch } from "@/lib/betting-types";
import type { SportSlug, TipsterProfile } from "@/lib/api";
import { getMatchReasoning, getTipsters } from "@/lib/api";
import { cn } from "@/lib/utils";

const SPORT_META: { value: string; label: string; icon: string }[] = [
  { value: "all", label: "All", icon: "🏆" },
  { value: "soccer", label: "Soccer", icon: "⚽" },
  { value: "tennis", label: "Tennis", icon: "🎾" },
  { value: "basketball", label: "Basketball", icon: "🏀" },
  { value: "baseball", label: "Baseball", icon: "⚾" },
  { value: "hockey", label: "Hockey", icon: "🏒" },
  { value: "esports", label: "Esports", icon: "🎮" },
];

const SPORT_ICONS: Record<string, string> = Object.fromEntries(SPORT_META.map(({ value, icon }) => [value, icon]));

const CONF_THRESHOLDS = [
  { value: "0", label: "All" },
  { value: "0.5", label: "50%+" },
  { value: "0.6", label: "60%+" },
  { value: "0.7", label: "70%+" },
  { value: "0.8", label: "80%+" },
];

interface BackendItem {
  id?: string;
  home_id?: string;
  away_id?: string;
  home_name: string;
  away_name: string;
  league?: string;
  status?: string;
  home_score?: number | null;
  away_score?: number | null;
  p_home: number | null;
  p_away: number | null;
  p_draw?: number | null;
  confidence: number | null;
  kickoff_utc: string;
  elo_home?: number | null;
  elo_away?: number | null;
}

type MatchWithSport = BettingMatch & { sport: SportSlug; backendId?: string };

const ALL_SPORT_LEAGUES: { sport: SportSlug; leagueID: string }[] = Object.entries(SPORT_LEAGUES).flatMap(([sport, leagues]) =>
  (leagues as string[]).map((leagueID) => ({ sport: sport as SportSlug, leagueID }))
);

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

function backendItemToMatch(item: BackendItem, sport: SportSlug): MatchWithSport {
  const homeName = item.home_name;
  const awayName = item.away_name;
  return {
    id: item.id ?? `be-${sport}-${homeName}-${awayName}`,
    sport,
    league: item.league ?? sport,
    startTime: item.kickoff_utc,
    status: (item.status === "scheduled" ? "upcoming" : item.status ?? "upcoming") as import("@/lib/betting-types").MatchStatus,
    homeScore: item.home_score ?? undefined,
    awayScore: item.away_score ?? undefined,
    home: { id: item.home_id ?? homeName, name: homeName, shortName: homeName.slice(0, 14) },
    away: { id: item.away_id ?? awayName, name: awayName, shortName: awayName.slice(0, 14) },
    pHome: item.p_home ?? undefined,
    pAway: item.p_away ?? undefined,
    pDraw: item.p_draw ?? undefined,
    modelConfidence: item.confidence != null ? item.confidence / 100 : undefined,
    featuredMarkets: [],
    allMarkets: [],
    backendId: item.id,
  };
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

  if (found.elo_home != null && found.elo_away != null) {
    const { pHome, pAway } = eloProb(found.elo_home, found.elo_away);
    return { ...match, backendId, pHome, pAway };
  }

  return { ...match, backendId };
}

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

function titleCase(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function fmtPct(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

function chipTone(conf: number) {
  if (conf >= 0.7) return "positive" as const;
  if (conf >= 0.55) return "warning" as const;
  return "neutral" as const;
}

function toneClasses(tone: "positive" | "warning" | "accent" | "neutral") {
  return {
    positive: "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300",
    warning: "border-amber-400/20 bg-amber-400/[0.08] text-amber-300",
    accent: "border-[rgba(0,255,132,0.18)] bg-[rgba(0,255,132,0.08)] text-[#8fffc7]",
    neutral: "border-white/[0.08] bg-white/[0.04] text-white/68",
  }[tone];
}

function SummaryStat({
  label,
  value,
  note,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "positive" | "warning" | "accent" | "neutral";
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className={cn("rounded-[22px] border p-4", toneClasses(tone))}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/34">{label}</p>
        <Icon className="h-4 w-4 text-current/40" />
      </div>
      <p className="mt-3 font-mono text-[26px] font-bold tracking-[-0.04em] text-white tabular-nums">{value}</p>
      <p className="mt-2 text-[11px] text-white/36">{note}</p>
    </div>
  );
}

function TinyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] bg-white/[0.05] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">{label}</p>
      <p className="mt-1 text-[13px] font-semibold text-white/82">{value}</p>
    </div>
  );
}

function SectionLabel({
  icon: Icon,
  label,
  sub,
  count,
  action,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: ReactNode;
  sub?: string;
  count?: number;
  action?: { label: string; href: string };
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      {Icon ? (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/70">
          <Icon className="h-4 w-4" />
        </span>
      ) : null}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.18em] text-white/58">{label}</h2>
          {count != null ? (
            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/36">
              {count}
            </span>
          ) : null}
        </div>
        {sub ? <p className="mt-1 text-[12px] text-white/34">{sub}</p> : null}
      </div>
      <div className="h-px flex-1 bg-white/[0.06]" />
      {action ? (
        <Link href={action.href} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] transition-opacity hover:opacity-75">
          {action.label}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function FeaturedPickCard({ match }: { match: MatchWithSport }) {
  const href = `/sports/${match.sport}/matches/${match.id}`;
  const conf = match.modelConfidence ?? 0;
  const confPct = Math.round(conf * 100);
  const hPct = match.pHome != null ? Math.round(match.pHome * 100) : null;
  const aPct = match.pAway != null ? Math.round(match.pAway * 100) : null;
  const dPct = match.pDraw != null ? Math.round(match.pDraw * 100) : null;
  const leagueLabel = LEAGUE_LABELS[match.league] ?? titleCase(match.league);
  const tone = chipTone(conf);
  const favorite = hPct != null && aPct != null ? (hPct >= aPct ? match.home.name : match.away.name) : "Awaiting read";
  const source = match.modelConfidence != null ? "Model read" : match.pHome != null ? "ELO read" : "Market read";
  const edge = hPct != null && aPct != null ? Math.abs(hPct - aPct) : null;

  return (
    <Link href={href} className="group block rounded-[22px] border border-white/[0.08] bg-[#10131a] p-4 transition-colors hover:border-white/[0.14] hover:bg-[#141923]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/54">
              <span>{SPORT_ICONS[match.sport] ?? "🏆"}</span>
              {leagueLabel}
            </span>
            <span
              className={cn(
                "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                tone === "positive"
                  ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300"
                  : "border-white/[0.08] bg-white/[0.04] text-white/56"
              )}
            >
              {confPct}% confidence
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[18px] font-semibold leading-tight text-white">
            <span>{match.home.name}</span>
            <span className="text-white/22">vs</span>
            <span>{match.away.name}</span>
          </div>

          <p className="mt-2 text-[12px] leading-5 text-white/38">
            {source}
            {edge != null ? ` · ${edge}% separation between the two main sides` : " · Signal still forming"}
          </p>
        </div>

        <div className="rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">Kickoff</p>
          <p className="mt-1 font-mono text-[13px] font-semibold text-white">{fmtTime(match.startTime)}</p>
        </div>
      </div>

      {hPct != null && aPct != null ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/28">Home</p>
              <p className="mt-2 truncate text-[13px] font-semibold text-white/74">{match.home.name}</p>
              <p className={cn("mt-1 font-mono text-[22px] font-bold leading-none tabular-nums", hPct >= aPct ? "text-emerald-300" : "text-white/44")}>{hPct}%</p>
            </div>
            <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/28">Away</p>
              <p className="mt-2 truncate text-[13px] font-semibold text-white/74">{match.away.name}</p>
              <p className={cn("mt-1 font-mono text-[22px] font-bold leading-none tabular-nums", aPct > hPct ? "text-orange-300" : "text-white/44")}>{aPct}%</p>
            </div>
            <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/28">Draw / market</p>
              <p className="mt-2 text-[13px] font-semibold text-white/74">{dPct != null ? "Draw available" : "Two-way market"}</p>
              <p className="mt-1 font-mono text-[22px] font-bold leading-none tabular-nums text-amber-300">{dPct != null ? `${dPct}%` : "—"}</p>
            </div>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full bg-[linear-gradient(90deg,#00ff84,#10b981)]" style={{ width: `${hPct}%` }} />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <TinyMetric label="Favorite" value={favorite} />
            <TinyMetric label="Source" value={source} />
            <TinyMetric label="Edge" value={edge != null ? `${edge}%` : "—"} />
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-[18px] border border-dashed border-white/[0.10] bg-white/[0.02] px-4 py-4 text-[12px] text-white/42">
          Probabilities are still warming up for this fixture.
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 text-[11px] font-semibold text-white/38">
        <span>{match.backendId ? "Backend-linked analysis ready" : "Fixture card only"}</span>
        <span className="inline-flex items-center gap-1 text-white/48 transition-colors group-hover:text-white/72">
          Open match
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

function avatarColor(name: string): string {
  const palette = ["#6ee7b7", "#93c5fd", "#c4b5fd", "#fca5a5", "#fcd34d", "#67e8f9"];
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length];
}

function TipsterCard({ tipster }: { tipster: TipsterProfile }) {
  const pl = tipster.profit_loss ?? 0;
  const col = avatarColor(tipster.username);
  const isHot = (tipster.weekly_win_rate ?? 0) >= 0.6 || pl >= 5;
  const meta = [
    (tipster.active_tips_count ?? 0) > 0 ? `${tipster.active_tips_count} active tip${tipster.active_tips_count === 1 ? "" : "s"}` : null,
    (tipster.followers ?? 0) > 0 ? `${tipster.followers.toLocaleString()} followers` : null,
  ].filter(Boolean).join(" · ") || "Building sample";

  return (
    <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4 transition-colors hover:border-white/[0.14]">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-[13px] font-bold uppercase" style={{ background: `${col}1a`, color: col, borderColor: `${col}35` }}>
          {(tipster.display_name || tipster.username).slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[14px] font-semibold text-white">{tipster.display_name || tipster.username}</p>
            {isHot ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-300">
                <Flame className="h-3 w-3" />
                Hot
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-white/34">{meta}</p>
        </div>
        <div className="text-right">
          <p className={cn("font-mono text-[20px] font-bold leading-none tabular-nums", pl >= 0 ? "text-emerald-300" : "text-red-400")}>{pl >= 0 ? "+" : ""}{pl.toFixed(1)}u</p>
          <p className="mt-1 text-[9px] uppercase tracking-[0.14em] text-white/28">Profit</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <TinyMetric label="Weekly" value={fmtPct(tipster.weekly_win_rate ?? 0)} />
        <TinyMetric label="Overall" value={fmtPct(tipster.overall_win_rate ?? 0)} />
        <TinyMetric label="Sample" value={`${tipster.settled_picks}`} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {tipster.recent_results.slice(0, 6).map((result, index) => (
            <span
              key={`${tipster.id}-${index}`}
              className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded-[8px] text-[9px] font-bold",
                result === "W" ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300"
              )}
            >
              {result}
            </span>
          ))}
        </div>
        <Link href="/tipsters" className="text-[11px] font-semibold text-[var(--accent)] transition-opacity hover:opacity-75">
          View profile
        </Link>
      </div>
    </div>
  );
}

function PillGroup<T extends string>({
  label,
  options,
  active,
  onChange,
  badges,
}: {
  label: string;
  options: { value: T; label: string }[];
  active: T;
  onChange: (value: T) => void;
  badges?: Partial<Record<string, number>>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">{label}</span>
      <div className="flex flex-wrap items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
        {options.map((option) => {
          const badge = badges?.[option.value];
          const isActive = active === option.value;
          return (
            <button
              key={option.value}
              onClick={() => onChange(option.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all",
                isActive ? "bg-[#00ff84] text-[#07110d]" : "text-white/55 hover:bg-white/[0.06] hover:text-white"
              )}
            >
              {option.label}
              {badge != null && badge > 0 ? (
                <span className={cn("inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold", isActive ? "bg-[#07110d]/25 text-[#07110d]" : "bg-emerald-400/20 text-emerald-300")}>
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MatchCard({ match }: { match: MatchWithSport }) {
  const href = `/sports/${match.sport}/matches/${match.id}`;
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [loadingReasoning, setLoadingReasoning] = useState(false);

  async function handleAnalysis(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (reasoning) {
      setReasoningOpen((value) => !value);
      return;
    }
    setReasoningOpen(true);
    setLoadingReasoning(true);
    const value = await getMatchReasoning(match.backendId ?? match.id);
    setReasoning(value);
    setLoadingReasoning(false);
  }

  const modelConf = match.modelConfidence ?? 0;
  const hasModelProbs = match.pHome != null && modelConf > 0;

  const ml = match.featuredMarkets?.[0];
  const homeOdds = ml?.selections[0]?.odds;
  const drawSel = ml?.selections.find((selection) => selection.id === "draw");
  const awayOdds = ml?.selections[ml.selections.length - 1]?.odds;

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

  let conf = hasModelProbs ? modelConf : 0;
  if (match.modelConfidence == null && hasModelProbs && !isMarketImplied) {
    const maxRaw = Math.max(match.pHome ?? 0, match.pAway ?? 0, match.pDraw ?? 0);
    const numOutcomes = match.pDraw != null ? 3 : 2;
    const random = 1 / numOutcomes;
    conf = Math.max(0, Math.min(1, (maxRaw - random) / (1 - random)));
  }

  const hasConfidence = match.modelConfidence != null || (hasModelProbs && !isMarketImplied);
  const leagueLabel = LEAGUE_LABELS[match.league] ?? titleCase(match.league);
  const sportIcon = SPORT_ICONS[match.sport] ?? "🏆";
  const favoredSide = hasProbabilities ? ((hPct ?? 0) >= (aPct ?? 0) ? match.home.name : match.away.name) : "No lean yet";
  const sourceLabel = match.modelConfidence != null ? "Model" : hasProbabilities && !isMarketImplied ? "ELO" : isMarketImplied ? "Market" : "Pending";
  const confidenceTone = hasConfidence ? chipTone(conf) : "neutral";

  return (
    <div className={cn("overflow-hidden rounded-[28px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] transition-colors", hasConfidence && conf >= 0.7 ? "border-emerald-400/22" : "border-white/[0.08]")}>
      <Link href={href} className="group block p-5 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.015]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm">{sportIcon}</span>
            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">{leagueLabel}</span>
          </div>
          <span className="font-mono text-[11px] text-white/30">{fmtTime(match.startTime)}</span>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_34px_1fr] items-start gap-2">
          <div>
            <p className="text-[15px] font-semibold leading-tight text-white">{match.home.name}</p>
            {hPct != null ? <p className={cn("mt-2 font-mono text-[28px] font-bold leading-none tabular-nums", hPct >= (aPct ?? 0) ? "text-emerald-300" : "text-white/45")}>{hPct}%</p> : null}
            {homeOdds ? <p className="mt-1 font-mono text-[11px] text-white/28">Odds {homeOdds.toFixed(2)}</p> : null}
          </div>

          <div className="flex flex-col items-center pt-1">
            <span className="text-[11px] font-medium text-white/25">vs</span>
            {dPct != null ? (
              <div className="mt-2 rounded-[12px] border border-white/[0.08] bg-white/[0.03] px-2 py-2 text-center">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/26">Draw</p>
                <p className="mt-1 font-mono text-[12px] font-bold text-amber-300">{dPct}%</p>
              </div>
            ) : null}
          </div>

          <div className="text-right">
            <p className="text-[15px] font-semibold leading-tight text-white">{match.away.name}</p>
            {aPct != null ? <p className={cn("mt-2 font-mono text-[28px] font-bold leading-none tabular-nums", aPct > (hPct ?? 0) ? "text-orange-300" : "text-white/45")}>{aPct}%</p> : null}
            {awayOdds ? <p className="mt-1 font-mono text-[11px] text-white/28">Odds {awayOdds.toFixed(2)}</p> : null}
          </div>
        </div>

        {hasProbabilities ? (
          <>
            <div className="mt-4 relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="absolute left-0 top-0 h-full bg-[linear-gradient(90deg,#00ff84,#10b981)]" style={{ width: `${Math.max(0, (hPct ?? 0) - (dPct != null ? dPct / 2 : 0))}%` }} />
              {dPct != null ? <div className="absolute top-0 h-full bg-amber-300/75" style={{ left: `${Math.max(0, (hPct ?? 0) - dPct / 2)}%`, width: `${dPct}%` }} /> : null}
              <div className="absolute right-0 top-0 h-full bg-[linear-gradient(270deg,#fb923c,#f97316)]" style={{ width: `${Math.max(0, (aPct ?? 0) - (dPct != null ? dPct / 2 : 0))}%` }} />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              <TinyMetric label="Lean" value={favoredSide} />
              <TinyMetric label="Source" value={sourceLabel} />
              <TinyMetric label="Home" value={`${hPct}%`} />
              <TinyMetric label="Away" value={`${aPct}%`} />
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-[18px] border border-dashed border-white/[0.10] bg-white/[0.02] px-4 py-4 text-[12px] text-white/40">
            No clean prediction signal yet for this fixture.
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          {hasConfidence ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">Confidence</span>
              <span className={cn("inline-flex rounded-full border px-2.5 py-1 font-mono text-[12px] font-bold tabular-nums", toneClasses(confidenceTone))}>
                {Math.round(conf * 100)}%
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-white/28">{sourceLabel} signal</span>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/42 opacity-0 transition-opacity group-hover:opacity-100">
            Open analysis
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </Link>

      {match.backendId ? (
        <div className="border-t border-white/[0.05] px-5 pb-4 pt-2.5">
          <button
            onClick={handleAnalysis}
            className={cn("flex w-full items-center gap-2 text-left text-[11px] font-semibold transition-colors", reasoningOpen ? "text-purple-300" : "text-white/34 hover:text-white/58")}
          >
            {loadingReasoning ? <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" /> : <Sparkles className={cn("h-3.5 w-3.5", reasoningOpen ? "text-purple-400" : "text-white/28")} />}
            {loadingReasoning ? "Generating analysis…" : reasoningOpen ? "Hide pre-match analysis" : "Pre-match analysis"}
          </button>

          {reasoningOpen ? (
            <div className="mt-3 rounded-[18px] border border-purple-400/15 bg-purple-400/[0.05] px-4 py-3">
              {loadingReasoning ? (
                <div className="flex items-center gap-2 text-[12px] text-white/36">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400/60" />
                  Analysing match data…
                </div>
              ) : reasoning ? (
                <p className="text-[12px] leading-6 text-white/58">{reasoning}</p>
              ) : (
                <p className="text-[12px] text-white/42">Analysis not yet available — check back shortly.</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DaySection({ label, matches }: { label: string; matches: MatchWithSport[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-white">{label}</h3>
        <div className="h-px flex-1 bg-white/[0.06]" />
        <span className="text-[11px] uppercase tracking-[0.14em] text-white/30">{matches.length} fixture{matches.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </div>
    </section>
  );
}

export function PredictionsShell({ initialSport }: { initialSport: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [matches, setMatches] = useState<MatchWithSport[]>([]);
  const [loading, setLoading] = useState(true);
  const [minConf, setMinConf] = useState("0");
  const [showAll, setShowAll] = useState(true);
  const [tipsters, setTipsters] = useState<TipsterProfile[]>([]);
  const [tipstersLoading, setTipstersLoading] = useState(true);

  const sport = searchParams.get("sport") ?? initialSport;

  function navigate(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === "all") params.delete(key);
      else params.set(key, value);
    });
    router.replace(`/predictions${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  useEffect(() => {
    setLoading(true);
    const leagues = sport === "all" ? ALL_SPORT_LEAGUES : ALL_SPORT_LEAGUES.filter((league) => league.sport === sport);

    // sportSlugs: always include the selected sport (or all sports) for backend fetch,
    // even if that sport has no SGO league IDs (e.g. esports).
    const sportSlugs: SportSlug[] = sport === "all"
      ? (SPORT_META.map((m) => m.value).filter((v) => v !== "all") as SportSlug[])
      : [sport as SportSlug];

    Promise.all([
      leagues.length > 0
        ? Promise.all(
            leagues.map(({ leagueID, sport: currentSport }) =>
              fetchSGOEvents(leagueID).then((events) =>
                events
                  .filter((event) => !event.status.started && !event.status.ended && !event.status.cancelled)
                  .map((event) => ({ ...sgoEventToMatch(event, currentSport), sport: currentSport }))
              )
            )
          ).then((result) => result.flat())
        : Promise.resolve([] as MatchWithSport[]),
      Promise.all(sportSlugs.map((currentSport) => fetchBackendForSport(currentSport).then((items) => ({ sport: currentSport, items })))),
    ]).then(async ([sgoMatches, backendBySport]) => {
      const backendMap = Object.fromEntries(backendBySport.map(({ sport: currentSport, items }) => [currentSport, items]));
      const now = Date.now();
      const cutoff = now + 48 * 3600_000;

      const sgoFiltered = sgoMatches.filter((match) => {
        const time = new Date(match.startTime).getTime();
        return time >= now && time <= cutoff;
      });

      const sgoMerged: MatchWithSport[] = sgoFiltered.map((match) => ({ ...mergeBackend(match, backendMap[match.sport] ?? []), sport: match.sport }));

      const backendOnly: MatchWithSport[] = [];
      for (const { sport: currentSport, items } of backendBySport) {
        for (const item of items) {
          const time = new Date(item.kickoff_utc).getTime();
          if (time < now || time > cutoff) continue;
          const alreadyCovered = sgoMerged.some(
            (match) => match.sport === currentSport && teamsMatch(match.home.name, item.home_name) && teamsMatch(match.away.name, item.away_name)
          );
          if (!alreadyCovered) backendOnly.push(backendItemToMatch(item, currentSport));
        }
      }

      const firstPass = [...sgoMerged, ...backendOnly].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      setMatches(firstPass);
      setLoading(false);

      const needsPreview = (match: MatchWithSport) => {
        if (match.status === "finished") return false;
        if (match.pHome == null) return true;
        const hasDrawMarket = match.featuredMarkets?.[0]?.selections.some((selection) => selection.id === "draw");
        return Boolean(hasDrawMarket && match.pDraw == null);
      };

      const unmatched = firstPass.filter(needsPreview);
      if (unmatched.length > 0) {
        const previews = await Promise.all(unmatched.map((match) => fetchPreview(match.sport, match.home.name, match.away.name)));
        setMatches((prev) =>
          prev.map((match) => {
            if (!needsPreview(match)) return match;
            const index = unmatched.findIndex((candidate) => candidate.id === match.id);
            const preview = index >= 0 ? previews[index] : null;
            if (!preview) return match;
            return {
              ...match,
              pHome: preview.p_home ?? match.pHome ?? undefined,
              pAway: preview.p_away ?? match.pAway ?? undefined,
              pDraw: preview.p_draw ?? undefined,
              modelConfidence: preview.confidence != null ? preview.confidence / 100 : match.modelConfidence ?? undefined,
            };
          })
        );
      }
    });
  }, [sport]);

  useEffect(() => {
    getTipsters()
      .then((data) => {
        setTipsters([...data].sort((a, b) => (b.profit_loss ?? 0) - (a.profit_loss ?? 0)).slice(0, 5));
      })
      .catch(() => {})
      .finally(() => setTipstersLoading(false));
  }, []);

  const threshold = parseFloat(minConf);
  const baseItems = showAll ? matches : matches.filter((match) => match.pHome != null);
  const items = threshold > 0 ? baseItems.filter((match) => (match.modelConfidence ?? 0) >= threshold) : baseItems;
  const withConf = matches.filter((match) => match.modelConfidence != null).length;
  const highConf = matches.filter((match) => (match.modelConfidence ?? 0) >= 0.7).length;
  const withProbabilities = matches.filter((match) => match.pHome != null).length;
  const coverage = matches.length ? Math.round((withProbabilities / matches.length) * 100) : 0;

  const sportSignals: Partial<Record<string, number>> = {};
  let totalSignals = 0;
  for (const match of matches) {
    if ((match.modelConfidence ?? 0) >= 0.6) {
      sportSignals[match.sport] = (sportSignals[match.sport] ?? 0) + 1;
      totalSignals += 1;
    }
  }
  if (totalSignals > 0) sportSignals.all = totalSignals;

  const featuredPicks = useMemo(
    () => matches.filter((match) => (match.modelConfidence ?? 0) >= 0.6).sort((a, b) => (b.modelConfidence ?? 0) - (a.modelConfidence ?? 0)).slice(0, 5),
    [matches]
  );

  const grouped = useMemo(() => {
    const rows: { label: string; matches: MatchWithSport[] }[] = [];
    for (const match of items) {
      const label = dayLabel(match.startTime);
      const existing = rows.find((row) => row.label === label);
      if (existing) existing.matches.push(match);
      else rows.push({ label, matches: [match] });
    }
    return rows;
  }, [items]);

  const topSignalSport = useMemo(() => {
    const rows = Object.entries(sportSignals).filter(([key]) => key !== "all").sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
    return rows[0] ?? null;
  }, [matches.length, totalSignals]);

  const nextKickoff = matches[0]?.startTime;
  const boardModeLabel = showAll ? "All fixtures" : "Predictions only";

  return (
    <div className="space-y-5 pb-24 lg:pb-12">
      <div className="-mx-1 overflow-x-auto px-1 pb-1 no-scrollbar">
        <div className="flex min-w-max items-center gap-2 rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-2 pr-3">
          {SPORT_META.map((entry) => {
            const badge = sportSignals[entry.value];
            const active = entry.value === sport;
            return (
              <button
                key={entry.value}
                onClick={() => navigate({ sport: entry.value })}
                className={cn(
                  "inline-flex shrink-0 snap-start items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-all",
                  active ? "bg-[#00ff84] text-[#07110d]" : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                <span>{entry.icon}</span>
                <span>{entry.label}</span>
                {badge != null && badge > 0 ? (
                  <span className={cn("inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold", active ? "bg-[#07110d]/25 text-[#07110d]" : "bg-emerald-400/20 text-emerald-300")}>
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-[28px] border border-[rgba(0,255,132,0.12)] bg-[radial-gradient(circle_at_top_left,rgba(0,255,132,0.12),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5 lg:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-[620px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,255,132,0.16)] bg-[rgba(0,255,132,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9dffcb]">
                <Activity className="h-3.5 w-3.5" />
                Board overview
              </div>
              <h2 className="mt-4 text-[26px] font-semibold tracking-[-0.04em] text-white sm:text-[32px]">
                {matches.length === 0 && !loading
                  ? "No live board right now — relax the filters or open the wider fixture list."
                  : "Start with the strongest reads, then move straight into fixtures."}
              </h2>
              <p className="mt-3 max-w-[58ch] text-[14px] leading-6 text-white/48">
                {matches.length === 0 && !loading
                  ? threshold > 0
                    ? `Nothing in the next 48 hours clears the ${Math.round(threshold * 100)}% confidence bar yet. Reset the filter or open all fixtures to keep moving.`
                    : "The board is quiet right now. Use the sport tabs, open all fixtures, or jump into match hubs while fresh signals warm up."
                  : "Scan by sport, tighten the confidence bar, and move from featured conviction into the full fixture feed without duplicate framing."}
              </p>
            </div>
            <div className="rounded-[22px] border border-white/[0.08] bg-[#0b0c14]/70 px-4 py-3 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/34">Current board mode</p>
              <p className="mt-2 text-[18px] font-semibold text-white">{titleCase(boardModeLabel)}</p>
              <p className="mt-1 text-[11px] text-white/36">{nextKickoff ? `Next kickoff ${fmtTime(nextKickoff)}` : "Waiting for fixtures"}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <SummaryStat
              label="Visible board"
              value={`${items.length}`}
              note={
                items.length > 0
                  ? showAll
                    ? `${matches.length} fixtures in the next 48 hours`
                    : "Prediction-ready fixtures only"
                  : "Waiting for the next readable board"
              }
              tone="accent"
              icon={Activity}
            />
            <SummaryStat
              label="Featured picks"
              value={`${featuredPicks.length}`}
              note={featuredPicks.length > 0 ? "60%+ confidence reads surfaced first" : "Waiting for 60%+ reads"}
              tone={featuredPicks.length > 0 ? "positive" : "neutral"}
              icon={Zap}
            />
          </div>
        </div>

        <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
          <SectionLabel icon={Target} label="Quick filters" sub="Confidence and visibility controls in one place" />
          <div className="space-y-4">
            <PillGroup label="Confidence" options={CONF_THRESHOLDS} active={minConf} onChange={setMinConf} />

            <div className="rounded-[22px] border border-white/[0.08] bg-[#0b0c14]/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">Visibility</p>
                  <p className="mt-2 text-[15px] font-semibold text-white">{showAll ? "Showing all upcoming fixtures" : "Predictions-only board"}</p>
                  <p className="mt-1 text-[11px] text-white/36">Keep the full board open or collapse to fixtures with a readable prediction.</p>
                </div>
                <button
                  onClick={() => setShowAll((value) => !value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-semibold transition-all",
                    showAll ? "border-white/[0.12] bg-white/[0.06] text-white/74" : "border-[rgba(0,255,132,0.18)] bg-[rgba(0,255,132,0.08)] text-[#8fffc7]"
                  )}
                >
                  {showAll ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {showAll ? "Showing all" : "Predictions only"}
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
              <TinyMetric label="Selected sport" value={sport === "all" ? "All sports" : titleCase(sport)} />
              <TinyMetric label="Coverage" value={`${coverage}% readable`} />
              <TinyMetric label="Signals" value={highConf > 0 ? `${highConf} high-confidence` : `${withConf} with confidence`} />
            </div>
          </div>
        </div>
      </section>

      <section className={cn("grid gap-5", loading || featuredPicks.length > 0 ? "lg:grid-cols-[minmax(0,1fr)_340px]" : "")}>

        {loading || featuredPicks.length > 0 ? (
        <div className="rounded-[28px] border border-white/[0.08] bg-[#0f1117] p-5">
          <div className="border-b border-white/[0.06] pb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[640px]">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/18 bg-emerald-400/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  <Zap className="h-3.5 w-3.5" />
                  Featured picks
                </div>
                <h3 className="mt-3 text-[22px] font-semibold tracking-[-0.03em] text-white sm:text-[24px]">
                  Highest-confidence reads only.
                </h3>
                <p className="mt-2 max-w-[60ch] text-[13px] leading-6 text-white/42">
                  This shortlist appears only when the board has genuine 60%+ conviction, so the page stays lighter when signal quality is thin.
                </p>
              </div>

              <div className="grid min-w-[220px] gap-2 sm:grid-cols-2">
                <TinyMetric label="Showing" value={loading ? "..." : `${featuredPicks.length} picks`} />
                <TinyMetric label="Entry rule" value="60%+ confidence" />
              </div>
            </div>
          </div>

          {(loading || featuredPicks.length > 0) ? (
            loading ? (
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="h-[250px] animate-pulse rounded-[22px] border border-white/[0.06] bg-white/[0.02]" />
                ))}
              </div>
            ) : (
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {featuredPicks.map((match) => (
                  <FeaturedPickCard key={match.id} match={match} />
                ))}
              </div>
            )
          ) : null}
        </div>
        ) : null}

        <div className="space-y-5">
          <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
            <SectionLabel icon={Users} label="Top tipsters" sub="Quick trust context beside the machine-led board" action={{ label: "View all", href: "/tipsters" }} />
            {tipstersLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="h-[132px] animate-pulse rounded-[22px] border border-white/[0.06] bg-white/[0.02]" />
                ))}
              </div>
            ) : tipsters.length === 0 ? (
              <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[24px] border border-dashed border-white/[0.10] bg-white/[0.02] p-8 text-center">
                <Users className="h-6 w-6 text-white/26" />
                <p className="mt-4 text-[14px] font-semibold text-white">No tipsters yet</p>
                <p className="mt-2 text-[12px] text-white/40">The leaderboard will appear here once profiles are active.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tipsters.map((tipster) => (
                  <TipsterCard key={tipster.id} tipster={tipster} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
        <SectionLabel icon={Activity} label="All fixtures" sub={loading ? "Loading upcoming match cards…" : `${items.length} visible fixtures · grouped by day and sorted by kickoff`} count={loading ? undefined : items.length} />

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="h-[312px] animate-pulse rounded-[28px] border border-white/[0.06] bg-white/[0.02]" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[24px] border border-dashed border-white/[0.10] bg-white/[0.02] p-8 text-center">
            <BrainCircuit className="h-7 w-7 text-white/28" />
            <div className="mt-4 text-[20px] font-semibold text-white">
              {threshold > 0 ? "Nothing meets this confidence filter" : "No prediction-ready fixtures right now"}
            </div>
            <div className="mt-2 max-w-lg text-[13px] leading-6 text-white/40">
              {threshold > 0
                ? `No fixtures currently meet the ${Math.round(threshold * 100)}% confidence threshold.`
                : "The next 48-hour window is clear for now. Reset the board or browse the wider match hubs while fresh reads populate."}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {threshold > 0 ? (
                <button
                  onClick={() => setMinConf("0")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.04] px-4 py-2 text-[12px] font-semibold text-white/68 transition-colors hover:text-white/85"
                >
                  Reset confidence filter
                </button>
              ) : null}
              {!showAll ? (
                <button
                  onClick={() => setShowAll(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.04] px-4 py-2 text-[12px] font-semibold text-white/68 transition-colors hover:text-white/85"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Show all fixtures
                </button>
              ) : null}
              <Link
                href="/sports/soccer/matches"
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-[#07110d] transition-opacity hover:opacity-85"
              >
                Browse match hubs
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(({ label, matches: dayMatches }) => (
              <DaySection key={label} label={label} matches={dayMatches} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
