"use client";

import { useMemo, useState } from "react";
import { Search, ArrowUpDown, CalendarDays } from "lucide-react";
import type { Match } from "@/lib/types";
import { cn, formatDate, formatPercent } from "@/lib/utils";

type SortField = "scheduled_at" | "confidence" | "competition";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "live" | "scheduled" | "finished";

const SPORTS = [
  { label: "All sports", value: "all" },
  { label: "⚽ Soccer", value: "soccer" },
  { label: "🎾 Tennis", value: "tennis" },
  { label: "🎮 Esports", value: "esports" },
  { label: "🏀 Basketball", value: "basketball" },
  { label: "⚾ Baseball", value: "baseball" },
  { label: "🏒 Hockey", value: "hockey" },
] as const;

const STATUSES = [
  { label: "All", value: "all" },
  { label: "Upcoming", value: "scheduled" },
  { label: "Live", value: "live" },
  { label: "Finished", value: "finished" },
] as const;

const PAGE_SIZE = 20;

function predictedOutcome(m: Match) {
  if (m.p_home == null || m.p_away == null || m.p_draw == null) return "No model";
  if (m.p_home >= m.p_away && m.p_home >= m.p_draw) return "Home win";
  if (m.p_away > m.p_home && m.p_away > m.p_draw) return "Away win";
  return "Draw";
}

function statusTone(status: Match["status"]) {
  if (status === "live") return "border-emerald-300/20 bg-emerald-300/10 text-emerald-300";
  if (status === "finished") return "border-white/8 bg-white/[0.04] text-white/52";
  return "border-sky-300/20 bg-sky-300/10 text-sky-200";
}

function confidenceTone(confidence: number | null | undefined) {
  if (confidence == null) return "text-white/40";
  if (confidence >= 70) return "text-emerald-300";
  if (confidence >= 50) return "text-amber-300";
  return "text-red-300";
}

function sortButton(active: boolean) {
  return cn(
    "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all",
    active ? "bg-[#2edb6c] text-[#07110d]" : "text-white/55 hover:bg-white/[0.06] hover:text-white"
  );
}

export function MatchesTable({ initialMatches }: { initialMatches: Match[]; loading?: boolean }) {
  const [sport, setSport] = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("scheduled_at");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let items = [...initialMatches];

    if (sport !== "all") items = items.filter((m) => m.sport === sport);
    if (status !== "all") items = items.filter((m) => m.status === status);

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((m) =>
        [m.home_name, m.away_name, m.competition, m.sport].join(" ").toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => {
      const mult = sortDir === "asc" ? 1 : -1;
      if (sortField === "scheduled_at") return mult * (new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
      if (sortField === "confidence") return mult * ((a.confidence ?? 0) - (b.confidence ?? 0));
      return mult * a.competition.localeCompare(b.competition);
    });

    return items;
  }, [initialMatches, search, sortDir, sortField, sport, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const liveCount = initialMatches.filter((m) => m.status === "live").length;

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  }

  return (
    <div className="space-y-5 pb-10">
      <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-max items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] p-1.5">
              {SPORTS.map((item) => (
                <button
                  key={item.value}
                  onClick={() => {
                    setSport(item.value);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all",
                    sport === item.value
                      ? "bg-[#2edb6c] text-[#07110d]"
                      : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex min-w-max items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] p-1.5">
              {STATUSES.map((item) => (
                <button
                  key={item.value}
                  onClick={() => {
                    setStatus(item.value);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all",
                    status === item.value
                      ? "bg-[#2edb6c] text-[#07110d]"
                      : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-sm">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search matches, teams, or leagues"
                className="h-11 w-full rounded-full border border-white/8 bg-white/[0.04] pl-10 pr-4 text-sm text-white placeholder:text-white/28 outline-none transition focus:border-emerald-300/25"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-white/55">
              <button onClick={() => toggleSort("scheduled_at")} className={sortButton(sortField === "scheduled_at")}>Time</button>
              <button onClick={() => toggleSort("competition")} className={sortButton(sortField === "competition")}>League</button>
              <button onClick={() => toggleSort("confidence")} className={sortButton(sortField === "confidence")}>Confidence</button>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-white/40">
                <ArrowUpDown size={14} />
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="px-1 text-sm text-white/62">
        Showing <span className="font-semibold text-white">{filtered.length}</span> matches
        {liveCount > 0 && <span className="ml-3 text-emerald-300">• {liveCount} live</span>}
      </div>

      <section className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left">
            <thead className="border-b border-white/8 bg-white/[0.03]">
              <tr className="text-[11px] uppercase tracking-[0.18em] text-white/38">
                <th className="px-4 py-3 font-semibold">Sport</th>
                <th className="px-4 py-3 font-semibold">Match</th>
                <th className="px-4 py-3 font-semibold">League</th>
                <th className="px-4 py-3 font-semibold">Start</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Confidence</th>
                <th className="px-4 py-3 font-semibold">Prediction</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center text-sm text-white/50">
                    No matches found for the current filters.
                  </td>
                </tr>
              ) : (
                paginated.map((match) => (
                  <tr
                    key={match.id}
                    onClick={() => (window.location.href = `/sports/${match.sport}/matches/${match.id}`)}
                    className="cursor-pointer border-b border-white/8 text-sm transition hover:bg-white/[0.04]"
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/58">
                        {match.sport}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{match.home_name}</div>
                      <div className="mt-1 text-white/40">vs {match.away_name}</div>
                    </td>
                    <td className="px-4 py-3 text-white/64">{match.competition}</td>
                    <td className="px-4 py-3 text-white/58">
                      <div className="inline-flex items-center gap-2">
                        <CalendarDays size={13} className="text-white/32" />
                        {formatDate(match.scheduled_at, "long")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]", statusTone(match.status))}>
                        {match.status}
                      </span>
                    </td>
                    <td className={cn("px-4 py-3 text-right font-mono font-semibold", confidenceTone(match.confidence))}>
                      {match.confidence != null ? formatPercent(match.confidence / 100) : "—"}
                    </td>
                    <td className="px-4 py-3 text-white/78">{predictedOutcome(match)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 px-1 text-sm text-white/58">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-full border border-white/8 bg-white/[0.04] px-4 py-2 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="px-2 text-white/72">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-full border border-white/8 bg-white/[0.04] px-4 py-2 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
