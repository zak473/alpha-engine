"use client";

import { useState, useCallback, useId } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Shield, Timer, TrendingUp, Flame } from "lucide-react";
import { cn, formatMatchKickoff } from "@/lib/utils";
import type { BettingMatch, Market, Selection, SportSlug } from "@/lib/betting-types";
import { SPORT_CONFIG } from "@/lib/betting-types";
import { useBetting } from "./BettingContext";

function OddsButton({ selection, market, match, compact = false }: { selection: Selection; market: Market; match: BettingMatch; compact?: boolean }) {
  const { addToQueue, removeFromQueue, isInQueue } = useBetting();
  const selId = `${match.id}:${market.id}:${selection.id}`;
  const added = isInQueue(selId);
  const [flash, setFlash] = useState(false);

  const handleClick = useCallback(() => {
    if (added) {
      removeFromQueue(selId);
      return;
    }
    addToQueue({
      id: selId,
      matchId: match.id,
      matchLabel: `${match.home.name} vs ${match.away.name}`,
      sport: match.sport,
      league: match.league,
      marketId: market.id,
      marketName: market.name,
      selectionId: selection.id,
      selectionLabel: selection.label,
      odds: selection.odds,
      edge: selection.edge,
      startTime: match.startTime,
      addedAt: new Date().toISOString(),
    });
    setFlash(true);
    setTimeout(() => setFlash(false), 1400);
  }, [added, addToQueue, removeFromQueue, selId, match, market, selection]);

  const edgePct = (selection.edge ?? 0) * 100;

  return (
    <button
      onClick={handleClick}
      disabled={match.status === "finished"}
      className={cn(
        "relative flex flex-col items-start justify-center overflow-hidden rounded-2xl border text-left transition-all duration-150",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        compact ? "min-w-[62px] px-2.5 py-2" : "min-w-[84px] px-3 py-2.5",
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
      <span className={cn("font-mono font-bold tabular-nums leading-tight", compact ? "text-[11px]" : "text-sm")}>
        {flash ? "✓ Added" : added ? "× Remove" : selection.odds.toFixed(2)}
      </span>
      <span className={cn("mt-0.5 max-w-full truncate leading-tight text-text-muted", compact ? "text-[9px]" : "text-[10px]")}>
        {flash ? "Tracked" : added ? "Click to deselect" : selection.label}
      </span>
      {!flash && !added && edgePct > 0.5 && (
        <span className="mt-1 rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
          +{edgePct.toFixed(1)}%
        </span>
      )}
    </button>
  );
}

function MarketRow({ market, match, compact }: { market: Market; match: BettingMatch; compact?: boolean }) {
  return (
    <div className="rounded-[20px] border p-2.5" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{market.name}</div>
      <div className="flex items-center gap-2 flex-wrap">
        {market.selections.map((sel) => (
          <OddsButton key={sel.id} selection={sel} market={market} match={match} compact={compact} />
        ))}
      </div>
    </div>
  );
}

function LiveBadge({ match }: { match: BettingMatch }) {
  const cfg = SPORT_CONFIG[match.sport];

  if (match.status === "live") {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1" style={{ borderColor: `${cfg.color}35`, background: `${cfg.color}12` }}>
        <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: cfg.color }} />
        <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: cfg.color }}>
          Live {match.liveClock ? `· ${match.liveClock}` : ""}
        </span>
      </div>
    );
  }

  if (match.status === "finished") {
    return <span className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>Final</span>;
  }

  const soon = isWithinHour(match.startTime);
  const timeStr = formatMatchTime(match.startTime);
  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]", soon ? "text-[var(--warning)]" : "text-text-muted")} style={{ borderColor: soon ? "rgba(251,191,36,0.25)" : "var(--border0)", background: soon ? "rgba(251,191,36,0.10)" : "var(--bg2)" }}>
      {timeStr}
    </span>
  );
}

function ScoreBlock({ match }: { match: BettingMatch }) {
  const hasScore = match.homeScore != null && match.awayScore != null;
  if (!hasScore) return <div className="px-3 text-sm text-text-subtle">vs</div>;

  return (
    <div className="rounded-2xl border px-3 py-2 text-center min-w-[86px]" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-text-subtle">score</div>
      <div className="mt-1 flex items-center justify-center gap-2 text-2xl font-mono font-bold text-text-primary">
        <span>{match.homeScore}</span>
        <span className="text-text-subtle">–</span>
        <span>{match.awayScore}</span>
      </div>
    </div>
  );
}

function ModelBar({ match }: { match: BettingMatch }) {
  // Only render when we have a real model prediction
  if (match.pHome == null) {
    return (
      <div className="text-[11px] text-text-muted italic">No model prediction yet</div>
    );
  }
  const pct = Math.round(match.pHome * 100);
  const edge = match.edgePercent ?? 0;
  const confidence = match.modelConfidence != null ? Math.round(match.modelConfidence * 100) : null;

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-text-muted">
          <span>Model lean</span>
          <span>{pct}% home</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--bg3)" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
        </div>
      </div>
      {confidence != null && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
            <Shield size={12} /> {confidence}% confidence
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold" style={{ borderColor: edge >= 3 ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)", background: edge >= 3 ? "rgba(34,197,94,0.10)" : "rgba(245,158,11,0.10)", color: edge >= 3 ? "var(--positive)" : "var(--warning)" }}>
            <TrendingUp size={12} /> {edge > 0 ? "+" : ""}{edge.toFixed(1)}% edge
          </span>
        </div>
      )}
    </div>
  );
}

function MatchCardIdentity({ match, cfg }: { match: BettingMatch; cfg: (typeof SPORT_CONFIG)[keyof typeof SPORT_CONFIG] }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm" style={{ background: `${cfg.color}16`, color: cfg.color }}>
            {cfg.icon}
          </span>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-text-subtle">{cfg.label}</div>
            <div className="truncate text-sm font-medium text-text-primary">{match.league}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {(match.edgePercent ?? 0) >= 5 && (
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]"
              style={{ borderColor: "rgba(251,191,36,0.30)", background: "rgba(251,191,36,0.12)", color: "#f59e0b" }}>
              <Flame size={9} /> Value
            </span>
          )}
          <LiveBadge match={match} />
        </div>
      </div>

      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">Home</p>
          <p className="mt-1 truncate text-[18px] font-semibold leading-tight text-text-primary">{match.home.name}</p>
        </div>
        <ScoreBlock match={match} />
        <div className="min-w-0 text-left lg:text-right">
          <p className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">Away</p>
          <p className="mt-1 truncate text-[18px] font-semibold leading-tight text-text-primary">{match.away.name}</p>
        </div>
      </div>

      <div className="px-5 pb-4">
        <div className="flex flex-wrap items-center gap-2 pb-3 text-[11px] text-text-muted">
          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
            <Timer size={12} /> {formatCountdown(match.startTime, match.status)}
          </span>
        </div>
        <ModelBar match={match} />
      </div>
    </>
  );
}

interface MatchCardProps {
  match: BettingMatch;
  highlighted?: boolean;
  sport: SportSlug;
  detailHref?: string;
}

export function MatchCard({ match, highlighted, sport, detailHref }: MatchCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SPORT_CONFIG[match.sport];
  const cardId = useId();
  void cardId;
  void sport;

  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const featuredSlice = match.featuredMarkets.slice(0, 2);
  const hasMoreMarkets = match.allMarkets.length > 2;

  return (
    <article
      id={`match-${match.id}`}
      className={cn(
        "sportsbook-card flex flex-col gap-0 overflow-hidden transition-all duration-200",
        highlighted && "ring-2 ring-[var(--accent)]"
      )}
      style={isLive ? { boxShadow: `0 0 0 1px ${cfg.color}22, 0 14px 28px rgba(17,24,17,0.10)` } : undefined}
    >
      {detailHref ? (
        <Link href={detailHref} className="block transition-colors hover:bg-[var(--accent-muted)]">
          <MatchCardIdentity match={match} cfg={cfg} />
        </Link>
      ) : (
        <MatchCardIdentity match={match} cfg={cfg} />
      )}

      {!isFinished && (
        <div className="border-t px-5 py-4 flex flex-col gap-3" style={{ borderColor: "var(--border0)" }}>
          {featuredSlice.map((mkt) => <MarketRow key={mkt.id} market={mkt} match={match} />)}
        </div>
      )}

      <div className="flex items-center justify-between border-t px-5 py-3" style={{ borderColor: "var(--border0)" }}>
        {hasMoreMarkets && !isFinished ? (
          <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-[11px] font-medium text-text-muted transition-colors hover:text-text-primary">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? "Hide extra markets" : `${match.allMarkets.length - 2} more markets`}
          </button>
        ) : <div />}
        {detailHref && <Link href={detailHref} className="text-[11px] font-medium text-[var(--accent)] transition-opacity hover:opacity-80">View full breakdown</Link>}
      </div>

      {expanded && !isFinished && (
        <div className="border-t px-5 py-4 flex flex-col gap-3" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
          {match.allMarkets.slice(2).map((mkt) => <MarketRow key={mkt.id} market={mkt} match={match} />)}
        </div>
      )}
    </article>
  );
}

const TZ = "Europe/London";

function isWithinHour(iso: string): boolean {
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) return false;
  const diff = ms - Date.now();
  return diff > 0 && diff < 3_600_000;
}

const formatMatchTime = formatMatchKickoff;

function formatCountdown(iso: string, status: BettingMatch["status"]): string {
  if (status === "live") return "In-play";
  if (status === "finished") return "Settled";
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) return "—";
  const diff = ms - Date.now();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${Math.max(0, mins)} min to start`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hours}h ${rem}m to start`;
}
