"use client";

import { Zap, RotateCcw, Wifi, ChevronRight } from "lucide-react";
import type { BettingMatch, BettingFilter, SportSlug } from "@/lib/betting-types";
import { MatchCard } from "./MatchCard";

interface MatchListProps {
  matches: BettingMatch[];
  allMatches: BettingMatch[];     // unfiltered — used to count finished for footer
  sport: SportSlug;
  activeFilter: BettingFilter["status"];
  highlightedId?: string | null;
  onClearFilters?: () => void;
  onShowTopPicks?: () => void;
  onShowLive?: () => void;
  onShowResults?: () => void;
}

function EmptyState({
  onClearFilters,
  onShowTopPicks,
  onShowLive,
}: Pick<MatchListProps, "onClearFilters" | "onShowTopPicks" | "onShowLive">) {
  return (
    <div className="flex flex-col items-center gap-6 py-16 px-6">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}
      >
        <Zap size={24} style={{ color: "var(--text2)" }} />
      </div>

      <div className="text-center space-y-1 max-w-xs">
        <p className="text-text-primary font-semibold">No games match your filters</p>
        <p className="text-text-muted text-sm">
          Try widening your search or browse today's full slate.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {onClearFilters && (
          <button
            onClick={onClearFilters}
            className="btn btn-md btn-secondary flex items-center gap-1.5"
          >
            <RotateCcw size={13} />
            Clear filters
          </button>
        )}
        {onShowTopPicks && (
          <button
            onClick={onShowTopPicks}
            className="btn btn-md btn-primary flex items-center gap-1.5"
          >
            <Zap size={13} />
            Show top picks
          </button>
        )}
        {onShowLive && (
          <button
            onClick={onShowLive}
            className="btn btn-md btn-ghost flex items-center gap-1.5"
          >
            <Wifi size={13} />
            Explore live games
          </button>
        )}
      </div>
    </div>
  );
}

export function MatchList({
  matches,
  allMatches,
  sport,
  activeFilter,
  highlightedId,
  onClearFilters,
  onShowTopPicks,
  onShowLive,
  onShowResults,
}: MatchListProps) {
  const finishedCount = allMatches.filter(
    (m) => m.status === "finished" || m.status === "cancelled"
  ).length;

  if (matches.length === 0) {
    return (
      <>
        <EmptyState
          onClearFilters={onClearFilters}
          onShowTopPicks={onShowTopPicks}
          onShowLive={onShowLive}
        />
        {finishedCount > 0 && activeFilter !== "finished" && (
          <ResultsFooter count={finishedCount} onShowResults={onShowResults} />
        )}
      </>
    );
  }

  // Group: live first, then upcoming only — finished are never mixed in here.
  // They only appear when the user explicitly selects the "Results" filter.
  const live     = matches.filter((m) => m.status === "live");
  const upcoming = matches.filter((m) => m.status === "upcoming");
  const results  = matches.filter((m) => m.status === "finished" || m.status === "cancelled");

  const sections: { label: string; items: BettingMatch[] }[] = [
    ...(live.length     ? [{ label: "Live Now",  items: live }]     : []),
    ...(upcoming.length ? [{ label: "Upcoming",  items: upcoming }] : []),
    ...(results.length  ? [{ label: "Results",   items: results }]  : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      {sections.map(({ label, items }) => (
        <section key={label}>
          {sections.length > 1 && (
            <h2 className="label px-1 mb-3">{label}</h2>
          )}
          <div className="flex flex-col gap-3">
            {items.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                sport={sport}
                highlighted={m.id === highlightedId}
                detailHref={`/sports/${sport}/matches/${m.id}`}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Footer: nudge to see results when on active view */}
      {finishedCount > 0 && activeFilter !== "finished" && (
        <ResultsFooter count={finishedCount} onShowResults={onShowResults} />
      )}
    </div>
  );
}

function ResultsFooter({
  count,
  onShowResults,
}: {
  count: number;
  onShowResults?: () => void;
}) {
  return (
    <button
      onClick={onShowResults}
      className="flex items-center justify-center gap-1.5 w-full py-3 text-[11px] text-text-muted hover:text-text-primary transition-colors"
    >
      {count} recent result{count !== 1 ? "s" : ""} — tap to view
      <ChevronRight size={11} />
    </button>
  );
}
