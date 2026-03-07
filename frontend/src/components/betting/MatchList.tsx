"use client";

import { useState } from "react";
import { Zap, RotateCcw, Wifi, ChevronRight, Calendar, Search } from "lucide-react";
import type { BettingMatch, BettingFilter, SportSlug } from "@/lib/betting-types";
import { MatchCard } from "./MatchCard";

interface MatchListProps {
  matches: BettingMatch[];
  allMatches: BettingMatch[];
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
    <div className="flex flex-col items-center gap-6 py-20 px-6">
      {/* Icon */}
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ 
          background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)", 
          border: "1px solid rgba(255,255,255,0.08)" 
        }}
      >
        <Search size={28} style={{ color: "var(--text2)" }} />
      </div>

      {/* Copy */}
      <div className="text-center space-y-2 max-w-sm">
        <p className="text-lg font-semibold text-text-primary">No games match your filters</p>
        <p className="text-sm text-text-muted leading-relaxed">
          Try adjusting your filters or explore the full slate of today's games.
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {onClearFilters && (
          <button
            onClick={onClearFilters}
            className="btn btn-md btn-secondary flex items-center gap-2"
          >
            <RotateCcw size={14} />
            Clear filters
          </button>
        )}
        {onShowTopPicks && (
          <button
            onClick={onShowTopPicks}
            className="btn btn-md flex items-center gap-2"
            style={{
              background: "linear-gradient(135deg, rgba(251,191,36,0.2) 0%, rgba(251,191,36,0.1) 100%)",
              color: "var(--warning)",
              border: "1px solid rgba(251,191,36,0.3)",
            }}
          >
            <Zap size={14} />
            Show top picks
          </button>
        )}
        {onShowLive && (
          <button
            onClick={onShowLive}
            className="btn btn-md btn-ghost flex items-center gap-2"
          >
            <Wifi size={14} />
            Explore live games
          </button>
        )}
      </div>

      {/* Suggestion cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 w-full max-w-lg">
        <SuggestionCard
          icon={<Calendar size={16} />}
          title="Check tomorrow"
          subtitle="More games scheduled"
        />
        <SuggestionCard
          icon={<Zap size={16} />}
          title="Lower edge filter"
          subtitle="See more options"
        />
        <SuggestionCard
          icon={<Wifi size={16} />}
          title="Enable live"
          subtitle="In-play opportunities"
        />
      </div>
    </div>
  );
}

function SuggestionCard({ 
  icon, 
  title, 
  subtitle 
}: { 
  icon: React.ReactNode; 
  title: string; 
  subtitle: string;
}) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="text-text-subtle">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-primary truncate">{title}</p>
        <p className="text-[10px] text-text-muted truncate">{subtitle}</p>
      </div>
    </div>
  );
}

const DEFAULT_VISIBLE = 6;

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
  const [showAll, setShowAll] = useState(false);

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

  // Group: live first, then upcoming, then results
  const live     = matches.filter((m) => m.status === "live");
  const upcoming = matches.filter((m) => m.status === "upcoming");
  const results  = matches.filter((m) => m.status === "finished" || m.status === "cancelled");

  const sections: { label: string; items: BettingMatch[]; accent?: string }[] = [
    ...(live.length     ? [{ label: "Live Now",  items: live, accent: "var(--positive)" }] : []),
    ...(upcoming.length ? [{ label: "Upcoming",  items: upcoming }] : []),
    ...(results.length  ? [{ label: "Results",   items: results }] : []),
  ];

  // Flatten all items to apply global show-more cap
  const allItems = [...live, ...upcoming, ...results];
  const visibleItems = showAll ? allItems : allItems.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = allItems.length - DEFAULT_VISIBLE;

  return (
    <div className="flex flex-col gap-6">
      {sections.map(({ label, items, accent }) => {
        const sectionItems = items.filter((m) => visibleItems.includes(m));
        if (sectionItems.length === 0) return null;
        return (
          <section key={label}>
            {sections.length > 1 && (
              <div className="flex items-center gap-2 px-1 mb-3">
                {accent && (
                  <span
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ background: accent }}
                  />
                )}
                <h2 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: accent ?? "var(--text1)" }}>
                  {label}
                </h2>
                <span className="text-[10px] text-text-muted font-mono">
                  {items.length}
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {sectionItems.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  sport={m.sport}
                  highlighted={m.id === highlightedId}
                  detailHref={`/sports/${m.sport}/matches/${m.id}`}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Show more / show less */}
      {!showAll && hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="flex items-center justify-center gap-2 w-full py-4 rounded-lg transition-all"
          style={{ background: "rgba(48,224,106,0.06)", border: "1px solid rgba(48,224,106,0.15)" }}
        >
          <span className="text-sm font-medium" style={{ color: "var(--positive)" }}>
            Show {hiddenCount} more match{hiddenCount !== 1 ? "es" : ""}
          </span>
          <ChevronRight size={14} style={{ color: "var(--positive)" }} />
        </button>
      )}
      {showAll && allItems.length > DEFAULT_VISIBLE && (
        <button
          onClick={() => setShowAll(false)}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-lg transition-all"
          style={{ background: "transparent", border: "1px solid var(--border0)" }}
        >
          <span className="text-xs text-text-muted">Show less</span>
        </button>
      )}

      {/* Footer: nudge to see results */}
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
      className="flex items-center justify-center gap-2 w-full py-4 mt-4 rounded-lg transition-all"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <span className="text-xs text-text-muted">
        View {count} recent result{count !== 1 ? "s" : ""}
      </span>
      <ChevronRight size={12} className="text-text-subtle" />
    </button>
  );
}
