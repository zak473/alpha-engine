"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Timer, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SportSlug, Market, Selection } from "@/lib/betting-types";
import { SPORT_CONFIG } from "@/lib/betting-types";
import { useBetting } from "@/components/betting/BettingContext";
import { sgoEventToMatch } from "@/lib/sgo";
import type { SGOEvent } from "@/lib/sgo";

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
        added || flash
          ? "text-white"
          : "text-text-primary hover:-translate-y-[1px]"
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

// ─── Group markets by category ────────────────────────────────────────────────

const CATEGORY_ORDER = ["Full Game", "1st Half", "2nd Half", "Quarters", "Periods", "Player Props"];

function categorizeMarkets(markets: Market[]): Record<string, Market[]> {
  const groups: Record<string, Market[]> = {};

  for (const m of markets) {
    let cat = "Full Game";
    if (m.id.startsWith("1h-"))   cat = "1st Half";
    else if (m.id.startsWith("2h-")) cat = "2nd Half";
    else if (m.id.startsWith("1q-") || m.id.startsWith("2q-") || m.id.startsWith("3q-") || m.id.startsWith("4q-")) cat = "Quarters";
    else if (m.id.startsWith("1p-") || m.id.startsWith("2p-") || m.id.startsWith("3p-")) cat = "Periods";
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
}

export function SGOMatchDetail({ event, sport }: Props) {
  const match = sgoEventToMatch(event, sport);
  const cfg = SPORT_CONFIG[sport];
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const matchLabel = `${match.home.name} vs ${match.away.name}`;

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(["Full Game"]));

  const toggleCat = (cat: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const grouped = categorizeMarkets(match.allMarkets);
  const orderedCats = CATEGORY_ORDER.filter((c) => grouped[c]?.length);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-6 space-y-6">

      {/* Hero */}
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

          {/* Status badge */}
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

        {/* Teams + score */}
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

        {match.allMarkets.length === 0 && (
          <div className="border-t px-5 py-4 text-sm text-text-muted" style={{ borderColor: "var(--border0)" }}>
            No odds available for this match.
          </div>
        )}
      </div>

      {/* Markets by category */}
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
        <p className="text-center text-sm text-text-muted">This match has ended — odds are no longer available.</p>
      )}
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
