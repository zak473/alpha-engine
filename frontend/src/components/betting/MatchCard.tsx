"use client";

import { useState, useCallback, useId } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Shield, Timer, TrendingUp, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BettingMatch, Market, Selection, SportSlug } from "@/lib/betting-types";
import { SPORT_CONFIG } from "@/lib/betting-types";
import { useBetting } from "./BettingContext";

function OddsButton({ selection, market, match, compact = false }: { selection: Selection; market: Market; match: BettingMatch; compact?: boolean }) {
  const { addToQueue, isInQueue } = useBetting();
  const selId = `${match.id}:${market.id}:${selection.id}`;
  const added = isInQueue(selId);
  const [flash, setFlash] = useState(false);

  const handleClick = useCallback(() => {
    if (added) return;
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
  }, [added, addToQueue, selId, match, market, selection]);

  const edgePct = (selection.edge ?? 0) * 100;

  return (
    <button
      onClick={handleClick}
      disabled={match.status === "finished"}
      className={cn(
        "relative flex flex-col items-start justify-center overflow-hidden rounded-xl border text-left transition-all duration-150",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        compact ? "min-w-[56px] px-2 py-1" : "min-w-[72px] px-2.5 py-1.5",
        added || flash
          ? "text-white"
          : "text-text-primary hover:-translate-y-[1px]"
      )}
      style={added || flash ? {
        background: "rgba(46,219,108,0.12)",
        borderColor: "rgba(46,219,108,0.20)",
        boxShadow: "0 8px 18px rgba(46,219,108,0.10)",
      } : {
        background: "var(--bg2)",
        borderColor: "var(--border0)",
      }}
    >
      <span className={cn("font-mono font-bold tabular-nums leading-tight", compact ? "text-[11px]" : "text-[13px]")}>
        {flash || added ? "✓ Added" : selection.odds.toFixed(2)}
      </span>
      <span className={cn("mt-0.5 max-w-full truncate leading-tight text-text-muted", compact ? "text-[9px]" : "text-[9px]")}>
        {flash || added ? "Tracked" : selection.label}
      </span>
      {!flash && !added && edgePct > 0.5 && (
        <span className="mt-0.5 rounded bg-emerald-500/12 px-1 py-px text-[8px] font-bold text-emerald-300">
          +{edgePct.toFixed(1)}%
        </span>
      )}
    </button>
  );
}

function MarketRow({ market, match, compact }: { market: Market; match: BettingMatch; compact?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/35">{market.name}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
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
      <div className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5" style={{ borderColor: `${cfg.color}35`, background: `${cfg.color}12` }}>
        <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: cfg.color }} />
        <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: cfg.color }}>
          Live {match.liveClock ? `· ${match.liveClock}` : ""}
        </span>
      </div>
    );
  }

  if (match.status === "finished") {
    return <span className="rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>Final</span>;
  }

  const soon = isWithinHour(match.startTime);
  const timeStr = formatMatchTime(match.startTime);
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]", soon ? "text-[var(--warning)]" : "text-text-muted")} style={{ borderColor: soon ? "rgba(251,191,36,0.25)" : "var(--border0)", background: soon ? "rgba(251,191,36,0.10)" : "var(--bg2)" }}>
      {timeStr}
    </span>
  );
}

function ScoreBlock({ match }: { match: BettingMatch }) {
  const hasScore = match.homeScore != null && match.awayScore != null;
  if (!hasScore) return (
    <div className="flex flex-col items-center px-2">
      <span className="text-[9px] uppercase tracking-[0.18em] text-white/20">vs</span>
    </div>
  );

  return (
    <div className="rounded-lg border px-2 py-1 text-center min-w-[60px]" style={{ borderColor: "rgba(255,255,255,0.08)", background: "var(--bg2)" }}>
      <div className="text-[8px] uppercase tracking-[0.18em] text-white/28">score</div>
      <div className="mt-0.5 flex items-center justify-center gap-1 text-[17px] font-mono font-bold text-text-primary leading-tight">
        <span>{match.homeScore}</span>
        <span className="text-white/30">–</span>
        <span>{match.awayScore}</span>
      </div>
    </div>
  );
}

function ModelBar({ match }: { match: BettingMatch }) {
  if (match.pHome == null) {
    return <div className="text-[10px] text-white/25 italic">No model prediction yet</div>;
  }
  const pct = Math.round(match.pHome * 100);
  const edge = match.edgePercent ?? 0;
  const confidence = match.modelConfidence != null ? Math.round(match.modelConfidence * 100) : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-[120px] flex-1 flex-col gap-1">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.14em]">
          <span className="text-white/38">Model lean</span>
          <span className="font-semibold text-white/60">{pct}% home</span>
        </div>
        <div className="h-[3px] overflow-hidden rounded-full" style={{ background: "var(--bg3)" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
        </div>
      </div>
      {confidence != null && (
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] text-white/50" style={{ borderColor: "rgba(255,255,255,0.08)", background: "var(--bg2)" }}>
            <Shield size={9} /> <span className="font-medium">{confidence}%</span>
          </span>
          <span className="inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold" style={{ borderColor: edge >= 3 ? "rgba(34,197,94,0.22)" : "rgba(245,158,11,0.22)", background: edge >= 3 ? "rgba(34,197,94,0.10)" : "rgba(245,158,11,0.10)", color: edge >= 3 ? "var(--positive)" : "var(--warning)" }}>
            <TrendingUp size={9} /> {edge > 0 ? "+" : ""}{edge.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

function MatchCardIdentity({ match, cfg }: { match: BettingMatch; cfg: (typeof SPORT_CONFIG)[keyof typeof SPORT_CONFIG] }) {
  return (
    <>
      {/* Header: sport + league + timer + status badges */}
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs" style={{ background: `${cfg.color}16`, color: cfg.color }}>
            {cfg.icon}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-medium text-white/65">
              <span className="text-white/30 text-[9px] uppercase tracking-[0.14em] mr-1.5">{cfg.label}</span>
              {match.league}
            </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {(match.edgePercent ?? 0) >= 5 && (
            <span className="inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em]"
              style={{ borderColor: "rgba(251,191,36,0.30)", background: "rgba(251,191,36,0.12)", color: "#f59e0b" }}>
              <Flame size={8} /> Value
            </span>
          )}
          {match.status !== "live" && (
            <span className="inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[9px] text-text-muted" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
              <Timer size={9} /> {formatCountdown(match.startTime, match.status)}
            </span>
          )}
          <LiveBadge match={match} />
        </div>
      </div>

      {/* Teams + score */}
      <div className="grid gap-1 px-4 py-2 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <p className="truncate text-[15px] font-semibold leading-tight text-text-primary">{match.home.name}</p>
        <ScoreBlock match={match} />
        <p className="truncate text-[15px] font-semibold leading-tight text-text-primary lg:text-right">{match.away.name}</p>
      </div>

      {/* Model bar */}
      <div className="px-4 pb-2.5">
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
      style={isLive ? { boxShadow: `0 0 0 1px ${cfg.color}22, 0 12px 24px rgba(17,24,17,0.10)` } : undefined}
    >
      {detailHref ? (
        <Link href={detailHref} className="block transition-colors hover:bg-[var(--accent-muted)]">
          <MatchCardIdentity match={match} cfg={cfg} />
        </Link>
      ) : (
        <MatchCardIdentity match={match} cfg={cfg} />
      )}

      {!isFinished && (
        <div className="border-t px-4 py-2 flex flex-col gap-2" style={{ borderColor: "var(--border0)" }}>
          {featuredSlice.map((mkt) => <MarketRow key={mkt.id} market={mkt} match={match} />)}
        </div>
      )}

      <div className="flex items-center justify-between border-t px-4 py-1.5" style={{ borderColor: "var(--border0)" }}>
        {hasMoreMarkets && !isFinished ? (
          <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-[10px] font-medium text-text-muted transition-colors hover:text-text-primary">
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {expanded ? "Hide" : `${match.allMarkets.length - 2} more markets`}
          </button>
        ) : <div />}
        {detailHref && <Link href={detailHref} className="text-[10px] font-medium text-[var(--accent)] transition-opacity hover:opacity-80">View breakdown →</Link>}
      </div>

      {expanded && !isFinished && (
        <div className="border-t px-4 py-2 flex flex-col gap-2" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
          {match.allMarkets.slice(2).map((mkt) => <MarketRow key={mkt.id} market={mkt} match={match} compact />)}
        </div>
      )}
    </article>
  );
}

function isWithinHour(iso: string): boolean {
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) return false;
  const diff = ms - Date.now();
  return diff > 0 && diff < 3_600_000;
}

function formatMatchTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);

  if (d >= todayStart && d < tomorrowStart) return "Today " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (d >= tomorrowStart && d < new Date(tomorrowStart.getTime() + 86_400_000)) return "Tomorrow " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatCountdown(iso: string, status: BettingMatch["status"]): string {
  if (status === "live") return "In-play";
  if (status === "finished") return "Settled";
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) return "—";
  const diff = ms - Date.now();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${Math.max(0, mins)}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hours}h${rem > 0 ? ` ${rem}m` : ""}`;
}
