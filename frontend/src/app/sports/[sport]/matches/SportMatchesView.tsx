"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import type { SportSlug } from "@/lib/api";
import type { BettingMatch, BettingFilter } from "@/lib/betting-types";
import { DEFAULT_BETTING_FILTER, SPORT_CONFIG } from "@/lib/betting-types";
import { applyBettingFilter, sortMatches } from "@/lib/betting-adapters";
import { LiveNowStrip } from "@/components/betting/LiveNowStrip";
import { StickyFilterBar } from "@/components/betting/StickyFilterBar";
import { MatchList } from "@/components/betting/MatchList";
import { QueueRail } from "@/components/betting/QueueRail";
import { MobileQueueDrawer } from "@/components/betting/MobileQueueDrawer";
import { cn } from "@/lib/utils";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { SPORT_LEAGUES, fetchSGOEvents, sgoEventToMatch } from "@/lib/sgo";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Flame,
  Radar,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Trophy,
  Waves,
} from "lucide-react";

const SPORT_BAR: { slug: SportSlug; label: string; icon: string }[] = [
  { slug: "soccer", label: "Soccer", icon: "⚽" },
  { slug: "tennis", label: "Tennis", icon: "🎾" },
  { slug: "basketball", label: "Basketball", icon: "🏀" },
  { slug: "baseball", label: "Baseball", icon: "⚾" },
  { slug: "hockey", label: "Hockey", icon: "🏒" },
  { slug: "esports", label: "Esports", icon: "🎮" },
];

const SPORT_DESK_META: Record<
  SportSlug,
  {
    eyebrow: string;
    lede: string;
    boardNote: string;
    marketFocus: string;
    coverage: string;
    cadence: string;
  }
> = {
  soccer: {
    eyebrow: "Football trading desk",
    lede: "Premier League, Europe, and domestic boards arranged in one sharp multi-match read.",
    boardNote: "Pricing leans on team strength, matchup state, and schedule pressure across the current slate.",
    marketFocus: "1X2, moneyline, and spot conviction around match winners.",
    coverage: "Domestic + continental coverage",
    cadence: "Fast-moving live board refreshes",
  },
  tennis: {
    eyebrow: "Court intelligence desk",
    lede: "ATP and WTA boards organised around surface reads, matchup form, and live momentum.",
    boardNote: "The model is strongest when form, travel, and surface fit align into clean pre-match edges.",
    marketFocus: "Moneyline reads with momentum-heavy live checks.",
    coverage: "ATP / WTA slate overview",
    cadence: "Ideal for rolling session scans",
  },
  esports: {
    eyebrow: "Esports command desk",
    lede: "CS2 and broader esports boards framed like a live intelligence feed for maps and series pressure.",
    boardNote: "Look for conviction spikes where recent form, roster stability, and map profile line up.",
    marketFocus: "Series winner and map-driven confidence pockets.",
    coverage: "CS2-led esports board",
    cadence: "Frequent shifts around match start",
  },
  basketball: {
    eyebrow: "Court intelligence desk",
    lede: "NBA-centric matchup board tuned for pace, form, and late slate movement.",
    boardNote: "Conviction is strongest when possession profile and recent form create a clear spread or ML gap.",
    marketFocus: "Moneyline and spread-led reads.",
    coverage: "Primary pro basketball slate",
    cadence: "Built for live swing monitoring",
  },
  baseball: {
    eyebrow: "Diamond intelligence desk",
    lede: "MLB matchup board centred on starters, run environment, and daily card shape.",
    boardNote: "The cleanest reads usually emerge where pitching strength and price divergence stack together.",
    marketFocus: "Moneyline and game-state value checks.",
    coverage: "Full daily baseball card",
    cadence: "Best used through the full schedule window",
  },
  hockey: {
    eyebrow: "Ice intelligence desk",
    lede: "NHL boards laid out for quick scans of goaltending, shot quality, and in-play pressure.",
    boardNote: "Watch conviction bands when special teams and pace combine into a meaningful edge window.",
    marketFocus: "Moneyline and live game-state pressure.",
    coverage: "Full hockey board coverage",
    cadence: "Strong in live and near-start windows",
  },
};

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

interface BackendListItem {
  id?: string;
  home_id?: string;
  away_id?: string;
  home_name: string;
  away_name: string;
  league?: string;
  status?: string;
  p_home: number | null;
  p_away: number | null;
  p_draw?: number | null;
  confidence: number | null;
  kickoff_utc: string;
  home_score?: number | null;
  away_score?: number | null;
}

async function fetchBackendPredictions(sport: SportSlug): Promise<BackendListItem[]> {
  try {
    const now = new Date();
    const dateFrom = new Date(now.getTime() - 3 * 3600_000).toISOString();
    const dateTo = new Date(now.getTime() + 7 * 24 * 3600_000).toISOString();
    const token = typeof window !== "undefined" ? localStorage.getItem("alpha_engine_token") : null;
    const res = await fetch(
      `/api/v1/sports/${sport}/matches?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&limit=200`,
      { cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

function backendItemToMatch(item: BackendListItem, sport: SportSlug): BettingMatch {
  const id = item.id ?? `backend-${item.home_name}-${item.away_name}`;
  const status: BettingMatch["status"] = item.status === "live" ? "live" : item.status === "finished" ? "finished" : "upcoming";
  return {
    id,
    sport,
    league: item.league ?? sport.toUpperCase(),
    startTime: item.kickoff_utc,
    status,
    homeScore: item.home_score ?? undefined,
    awayScore: item.away_score ?? undefined,
    home: { id: item.home_id ?? `${id}-home`, name: item.home_name, shortName: item.home_name.slice(0, 10) },
    away: { id: item.away_id ?? `${id}-away`, name: item.away_name, shortName: item.away_name.slice(0, 10) },
    featuredMarkets: [],
    allMarkets: [],
    pHome: item.p_home ?? undefined,
    pAway: item.p_away ?? undefined,
    pDraw: item.p_draw ?? undefined,
    modelConfidence: item.confidence != null ? item.confidence / 100 : undefined,
  };
}

function mergeBackendData(matches: BettingMatch[], backendItems: BackendListItem[]): BettingMatch[] {
  if (!backendItems.length) return matches;
  return matches.map((m) => {
    const found = backendItems.find(
      (b) =>
        teamsMatch(m.home.name, b.home_name) &&
        teamsMatch(m.away.name, b.away_name) &&
        Math.abs(new Date(m.startTime).getTime() - new Date(b.kickoff_utc).getTime()) < 6 * 3600_000
    );
    if (!found) return m;
    return {
      ...m,
      pHome: found.p_home ?? undefined,
      pAway: found.p_away ?? undefined,
      pDraw: found.p_draw ?? undefined,
      modelConfidence: found.confidence != null ? found.confidence / 100 : undefined,
    };
  });
}

function formatKickoff(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function confidencePct(match: BettingMatch | null) {
  if (!match?.modelConfidence) return "—";
  return `${Math.round(match.modelConfidence * 100)}%`;
}

function probabilityLabel(value?: number) {
  return value != null ? `${Math.round(value * 100)}%` : "—";
}

function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "accent" | "positive" | "warning" | "neutral";
}) {
  const toneClass =
    tone === "accent"
      ? "border-emerald-400/18 bg-emerald-400/[0.08]"
      : tone === "positive"
      ? "border-cyan-400/18 bg-cyan-400/[0.08]"
      : tone === "warning"
      ? "border-amber-400/18 bg-amber-400/[0.08]"
      : "border-white/8 bg-white/[0.03]";

  const valueClass =
    tone === "accent"
      ? "text-emerald-300"
      : tone === "positive"
      ? "text-cyan-200"
      : tone === "warning"
      ? "text-amber-200"
      : "text-white";

  return (
    <div className={cn("rounded-[24px] border px-4 py-4", toneClass)}>
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/36">{label}</div>
      <div className={cn("mt-2 text-[28px] font-black tracking-[-0.06em]", valueClass)}>{value}</div>
      <div className="mt-1 text-[11px] leading-5 text-white/46">{hint}</div>
    </div>
  );
}

function SpotlightCard({ match, sport }: { match: BettingMatch; sport: SportSlug }) {
  return (
    <Link
      href={`/sports/${sport}/matches/${match.id}`}
      className="group block rounded-[24px] border border-white/10 bg-white/[0.04] p-4 transition-all hover:-translate-y-0.5 hover:border-white/16"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
          <Sparkles size={11} className="text-[#00FF84]" /> Spotlight
        </div>
        <div className="text-[11px] font-bold text-emerald-300">{confidencePct(match)}</div>
      </div>
      <div className="mt-4 text-[18px] font-black tracking-[-0.04em] text-white">
        {match.home.shortName} <span className="text-white/28">vs</span> {match.away.shortName}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/42">
        <span>{match.league}</span>
        <span>•</span>
        <span>{formatKickoff(match.startTime)}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-center">
          <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">Home</div>
          <div className="mt-1 text-sm font-bold text-white">{probabilityLabel(match.pHome)}</div>
        </div>
        {match.pDraw != null ? (
          <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-center">
            <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">Draw</div>
            <div className="mt-1 text-sm font-bold text-white">{probabilityLabel(match.pDraw)}</div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-center">
            <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">Status</div>
            <div className="mt-1 text-sm font-bold text-white capitalize">{match.status}</div>
          </div>
        )}
        <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-center">
          <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">Away</div>
          <div className="mt-1 text-sm font-bold text-white">{probabilityLabel(match.pAway)}</div>
        </div>
      </div>
      <div className="mt-4 inline-flex items-center gap-2 text-[12px] font-semibold text-emerald-300 transition-transform group-hover:translate-x-0.5">
        Open matchup <ArrowRight size={13} />
      </div>
    </Link>
  );
}

interface Props {
  sport: SportSlug;
}

export function SportMatchesView({ sport }: Props) {
  const [filter, setFilter] = useState<BettingFilter>(DEFAULT_BETTING_FILTER);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [matches, setMatches] = useState<BettingMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setMatches([]);
    const leagues = SPORT_LEAGUES[sport] ?? [];

    if (!leagues.length) {
      fetchBackendPredictions(sport).then((backendItems) => {
        setMatches(backendItems.map((item) => backendItemToMatch(item, sport)));
        setLoading(false);
      });
      return;
    }

    Promise.all([
      Promise.all(leagues.map((l) => fetchSGOEvents(l))).then((results) => results.flat().map((e) => sgoEventToMatch(e, sport))),
      fetchBackendPredictions(sport),
    ]).then(async ([sgoMatches, backendItems]) => {
      const merged = mergeBackendData(sgoMatches, backendItems);
      setMatches(merged);
      setLoading(false);

      const token = typeof window !== "undefined" ? localStorage.getItem("alpha_engine_token") : null;
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const unmatched = merged.filter((m) => m.pHome == null && m.status !== "finished");
      if (!unmatched.length) return;

      const previews = await Promise.all(
        unmatched.map(async (m) => {
          try {
            const res = await fetch(
              `/api/v1/sports/${sport}/matches/preview?home=${encodeURIComponent(m.home.name)}&away=${encodeURIComponent(m.away.name)}`,
              { cache: "no-store", headers: authHeaders }
            );
            if (!res.ok) return null;
            const d = await res.json();
            if (!d.probabilities) return null;
            return {
              id: m.id,
              pHome: d.probabilities.home_win ?? null,
              pAway: d.probabilities.away_win ?? null,
              pDraw: d.probabilities.draw ?? null,
            };
          } catch {
            return null;
          }
        })
      );

      setMatches((prev) =>
        prev.map((m) => {
          if (m.pHome != null) return m;
          const idx = unmatched.findIndex((u) => u.id === m.id);
          const p = idx >= 0 ? previews[idx] : null;
          if (!p) return m;
          return { ...m, pHome: p.pHome ?? undefined, pAway: p.pAway ?? undefined, pDraw: p.pDraw ?? undefined };
        })
      );
    });
  }, [sport]);

  const filtered = sortMatches(applyBettingFilter(matches, filter));
  const currentSportMeta = SPORT_BAR.find((item) => item.slug === sport) ?? SPORT_BAR[0];
  const config = SPORT_CONFIG[sport];
  const deskMeta = SPORT_DESK_META[sport];

  const nextUpcoming = useMemo(() => {
    const up = [...matches]
      .filter((m) => m.status === "upcoming")
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];
    if (!up) return null;
    const diff = Math.round((new Date(up.startTime).getTime() - Date.now()) / 60_000);
    if (diff < 0 || diff > 480) return null;
    return { label: `${up.home.shortName} vs ${up.away.shortName}`, minutesAway: diff };
  }, [matches]);

  const liveCount = matches.filter((m) => m.status === "live").length;
  const upcomingCount = matches.filter((m) => m.status === "upcoming").length;
  const finishedCount = matches.filter((m) => m.status === "finished").length;
  const highConfidenceCount = matches.filter((m) => (m.modelConfidence ?? 0) >= 0.7).length;
  const strongestCount = matches.filter((m) => (m.modelConfidence ?? 0) >= 0.75).length;
  const coverageCount = new Set(matches.map((m) => m.league)).size;
  const todayCount = matches.filter((m) => {
    const d = new Date(m.startTime);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  const bestMatch =
    [...matches].filter((m) => m.modelConfidence != null).sort((a, b) => (b.modelConfidence ?? 0) - (a.modelConfidence ?? 0))[0] ?? null;

  const spotlightMatches = [...matches]
    .filter((m) => m.modelConfidence != null)
    .sort((a, b) => (b.modelConfidence ?? 0) - (a.modelConfidence ?? 0))
    .slice(0, 3);

  const handleTileClick = useCallback((matchId: string) => {
    setHighlightedId(matchId);
    setFilter((f) => ({ ...f, status: "all" }));
    setTimeout(() => {
      document.getElementById(`match-${matchId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setHighlightedId(null), 2000);
    }, 100);
  }, []);

  const handleShowTopPicks = useCallback(() => setFilter({ ...DEFAULT_BETTING_FILTER, confidence: "65" }), []);
  const handleShowLive = useCallback(() => setFilter({ ...DEFAULT_BETTING_FILTER, status: "live" }), []);
  const handleShowToday = useCallback(() => setFilter({ ...DEFAULT_BETTING_FILTER, time: "today" }), []);
  const handleShowResults = useCallback(() => setFilter({ ...DEFAULT_BETTING_FILTER, status: "finished" }), []);
  const handleResetBoard = useCallback(() => setFilter(DEFAULT_BETTING_FILTER), []);

  return (
    <div className="flex min-h-full flex-col gap-5 pb-12">
      <div className="px-4 pt-4 lg:px-6">
        <div className="overflow-x-auto no-scrollbar rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/34">Sports hubs</div>
              <div className="mt-1 text-sm font-semibold text-white">Switch desk instantly across all core boards</div>
            </div>
            <div className="hidden rounded-full border border-emerald-400/18 bg-emerald-400/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300 sm:inline-flex">
              {coverageCount || 0} active leagues
            </div>
          </div>
          <div className="flex min-w-max items-center gap-2 rounded-[22px] border border-white/8 bg-black/20 p-2">
            {SPORT_BAR.map((item) => (
              <Link
                key={item.slug}
                href={`/sports/${item.slug}/matches`}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-all",
                  item.slug === sport ? "bg-[#2edb6c] text-[#07110d] shadow-sm" : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-6">
        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
          <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(0,255,132,0.14),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.22)] lg:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/18 bg-emerald-400/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">
                  <span>{currentSportMeta.icon}</span> {deskMeta.eyebrow}
                </div>
                <h1 className="mt-4 text-3xl font-black tracking-[-0.06em] text-white lg:text-[42px]">
                  {currentSportMeta.label} hub
                </h1>
                <p className="mt-3 max-w-xl text-[14px] leading-7 text-white/58">{deskMeta.lede}</p>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/34">Board leader</div>
                <div className="mt-2 text-[26px] font-black tracking-[-0.05em]" style={{ color: config.color }}>
                  {confidencePct(bestMatch)}
                </div>
                <div className="mt-1 max-w-[180px] text-[11px] leading-5 text-white/46">
                  {bestMatch ? `${bestMatch.home.shortName} vs ${bestMatch.away.shortName}` : "Waiting for a conviction spike"}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Slate" value={String(matches.length)} hint={`${upcomingCount} upcoming · ${liveCount} live`} tone="accent" />
              <StatCard label="High conviction" value={String(highConfidenceCount)} hint="70%+ confidence reads on the board" tone="positive" />
              <StatCard label="Coverage" value={String(coverageCount || 0)} hint={deskMeta.coverage} tone="neutral" />
              <StatCard label="Today" value={String(todayCount)} hint={nextUpcoming ? `${nextUpcoming.minutesAway}m to next start` : deskMeta.cadence} tone="warning" />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                onClick={handleShowTopPicks}
                className="inline-flex items-center gap-2 rounded-full bg-[#00FF84] px-4 py-2 text-[12px] font-black uppercase tracking-[0.14em] text-[#07110d]"
              >
                <Trophy size={13} /> Show top signals
              </button>
              {bestMatch ? (
                <Link
                  href={`/sports/${sport}/matches/${bestMatch.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.14em] text-white/74 transition-colors hover:text-white"
                >
                  Open lead matchup <ArrowRight size={13} />
                </Link>
              ) : null}
            </div>
          </section>

          <section className="grid gap-4">
            <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/36">
                <Radar size={12} className="text-[#00FF84]" /> Desk read
              </div>
              <div className="mt-3 text-[18px] font-black tracking-[-0.04em] text-white">What the model is prioritising</div>
              <p className="mt-3 text-[13px] leading-6 text-white/56">{deskMeta.boardNote}</p>
              <div className="mt-4 rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/34">Market focus</div>
                <div className="mt-2 text-[13px] leading-6 text-white/78">{deskMeta.marketFocus}</div>
              </div>
            </div>

            <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/36">
                <BarChart3 size={12} className="text-[#00FF84]" /> Quick filters
              </div>
              <div className="mt-4 grid gap-2">
                <button onClick={handleShowLive} className="flex items-center justify-between rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition-colors hover:border-white/16">
                  <span className="flex items-center gap-2 text-sm font-semibold text-white"><Flame size={14} className="text-emerald-300" /> Live now</span>
                  <span className="text-[11px] text-white/44">{liveCount}</span>
                </button>
                <button onClick={handleShowToday} className="flex items-center justify-between rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition-colors hover:border-white/16">
                  <span className="flex items-center gap-2 text-sm font-semibold text-white"><CalendarDays size={14} className="text-cyan-200" /> Today only</span>
                  <span className="text-[11px] text-white/44">{todayCount}</span>
                </button>
                <button onClick={handleShowResults} className="flex items-center justify-between rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition-colors hover:border-white/16">
                  <span className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck size={14} className="text-amber-200" /> Results</span>
                  <span className="text-[11px] text-white/44">{finishedCount}</span>
                </button>
                <button onClick={handleResetBoard} className="flex items-center justify-between rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition-colors hover:border-white/16">
                  <span className="flex items-center gap-2 text-sm font-semibold text-white"><TimerReset size={14} className="text-white/70" /> Reset board</span>
                  <span className="text-[11px] text-white/44">Default</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <LiveNowStrip matches={matches} onTileClick={handleTileClick} nextUpcoming={nextUpcoming} />

      <div className="px-4 lg:px-6">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/36">Spotlight board</div>
                <div className="mt-1 text-[20px] font-black tracking-[-0.04em] text-white">Highest-confidence matchups</div>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/46">
                {strongestCount} strong reads
              </div>
            </div>

            {loading ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-56 animate-pulse rounded-[24px] border border-white/[0.06] bg-white/[0.02]" />
                ))}
              </div>
            ) : spotlightMatches.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center text-sm text-white/48">
                No confidence-ranked spotlight matches yet. The board will populate as prices and model reads sync.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {spotlightMatches.map((match) => (
                  <SpotlightCard key={match.id} match={match} sport={sport} />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/36">Desk summary</div>
            <div className="mt-1 text-[20px] font-black tracking-[-0.04em] text-white">Slate rhythm at a glance</div>

            <div className="mt-4 space-y-3">
              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/38">
                  <Waves size={12} className="text-emerald-300" /> Live pressure
                </div>
                <div className="mt-2 text-[24px] font-black tracking-[-0.05em] text-white">{liveCount}</div>
                <div className="mt-1 text-[12px] leading-6 text-white/48">
                  {liveCount > 0 ? "The board has active in-play events you can jump into now." : "No live pressure at the moment — this desk is pre-match first right now."}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/38">
                  <Sparkles size={12} className="text-cyan-200" /> Lead matchup
                </div>
                <div className="mt-2 text-[16px] font-black tracking-[-0.03em] text-white">
                  {bestMatch ? `${bestMatch.home.shortName} vs ${bestMatch.away.shortName}` : "Board building"}
                </div>
                <div className="mt-1 text-[12px] leading-6 text-white/48">
                  {bestMatch ? `${confidencePct(bestMatch)} confidence · ${formatKickoff(bestMatch.startTime)}` : "Waiting for the strongest matchup to emerge."}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/38">
                  <CalendarDays size={12} className="text-amber-200" /> Next to start
                </div>
                <div className="mt-2 text-[16px] font-black tracking-[-0.03em] text-white">
                  {nextUpcoming ? nextUpcoming.label : "No near-term kickoff"}
                </div>
                <div className="mt-1 text-[12px] leading-6 text-white/48">
                  {nextUpcoming ? `${nextUpcoming.minutesAway} minutes away` : deskMeta.cadence}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <StickyFilterBar
            filter={filter}
            onChange={setFilter}
            totalShown={filtered.length}
            onShowTopPicks={handleShowTopPicks}
            onShowQueueRail={() => setMobileQueueOpen(true)}
          />
          <div className="p-4 lg:p-6">
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : (
              <MatchList
                matches={filtered}
                allMatches={matches}
                sport={sport}
                activeFilter={filter.status}
                highlightedId={highlightedId}
                onClearFilters={() => setFilter(DEFAULT_BETTING_FILTER)}
                onShowTopPicks={handleShowTopPicks}
                onShowLive={handleShowLive}
                onShowResults={handleShowResults}
              />
            )}
          </div>
        </div>
        <QueueRail matches={matches} />
      </div>

      <MobileQueueDrawer open={mobileQueueOpen} onClose={() => setMobileQueueOpen(false)} matches={matches} />
    </div>
  );
}
