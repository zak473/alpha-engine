"use client";

import { useState, useCallback, useId } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BettingMatch, Market, Selection, SportSlug } from "@/lib/betting-types";
import { SPORT_CONFIG } from "@/lib/betting-types";
import { useBetting } from "./BettingContext";

// ── Odds button ──────────────────────────────────────────────────────────────

function OddsButton({
  selection,
  market,
  match,
  compact = false,
}: {
  selection: Selection;
  market: Market;
  match: BettingMatch;
  compact?: boolean;
}) {
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

  return (
    <button
      onClick={handleClick}
      disabled={match.status === "finished"}
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border transition-all duration-150",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        compact ? "px-2.5 py-1.5 min-w-[56px]" : "px-3 py-2 min-w-[68px]",
        added || flash
          ? "bg-[var(--accent-dim)] border-[rgba(34,211,238,0.4)] text-[var(--accent)]"
          : "bg-white/[0.05] border-white/[0.09] hover:bg-white/[0.09] hover:border-white/[0.16] text-text-primary"
      )}
    >
      <span className={cn("font-mono font-bold tabular-nums leading-tight",
            compact ? "text-[11px]" : "text-xs")}>
        {flash || added ? "✓" : selection.odds.toFixed(2)}
      </span>
      <span className={cn("text-text-muted leading-tight truncate max-w-full",
            compact ? "text-[9px]" : "text-[10px]")}>
        {flash || added ? "Added" : selection.label}
      </span>
    </button>
  );
}

// ── Market row (one market inline) ───────────────────────────────────────────

function MarketRow({ market, match, compact }: { market: Market; match: BettingMatch; compact?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={cn("text-text-muted flex-shrink-0", compact ? "text-[10px]" : "text-[11px]")}>
        {market.name}
      </span>
      {market.selections.map((sel) => (
        <OddsButton key={sel.id} selection={sel} market={market} match={match} compact={compact} />
      ))}
    </div>
  );
}

// ── Live badge ────────────────────────────────────────────────────────────────

function LiveBadge({ match }: { match: BettingMatch }) {
  const cfg = SPORT_CONFIG[match.sport];

  if (match.status === "live") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cfg.color }} />
        <span className="text-[11px] font-bold uppercase" style={{ color: cfg.color }}>
          LIVE{match.liveClock ? ` ${match.liveClock}` : ""}
        </span>
      </div>
    );
  }

  if (match.status === "finished") {
    return (
      <span className="text-[11px] text-text-muted font-medium uppercase tracking-wide">FT</span>
    );
  }

  // Upcoming
  const soon = isWithinHour(match.startTime);
  const timeStr = formatMatchTime(match.startTime);
  return (
    <span className={cn("text-[11px] font-medium", soon ? "text-[var(--warning)]" : "text-text-muted")}>
      {timeStr}
    </span>
  );
}

// ── Score block ───────────────────────────────────────────────────────────────

function ScoreBlock({ match }: { match: BettingMatch }) {
  const hasScore = match.homeScore != null && match.awayScore != null;
  if (!hasScore) {
    return (
      <div className="flex items-center justify-center gap-2 px-3">
        <span className="text-text-subtle text-xs">vs</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-2 px-3">
      <span className="text-2xl font-mono font-bold tabular-nums text-text-primary leading-none">
        {match.homeScore}
      </span>
      <span className="text-text-subtle text-sm">–</span>
      <span className="text-2xl font-mono font-bold tabular-nums text-text-primary leading-none">
        {match.awayScore}
      </span>
    </div>
  );
}

// ── Model signal bar ──────────────────────────────────────────────────────────

function ModelBar({ match }: { match: BettingMatch }) {
  const p = match.pHome ?? 0.5;
  const pct = Math.round(p * 100);
  const edge = match.edgePercent ?? 0;
  const edgeColor = edge >= 3 ? "var(--positive)" : edge >= 1 ? "var(--warning)" : "var(--text2)";

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 rounded-full overflow-hidden flex-1 max-w-[120px]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: "var(--info)" }}
        />
        <div className="flex-1 h-full" style={{ background: "var(--warning)", opacity: 0.5 }} />
      </div>
      <span className="text-[11px] text-text-muted whitespace-nowrap">
        <span className="text-text-primary font-medium">{pct}%</span> model
        {edge !== 0 && (
          <>
            {" · "}
            <span style={{ color: edgeColor }} className="font-semibold">
              {edge > 0 ? "+" : ""}{edge.toFixed(1)}% edge
            </span>
          </>
        )}
      </span>
    </div>
  );
}

// ── Identity section (clickable area) ────────────────────────────────────────

function MatchCardIdentity({ match, cfg }: { match: BettingMatch; cfg: (typeof SPORT_CONFIG)[keyof typeof SPORT_CONFIG] }) {
  return (
    <>
      {/* Header row: sport dot · league · time/status */}
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
          <span className="text-[11px] text-text-muted truncate">{match.league}</span>
        </div>
        <LiveBadge match={match} />
      </div>

      {/* Team names + score */}
      <div className="flex items-center gap-0 px-4 py-2">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-text-primary leading-snug truncate">{match.home.name}</p>
        </div>
        <ScoreBlock match={match} />
        <div className="flex-1 min-w-0 text-right">
          <p className="text-[15px] font-semibold text-text-primary leading-snug truncate">{match.away.name}</p>
        </div>
      </div>

      {/* Model signal bar */}
      <div className="px-4 pb-3">
        <ModelBar match={match} />
      </div>
    </>
  );
}

// ── Main MatchCard ────────────────────────────────────────────────────────────

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

  const isLive = match.status === "live";
  const isFinished = match.status === "finished";

  // Featured markets: first 2 (1X2 + one more) to keep the card compact
  const featuredSlice = match.featuredMarkets.slice(0, 2);
  const hasMoreMarkets = match.allMarkets.length > 2;

  return (
    <article
      id={`match-${match.id}`}
      className={cn(
        "card flex flex-col gap-0 overflow-hidden transition-all duration-200",
        isLive && "ring-1",
        highlighted && "ring-2 ring-[var(--accent)]"
      )}
      style={isLive ? { "--tw-ring-color": cfg.color } as React.CSSProperties : undefined}
    >
      {/* ── Clickable identity section ── */}
      {detailHref ? (
        <Link href={detailHref} className="block hover:bg-white/[0.025] transition-colors">
          <MatchCardIdentity match={match} cfg={cfg} />
        </Link>
      ) : (
        <MatchCardIdentity match={match} cfg={cfg} />
      )}

      {/* ── Featured odds ── */}
      {!isFinished && (
        <div className="border-t px-4 py-3 flex flex-col gap-2.5" style={{ borderColor: "var(--border0)" }}>
          {featuredSlice.map((mkt) => (
            <MarketRow key={mkt.id} market={mkt} match={match} />
          ))}
        </div>
      )}

      {/* ── Expand / detail links ── */}
      <div
        className="border-t flex items-center justify-between px-4 py-2"
        style={{ borderColor: "var(--border0)" }}
      >
        {hasMoreMarkets && !isFinished ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-text-muted hover:text-[var(--accent)] transition-colors"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? "Hide markets" : `${match.allMarkets.length - 2} more markets`}
          </button>
        ) : (
          <div />
        )}
        {detailHref && (
          <Link
            href={detailHref}
            className="text-[11px] text-text-muted hover:text-[var(--accent)] transition-colors"
          >
            Full analysis →
          </Link>
        )}
      </div>

      {/* ── Expanded market drawer ── */}
      {expanded && !isFinished && (
        <div className="border-t px-4 py-3 flex flex-col gap-3 bg-white/[0.018]"
             style={{ borderColor: "var(--border0)" }}>
          {match.allMarkets.slice(2).map((mkt) => (
            <MarketRow key={mkt.id} market={mkt} match={match} />
          ))}
        </div>
      )}
    </article>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isWithinHour(iso: string): boolean {
  const diff = new Date(iso).getTime() - Date.now();
  return diff > 0 && diff < 3_600_000;
}

function formatMatchTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);

  if (d >= todayStart && d < tomorrowStart) {
    return "Today " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  if (d >= tomorrowStart && d < new Date(tomorrowStart.getTime() + 86_400_000)) {
    return "Tomorrow " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
