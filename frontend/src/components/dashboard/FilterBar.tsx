"use client";

import { useCallback, useTransition, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Bookmark, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export type SportFilter = "all" | "soccer" | "tennis" | "esports" | "basketball" | "baseball";
export type RangeFilter = "today" | "7d" | "30d";

export interface FocusViewDef {
  id: string;
  label: string;
  sport?: SportFilter;
  range?: RangeFilter;
  minConf?: number;
  maxHours?: number;
  signalMode?: "confidence" | "edge";
}

export const FOCUS_VIEWS: FocusViewDef[] = [
  { id: "today-high",  label: "Today — High confidence", sport: "all",     range: "today", minConf: 75 },
  { id: "next-6h",     label: "Next 6 hours",            sport: "all",     range: "today", maxHours: 6 },
  { id: "esports",     label: "Esports only",            sport: "esports", range: "7d"                 },
  { id: "high-edge",   label: "High edge",               sport: "all",     range: "7d",    signalMode: "edge" },
];

const SPORTS: { value: SportFilter; label: string }[] = [
  { value: "all",     label: "All sports" },
  { value: "soccer",     label: "⚽ Soccer"     },
  { value: "tennis",     label: "🎾 Tennis"     },
  { value: "esports",    label: "🎮 Esports"    },
  { value: "basketball", label: "🏀 Basketball" },
  { value: "baseball",   label: "⚾ Baseball"   },
];

const RANGES: { value: RangeFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d",    label: "7 days" },
  { value: "30d",   label: "30 days" },
];

interface FilterBarProps {
  sport: SportFilter;
  range: RangeFilter;
  q: string;
  onQChange: (q: string) => void;
  activeFocusId?: string | null;
  onFocusChange?: (view: FocusViewDef | null) => void;
  searchRef?: React.RefObject<HTMLInputElement>;
}

export function FilterBar({ sport, range, q, onQChange, activeFocusId, onFocusChange, searchRef }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [showViews, setShowViews] = useState(false);

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all" || value === "today") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      startTransition(() => {
        router.replace(`/dashboard${params.size ? `?${params}` : ""}`, { scroll: false });
      });
    },
    [router, searchParams]
  );

  function applyFocusView(view: FocusViewDef) {
    // Update URL params
    const params = new URLSearchParams(searchParams.toString());
    if (view.sport && view.sport !== "all") params.set("sport", view.sport); else params.delete("sport");
    if (view.range && view.range !== "today") params.set("range", view.range); else params.delete("range");
    startTransition(() => {
      router.replace(`/dashboard${params.size ? `?${params}` : ""}`, { scroll: false });
    });
    onFocusChange?.(view);
    setShowViews(false);
  }

  function clearFocus() {
    onFocusChange?.(null);
  }

  const activeView = FOCUS_VIEWS.find((v) => v.id === activeFocusId);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Saved Views */}
      <div className="relative">
        <button
          onClick={() => setShowViews((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors",
            activeFocusId
              ? "bg-accent-blue/15 border-accent-blue/30 text-accent-blue"
              : "bg-surface-overlay border-surface-border text-text-muted hover:text-text-primary"
          )}
        >
          <Bookmark size={11} />
          {activeView ? activeView.label : "Saved Views"}
          <ChevronDown size={10} className={cn("transition-transform", showViews && "rotate-180")} />
        </button>

        {showViews && (
          <div className="absolute top-full mt-1.5 left-0 z-20 w-52 bg-surface-overlay border border-surface-border rounded-lg shadow-xl py-1">
            {activeFocusId && (
              <button
                onClick={clearFocus}
                className="w-full px-3 py-2 text-xs text-text-muted hover:text-text-primary hover:bg-white/[0.04] text-left transition-colors"
              >
                ✕ Clear filter
              </button>
            )}
            {FOCUS_VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => applyFocusView(v)}
                className={cn(
                  "w-full px-3 py-2 text-xs text-left transition-colors flex items-center gap-2",
                  activeFocusId === v.id
                    ? "text-accent-blue bg-accent-blue/8"
                    : "text-text-muted hover:text-text-primary hover:bg-white/[0.04]"
                )}
              >
                <Bookmark size={10} className="shrink-0 opacity-60" />
                {v.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sport pills */}
      <div className="flex items-center gap-1 bg-surface-overlay border border-surface-border rounded-lg p-1">
        {SPORTS.map((s) => (
          <button
            key={s.value}
            onClick={() => { updateParam("sport", s.value); clearFocus(); }}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
              sport === s.value
                ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30"
                : "text-text-muted hover:text-text-primary hover:bg-white/[0.05]"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Range pills */}
      <div className="flex items-center gap-1 bg-surface-overlay border border-surface-border rounded-lg p-1">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => { updateParam("range", r.value); clearFocus(); }}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              range === r.value
                ? "bg-white/[0.08] text-text-primary"
                : "text-text-muted hover:text-text-primary hover:bg-white/[0.05]"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative flex-1 min-w-[160px] max-w-xs">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none" />
        <input
          ref={searchRef}
          type="text"
          placeholder="Search teams, events… (/)"
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          className="input-field pl-7 pr-7 py-1.5 text-xs h-8"
        />
        {q && (
          <button onClick={() => onQChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text-muted transition-colors">
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
