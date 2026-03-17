"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BrainCircuit, Zap, ChevronRight, Eye, EyeOff } from "lucide-react";
import { SPORT_LEAGUES, fetchSGOEvents, sgoEventToMatch, LEAGUE_LABELS } from "@/lib/sgo";
import type { BettingMatch } from "@/lib/betting-types";
import type { SportSlug } from "@/lib/api";
import { cn, formatUKTime, formatMatchKickoff } from "@/lib/utils";

// ── Constants ───────────────────────────────────────────────────────────────

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
    const dateTo = new Date(now.getTime() + 48 * 3600_000).toISOString();
    const res = await fetch(
      `/api/v1/sports/${sport}/matches?date_from=${encodeURIComponent(now.toISOString())}&date_to=${encodeURIComponent(dateTo)}&limit=200`,
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

const fmtTime = formatUKTime;

const UK_TZ = "Europe/London";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Unknown";
  // Compare calendar dates in UK timezone
  const ukFmt = (dt: Date) => dt.toLocaleDateString("en-CA", { timeZone: UK_TZ }); // YYYY-MM-DD
  const matchDay = ukFmt(d);
  const now = new Date();
  if (matchDay === ukFmt(now)) return "Today";
  if (matchDay === ukFmt(new Date(now.getTime() + 86_400_000))) return "Tomorrow";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: UK_TZ });
}

// ── Card ─────────────────────────────────────────────────────────────────────

type MatchWithSport = BettingMatch & { sport: SportSlug };

function MatchCard({ match }: { match: MatchWithSport }) {
  const href = `/sports/${match.sport}/matches/${match.id}`;

  const hasProbabilities = match.pHome != null;
  const hasConfidence = match.modelConfidence != null;
  const hPct = hasProbabilities ? Math.round((match.pHome ?? 0) * 100) : null;
  const aPct = hasProbabilities ? Math.round((match.pAway ?? 0) * 100) : null;
  const dPct = hasProbabilities && match.pDraw != null ? Math.round(match.pDraw * 100) : null;
  const conf = match.modelConfidence ?? 0;

  // Moneyline from first featured market
  const ml = match.featuredMarkets?.[0];
  const homeOdds = ml?.selections[0]?.odds;
  const awayOdds = ml?.selections[ml.selections.length - 1]?.odds;

  const isHighConf = hasConfidence && conf >= 0.7;
  const confColor = conf >= 0.7 ? "text-emerald-300" : conf >= 0.5 ? "text-amber-400" : "text-red-400";
  const confBarBg = conf >= 0.7 ? "bg-emerald-400" : conf >= 0.5 ? "bg-amber-400" : "bg-red-400";

  const leagueLabel = LEAGUE_LABELS[match.league] ?? match.league;
  const sportIcon = SPORT_ICONS[match.sport] ?? "🏆";

  return (
    <Link
      href={href}
      className={cn(
        "group relative block overflow-hidden rounded-[28px] border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(0,0,0,0.32)]",
        isHighConf
          ? "border-emerald-400/25 bg-[linear-gradient(135deg,rgba(54,242,143,0.08),rgba(54,242,143,0.03))] hover:border-emerald-400/40"
          : "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] hover:border-emerald-300/20"
      )}
    >
      {/* High confidence glow */}
      {isHighConf && (
        <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_top_left,rgba(54,242,143,0.08),transparent_60%)]" />
      )}

      {/* Header row */}
      <div className="relative flex items-center justify-between gap-2">
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

      {/* Teams */}
      <div className="relative mt-4 grid grid-cols-[1fr_32px_1fr] items-start gap-2">
        {/* Home */}
        <div>
          <p className="text-[13px] font-semibold leading-snug text-white">{match.home.name}</p>
          {hasProbabilities ? (
            <p className={cn("mt-1.5 font-mono text-[26px] font-bold tabular-nums leading-none",
              (hPct ?? 0) > (aPct ?? 0) ? "text-emerald-300" : "text-white/60"
            )}>{hPct}%</p>
          ) : homeOdds ? (
            <p className="mt-1.5 font-mono text-xl font-bold tabular-nums leading-none text-white/50">{homeOdds.toFixed(2)}</p>
          ) : null}
          {hasProbabilities && homeOdds && (
            <p className="mt-0.5 font-mono text-[11px] text-white/30">{homeOdds.toFixed(2)}</p>
          )}
        </div>

        {/* VS divider */}
        <div className="flex h-full flex-col items-center pt-1">
          <span className="text-[11px] font-medium text-white/25">vs</span>
          {dPct != null && (
            <div className="mt-2 rounded-xl border border-white/8 bg-black/20 px-1.5 py-2 text-center">
              <p className="text-[9px] font-semibold uppercase text-white/35">D</p>
              <p className="font-mono text-xs font-bold text-white/60 tabular-nums">{dPct}%</p>
            </div>
          )}
        </div>

        {/* Away */}
        <div className="text-right">
          <p className="text-[13px] font-semibold leading-snug text-white">{match.away.name}</p>
          {hasProbabilities ? (
            <p className={cn("mt-1.5 font-mono text-[26px] font-bold tabular-nums leading-none",
              (aPct ?? 0) > (hPct ?? 0) ? "text-emerald-300" : "text-white/60"
            )}>{aPct}%</p>
          ) : awayOdds ? (
            <p className="mt-1.5 font-mono text-xl font-bold tabular-nums leading-none text-white/50">{awayOdds.toFixed(2)}</p>
          ) : null}
          {hasProbabilities && awayOdds && (
            <p className="mt-0.5 font-mono text-[11px] text-white/30">{awayOdds.toFixed(2)}</p>
          )}
        </div>
      </div>

      {/* Probability bar */}
      {hasProbabilities && (
        <div className="relative mt-4 overflow-hidden rounded-full bg-white/[0.08]" style={{ height: 8 }}>
          <div
            className={cn("absolute left-0 top-0 h-full transition-all shadow-[0_0_8px_rgba(52,211,153,0.5)]", (hPct ?? 0) >= (aPct ?? 0) ? "bg-emerald-400" : "bg-white/30")}
            style={{ width: `${hPct}%` }}
          />
          {dPct != null && (
            <div className="absolute top-0 h-full bg-white/15" style={{ left: `${hPct}%`, width: `${dPct}%` }} />
          )}
          <div
            className={cn("absolute right-0 top-0 h-full", (aPct ?? 0) > (hPct ?? 0) ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "bg-amber-400/50")}
            style={{ width: `${aPct}%` }}
          />
        </div>
      )}

      {/* Footer */}
      <div className="relative mt-4 flex items-center justify-between gap-3">
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
        ) : hasProbabilities ? (
          <span className="text-[11px] text-white/25">ELO estimate</span>
        ) : (
          <span className="text-[11px] text-white/20">No model prediction</span>
        )}

        <span className="flex items-center gap-1 text-[11px] font-semibold text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
          View <ChevronRight size={12} />
        </span>
      </div>
    </Link>
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

// ── Main shell ───────────────────────────────────────────────────────────────

const ALL_SPORT_LEAGUES: { sport: SportSlug; leagueID: string }[] = Object.entries(SPORT_LEAGUES)
  .flatMap(([sport, leagues]) =>
    (leagues as string[]).map((leagueID) => ({ sport: sport as SportSlug, leagueID }))
  );

export function PredictionsShell({ initialSport }: { initialSport: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  type MatchWithSportLocal = BettingMatch & { sport: SportSlug };
  const [matches, setMatches] = useState<MatchWithSportLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [minConf, setMinConf] = useState("0.6");
  const [showAll, setShowAll] = useState(false);

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
      const merged: MatchWithSportLocal[] = sgoMatches
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

  // Filter: if not showAll, only show matches with predictions or high odds interest
  const base = showAll ? matches : matches.filter((m) => m.pHome != null);
  const items = threshold > 0
    ? base.filter((m) => (m.modelConfidence ?? 0) >= threshold)
    : base;

  const withConf = matches.filter((m) => m.modelConfidence != null).length;
  const highConf = matches.filter((m) => (m.modelConfidence ?? 0) >= 0.7).length;

  // Group by day
  const grouped: { label: string; matches: MatchWithSportLocal[] }[] = [];
  for (const m of items) {
    const label = dayLabel(m.startTime);
    const existing = grouped.find((g) => g.label === label);
    if (existing) existing.matches.push(m);
    else grouped.push({ label, matches: [m] });
  }

  return (
    <div className="pb-12">

      {/* Hero */}
      <section className="overflow-hidden rounded-[30px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(54,242,143,0.10),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-5 shadow-[0_26px_70px_rgba(0,0,0,0.24)] xl:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-emerald-300/16 bg-emerald-300/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
              Model predictions · Next 48 hours
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-white lg:text-[2.5rem]">
              AI-Powered Tip Finder
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">
              Win probabilities and confidence scores from our ML models, overlaid on live SGO fixtures across every sport.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 xl:shrink-0">
            {[
              { label: "Total fixtures", value: loading ? "—" : String(matches.length), color: "text-white" },
              { label: "With predictions", value: loading ? "—" : String(withConf), color: "text-blue-300" },
              { label: "High confidence", value: loading ? "—" : String(highConf), color: "text-emerald-300" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-[22px] border border-white/8 bg-white/[0.05] px-4 py-4 text-center">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">{label}</div>
                <div className={cn("mt-2 text-2xl font-bold tabular-nums", color)}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Filters */}
      <div className="mt-4 overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center gap-4">
          <PillGroup
            label="Sport"
            options={SPORT_META}
            active={sport}
            onChange={(v) => navigate({ sport: v })}
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
                : "border-white/8 text-white/40 hover:text-white/60"
            )}
          >
            {showAll ? <Eye size={13} /> : <EyeOff size={13} />}
            {showAll ? "Showing all" : "Predictions only"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="mt-6 space-y-8">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-52 animate-pulse rounded-[28px] border border-white/6 bg-white/[0.02]" />
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
          grouped.map(({ label, matches: dayMatches }) => (
            <DaySection key={label} label={label} matches={dayMatches} />
          ))
        )}
      </div>
    </div>
  );
}
