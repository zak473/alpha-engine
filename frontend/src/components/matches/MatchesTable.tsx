"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, ArrowUpDown, CalendarDays, BrainCircuit } from "lucide-react";
import { formatDate, formatPercent } from "@/lib/utils";
import type { Match } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortField = "scheduled_at" | "confidence" | "competition";
type SortDir = "asc" | "desc";

const SPORTS = [
  { label: "All",        value: "all" },
  { label: "⚽ Soccer",     value: "soccer" },
  { label: "🎾 Tennis",     value: "tennis" },
  { label: "🎮 Esports",    value: "esports" },
  { label: "🏀 Basketball", value: "basketball" },
  { label: "⚾ Baseball",   value: "baseball" },
  { label: "🏒 Hockey",     value: "hockey" },
];

const PAGE_SIZE = 12;

function predictedOutcome(m: Match) {
  if (m.p_home == null || m.p_away == null || m.p_draw == null) return "No model";
  if (m.p_home >= m.p_away && m.p_home >= m.p_draw) return "Home win";
  if (m.p_away > m.p_home && m.p_away > m.p_draw) return "Away win";
  return "Draw";
}

function StatusPill({ status }: { status: string }) {
  if (status === "live") return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#bbf7d0]/60 bg-[#dcfce7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2d7f4f]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] animate-pulse" />
      Live
    </span>
  );
  if (status === "scheduled") return (
    <span className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#dbeafe] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1d4ed8]">
      Upcoming
    </span>
  );
  return (
    <span className="inline-flex items-center rounded-full border border-[#d9e2d7] bg-[#f7f8f5] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#667066]">
      Finished
    </span>
  );
}

function SportPill({ sport }: { sport: string }) {
  const map: Record<string, { bg: string; text: string; border: string; emoji: string }> = {
    soccer:     { bg: "bg-[#dcfce7]", text: "text-[#2d7f4f]", border: "border-[#bbf7d0]", emoji: "⚽" },
    tennis:     { bg: "bg-[#f0fdf4]", text: "text-[#2d7f4f]", border: "border-[#bbf7d0]", emoji: "🎾" },
    esports:    { bg: "bg-[#f5f3ff]", text: "text-[#6d28d9]", border: "border-[#ddd6fe]", emoji: "🎮" },
    basketball: { bg: "bg-[#fef3c7]", text: "text-[#b45309]", border: "border-[#fde68a]", emoji: "🏀" },
    baseball:   { bg: "bg-[#fee2e2]", text: "text-[#b91c1c]", border: "border-[#fecaca]", emoji: "⚾" },
    hockey:     { bg: "bg-[#eff6ff]", text: "text-[#1d4ed8]", border: "border-[#bfdbfe]", emoji: "🏒" },
  };
  const s = map[sport] ?? { bg: "bg-[#f7f8f5]", text: "text-[#667066]", border: "border-[#d9e2d7]", emoji: "🏆" };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", s.bg, s.text, s.border)}>
      {s.emoji} {sport}
    </span>
  );
}

function ConfBar({ conf }: { conf: number }) {
  const pct = Math.round(conf * 100);
  const bg = conf >= 0.7 ? "bg-[#2edb6c]" : conf >= 0.5 ? "bg-[#f59e0b]" : "bg-[#ef4444]";
  const textCol = conf >= 0.7 ? "text-[#2d7f4f]" : conf >= 0.5 ? "text-[#b45309]" : "text-[#dc2626]";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 rounded-full bg-[#e8efe6] overflow-hidden">
        <div className={cn("h-full rounded-full", bg)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("font-mono text-xs font-bold tabular-nums w-8 text-right", textCol)}>{pct}%</span>
    </div>
  );
}

export function MatchesTable({ initialMatches, loading = false }: { initialMatches: Match[]; loading?: boolean }) {
  const [sport, setSport] = useState("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("scheduled_at");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let items = [...initialMatches];
    if (sport !== "all") items = items.filter((m) => m.sport === sport);

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (m) =>
          m.home_name.toLowerCase().includes(q) ||
          m.away_name.toLowerCase().includes(q) ||
          m.competition.toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => {
      const mult = sortDir === "asc" ? 1 : -1;
      if (sortField === "scheduled_at") return mult * (new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
      if (sortField === "confidence") return mult * ((a.confidence ?? 0) - (b.confidence ?? 0));
      return mult * a.competition.localeCompare(b.competition);
    });

    return items;
  }, [initialMatches, search, sortDir, sortField, sport]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const liveCount = initialMatches.filter((m) => m.status === "live").length;

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
    setPage(1);
  }

  return (
    <div className="grid gap-6 pb-10">
      {/* Filter bar */}
      <div className="overflow-hidden rounded-[28px] border border-[#d9e2d7] bg-white p-5 shadow-[0_4px_20px_rgba(17,19,21,0.05)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          {/* Sport pills */}
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((item) => {
              const active = sport === item.value;
              return (
                <button
                  key={item.value}
                  onClick={() => { setSport(item.value); setPage(1); }}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-semibold transition",
                    active
                      ? "border-[#bbf7d0] bg-[#dcfce7] text-[#2d7f4f]"
                      : "border-[#d9e2d7] bg-[#f7f8f5] text-[#667066] hover:text-[#111315]"
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Search + sort */}
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative min-w-[260px]">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7b857b]" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search teams or leagues"
                className="h-11 w-full rounded-full border border-[#d9e2d7] bg-[#f7f8f5] pl-10 pr-4 text-sm text-[#111315] placeholder:text-[#7b857b] outline-none transition focus:border-[#2edb6c] focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-2 rounded-full border border-[#d9e2d7] bg-[#f7f8f5] px-3 py-2 text-sm text-[#667066]">
              <SlidersHorizontal size={15} />
              <button onClick={() => toggleSort("scheduled_at")} className={cn("rounded-full px-3 py-1 text-sm font-semibold transition", sortField === "scheduled_at" && "bg-[#111315] text-white")}>
                Time
              </button>
              <button onClick={() => toggleSort("competition")} className={cn("rounded-full px-3 py-1 text-sm font-semibold transition", sortField === "competition" && "bg-[#111315] text-white")}>
                League
              </button>
              <button onClick={() => toggleSort("confidence")} className={cn("rounded-full px-3 py-1 text-sm font-semibold transition", sortField === "confidence" && "bg-[#111315] text-white")}>
                Confidence
              </button>
              <ArrowUpDown size={14} className="text-[#7b857b]" />
            </div>
          </div>
        </div>

        {/* Results count */}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-[#667066]">
            Showing <span className="font-semibold text-[#111315]">{filtered.length}</span> matches
            {liveCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[#bbf7d0] bg-[#dcfce7] px-2 py-0.5 text-[10px] font-semibold text-[#2d7f4f]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                {liveCount} live
              </span>
            )}
          </p>
          <p className="text-sm text-[#667066]">Page {page} of {totalPages}</p>
        </div>
      </div>

      {/* Match cards grid */}
      {!loading && paginated.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-[24px] border border-[#d9e2d7] bg-[#f7f8f5]">
            <BrainCircuit size={28} className="text-[#2d7f4f]" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-[#111315]">No matches found</p>
            <p className="mt-1 text-sm text-[#667066] max-w-xs">Try a different sport filter or broaden your search.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paginated.map((match) => (
            <button
              key={match.id}
              onClick={() => (window.location.href = `/sports/${match.sport}/matches/${match.id}`)}
              className="group block overflow-hidden rounded-[28px] border border-[#d9e2d7] bg-white text-left shadow-[0_4px_20px_rgba(17,19,21,0.05)] transition hover:border-[#b8d4c0] hover:shadow-[0_8px_30px_rgba(17,19,21,0.1)] hover:-translate-y-0.5"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b border-[#edf2ea] px-5 py-3">
                <SportPill sport={match.sport} />
                <div className="flex items-center gap-2">
                  <StatusPill status={match.status} />
                </div>
              </div>

              {/* Teams */}
              <div className="px-5 py-4">
                <p className="font-semibold text-[#111315] leading-tight">{match.home_name}</p>
                <p className="mt-1 text-xs text-[#7b857b]">vs</p>
                <p className="mt-0.5 font-semibold text-[#111315] leading-tight">{match.away_name}</p>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-3 gap-2 px-5 pb-4">
                <div className="rounded-[16px] border border-[#edf2ea] bg-[#f7f8f5] p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[#7b857b]">League</div>
                  <div className="mt-1.5 line-clamp-2 text-xs font-medium text-[#111315]">{match.competition}</div>
                </div>
                <div className="rounded-[16px] border border-[#edf2ea] bg-[#f7f8f5] p-3">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-[#7b857b]">
                    <CalendarDays size={10} /> Start
                  </div>
                  <div className="mt-1.5 text-xs font-medium text-[#111315]">{formatDate(match.scheduled_at, "long")}</div>
                </div>
                <div className="rounded-[16px] border border-[#edf2ea] bg-[#f7f8f5] p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[#7b857b]">Model lean</div>
                  <div className="mt-1.5 text-xs font-semibold text-[#111315]">{predictedOutcome(match)}</div>
                </div>
              </div>

              {/* Confidence footer */}
              {match.confidence != null && (
                <div className="flex items-center gap-3 border-t border-[#edf2ea] px-5 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7b857b]">Confidence</span>
                  <ConfBar conf={match.confidence / 100} />
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 border-t border-[#d9e2d7] pt-4 text-sm text-[#667066]">
          <div>{filtered.length} total · page {page} of {totalPages}</div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="inline-flex items-center gap-2 rounded-full border border-[#d9e2d7] bg-white px-4 py-2 text-[#667066] transition hover:border-[#b8d4c0] disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-2 rounded-full border border-[#d9e2d7] bg-white px-4 py-2 text-[#667066] transition hover:border-[#b8d4c0] disabled:opacity-40"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
