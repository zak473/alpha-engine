"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface RaceListItem {
  id: string;
  course: string;
  region: string | null;
  race_name: string;
  race_class: string | null;
  race_type: string | null;
  distance_f: number | null;
  going: string | null;
  pattern: string | null;
  off_time: string | null;
  scheduled_at: string | null;
  status: string;
  field_size: number | null;
  num_runners: number;
}

interface Props {
  initialRaces: RaceListItem[];
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "text-amber-400",
  live:      "text-emerald-400",
  finished:  "text-white/40",
};

const STATUS_DOT: Record<string, string> = {
  scheduled: "bg-amber-400",
  live:      "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]",
  finished:  "bg-white/30",
};

function distanceLabel(f: number | null): string {
  if (!f) return "—";
  const miles = f / 8;
  if (miles >= 1) return `${miles.toFixed(1)}m`;
  return `${f}f`;
}

function formatTime(scheduled_at: string | null, off_time: string | null): string {
  if (off_time) return off_time;
  if (scheduled_at) {
    try {
      return new Date(scheduled_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "—";
    }
  }
  return "—";
}

export function HorseRacingClient({ initialRaces }: Props) {
  const [statusFilter, setStatusFilter] = useState<"all" | "scheduled" | "live" | "finished">("all");

  const filtered = useMemo(() => {
    if (statusFilter === "all") return initialRaces;
    return initialRaces.filter((r) => r.status === statusFilter);
  }, [initialRaces, statusFilter]);

  // Group by course
  const grouped = useMemo(() => {
    const map = new Map<string, RaceListItem[]>();
    for (const race of filtered) {
      const key = race.course;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(race);
    }
    // Sort races within each course by scheduled time
    for (const races of map.values()) {
      races.sort((a, b) => {
        const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
        const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
        return ta - tb;
      });
    }
    return map;
  }, [filtered]);

  const liveCount = initialRaces.filter((r) => r.status === "live").length;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "live", "scheduled", "finished"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "border border-white/8 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s === "live" && liveCount > 0 && (
              <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-black">
                {liveCount}
              </span>
            )}
          </button>
        ))}
        <span className="ml-auto text-xs text-white/40">
          {filtered.length} races
        </span>
      </div>

      {/* No races */}
      {grouped.size === 0 && (
        <div className="rounded-xl border border-white/8 bg-white/[0.03] px-6 py-12 text-center">
          <div className="text-3xl mb-3">🏇</div>
          <p className="text-white/60 text-sm">No races found for today.</p>
          <p className="text-white/30 text-xs mt-1">Racecards are refreshed every 30 minutes.</p>
        </div>
      )}

      {/* Courses */}
      {Array.from(grouped.entries()).map(([course, races]) => (
        <div key={course} className="rounded-xl border border-white/8 bg-white/[0.03] overflow-hidden">
          {/* Course header */}
          <div className="flex items-center gap-3 border-b border-white/6 px-4 py-3">
            <span className="text-base">🏇</span>
            <h2 className="font-semibold text-white text-sm">{course}</h2>
            {races[0]?.region && (
              <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/50 uppercase">
                {races[0].region}
              </span>
            )}
            <span className="ml-auto text-xs text-white/40">{races.length} races</span>
          </div>

          {/* Race rows */}
          <div className="divide-y divide-white/4">
            {races.map((race) => (
              <Link
                key={race.id}
                href={`/sports/horseracing/races/${race.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors group"
              >
                {/* Time */}
                <div className="w-12 shrink-0 text-center">
                  <div className="text-sm font-mono font-semibold text-white">
                    {formatTime(race.scheduled_at, race.off_time)}
                  </div>
                </div>

                {/* Status dot */}
                <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[race.status] ?? "bg-white/30"}`} />
                </div>

                {/* Race info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white truncate">
                      {race.race_name}
                    </span>
                    {race.pattern && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300 font-medium">
                        {race.pattern}
                      </span>
                    )}
                    {race.race_class && (
                      <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/50">
                        {race.race_class}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex gap-3 text-[11px] text-white/40">
                    {race.distance_f && <span>{distanceLabel(race.distance_f)}</span>}
                    {race.going && <span>{race.going}</span>}
                    {race.race_type && <span>{race.race_type}</span>}
                  </div>
                </div>

                {/* Runners count */}
                <div className="shrink-0 text-right">
                  <div className="text-sm font-medium text-white/80">
                    {race.num_runners || race.field_size || "—"}
                  </div>
                  <div className="text-[10px] text-white/30">runners</div>
                </div>

                {/* Arrow */}
                <div className="shrink-0 text-white/20 group-hover:text-white/50 transition-colors">
                  →
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
