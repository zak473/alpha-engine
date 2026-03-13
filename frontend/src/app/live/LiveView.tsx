"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, RefreshCw, Radio } from "lucide-react";
import { useRouter } from "next/navigation";
import { getLiveMatches } from "@/lib/api";
import type { LiveMatchOut } from "@/lib/api";
import { useLiveRefresh } from "@/lib/hooks/useLiveRefresh";
import { cn, formatDate } from "@/lib/utils";

const SPORT_LABELS: Record<string, string> = {
  soccer: "Soccer",
  basketball: "Basketball",
  baseball: "Baseball",
  hockey: "Hockey",
  tennis: "Tennis",
  esports: "Esports",
};

const SPORT_ICONS: Record<string, string> = {
  soccer: "⚽",
  basketball: "🏀",
  baseball: "⚾",
  hockey: "🏒",
  tennis: "🎾",
  esports: "🎮",
};

function TeamPill({ name, logo, align = "left" }: { name: string; logo?: string | null; align?: "left" | "right" }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", align === "right" && "justify-end")}>
      {align === "right" ? (
        <>
          <div className="min-w-0 text-right">
            <div className="truncate text-sm font-semibold text-white">{name}</div>
          </div>
          <Avatar name={name} src={logo} />
        </>
      ) : (
        <>
          <Avatar name={name} src={logo} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{name}</div>
          </div>
        </>
      )}
    </div>
  );
}

function Avatar({ name, src }: { name: string; src?: string | null }) {
  if (src) {
    return <img src={src} alt={name} className="h-10 w-10 rounded-full border border-white/10 bg-white/5 object-contain p-1" />;
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-white/70">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
    </span>
  );
}

function MatchTile({ match }: { match: LiveMatchOut }) {
  const href = `/sports/${match.sport}/matches/${match.id}`;
  const isLive = match.is_live;
  const statusLabel = isLive
    ? match.live_clock || "Live"
    : formatDate(match.kickoff_utc ?? new Date().toISOString(), "long");

  return (
    <Link
      href={href}
      className={cn(
        "group rounded-[28px] border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300/25 hover:shadow-[0_24px_60px_rgba(0,0,0,0.26)] lg:p-5",
        isLive
          ? "bg-[#18181b] border-emerald-400/20"
          : "bg-[#18181b] border-[#27272a]"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-[#27272a] bg-[#27272a] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/55">
            <span>{SPORT_ICONS[match.sport] ?? "🏅"}</span>
            {SPORT_LABELS[match.sport] ?? match.sport}
          </span>
          <span className="truncate text-xs text-white/35">{match.league}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/45">
          {isLive ? (
            <>
              <LiveDot />
              <span className="font-semibold text-emerald-300">Live</span>
            </>
          ) : (
            <>
              <Clock3 size={12} />
              <span>{statusLabel}</span>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <TeamPill name={match.home_name} logo={match.home_logo} />
        <div className="flex flex-col items-center justify-center gap-2 rounded-[24px] border border-white/8 bg-black/20 px-4 py-3">
          <div className={cn("text-4xl font-semibold tracking-[-0.06em] text-white", isLive && "text-emerald-300")}>
            <span className="inline-block min-w-[1.5ch] text-right">{match.home_score ?? "–"}</span>
            <span className="px-2 text-white/25">:</span>
            <span className="inline-block min-w-[1.5ch] text-left">{match.away_score ?? "–"}</span>
          </div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
            {isLive
              ? match.current_period
                ? `${match.sport === "basketball" ? "Q" : match.sport === "hockey" ? "Period " : match.sport === "baseball" ? "Inning " : "Set "}${match.current_period}`
                : "In play"
              : "Scheduled"}
          </div>
        </div>
        <TeamPill name={match.away_name} logo={match.away_logo} align="right" />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-white/50">{isLive ? "Open live matchup" : statusLabel}</div>
        <div className="inline-flex items-center gap-2 text-sm font-medium text-white/72 transition group-hover:text-white">
          View board
          <ArrowRight size={15} />
        </div>
      </div>
    </Link>
  );
}

function SectionHeader({
  title,
  meta,
  accent = false,
}: {
  title: string;
  meta: string;
  accent?: boolean;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <div className={cn("text-[11px] uppercase tracking-[0.22em]", accent ? "text-emerald-300" : "text-white/38")}>{title}</div>
        <div className="mt-1 text-lg font-semibold tracking-[-0.03em] text-white">{meta}</div>
      </div>
    </div>
  );
}

const ALL_SPORTS = ["soccer", "tennis", "basketball", "baseball", "hockey", "esports"] as const;

export function LiveView({ initialMatches }: { initialMatches: LiveMatchOut[] }) {
  const router = useRouter();
  const [matches, setMatches] = useState<LiveMatchOut[]>(initialMatches);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeSport, setActiveSport] = useState<string>("soccer");

  const tick = useLiveRefresh(true, 30_000);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const fresh = await getLiveMatches();
      setMatches(fresh);
      setLastUpdated(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (tick === 0) return;
    refresh();
    router.refresh();
  }, [tick, refresh, router]);

  const allLive = useMemo(() => matches.filter((m) => m.is_live), [matches]);
  const allUpcoming = useMemo(() => matches.filter((m) => !m.is_live), [matches]);

  // Count per sport across all matches
  const sportCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    matches.forEach((m) => { counts[m.sport] = (counts[m.sport] ?? 0) + 1; });
    return counts;
  }, [matches]);

  // Filtered by active sport
  const filteredLive = useMemo(() => allLive.filter((m) => m.sport === activeSport), [allLive, activeSport]);
  const filteredUpcoming = useMemo(() => allUpcoming.filter((m) => m.sport === activeSport).slice(0, 12), [allUpcoming, activeSport]);

  return (
    <div className="pb-12">
      {/* Hero */}
      <section className="overflow-hidden rounded-[30px] border border-white/8 bg-[#18181b] p-5 shadow-[0_26px_70px_rgba(0,0,0,0.24)] xl:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/16 bg-emerald-300/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
              <LiveDot />
              Always-on live centre
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-white lg:text-[2.7rem]">Cleaner match scanning, faster live decisions.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/58">
              Live matches lead the page, upcoming fixtures are shown below — each card prioritises teams, score, and match state in one glance.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-white/8 bg-[#18181b] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Live matches</div>
              <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">{allLive.length}</div>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-[#18181b] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Upcoming queued</div>
              <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">{allUpcoming.length}</div>
            </div>
            <button
              onClick={refresh}
              className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-white/8 bg-[#18181b] px-4 py-4 text-left transition hover:border-emerald-300/25 hover:bg-[#27272a]"
            >
              <RefreshCw size={15} className={cn("text-emerald-200", isRefreshing && "animate-spin")} />
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Last sync</div>
                <div className="mt-1 text-sm font-medium text-white">
                  {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Sport filter bar */}
      <div className="mt-4 overflow-x-auto no-scrollbar">
        <div className="flex min-w-max items-center gap-2 rounded-[24px] border border-[#27272a] bg-[#18181b] p-2">
          {ALL_SPORTS.map((sport) => {
            const count = sportCounts[sport] ?? 0;
            const isActive = activeSport === sport;
            const liveCount = allLive.filter((m) => m.sport === sport).length;
            return (
              <button
                key={sport}
                onClick={() => setActiveSport(sport)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-all",
                  isActive
                    ? "bg-[#2edb6c] text-[#07110d] shadow-sm"
                    : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                <span>{SPORT_ICONS[sport]}</span>
                <span>{SPORT_LABELS[sport]}</span>
                {liveCount > 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    isActive ? "bg-black/20 text-[#07110d]" : "bg-emerald-400/20 text-emerald-300"
                  )}>
                    {liveCount} live
                  </span>
                )}
                {count > 0 && liveCount === 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    isActive ? "bg-black/20 text-[#07110d]" : "bg-white/10 text-white/50"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {matches.length === 0 ? (
        <div className="mt-6 flex min-h-[280px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-[#18181b] p-8 text-center">
          <Radio size={28} className="text-white/35" />
          <div className="mt-4 text-xl font-semibold text-white">No match data available</div>
          <div className="mt-2 max-w-md text-sm text-white/50">The live feed is empty right now. Retry once the API has fresh fixtures available.</div>
        </div>
      ) : (
        <div className="mt-4 grid gap-6">
          {/* Live */}
          <section className="rounded-[30px] border border-white/8 bg-[#18181b] p-5 lg:p-6">
            <SectionHeader title="Live priority" meta={`${filteredLive.length} ${SPORT_LABELS[activeSport] ?? activeSport} matches in play`} accent />
            {filteredLive.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredLive.map((match) => <MatchTile key={match.id} match={match} />)}
              </div>
            ) : (
              <div className="rounded-[24px] border border-white/8 bg-[#18181b] p-6 text-sm text-white/50">
                No live {SPORT_LABELS[activeSport]?.toLowerCase() ?? activeSport} matches right now — upcoming fixtures are shown below.
              </div>
            )}
          </section>

          {/* Upcoming */}
          {filteredUpcoming.length > 0 && (
            <section className="rounded-[30px] border border-white/8 bg-[#18181b] p-5 lg:p-6">
              <SectionHeader title="Upcoming" meta={`Next ${SPORT_LABELS[activeSport] ?? activeSport} fixtures`} />
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredUpcoming.map((match) => <MatchTile key={match.id} match={match} />)}
              </div>
            </section>
          )}

          {filteredLive.length === 0 && filteredUpcoming.length === 0 && (
            <div className="flex min-h-[200px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-[#18181b] p-8 text-center">
              <span className="text-4xl">{SPORT_ICONS[activeSport]}</span>
              <div className="mt-4 text-lg font-semibold text-white">No {SPORT_LABELS[activeSport]} matches right now</div>
              <div className="mt-1 text-sm text-white/50">Check another sport or come back later.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
