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
  { value: "live",     label: "● Live" },
  { value: "upcoming", label: "Upcoming" },
  { value: "finished", label: "Results" },
];

const TIME_CHIPS: Chip<BettingFilter["time"]>[] = [
  { value: "all",      label: "Any time" },
  { value: "today",    label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
];

const EDGE_CHIPS: Chip<BettingFilter["edge"]>[] = [
  { value: "all", label: "Any edge" },
  { value: "1",   label: "> 1%" },
  { value: "3",   label: "> 3%" },
  { value: "5",   label: "> 5%" },
];

const CONF_CHIPS: Chip<BettingFilter["confidence"]>[] = [
  { value: "all", label: "Any conf." },
  { value: "55",  label: "> 55%" },
  { value: "65",  label: "> 65%" },
  { value: "75",  label: "> 75%" },
];

function ChipGroup<T extends string>({
  chips,
  value,
  onChange,
  accent,
}: {
  chips: Chip<T>[];
  value: T;
  onChange: (v: T) => void;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {chips.map((c) => {
        const active = c.value === value;
        const isLive = c.value === "live";
        return (
          <button
            key={c.value}
            onClick={() => onChange(c.value)}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-120 whitespace-nowrap",
              active
                ? isLive
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "border text-[var(--accent)]"
                : "text-text-muted border border-transparent hover:text-text-primary hover:bg-white/[0.05]"
            )}
            style={active && !isLive ? {
              background: "var(--accent-dim)",
              borderColor: "rgba(34,211,238,0.3)",
            } : {}}
          >
            {c.label}
          </button>
        );
      })}
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
      className="sticky top-[var(--topbar-height)] z-20 border-b"
      style={{
        background: "rgba(4,4,15,0.85)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderColor: "var(--border0)",
      }}
    >
      {/* Row 1: Search + Queue toggle */}
      <div className="flex items-center gap-3 px-4 py-2 border-b" style={{ borderColor: "var(--border0)" }}>
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none" />
          <input
            type="text"
            placeholder="Search teams, leagues…"
            value={filter.search}
            onChange={(e) => set("search", e.target.value)}
            className="input-field pl-7 text-xs h-7"
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

        <span className="text-[11px] text-text-muted flex-shrink-0">
          {totalShown} games
        </span>

        {dirty && (
          <button
            onClick={reset}
            className="text-[11px] text-text-muted hover:text-[var(--accent)] transition-colors flex-shrink-0 flex items-center gap-1"
          >
            <X size={11} /> Clear
          </button>
        )}

        <div className="flex-1" />

        {onShowTopPicks && (
          <button
            onClick={onShowTopPicks}
            className="btn btn-sm btn-secondary text-[11px] flex-shrink-0"
          >
            Top picks
          </button>
        )}

        {/* Queue pill */}
        {onShowQueueRail && (
          <button
            onClick={onShowQueueRail}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all flex-shrink-0",
              queue.length > 0
                ? "text-[var(--accent)] border-[rgba(34,211,238,0.3)] bg-[var(--accent-dim)]"
                : "text-text-muted border-transparent hover:bg-white/[0.05]"
            )}
          >
            <SlidersHorizontal size={11} />
            Queue {queue.length > 0 && <span className="font-bold">{queue.length}</span>}
          </button>
        )}
      </div>

      {/* Row 2: Filter chips */}
      <div className="flex items-center gap-3 px-4 py-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <ChipGroup chips={STATUS_CHIPS} value={filter.status} onChange={(v) => set("status", v)} />
        <div className="w-px h-4 bg-white/[0.07] flex-shrink-0" />
        <ChipGroup chips={TIME_CHIPS} value={filter.time} onChange={(v) => set("time", v)} />
        <div className="w-px h-4 bg-white/[0.07] flex-shrink-0" />
        <ChipGroup chips={EDGE_CHIPS} value={filter.edge} onChange={(v) => set("edge", v)} />
        <div className="w-px h-4 bg-white/[0.07] flex-shrink-0" />
        <ChipGroup chips={CONF_CHIPS} value={filter.confidence} onChange={(v) => set("confidence", v)} />
      </div>
    </div>
  );
}
