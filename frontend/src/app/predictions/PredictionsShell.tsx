"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BrainCircuit, Zap, ChevronRight } from "lucide-react";
import { SPORT_LEAGUES, fetchSGOEvents, sgoEventToMatch, LEAGUE_LABELS } from "@/lib/sgo";
import type { BettingMatch } from "@/lib/betting-types";
import type { SportSlug } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Constants ───────────────────────────────────────────────────────────────

const SPORTS: { value: string; label: string; icon: string }[] = [
  { value: "all",        label: "All sports",  icon: "🏆" },
  { value: "soccer",     label: "Soccer",      icon: "⚽" },
  { value: "tennis",     label: "Tennis",      icon: "🎾" },
  { value: "basketball", label: "Basketball",  icon: "🏀" },
  { value: "baseball",   label: "Baseball",    icon: "⚾" },
  { value: "hockey",     label: "Hockey",      icon: "🏒" },
];

const CONF_THRESHOLDS = [
  { value: "0",   label: "All"  },
  { value: "0.5", label: "50%+" },
  { value: "0.6", label: "60%+" },
  { value: "0.7", label: "70%+" },
  { value: "0.8", label: "80%+" },
];

// ── Backend merge ───────────────────────────────────────────────────────────

interface BackendItem {
  home_name: string;
  away_name: string;
  p_home: number | null;
  p_away: number | null;
  p_draw?: number | null;
  confidence: number | null;
  kickoff_utc: string;
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

async function fetchBackendForSport(sport: SportSlug): Promise<BackendItem[]> {
  try {
    const now = new Date();
    const dateFrom = now.toISOString();
    const dateTo = new Date(now.getTime() + 48 * 3600_000).toISOString();
    const res = await fetch(
      `/api/v1/sports/${sport}/matches?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&limit=200`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

function mergeBackend(match: BettingMatch, items: BackendItem[]): BettingMatch {
  const found = items.find(
    (b) =>
      teamsMatch(match.home.name, b.home_name) &&
      teamsMatch(match.away.name, b.away_name) &&
      Math.abs(new Date(match.startTime).getTime() - new Date(b.kickoff_utc).getTime()) < 6 * 3600_000
  );
  if (!found) return match;
  return {
    ...match,
    pHome: found.p_home ?? undefined,
    pAway: found.p_away ?? undefined,
    pDraw: found.p_draw ?? undefined,
    modelConfidence: found.confidence != null ? found.confidence / 100 : undefined,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtKickoff(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
    " · " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) +
    " UTC"
  );
}

function ConfBar({ conf }: { conf: number }) {
  const pct = Math.round(conf * 100);
  const bg = conf >= 0.7 ? "bg-emerald-400" : conf >= 0.5 ? "bg-amber-400" : "bg-red-400";
  const textCol = conf >= 0.7 ? "text-emerald-300" : conf >= 0.5 ? "text-amber-400" : "text-red-400";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={cn("h-full rounded-full", bg)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("font-mono text-xs font-bold tabular-nums w-8 text-right", textCol)}>{pct}%</span>
    </div>
  );
}

// ── Prediction Card ──────────────────────────────────────────────────────────

function MatchCard({ match, sport }: { match: BettingMatch; sport: string }) {
  const href = `/sports/${sport}/matches/${match.id}`;
  const hasModel = match.pHome != null;
  const hPct = hasModel ? Math.round((match.pHome ?? 0) * 100) : null;
  const aPct = hasModel ? Math.round((match.pAway ?? 0) * 100) : null;
  const dPct = hasModel && match.pDraw != null ? Math.round(match.pDraw * 100) : null;

  // Get moneyline odds from featured markets
  const ml = match.featuredMarkets?.[0];
  const homeOdds = ml?.selections[0]?.odds;
  const awayOdds = ml?.selections[ml.selections.length - 1]?.odds;

  const conf = match.modelConfidence;

  return (
    <Link
      href={href}
      className="group rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300/25 hover:shadow-[0_24px_60px_rgba(0,0,0,0.26)] block"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/55">
          {LEAGUE_LABELS[match.league] ?? match.league}
        </span>
        <span className="text-[11px] text-white/35">{fmtKickoff(match.startTime)}</span>
      </div>

      {/* Teams + probs */}
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* Home */}
        <div>
          <p className="text-sm font-semibold text-white leading-tight">{match.home.name}</p>
          {hasModel ? (
            <p className="mt-1 font-mono text-2xl font-bold text-emerald-300 tabular-nums">{hPct}%</p>
          ) : (
            <p className="mt-1 text-xs text-white/30">—</p>
          )}
          {homeOdds && <p className="mt-0.5 font-mono text-xs text-white/35">{homeOdds.toFixed(2)} odds</p>}
        </div>

        {/* Center */}
        <div className="flex flex-col items-center gap-1">
          {dPct != null && (
            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Draw</p>
              <p className="font-mono text-sm font-bold text-white tabular-nums">{dPct}%</p>
            </div>
          )}
          <span className="text-[11px] font-medium text-white/35">vs</span>
        </div>

        {/* Away */}
        <div className="text-right">
          <p className="text-sm font-semibold text-white leading-tight">{match.away.name}</p>
          {hasModel ? (
            <p className="mt-1 font-mono text-2xl font-bold text-amber-400 tabular-nums">{aPct}%</p>
          ) : (
            <p className="mt-1 text-xs text-white/30">—</p>
          )}
          {awayOdds && <p className="mt-0.5 font-mono text-xs text-white/35">{awayOdds.toFixed(2)} odds</p>}
        </div>
      </div>

      {/* Prob bar */}
      {hasModel && (
        <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-emerald-400 transition-all" style={{ width: `${hPct}%` }} />
          {dPct != null && <div className="h-full bg-white/20" style={{ width: `${dPct}%` }} />}
          <div className="h-full flex-1 bg-amber-400" />
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between gap-3">
        {conf != null ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Confidence</span>
            <ConfBar conf={conf} />
          </div>
        ) : (
          <span className="text-[11px] text-white/25">No model prediction</span>
        )}
        <div className="flex items-center gap-1 text-[12px] font-semibold text-white/72 opacity-0 transition group-hover:opacity-100">
          View <ChevronRight size={13} />
        </div>
      </div>
    </Link>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center">
      <BrainCircuit size={28} className="text-white/35" />
      <div className="mt-4 text-xl font-semibold text-white">No upcoming matches</div>
      <div className="mt-2 max-w-md text-sm text-white/50">No fixtures found in the next 48 hours for this selection.</div>
    </div>
  );
}

// ── Pill group ───────────────────────────────────────────────────────────────

function PillGroup<T extends string>({
  label, options, active, onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  active: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38 shrink-0">{label}</span>
      <div className="flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] p-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all",
              active === o.value
                ? "bg-[#2edb6c] text-[#07110d] shadow-sm"
                : "text-white/55 hover:bg-white/[0.06] hover:text-white"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main shell ───────────────────────────────────────────────────────────────

const ALL_SPORT_LEAGUES: { sport: SportSlug; leagueID: string }[] = Object.entries(SPORT_LEAGUES)
  .flatMap(([sport, leagues]) =>
    (leagues as string[]).map((leagueID) => ({ sport: sport as SportSlug, leagueID }))
  );

export function PredictionsShell({ initialSport }: { initialSport: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  type MatchWithSport = BettingMatch & { sport: SportSlug };
  const [matches, setMatches] = useState<MatchWithSport[]>([]);
  const [loading, setLoading] = useState(true);
  const [minConf, setMinConf] = useState("0");

  const sport = searchParams.get("sport") ?? initialSport;

  function navigate(updates: Record<string, string>) {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === "all") p.delete(k); else p.set(k, v);
    });
    router.replace(`/predictions${p.size ? `?${p}` : ""}`, { scroll: false });
  }

  useEffect(() => {
    setLoading(true);

    const leagues = sport === "all"
      ? ALL_SPORT_LEAGUES
      : ALL_SPORT_LEAGUES.filter((l) => l.sport === sport);

    if (!leagues.length) { setLoading(false); return; }

    // Fetch SGO events + backend predictions in parallel
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
    ]).then(([sgoMatches, backendBySport]) => {
      const backendMap = Object.fromEntries(backendBySport.map(({ sport: s, items }) => [s, items]));
      const now = Date.now();
      const cutoff = now + 48 * 3600_000;
      const merged: MatchWithSport[] = sgoMatches
        .filter((m) => {
          const t = new Date(m.startTime).getTime();
          return t >= now && t <= cutoff;
        })
        .map((m) => ({ ...mergeBackend(m, backendMap[m.sport] ?? []), sport: m.sport }))
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      setMatches(merged);
      setLoading(false);
    });
  }, [sport]);

  const threshold = parseFloat(minConf);
  const items = threshold > 0
    ? matches.filter((m) => (m.modelConfidence ?? 0) >= threshold)
    : matches;

  const highConf = matches.filter((m) => (m.modelConfidence ?? 0) >= 0.7).length;
  const withModel = matches.filter((m) => m.modelConfidence != null).length;

  return (
    <div className="pb-12">

      {/* Hero */}
      <section className="overflow-hidden rounded-[30px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(54,242,143,0.10),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-5 shadow-[0_26px_70px_rgba(0,0,0,0.24)] backdrop-blur xl:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-emerald-300/16 bg-emerald-300/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
              Model predictions
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-white lg:text-[2.7rem]">AI-Powered Match Predictions</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/58">
              Win probabilities, fair odds, and confidence scores generated by our machine learning models across every sport.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/8 bg-white/[0.05] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">With predictions</div>
              <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">
                {loading ? "—" : withModel}
              </div>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-white/[0.05] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">High confidence</div>
              <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-emerald-300">
                {loading ? "—" : highConf}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <div className="mt-4 overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.03] p-4">
        <div className="flex flex-wrap gap-4">
          <PillGroup
            label="Sport"
            options={SPORTS}
            active={sport}
            onChange={(v) => navigate({ sport: v })}
          />
          <PillGroup
            label="Min confidence"
            options={CONF_THRESHOLDS}
            active={minConf}
            onChange={setMinConf}
          />
        </div>
      </div>

      {/* Results count */}
      {!loading && items.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-white/50">
            Showing <span className="font-semibold text-white">{items.length}</span> fixture{items.length !== 1 ? "s" : ""} in the next 48 hours
          </p>
          {threshold > 0 && (
            <p className="text-xs text-white/35 flex items-center gap-1">
              <Zap size={11} /> Filtered to {Math.round(threshold * 100)}%+ confidence
            </p>
          )}
        </div>
      )}

      {/* Cards */}
      <div className="mt-4">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-[28px] border border-white/8 bg-white/[0.02] h-52 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((m) => (
              <MatchCard key={m.id} match={m} sport={m.sport} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
