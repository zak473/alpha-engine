"use client";

import { Search, X, SlidersHorizontal, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BettingFilter } from "@/lib/betting-types";
import { DEFAULT_BETTING_FILTER } from "@/lib/betting-types";
import { useBetting } from "./BettingContext";

interface StickyFilterBarProps {
  filter: BettingFilter;
  onChange: (f: BettingFilter) => void;
  totalShown: number;
  onShowTopPicks?: () => void;
  onShowQueueRail?: () => void;
}

type Chip<T extends string = string> = { value: T; label: string };

const TIME_CHIPS: Chip<BettingFilter["time"]>[] = [
  { value: "all",      label: "Any" },
  { value: "today",    label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
];

const EDGE_CHIPS: Chip<BettingFilter["edge"]>[] = [
  { value: "all", label: "Any" },
  { value: "1",   label: "+1%" },
  { value: "3",   label: "+3%" },
  { value: "5",   label: "+5%" },
];

const CONF_CHIPS: Chip<BettingFilter["confidence"]>[] = [
  { value: "all", label: "Any" },
  { value: "55",  label: "55%+" },
  { value: "65",  label: "65%+" },
  { value: "75",  label: "75%+" },
];

function ChipGroup<T extends string>({
  chips,
  value,
  onChange,
  label,
  accentLive,
}: {
  chips: Chip<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  accentLive?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-medium text-text-subtle uppercase tracking-wide flex-shrink-0">
        {label}
      </span>
      <div className="flex items-center gap-0.5">
        {chips.map((c) => {
          const active = c.value === value;
          const isLive = accentLive && c.value === "live";
          return (
            <button
              key={c.value}
              onClick={() => onChange(c.value)}
              className={cn(
                "px-2 py-1 rounded-md text-[11px] font-medium transition-all duration-120 whitespace-nowrap",
                active
                  ? isLive
                    ? "border border-[rgba(23,148,71,0.22)] bg-[rgba(23,148,71,0.10)] text-[var(--positive)]"
                    : "border text-[var(--accent)]"
                  : "text-text-muted border border-transparent hover:text-text-primary hover:bg-[rgba(23,148,71,0.05)]"
              )}
              style={active && !isLive ? {
                background: "var(--accent-dim)",
                borderColor: "rgba(48,224,106,0.24)",
              } : {}}
            >
              {isLive && active && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1 inline-block animate-pulse" />
              )}
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const isDirty = (f: BettingFilter) =>
  f.time !== "all" || f.edge !== "all" || f.confidence !== "all" || f.search !== "";

export function StickyFilterBar({
  filter,
  onChange,
  totalShown,
  onShowTopPicks,
  onShowQueueRail,
}: StickyFilterBarProps) {
  const { queue } = useBetting();
  const dirty = isDirty(filter);

  const set = <K extends keyof BettingFilter>(key: K, val: BettingFilter[K]) =>
    onChange({ ...filter, [key]: val });

  const reset = () => onChange({ ...filter, time: "all", edge: "all", confidence: "all", search: "" });

  return (
    <div
      className="sticky top-0 z-20 border-b flex-shrink-0"
      style={{
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderColor: "var(--border0)",
      }}
    >
      {/* Row 1: Search + actions */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b" style={{ borderColor: "var(--border0)" }}>
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none" />
          <input
            type="text"
            placeholder="Search teams, leagues..."
            value={filter.search}
            onChange={(e) => set("search", e.target.value)}
            className="input-field pl-7 text-xs h-8"
          />
          {filter.search && (
            <button
              onClick={() => set("search", "")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Count */}
        <span className="text-[11px] text-text-muted flex-shrink-0 tabular-nums">
          <span className="text-text-primary font-semibold">{totalShown}</span> games
        </span>

        {/* Clear filters */}
        {dirty && (
          <button
            onClick={reset}
            className="text-[11px] text-text-muted hover:text-[var(--accent)] transition-colors flex-shrink-0 flex items-center gap-1"
          >
            <X size={11} /> Clear filters
          </button>
        )}

        <div className="flex-1" />

        {/* Top picks button */}
        {onShowTopPicks && (
          <button
            onClick={onShowTopPicks}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg, rgba(251,191,36,0.15) 0%, rgba(251,191,36,0.08) 100%)",
              color: "var(--warning)",
              border: "1px solid rgba(214,162,61,0.24)",
            }}
          >
            <Zap size={12} />
            Show top picks
          </button>
        )}

        {/* Queue pill (mobile) */}
        {onShowQueueRail && (
          <button
            onClick={onShowQueueRail}
            className={cn(
              "lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all flex-shrink-0",
              queue.length > 0
                ? "text-[var(--positive)] border-[rgba(48,224,106,0.24)] bg-[var(--accent-dim)]"
                : "text-text-muted border-[var(--border0)] hover:bg-[rgba(23,148,71,0.05)]"
            )}
          >
            <SlidersHorizontal size={11} />
            {queue.length > 0 ? queue.length : "Queue"}
          </button>
        )}
      </div>

      {/* Row 2: Filter chips */}
      <div
        className="flex items-center gap-4 px-4 py-2 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        <ChipGroup
          chips={TIME_CHIPS}
          value={filter.time}
          onChange={(v) => set("time", v)}
          label="Time"
        />

        <div className="w-px h-5 bg-[var(--border0)] flex-shrink-0" />

        <ChipGroup
          chips={EDGE_CHIPS}
          value={filter.edge}
          onChange={(v) => set("edge", v)}
          label="Edge"
        />

        <div className="w-px h-5 bg-[var(--border0)] flex-shrink-0" />

        <ChipGroup
          chips={CONF_CHIPS}
          value={filter.confidence}
          onChange={(v) => set("confidence", v)}
          label="Conf"
        />
      </div>

    </div>
  );
}
