"use client";

import { Search, X, SlidersHorizontal } from "lucide-react";
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

const STATUS_CHIPS: Chip<BettingFilter["status"]>[] = [
  { value: "all",      label: "Active" },
  { value: "live",     label: "Live" },
  { value: "upcoming", label: "Upcoming" },
  { value: "finished", label: "Results" },
];

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
    <div className="flex items-center gap-2 flex-shrink-0">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] flex-shrink-0" style={{ color: "rgba(255,255,255,0.32)" }}>
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
                "px-2 py-0.5 rounded text-[11px] font-medium transition-all duration-100 whitespace-nowrap",
                active
                  ? isLive
                    ? "border border-[rgba(46,219,108,0.28)] bg-[rgba(46,219,108,0.12)] text-[var(--positive)]"
                    : "border text-[var(--accent)]"
                  : "text-white/38 border border-transparent hover:text-white/70 hover:bg-white/[0.05]"
              )}
              style={active && !isLive ? {
                background: "rgba(46,219,108,0.10)",
                borderColor: "rgba(46,219,108,0.28)",
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
  f.status !== "all" || f.time !== "all" || f.edge !== "all" ||
  f.confidence !== "all" || f.search !== "";

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

  const reset = () => onChange(DEFAULT_BETTING_FILTER);

  return (
    <div
      className="sticky top-0 z-20 border-b flex-shrink-0"
      style={{
        background: "rgba(7,16,12,0.88)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderColor: "rgba(255,255,255,0.07)",
      }}
    >
      {/* Row 1: Search + actions */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        {/* Search */}
        <div className="relative flex-1 max-w-[160px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          <input
            type="text"
            placeholder="Search..."
            value={filter.search}
            onChange={(e) => set("search", e.target.value)}
            className="input-field pl-8 text-[11px]"
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
        <span className="text-[11px] flex-shrink-0 tabular-nums text-white/30">
          <span className="text-white/65 font-semibold">{totalShown}</span> games
        </span>

        {/* Clear filters */}
        {dirty && (
          <button
            onClick={reset}
            className="text-[11px] text-white/35 hover:text-[var(--accent)] transition-colors flex-shrink-0 flex items-center gap-1"
          >
            <X size={10} /> Clear
          </button>
        )}

        <div className="flex-1" />

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
        className="flex items-center gap-3 px-4 py-1.5 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        <ChipGroup
          chips={STATUS_CHIPS}
          value={filter.status}
          onChange={(v) => set("status", v)}
          label="Status"
          accentLive
        />

        <div className="w-px h-4 flex-shrink-0" style={{ background: "rgba(255,255,255,0.10)" }} />

        <ChipGroup
          chips={TIME_CHIPS}
          value={filter.time}
          onChange={(v) => set("time", v)}
          label="Time"
        />

        <div className="w-px h-4 flex-shrink-0" style={{ background: "rgba(255,255,255,0.10)" }} />

        <ChipGroup
          chips={EDGE_CHIPS}
          value={filter.edge}
          onChange={(v) => set("edge", v)}
          label="Edge"
        />

        <div className="w-px h-4 flex-shrink-0" style={{ background: "rgba(255,255,255,0.10)" }} />

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
