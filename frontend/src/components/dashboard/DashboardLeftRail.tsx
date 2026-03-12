"use client";

import { useMemo, useState } from "react";
import { cn, sportColor } from "@/lib/utils";
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { MvpPrediction } from "@/lib/types";
import type { FocusViewDef } from "./FilterBar";
import { FOCUS_VIEWS } from "./FilterBar";

interface DashboardLeftRailProps {
  predictions: MvpPrediction[];
  activeSport: string | null;
  activeLeague: string | null;
  onSportSelect: (s: string | null) => void;
  onLeagueSelect: (l: string | null) => void;
  activeFocusId: string | null;
  onFocusChange: (v: FocusViewDef | null) => void;
  open: boolean;
  onToggle: () => void;
}

interface SportNode {
  sport: string;
  count: number;
  leagues: { name: string; count: number }[];
}

const SPORT_ICONS: Record<string, string> = {
  soccer:  "⚽",
  tennis:  "🎾",
  esports: "🎮",
};

const CONF_FILTERS = [
  { id: "high",   label: "HIGH confidence", minConf: 80 },
  { id: "medium", label: "MED confidence",  minConf: 65 },
  { id: "any",    label: "All confidence",  minConf: 0  },
];

export function DashboardLeftRail({
  predictions,
  activeSport,
  activeLeague,
  onSportSelect,
  onLeagueSelect,
  activeFocusId,
  onFocusChange,
  open,
  onToggle,
}: DashboardLeftRailProps) {
  const [collapsedSports, setCollapsedSports] = useState<Set<string>>(new Set());

  // Build sport → league tree from predictions
  const tree = useMemo((): SportNode[] => {
    const map = new Map<string, Map<string, number>>();
    for (const p of predictions) {
      if (!map.has(p.sport)) map.set(p.sport, new Map());
      const leagues = map.get(p.sport)!;
      leagues.set(p.league, (leagues.get(p.league) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([sport, leagueMap]) => ({
      sport,
      count: Array.from(leagueMap.values()).reduce((a, b) => a + b, 0),
      leagues: Array.from(leagueMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    }));
  }, [predictions]);

  function toggleCollapse(sport: string) {
    setCollapsedSports((prev) => {
      const next = new Set(prev);
      next.has(sport) ? next.delete(sport) : next.add(sport);
      return next;
    });
  }

  // Collapsed icon-only width
  if (!open) {
    return (
      <div className="w-9 flex flex-col items-center py-3 gap-3 border-r border-surface-border bg-surface-raised shrink-0">
        <button
          onClick={onToggle}
          title="Expand sidebar"
          className="text-text-subtle hover:text-text-muted transition-colors"
        >
          <PanelLeftOpen size={15} />
        </button>
        <div className="w-px flex-1 bg-surface-border/50" />
        {tree.map((node) => (
          <button
            key={node.sport}
            onClick={() => { onSportSelect(node.sport === activeSport ? null : node.sport); onToggle(); }}
            title={node.sport}
            className={cn(
              "w-6 h-6 rounded text-sm flex items-center justify-center transition-colors",
              activeSport === node.sport ? "bg-accent-teal/20" : "hover:bg-white/[0.04]"
            )}
          >
            {SPORT_ICONS[node.sport] ?? "•"}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col border-r border-surface-border bg-surface-raised overflow-y-auto shrink-0"
      style={{ width: "var(--left-rail-width)" }}
    >
      {/* Header */}
      <div className="rail-header">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">Markets</span>
        <button onClick={onToggle} className="text-text-subtle hover:text-text-muted transition-colors">
          <PanelLeftClose size={13} />
        </button>
      </div>

      {/* All sports shortcut */}
      <button
        onClick={() => { onSportSelect(null); onLeagueSelect(null); }}
        className={cn(
          "flex items-center justify-between px-3 py-2 text-[12px] transition-colors border-b border-surface-border",
          !activeSport && !activeLeague
            ? "bg-accent-teal/10 text-accent-teal border-l-2 border-l-accent-teal"
            : "text-text-muted hover:text-text-primary hover:bg-white/[0.03]"
        )}
      >
        <span>All Sports</span>
        <span className="num text-[11px] text-text-subtle">{predictions.length}</span>
      </button>

      {/* Sport + league tree */}
      <div className="flex-1">
        {tree.map((node) => {
          const isActive = activeSport === node.sport;
          const collapsed = collapsedSports.has(node.sport);
          const color = sportColor(node.sport);

          return (
            <div key={node.sport}>
              {/* Sport row */}
              <div className={cn(
                "flex items-center gap-2 px-3 py-2 border-b border-surface-border/60 cursor-pointer transition-colors",
                isActive ? "bg-surface-overlay" : "hover:bg-white/[0.02]"
              )}>
                <button
                  className="flex items-center gap-2 flex-1 text-left"
                  onClick={() => { onSportSelect(isActive ? null : node.sport); onLeagueSelect(null); }}
                >
                  <span className="text-[11px]">{SPORT_ICONS[node.sport] ?? "•"}</span>
                  <span className={cn("text-[12px] font-medium", isActive ? "text-text-primary" : "text-text-muted")}>
                    {node.sport.charAt(0).toUpperCase() + node.sport.slice(1)}
                  </span>
                  <span className="num text-[10px] text-text-subtle ml-auto">{node.count}</span>
                </button>
                <button
                  onClick={() => toggleCollapse(node.sport)}
                  className="text-text-subtle hover:text-text-muted transition-colors"
                >
                  {collapsed
                    ? <ChevronRight size={11} />
                    : <ChevronDown size={11} />}
                </button>
              </div>

              {/* League rows */}
              {!collapsed && node.leagues.map((l) => {
                const isActiveLeague = activeLeague === l.name;
                return (
                  <button
                    key={l.name}
                    onClick={() => { onSportSelect(node.sport); onLeagueSelect(isActiveLeague ? null : l.name); }}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-1.5 text-[11px] border-b border-surface-border/40 transition-colors text-left",
                      isActiveLeague
                        ? "bg-accent-teal/8 text-accent-teal"
                        : "text-text-subtle hover:text-text-muted hover:bg-white/[0.02]"
                    )}
                  >
                    <span className="truncate">{l.name}</span>
                    <span className="num text-[10px] shrink-0 ml-1">{l.count}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div className="border-t border-surface-border py-2">
        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-subtle">Quick Views</p>
        {FOCUS_VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => onFocusChange(activeFocusId === v.id ? null : v)}
            className={cn(
              "w-full flex items-center px-3 py-1.5 text-[11px] text-left transition-colors",
              activeFocusId === v.id
                ? "text-accent-teal bg-accent-teal/8"
                : "text-text-subtle hover:text-text-muted hover:bg-white/[0.02]"
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
