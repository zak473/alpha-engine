"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Timer, Flame, TrendingUp, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SportSlug, Market, Selection } from "@/lib/betting-types";
import { SPORT_CONFIG } from "@/lib/betting-types";
import { useBetting } from "@/components/betting/BettingContext";
import { sgoEventToMatch } from "@/lib/sgo";
import type { SGOEvent } from "@/lib/sgo";
import type { SportMatchDetail } from "@/lib/types";
import type { EloPoint } from "@/app/sports/_lib/fetchMatchPageData";

// ─── Odds button ──────────────────────────────────────────────────────────────

function OddsButton({ selId, selection, matchLabel, sport, league, marketId, marketName, startTime, disabled }: {
  selId: string;
  selection: Selection;
  matchLabel: string;
  sport: SportSlug;
  league: string;
  marketId: string;
  marketName: string;
  startTime: string;
  disabled?: boolean;
}) {
  const { addToQueue, isInQueue } = useBetting();
  const added = isInQueue(selId);
  const [flash, setFlash] = useState(false);

  const handleClick = useCallback(() => {
    if (added || disabled) return;
    addToQueue({
      id: selId,
      matchId: selId.split(":")[0],
      matchLabel,
      sport,
      league,
      marketId,
      marketName,
      selectionId: selection.id,
      selectionLabel: selection.label,
      odds: selection.odds,
      edge: selection.edge,
      startTime,
      addedAt: new Date().toISOString(),
    });
    setFlash(true);
    setTimeout(() => setFlash(false), 1400);
  }, [added, disabled, addToQueue, selId, matchLabel, sport, league, marketId, marketName, selection, startTime]);

  return (
    <button
      onClick={handleClick}
      disabled={!!disabled}
      className={cn(
        "relative flex flex-col items-start justify-center overflow-hidden rounded-2xl border text-left transition-all duration-150",
        "min-w-[84px] px-3 py-2.5",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        added || flash ? "text-white" : "text-text-primary hover:-translate-y-[1px]"
      )}
      style={added || flash ? {
        background: "rgba(46,219,108,0.12)",
        borderColor: "rgba(46,219,108,0.20)",
        boxShadow: "0 10px 22px rgba(46,219,108,0.10)",
      } : {
        background: "var(--bg2)",
        borderColor: "var(--border0)",
      }}
    >
      <span className="font-mono font-bold tabular-nums leading-tight text-sm">
        {flash || added ? "✓ Added" : selection.odds.toFixed(2)}
      </span>
      <span className="mt-0.5 max-w-full truncate leading-tight text-text-muted text-[10px]">
        {flash || added ? "Tracked" : selection.label}
      </span>
    </button>
  );
}

// ─── Market section ───────────────────────────────────────────────────────────

function MarketSection({ market, matchId, matchLabel, sport, league, startTime, isFinished }: {
  market: Market;
  matchId: string;
  matchLabel: string;
  sport: SportSlug;
  league: string;
  startTime: string;
  isFinished: boolean;
}) {
  return (
    <div className="rounded-[20px] border p-4" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{market.name}</div>
      <div className="flex flex-wrap items-center gap-2">
        {market.selections.map((sel) => (
          <OddsButton
            key={sel.id}
            selId={`${matchId}:${market.id}:${sel.id}`}
            selection={sel}
            matchLabel={matchLabel}
            sport={sport}
            league={league}
            marketId={market.id}
            marketName={market.name}
            startTime={startTime}
            disabled={isFinished}
          />
        ))}
      </div>
    </div>
  );
}

// ─── ELO sparkline (simple inline SVG) ───────────────────────────────────────

function EloSparkline({ points, color }: { points: EloPoint[]; color: string }) {
  if (points.length < 2) return null;
  const ratings = points.map((p) => p.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const range = max - min || 1;
  const w = 120; const h = 32;
  const pts = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p.rating - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
    </svg>
  );
}

// ─── Model section ────────────────────────────────────────────────────────────

function ModelSection({ match, homeName, awayName, eloHome, eloAway, cfg }: {
  match: SportMatchDetail;
  homeName: string;
  awayName: string;
  eloHome: EloPoint[];
  eloAway: EloPoint[];
  cfg: { color: string; label: string; icon: string };
}) {
  const prob = match.probabilities;
  const conf = match.confidence;
  const hasDraw = prob?.draw != null && prob.draw > 0;

  return (
    <div className="space-y-4">
      {/* Win probabilities */}
      {prob && (
        <div className="sportsbook-card p-5 space-y-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Model Prediction</div>

          <div className={cn("grid gap-3", hasDraw ? "grid-cols-3" : "grid-cols-2")}>
            <ProbCard label={`${homeName} win`} prob={prob.home_win} color="#22c55e" />
            {hasDraw && <ProbCard label="Draw" prob={prob.draw!} color="#f59e0b" />}
            <ProbCard label={`${awayName} win`} prob={prob.away_win} color="#a855f7" />
          </div>

          {conf != null && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
                <Shield size={12} /> {conf}% model confidence
              </span>
              {match.fair_odds && (
                <>
                  {match.fair_odds.home_win && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
                      <TrendingUp size={12} /> Fair {homeName}: {match.fair_odds.home_win.toFixed(2)}
                    </span>
                  )}
                  {match.fair_odds.away_win && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
                      <TrendingUp size={12} /> Fair {awayName}: {match.fair_odds.away_win.toFixed(2)}
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ELO ratings */}
      {(match.elo_home || match.elo_away || eloHome.length > 0 || eloAway.length > 0) && (
        <div className="sportsbook-card p-5">
          <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">ELO Ratings</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <EloCard name={homeName} elo={match.elo_home} history={eloHome} color={cfg.color} />
            <EloCard name={awayName} elo={match.elo_away} history={eloAway} color="#6366f1" />
          </div>
        </div>
      )}

      {/* Key drivers */}
      {match.key_drivers && match.key_drivers.length > 0 && (
        <div className="sportsbook-card p-5">
          <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Model Drivers</div>
          <div className="space-y-2">
            {match.key_drivers.slice(0, 6).map((d, i) => {
              const pct = Math.round(d.importance * 100);
              return (
                <div key={`${d.feature}-${i}`} className="rounded-[18px] border p-3" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-text-primary">{d.feature}</span>
                    <span className="text-[11px] font-semibold text-emerald-300">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg3)" }}>
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
                  </div>
                  {d.value != null && (
                    <div className="mt-1 text-[10px] text-text-muted">Value: {typeof d.value === "number" ? d.value.toFixed(2) : d.value}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* H2H */}
      {match.h2h && (
        <div className="sportsbook-card p-5">
          <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Head to Head</div>
          <div className="grid grid-cols-3 gap-3 text-center mb-4">
            <H2HStat label={homeName} value={match.h2h.home_wins ?? match.h2h.player_a_wins ?? match.h2h.team_a_wins ?? 0} color="#22c55e" />
            <H2HStat label="Draws" value={match.h2h.draws ?? 0} color="#f59e0b" />
            <H2HStat label={awayName} value={match.h2h.away_wins ?? match.h2h.player_b_wins ?? match.h2h.team_b_wins ?? 0} color="#a855f7" />
          </div>
          {match.h2h.recent_matches?.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-muted mb-2">Recent meetings</div>
              {match.h2h.recent_matches.slice(0, 5).map((m: { date?: string; home_score?: number | null; away_score?: number | null; winner?: string }, i: number) => (
                <div key={i} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
                  <span className="text-text-muted text-[11px]">{m.date ? new Date(m.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}</span>
                  <span className="font-mono font-semibold text-text-primary">
                    {m.home_score ?? m.winner ?? "—"}{m.home_score != null ? ` – ${m.away_score}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats comparison */}
      {(match.stats_home || match.stats_away) && (
        <div className="sportsbook-card p-5">
          <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Stats Comparison</div>
          <div className="space-y-2">
            {Array.from(
              new Set([
                ...Object.keys((match.stats_home as Record<string, unknown>) ?? {}),
                ...Object.keys((match.stats_away as Record<string, unknown>) ?? {}),
              ])
            ).slice(0, 12).map((key) => {
              const home = (match.stats_home as Record<string, unknown> | null)?.[key];
              const away = (match.stats_away as Record<string, unknown> | null)?.[key];
              return (
                <div key={key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
                  <span className="text-right text-sm text-text-primary">{fmt(home)}</span>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted text-center min-w-[80px]">{key.replace(/_/g, " ")}</span>
                  <span className="text-sm text-text-primary">{fmt(away)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ProbCard({ label, prob, color }: { label: string; prob: number; color: string }) {
  const pct = Math.round(prob * 100);
  return (
    <div className="rounded-[20px] border p-4 text-center" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-text-muted mb-2 truncate">{label}</div>
      <div className="text-3xl font-bold" style={{ color }}>{pct}%</div>
      <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg3)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function EloCard({ name, elo, history, color }: {
  name: string;
  elo?: { rating?: number | null; rating_change?: number | null } | null;
  history: EloPoint[];
  color: string;
}) {
  const rating = elo?.rating;
  const change = elo?.rating_change;
  return (
    <div className="rounded-[20px] border p-4" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-text-muted mb-1 truncate">{name}</div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="text-2xl font-bold text-text-primary">{rating != null ? Math.round(rating) : "—"}</span>
          {change != null && (
            <span className={cn("ml-2 text-xs font-semibold", change >= 0 ? "text-emerald-400" : "text-red-400")}>
              {change >= 0 ? "+" : ""}{Math.round(change)}
            </span>
          )}
        </div>
        {history.length > 1 && <EloSparkline points={history} color={color} />}
      </div>
    </div>
  );
}

function H2HStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-[20px] border p-3" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-text-muted mt-1 truncate">{label}</div>
    </div>
  );
}

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v).replace(/_/g, " ");
}

// ─── Market category grouping ─────────────────────────────────────────────────

const CATEGORY_ORDER = ["Full Game", "1st Half", "2nd Half", "Quarters", "Periods", "Player Props"];

function categorizeMarkets(markets: Market[]): Record<string, Market[]> {
  const groups: Record<string, Market[]> = {};
  for (const m of markets) {
    let cat = "Full Game";
    if (m.id.startsWith("1h-"))   cat = "1st Half";
    else if (m.id.startsWith("2h-")) cat = "2nd Half";
    else if (/^[1-4]q-/.test(m.id)) cat = "Quarters";
    else if (/^[1-3]p-/.test(m.id)) cat = "Periods";
    else if (m.id.startsWith("prop-")) cat = "Player Props";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(m);
  }
  return groups;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  event: SGOEvent;
  sport: SportSlug;
  backendMatch?: SportMatchDetail | null;
  eloHome?: EloPoint[];
  eloAway?: EloPoint[];
}

export function SGOMatchDetail({ event, sport, backendMatch, eloHome = [], eloAway = [] }: Props) {
  const match = sgoEventToMatch(event, sport);
  const cfg = SPORT_CONFIG[sport];
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const matchLabel = `${match.home.name} vs ${match.away.name}`;

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(["Full Game"]));
  const toggleCat = (cat: string) => setExpandedCats((prev) => {
    const next = new Set(prev);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    return next;
  });

  const grouped = categorizeMarkets(match.allMarkets);
  const orderedCats = CATEGORY_ORDER.filter((c) => grouped[c]?.length);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
      <div className={cn("grid gap-6", backendMatch ? "lg:grid-cols-[1fr_380px]" : "")}>

        {/* Left column: hero + odds */}
        <div className="space-y-4">

          {/* Hero card */}
          <div className="sportsbook-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 pt-5">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full text-base" style={{ background: `${cfg.color}16`, color: cfg.color }}>
                  {cfg.icon}
                </span>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-text-subtle">{cfg.label}</div>
                  <div className="text-sm font-medium text-text-primary">{match.league}</div>
                </div>
              </div>
              {isLive ? (
                <div className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1" style={{ borderColor: `${cfg.color}35`, background: `${cfg.color}12` }}>
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: cfg.color }} />
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: cfg.color }}>
                    Live {match.liveClock ? `· ${match.liveClock}` : ""}
                  </span>
                </div>
              ) : isFinished ? (
                <span className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>Final</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
                  <Timer size={12} /> {formatKickoff(match.startTime)}
                </span>
              )}
            </div>

            <div className="grid gap-4 px-5 py-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">Home</p>
                <p className="mt-1 text-2xl font-bold leading-tight text-text-primary">{match.home.name}</p>
              </div>
              {match.homeScore != null && match.awayScore != null ? (
                <div className="rounded-2xl border px-5 py-3 text-center" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-text-subtle mb-1">score</div>
                  <div className="flex items-center justify-center gap-3 text-3xl font-mono font-bold text-text-primary">
                    <span>{match.homeScore}</span>
                    <span className="text-text-subtle">–</span>
                    <span>{match.awayScore}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center text-2xl font-thin text-text-subtle">vs</div>
              )}
              <div className="text-left lg:text-right">
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">Away</p>
                <p className="mt-1 text-2xl font-bold leading-tight text-text-primary">{match.away.name}</p>
              </div>
            </div>
          </div>

          {/* Odds markets */}
          {orderedCats.length === 0 && (
            <div className="rounded-[20px] border px-5 py-8 text-center text-sm text-text-muted" style={{ borderColor: "var(--border0)" }}>
              No odds available for this match.
            </div>
          )}

          {orderedCats.map((cat) => {
            const markets = grouped[cat];
            const isExpanded = expandedCats.has(cat);
            const hasEdge = markets.some((m) => m.selections.some((s) => (s.edge ?? 0) >= 0.05));
            return (
              <div key={cat} className="sportsbook-card overflow-hidden">
                <button
                  onClick={() => toggleCat(cat)}
                  className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-white/[0.02]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{cat}</span>
                    <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
                      {markets.length}
                    </span>
                    {hasEdge && (
                      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]"
                        style={{ borderColor: "rgba(251,191,36,0.30)", background: "rgba(251,191,36,0.12)", color: "#f59e0b" }}>
                        <Flame size={9} /> Value
                      </span>
                    )}
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
                </button>
                {isExpanded && (
                  <div className="border-t px-5 py-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" style={{ borderColor: "var(--border0)" }}>
                    {markets.map((mkt) => (
                      <MarketSection
                        key={mkt.id}
                        market={mkt}
                        matchId={match.id}
                        matchLabel={matchLabel}
                        sport={sport}
                        league={match.league}
                        startTime={match.startTime}
                        isFinished={isFinished}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {isFinished && (
            <p className="text-center text-sm text-text-muted py-2">This match has ended — odds are no longer available.</p>
          )}
        </div>

        {/* Right column: model / ELO / H2H */}
        {backendMatch && (
          <div className="lg:sticky lg:top-4 lg:self-start">
            <ModelSection
              match={backendMatch}
              homeName={match.home.name}
              awayName={match.away.name}
              eloHome={eloHome}
              eloAway={eloAway}
              cfg={cfg}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  if (d >= todayStart && d < tomorrowStart) return "Today " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (d >= tomorrowStart && d < new Date(tomorrowStart.getTime() + 86_400_000)) return "Tomorrow " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
