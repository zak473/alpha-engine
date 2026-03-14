"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, RefreshCw, Radio, Loader2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { getLiveMatches } from "@/lib/api";
import type { LiveMatchOut } from "@/lib/api";
import { useLiveRefresh } from "@/lib/hooks/useLiveRefresh";
import { cn, formatDate } from "@/lib/utils";
import {
  getNBAGames,
  getNBALiveBoxScores,
  isGameLive,
  isGameFinished,
  isGameScheduled,
  getPeriodLabel,
  type BdlGame,
  type BdlBoxScore,
} from "@/lib/balldontlie";
import {
  getCS2Matches,
  getCS2Maps,
  isMatchLive as isCS2Live,
  isMatchFinished as isCS2Finished,
  isMatchUpcoming as isCS2Upcoming,
  type Cs2Match,
  type Cs2MatchMap,
} from "@/lib/balldontlie-cs2";
import { NBALiveGameCard } from "@/components/live/NBALiveGameCard";
import { NBABoxScoreDrawer } from "@/components/live/NBABoxScoreDrawer";
import { CS2MatchCard } from "@/components/live/CS2MatchCard";
import { CS2MatchDrawer } from "@/components/live/CS2MatchDrawer";

// ─── Constants ────────────────────────────────────────────────────────────

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

const ALL_SPORTS = ["basketball", "soccer", "tennis", "baseball", "hockey", "esports"] as const;

// ─── Shared micro-components ──────────────────────────────────────────────

function LiveDot() {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
    </span>
  );
}

function Avatar({ name, src }: { name: string; src?: string | null }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="h-10 w-10 rounded-full border border-white/10 bg-white/5 object-contain p-1"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-white/70">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function TeamPill({
  name,
  logo,
  align = "left",
}: {
  name: string;
  logo?: string | null;
  align?: "left" | "right";
}) {
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

// ─── Generic MatchTile (non-NBA sports) ───────────────────────────────────

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
        "group rounded-[24px] border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(0,0,0,0.28)] lg:p-5",
        isLive
          ? "border-emerald-400/25 bg-[linear-gradient(160deg,rgba(54,242,143,0.07),rgba(255,255,255,0.03))]"
          : "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/50">
            <span>{SPORT_ICONS[match.sport] ?? "🏅"}</span>
            {SPORT_LABELS[match.sport] ?? match.sport}
          </span>
          <span className="truncate text-xs text-white/30">{match.league}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40">
          {isLive ? (
            <>
              <LiveDot />
              <span className="font-semibold text-emerald-300">Live</span>
            </>
          ) : (
            <>
              <Clock3 size={11} />
              <span>{statusLabel}</span>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <TeamPill name={match.home_name} logo={match.home_logo} />
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border border-white/8 bg-black/20 px-4 py-3">
          <div
            className={cn(
              "text-3xl font-semibold tracking-[-0.06em] text-white",
              isLive && "text-emerald-300"
            )}
          >
            <span className="inline-block min-w-[1.5ch] text-right">
              {match.home_score ?? "–"}
            </span>
            <span className="px-2 text-white/20">:</span>
            <span className="inline-block min-w-[1.5ch] text-left">
              {match.away_score ?? "–"}
            </span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
            {isLive
              ? match.current_period
                ? `${
                    match.sport === "basketball"
                      ? "Q"
                      : match.sport === "hockey"
                      ? "P"
                      : match.sport === "baseball"
                      ? "Inn "
                      : "Set "
                  }${match.current_period}`
                : "In play"
              : "Scheduled"}
          </div>
        </div>
        <TeamPill name={match.away_name} logo={match.away_logo} align="right" />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-white/40">
          {isLive ? "Open live matchup" : statusLabel}
        </div>
        <div className="inline-flex items-center gap-2 text-xs font-medium text-white/55 transition group-hover:text-white">
          View board
          <ArrowRight size={13} />
        </div>
      </div>
    </Link>
  );
}

// ─── Section header ───────────────────────────────────────────────────────

function SectionHeader({
  title,
  meta,
  accent = false,
  badge,
}: {
  title: string;
  meta: string;
  accent?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <div
          className={cn(
            "flex items-center gap-2 text-[10px] uppercase tracking-[0.22em]",
            accent ? "text-emerald-300" : "text-white/35"
          )}
        >
          {accent && <LiveDot />}
          {title}
        </div>
        <div className="mt-1 text-[17px] font-semibold tracking-[-0.03em] text-white">
          {meta}
        </div>
      </div>
      {badge}
    </div>
  );
}

// ─── NBA Section (BallDontLie GOAT data) ─────────────────────────────────

function NBASection() {
  const [games, setGames] = useState<BdlGame[]>([]);
  const [liveBoxScores, setLiveBoxScores] = useState<Map<number, BdlBoxScore>>(new Map());
  const [selectedGame, setSelectedGame] = useState<BdlGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [syncing, setSyncing] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const fetchAll = useCallback(async (quiet = false) => {
    if (quiet) setSyncing(true);
    else setLoading(true);
    try {
      const [gamesData, liveData] = await Promise.all([
        getNBAGames(today),
        getNBALiveBoxScores(today),
      ]);
      setGames(gamesData);
      const m = new Map<number, BdlBoxScore>();
      liveData.forEach((bs) => m.set(bs.game.id, bs));
      setLiveBoxScores(m);
      setLastSynced(new Date());
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [today]);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(() => fetchAll(true), 30_000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const liveGames = useMemo(() => games.filter((g) => isGameLive(g.status)), [games]);
  const scheduledGames = useMemo(
    () => games.filter((g) => isGameScheduled(g.status)),
    [games]
  );
  const finishedGames = useMemo(
    () => games.filter((g) => isGameFinished(g.status)),
    [games]
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 size={22} className="animate-spin text-emerald-400" />
        <div className="mt-3 text-sm text-white/40">Fetching NBA games…</div>
      </div>
    );
  }

  if (!games.length) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.025] p-8 text-center">
        <span className="text-4xl">🏀</span>
        <div className="mt-4 text-lg font-semibold text-white">No NBA games today</div>
        <div className="mt-1 text-sm text-white/40">Check back on game days.</div>
      </div>
    );
  }

  const dataLabel = (
    <div className="flex items-center gap-1.5 text-[10px] text-white/30">
      {syncing ? (
        <Loader2 size={10} className="animate-spin" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/60" />
      )}
      BallDontLie GOAT · {lastSynced.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </div>
  );

  return (
    <>
      <NBABoxScoreDrawer game={selectedGame} onClose={() => setSelectedGame(null)} />

      <div className="space-y-5">
        {/* Live games */}
        {liveGames.length > 0 && (
          <section className="rounded-[28px] border border-emerald-400/20 bg-[linear-gradient(160deg,rgba(54,242,143,0.07),rgba(255,255,255,0.025))] p-5 lg:p-6">
            <SectionHeader
              title="Live Now"
              meta={`${liveGames.length} game${liveGames.length !== 1 ? "s" : ""} in progress`}
              accent
              badge={dataLabel}
            />
            <div className="grid gap-4 xl:grid-cols-2">
              {liveGames.map((game) => (
                <NBALiveGameCard
                  key={game.id}
                  game={game}
                  boxScore={liveBoxScores.get(game.id) ?? null}
                  onClick={() => setSelectedGame(game)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Upcoming games */}
        {scheduledGames.length > 0 && (
          <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5 lg:p-6">
            <SectionHeader
              title="Upcoming Today"
              meta={`${scheduledGames.length} game${scheduledGames.length !== 1 ? "s" : ""} scheduled`}
              badge={liveGames.length === 0 ? dataLabel : undefined}
            />
            <div className="grid gap-4 xl:grid-cols-2">
              {scheduledGames.map((game) => (
                <NBALiveGameCard
                  key={game.id}
                  game={game}
                  boxScore={null}
                  onClick={() => setSelectedGame(game)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Finished games */}
        {finishedGames.length > 0 && (
          <section className="rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5 lg:p-6">
            <SectionHeader
              title="Final"
              meta={`${finishedGames.length} game${finishedGames.length !== 1 ? "s" : ""} completed`}
            />
            <div className="grid gap-4 xl:grid-cols-2">
              {finishedGames.map((game) => (
                <NBALiveGameCard
                  key={game.id}
                  game={game}
                  boxScore={liveBoxScores.get(game.id) ?? null}
                  onClick={() => setSelectedGame(game)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

// ─── CS2 Section (BallDontLie GOAT data) ──────────────────────────────────

function CS2Section() {
  const [matches, setMatches] = useState<Cs2Match[]>([]);
  const [maps, setMaps] = useState<Cs2MatchMap[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Cs2Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [syncing, setSyncing] = useState(false);

  // Fetch today + yesterday to catch recent finished matches
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];

  const fetchAll = useCallback(async (quiet = false) => {
    if (quiet) setSyncing(true);
    else setLoading(true);
    try {
      const matchData = await getCS2Matches([today, yesterday]);
      setMatches(matchData);
      if (matchData.length > 0) {
        const matchIds = matchData.map((m) => m.id);
        const mapData = await getCS2Maps(matchIds);
        setMaps(mapData);
      }
      setLastSynced(new Date());
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [today, yesterday]);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(() => fetchAll(true), 20_000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const liveMatches = useMemo(() => matches.filter((m) => isCS2Live(m.status)), [matches]);
  const upcomingMatches = useMemo(() => matches.filter((m) => isCS2Upcoming(m.status)), [matches]);
  const finishedMatches = useMemo(() => matches.filter((m) => isCS2Finished(m.status)), [matches]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 size={22} className="animate-spin text-emerald-400" />
        <div className="mt-3 text-sm text-white/40">Fetching CS2 matches…</div>
      </div>
    );
  }

  if (!matches.length) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.025] p-8 text-center">
        <span className="text-4xl">🎮</span>
        <div className="mt-4 text-lg font-semibold text-white">No CS2 matches today</div>
        <div className="mt-1 text-sm text-white/40">Check back when tournaments are running.</div>
      </div>
    );
  }

  const dataLabel = (
    <div className="flex items-center gap-1.5 text-[10px] text-white/30">
      {syncing ? (
        <Loader2 size={10} className="animate-spin" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/60" />
      )}
      BallDontLie GOAT · {lastSynced.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </div>
  );

  return (
    <>
      <CS2MatchDrawer match={selectedMatch} onClose={() => setSelectedMatch(null)} />

      <div className="space-y-5">
        {liveMatches.length > 0 && (
          <section className="rounded-[28px] border border-emerald-400/20 bg-[linear-gradient(160deg,rgba(54,242,143,0.07),rgba(255,255,255,0.025))] p-5 lg:p-6">
            <SectionHeader
              title="Live Now"
              meta={`${liveMatches.length} match${liveMatches.length !== 1 ? "es" : ""} in progress`}
              accent
              badge={dataLabel}
            />
            <div className="grid gap-4 xl:grid-cols-2">
              {liveMatches.map((m) => (
                <CS2MatchCard
                  key={m.id}
                  match={m}
                  maps={maps}
                  onClick={() => setSelectedMatch(m)}
                />
              ))}
            </div>
          </section>
        )}

        {upcomingMatches.length > 0 && (
          <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5 lg:p-6">
            <SectionHeader
              title="Upcoming Today"
              meta={`${upcomingMatches.length} match${upcomingMatches.length !== 1 ? "es" : ""} scheduled`}
              badge={liveMatches.length === 0 ? dataLabel : undefined}
            />
            <div className="grid gap-4 xl:grid-cols-2">
              {upcomingMatches.map((m) => (
                <CS2MatchCard
                  key={m.id}
                  match={m}
                  maps={maps}
                  onClick={() => setSelectedMatch(m)}
                />
              ))}
            </div>
          </section>
        )}

        {finishedMatches.length > 0 && (
          <section className="rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5 lg:p-6">
            <SectionHeader
              title="Final"
              meta={`${finishedMatches.length} match${finishedMatches.length !== 1 ? "es" : ""} completed`}
            />
            <div className="grid gap-4 xl:grid-cols-2">
              {finishedMatches.map((m) => (
                <CS2MatchCard
                  key={m.id}
                  match={m}
                  maps={maps}
                  onClick={() => setSelectedMatch(m)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

// ─── Generic sport section (non-NBA) ─────────────────────────────────────

function GenericSportSection({
  activeSport,
  matches,
}: {
  activeSport: string;
  matches: LiveMatchOut[];
}) {
  const filteredLive = useMemo(
    () => matches.filter((m) => m.is_live && m.sport === activeSport),
    [matches, activeSport]
  );
  const filteredUpcoming = useMemo(
    () =>
      matches.filter((m) => !m.is_live && m.sport === activeSport).slice(0, 12),
    [matches, activeSport]
  );

  if (filteredLive.length === 0 && filteredUpcoming.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.025] p-8 text-center">
        <span className="text-4xl">{SPORT_ICONS[activeSport]}</span>
        <div className="mt-4 text-lg font-semibold text-white">
          No {SPORT_LABELS[activeSport]} matches right now
        </div>
        <div className="mt-1 text-sm text-white/40">Check another sport or come back later.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {filteredLive.length > 0 && (
        <section className="rounded-[28px] border border-emerald-400/20 bg-[linear-gradient(160deg,rgba(54,242,143,0.07),rgba(255,255,255,0.025))] p-5 lg:p-6">
          <SectionHeader
            title="Live priority"
            meta={`${filteredLive.length} ${SPORT_LABELS[activeSport] ?? activeSport} matches in play`}
            accent
          />
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredLive.map((m) => (
              <MatchTile key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {filteredUpcoming.length > 0 && (
        <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5 lg:p-6">
          <SectionHeader
            title="Upcoming"
            meta={`Next ${SPORT_LABELS[activeSport] ?? activeSport} fixtures`}
          />
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredUpcoming.map((m) => (
              <MatchTile key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Root LiveView ────────────────────────────────────────────────────────

export function LiveView({ initialMatches }: { initialMatches: LiveMatchOut[] }) {
  const router = useRouter();
  const [matches, setMatches] = useState<LiveMatchOut[]>(initialMatches);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Default to basketball — richest real-time data source
  const [activeSport, setActiveSport] = useState<string>("basketball");

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

  const sportCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    matches.forEach((m) => {
      counts[m.sport] = (counts[m.sport] ?? 0) + 1;
    });
    return counts;
  }, [matches]);

  const totalLiveCount = allLive.length;
  const nbaGameCount = 7; // approximate — NBA section manages its own count

  return (
    <div className="pb-14">
      {/* Hero banner */}
      <section className="overflow-hidden rounded-[28px] border border-white/8 bg-[radial-gradient(ellipse_at_top,rgba(54,242,143,0.10),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.22)] xl:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/16 bg-emerald-300/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-200">
              <LiveDot />
              Live analytics terminal
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-white lg:text-[2.5rem] lg:leading-[1.1]">
              Real-time scores,<br className="hidden sm:block" /> live box scores, play-by-play.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-white/50">
              NBA data powered by BallDontLie GOAT — live box scores, player stats, quarter scores,
              and play-by-play. Other sports via internal pipeline.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 xl:grid-cols-3">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.05] px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                Live now
              </div>
              <div className="mt-2 text-3xl font-bold tracking-[-0.04em] text-white">
                {totalLiveCount}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.05] px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                Upcoming
              </div>
              <div className="mt-2 text-3xl font-bold tracking-[-0.04em] text-white">
                {allUpcoming.length}
              </div>
            </div>
            <button
              onClick={refresh}
              className="inline-flex items-center justify-center gap-2 rounded-[20px] border border-white/8 bg-white/[0.05] px-4 py-4 text-left transition hover:border-emerald-300/20 hover:bg-white/[0.08]"
            >
              <RefreshCw
                size={14}
                className={cn("shrink-0 text-emerald-200", isRefreshing && "animate-spin")}
              />
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                  Synced
                </div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {lastUpdated.toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Sport filter bar */}
      <div className="mt-4 overflow-x-auto no-scrollbar">
        <div className="flex min-w-max items-center gap-1.5 rounded-[22px] border border-white/8 bg-white/[0.03] p-2">
          {ALL_SPORTS.map((sport) => {
            const isActive = activeSport === sport;
            const count = sport === "basketball" ? nbaGameCount : (sportCounts[sport] ?? 0);
            const liveCount =
              sport === "basketball" ? 0 : allLive.filter((m) => m.sport === sport).length;
            const isBdl = sport === "basketball" || sport === "esports";

            return (
              <button
                key={sport}
                onClick={() => setActiveSport(sport)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2.5 text-[12px] font-semibold transition-all",
                  isActive
                    ? "bg-[#2edb6c] text-[#07110d] shadow-sm"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                <span>{SPORT_ICONS[sport]}</span>
                <span>{SPORT_LABELS[sport]}</span>
                {isBdl && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                      isActive ? "bg-[#07110d]/20 text-[#07110d]" : "bg-blue-400/20 text-blue-300"
                    )}
                  >
                    GOAT
                  </span>
                )}
                {liveCount > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                      isActive
                        ? "bg-[#07110d]/20 text-[#07110d]"
                        : "bg-emerald-400/20 text-emerald-300"
                    )}
                  >
                    {liveCount} live
                  </span>
                )}
                {count > 0 && liveCount === 0 && !isBdl && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                      isActive ? "bg-[#07110d]/20 text-[#07110d]" : "bg-white/10 text-white/45"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* GOAT banners */}
      {activeSport === "basketball" && (
        <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-blue-400/15 bg-blue-400/[0.05] px-4 py-3">
          <Zap size={13} className="shrink-0 text-blue-300" />
          <p className="text-[12px] text-blue-200/80">
            Live NBA data via{" "}
            <span className="font-semibold text-blue-200">BallDontLie GOAT</span> — real-time box
            scores, quarter scores, player stats, play-by-play. Click any game to open the live box
            score.
          </p>
        </div>
      )}
      {activeSport === "esports" && (
        <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] px-4 py-3">
          <Zap size={13} className="shrink-0 text-emerald-300" />
          <p className="text-[12px] text-emerald-200/80">
            Live CS2 data via{" "}
            <span className="font-semibold text-emerald-200">BallDontLie GOAT</span> — real-time
            map scores, per-map player stats (K/D/A/ADR/KAST/Rating/HS%), round history, and
            economy data. Click any match to open the live match center.
          </p>
        </div>
      )}

      {/* Content area */}
      <div className="mt-4">
        {activeSport === "basketball" ? (
          <NBASection />
        ) : activeSport === "esports" ? (
          <>
            <GenericSportSection activeSport="esports" matches={matches} />
            <div className="mt-6">
              <CS2Section />
            </div>
          </>
        ) : matches.length === 0 ? (
          <div className="mt-2 flex min-h-[280px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.025] p-8 text-center">
            <Radio size={26} className="text-white/30" />
            <div className="mt-4 text-xl font-semibold text-white">No match data available</div>
            <div className="mt-2 max-w-md text-sm text-white/45">
              The live feed is empty. Retry once the API has fresh fixtures.
            </div>
          </div>
        ) : (
          <GenericSportSection activeSport={activeSport} matches={matches} />
        )}
      </div>
    </div>
  );
}
