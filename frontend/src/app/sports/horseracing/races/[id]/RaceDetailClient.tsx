"use client";

import { useState, useMemo } from "react";

interface RunnerOut {
  horse_id: string;
  horse_name: string;
  number: number | null;
  draw: number | null;
  jockey: string | null;
  trainer: string | null;
  age: number | null;
  sex: string | null;
  colour: string | null;
  sire: string | null;
  dam: string | null;
  lbs: number | null;
  ofr: string | null;
  form: string | null;
  last_run: string | null;
  headgear: string | null;
  is_non_runner: boolean;
  position: number | null;
  sp: number | null;
  beaten_lengths: number | null;
  form_score: number | null;
}

interface RaceDetail {
  id: string;
  course: string;
  region: string | null;
  race_name: string;
  race_class: string | null;
  race_type: string | null;
  distance_f: number | null;
  going: string | null;
  surface: string | null;
  pattern: string | null;
  age_band: string | null;
  prize: string | null;
  field_size: number | null;
  off_time: string | null;
  scheduled_at: string | null;
  status: string;
  runners: RunnerOut[];
}

interface Props {
  race: RaceDetail;
}

type SortKey = "number" | "form_score" | "ofr";

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  live:      "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  finished:  "bg-white/8 text-white/50 border-white/10",
};

function FormBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-white/20 text-xs">—</span>;
  const pct = Math.round(score * 100);
  const color = pct >= 60 ? "bg-emerald-400" : pct >= 35 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/60 tabular-nums">{pct}%</span>
    </div>
  );
}

function ofrToNum(ofr: string | null): number {
  if (!ofr || ofr === "-") return -1;
  const n = parseInt(ofr, 10);
  return isNaN(n) ? -1 : n;
}

function distanceLabel(f: number | null): string {
  if (!f) return "—";
  const miles = f / 8;
  if (miles >= 1) return `${miles.toFixed(1)}m`;
  return `${f}f`;
}

export function RaceDetailClient({ race }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("number");

  const sorted = useMemo(() => {
    const runners = [...race.runners];
    switch (sortKey) {
      case "number":
        return runners.sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
      case "form_score":
        return runners.sort((a, b) => (b.form_score ?? 0) - (a.form_score ?? 0));
      case "ofr":
        return runners.sort((a, b) => ofrToNum(b.ofr) - ofrToNum(a.ofr));
      default:
        return runners;
    }
  }, [race.runners, sortKey]);

  const formatTime = (scheduled_at: string | null, off_time: string | null) => {
    if (off_time) return off_time;
    if (scheduled_at) {
      try {
        return new Date(scheduled_at).toLocaleTimeString("en-GB", {
          hour: "2-digit", minute: "2-digit",
        });
      } catch { return "—"; }
    }
    return "—";
  };

  return (
    <div className="space-y-5">
      {/* Race header card */}
      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3 justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${STATUS_BADGE[race.status] ?? STATUS_BADGE.scheduled}`}>
                {race.status === "live" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                )}
                {race.status}
              </span>
              {race.pattern && (
                <span className="rounded-full bg-amber-500/15 border border-amber-500/20 px-2.5 py-1 text-[11px] text-amber-300 font-medium">
                  {race.pattern}
                </span>
              )}
              {race.race_class && (
                <span className="rounded-full bg-white/8 border border-white/10 px-2.5 py-1 text-[11px] text-white/60">
                  {race.race_class}
                </span>
              )}
            </div>
            <h1 className="text-lg font-semibold text-white leading-tight">{race.race_name}</h1>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-mono font-bold text-white">
              {formatTime(race.scheduled_at, race.off_time)}
            </div>
            <div className="text-xs text-white/50">{race.course}</div>
          </div>
        </div>

        {/* Meta row */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {race.distance_f && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Distance</div>
              <div className="text-sm text-white font-medium">{distanceLabel(race.distance_f)}</div>
            </div>
          )}
          {race.going && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Going</div>
              <div className="text-sm text-white font-medium">{race.going}</div>
            </div>
          )}
          {race.surface && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Surface</div>
              <div className="text-sm text-white font-medium">{race.surface}</div>
            </div>
          )}
          {race.prize && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Prize</div>
              <div className="text-sm text-white font-medium">{race.prize}</div>
            </div>
          )}
          {race.age_band && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Age</div>
              <div className="text-sm text-white font-medium">{race.age_band}</div>
            </div>
          )}
          {race.race_type && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Type</div>
              <div className="text-sm text-white font-medium">{race.race_type}</div>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Runners</div>
            <div className="text-sm text-white font-medium">{race.runners.length}</div>
          </div>
        </div>
      </div>

      {/* Sort controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/40">Sort by:</span>
        {([
          ["number",    "Number"],
          ["form_score","Form Score"],
          ["ofr",       "Official Rating"],
        ] as [SortKey, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              sortKey === key
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "border border-white/8 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Runners table */}
      <div className="rounded-xl border border-white/8 overflow-hidden">
        {/* Desktop table header */}
        <div className="hidden sm:grid grid-cols-[3rem_1fr_3rem_3rem_1fr_1fr_3rem_3rem_4rem_6rem] gap-2 border-b border-white/8 bg-white/[0.02] px-4 py-2 text-[10px] uppercase tracking-wider text-white/30">
          <span>No.</span>
          <span>Horse</span>
          <span>Draw</span>
          <span>Age</span>
          <span>Jockey</span>
          <span>Trainer</span>
          <span>Lbs</span>
          <span>OFR</span>
          <span>Form</span>
          <span>Form Score</span>
        </div>

        <div className="divide-y divide-white/4">
          {sorted.map((runner) => (
            <div
              key={runner.horse_id}
              className={`px-4 py-3 transition-colors hover:bg-white/[0.02] ${
                runner.is_non_runner ? "opacity-40" : ""
              }`}
            >
              {/* Desktop row */}
              <div className="hidden sm:grid grid-cols-[3rem_1fr_3rem_3rem_1fr_1fr_3rem_3rem_4rem_6rem] gap-2 items-center">
                <span className="text-sm font-bold text-white/60 tabular-nums">
                  {runner.number ?? "—"}
                </span>
                <div>
                  <div className="text-sm font-semibold text-white leading-tight">
                    {runner.horse_name}
                    {runner.is_non_runner && (
                      <span className="ml-1.5 text-[10px] text-red-400 font-normal">(NR)</span>
                    )}
                    {runner.headgear && (
                      <span className="ml-1 text-[10px] text-white/40">{runner.headgear}</span>
                    )}
                  </div>
                  {(runner.sire || runner.dam) && (
                    <div className="text-[10px] text-white/30">
                      {[runner.sire, runner.dam].filter(Boolean).join(" × ")}
                    </div>
                  )}
                </div>
                <span className="text-sm text-white/60 tabular-nums">{runner.draw ?? "—"}</span>
                <span className="text-sm text-white/60 tabular-nums">{runner.age ?? "—"}</span>
                <span className="text-sm text-white/70 truncate">{runner.jockey ?? "—"}</span>
                <span className="text-sm text-white/50 truncate">{runner.trainer ?? "—"}</span>
                <span className="text-sm text-white/60 tabular-nums">{runner.lbs ?? "—"}</span>
                <span className="text-sm text-white/60 tabular-nums">{runner.ofr ?? "—"}</span>
                <span className="font-mono text-xs text-white/60 tracking-wider">{runner.form ?? "—"}</span>
                <FormBar score={runner.form_score} />
              </div>

              {/* Mobile row */}
              <div className="sm:hidden">
                <div className="flex items-start gap-3">
                  <div className="w-7 shrink-0 text-center">
                    <div className="text-base font-bold text-white/60">{runner.number ?? "—"}</div>
                    {runner.draw !== null && (
                      <div className="text-[9px] text-white/30">d{runner.draw}</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">
                        {runner.horse_name}
                      </span>
                      {runner.is_non_runner && (
                        <span className="text-[10px] text-red-400">(NR)</span>
                      )}
                      {runner.headgear && (
                        <span className="text-[10px] text-white/40">{runner.headgear}</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/40">
                      {runner.jockey && <span>{runner.jockey}</span>}
                      {runner.trainer && <span>{runner.trainer}</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/30">
                      {runner.age && <span>{runner.age}yo</span>}
                      {runner.lbs && <span>{runner.lbs}lbs</span>}
                      {runner.ofr && runner.ofr !== "-" && <span>OFR {runner.ofr}</span>}
                      {runner.form && <span className="font-mono">{runner.form}</span>}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <FormBar score={runner.form_score} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {sorted.length === 0 && (
          <div className="px-6 py-8 text-center text-sm text-white/40">
            No runners found for this race.
          </div>
        )}
      </div>
    </div>
  );
}
