"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, ArrowUpDown, CalendarDays, Sparkles } from "lucide-react";
import { formatDate, formatPercent } from "@/lib/utils";
import type { Match } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortField = "scheduled_at" | "confidence" | "competition";
type SortDir = "asc" | "desc";

const SPORTS = [
  { label: "All", value: "all" },
  { label: "Soccer", value: "soccer" },
  { label: "Tennis", value: "tennis" },
  { label: "Esports", value: "esports" },
  { label: "Basketball", value: "basketball" },
  { label: "Baseball", value: "baseball" },
  { label: "Hockey", value: "hockey" },
];

const PAGE_SIZE = 12;

function predictedOutcome(m: Match) {
  if (m.p_home == null || m.p_away == null || m.p_draw == null) return "No model";
  if (m.p_home >= m.p_away && m.p_home >= m.p_draw) return "Home win";
  if (m.p_away > m.p_home && m.p_away > m.p_draw) return "Away win";
  return "Draw";
}

function outcomeTone(status: Match["status"]) {
  if (status === "live") return "text-emerald-300 border-emerald-300/20 bg-emerald-300/10";
  if (status === "finished") return "text-white/60 border-white/10 bg-white/[0.05]";
  return "text-sky-200 border-sky-300/15 bg-sky-300/10";
}

function sportTone(sport: string) {
  switch (sport) {
    case "soccer":
      return "bg-emerald-300/10 text-emerald-200 border-emerald-300/20";
    case "tennis":
      return "bg-lime-300/10 text-lime-200 border-lime-300/20";
    case "esports":
      return "bg-violet-300/10 text-violet-200 border-violet-300/20";
    case "basketball":
      return "bg-amber-300/10 text-amber-200 border-amber-300/20";
    case "baseball":
      return "bg-rose-300/10 text-rose-200 border-rose-300/20";
    default:
      return "bg-cyan-300/10 text-cyan-200 border-cyan-300/20";
  }
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
  }, [initialMatches, page, search, sortDir, sortField, sport]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const liveCount = initialMatches.filter((m) => m.status === "live").length;
  const avgConfidence = Math.round(
    (initialMatches.filter((m) => m.confidence != null).reduce((sum, m) => sum + (m.confidence ?? 0), 0) /
      Math.max(1, initialMatches.filter((m) => m.confidence != null).length))
  );

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  }

  return (
    <div className="grid gap-6 pb-10">
      <section className="overflow-hidden rounded-[30px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(54,242,143,0.10),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-5 shadow-[0_26px_70px_rgba(0,0,0,0.24)] lg:p-6">
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/16 bg-emerald-300/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
              <Sparkles size={12} />
              Market board redesign
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-white lg:text-[2.75rem]">Turn the cluttered table into a board you can actually scan.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/58">
              Match cards now carry the key decision data first: matchup, time, model lean, confidence, and live state. The heavy spreadsheet feel stays available further down.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-white/8 bg-white/[0.05] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Active markets</div>
              <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">{initialMatches.length}</div>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-white/[0.05] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Live right now</div>
              <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">{liveCount}</div>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-white/[0.05] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Avg confidence</div>
              <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">{Number.isFinite(avgConfidence) ? `${avgConfidence}%` : "—"}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,21,16,0.96),rgba(8,18,14,0.96))] p-4 lg:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((item) => {
              const active = sport === item.value;
              return (
                <button
                  key={item.value}
                  onClick={() => {
                    setSport(item.value);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition",
                    active ? "border-emerald-300/20 bg-emerald-300/12 text-emerald-200" : "border-white/8 bg-white/[0.03] text-white/55 hover:text-white"
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative min-w-[260px]">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search teams or leagues"
                className="h-11 w-full rounded-full border border-white/8 bg-white/[0.04] pl-10 pr-4 text-sm text-white placeholder:text-white/28 outline-none transition focus:border-emerald-300/25"
              />
            </div>

            <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 py-2 text-sm text-white/65">
              <SlidersHorizontal size={15} />
              <button onClick={() => toggleSort("scheduled_at")} className={cn("rounded-full px-3 py-1", sortField === "scheduled_at" && "bg-white/[0.08] text-white")}>
                Time
              </button>
              <button onClick={() => toggleSort("competition")} className={cn("rounded-full px-3 py-1", sortField === "competition" && "bg-white/[0.08] text-white")}>
                League
              </button>
              <button onClick={() => toggleSort("confidence")} className={cn("rounded-full px-3 py-1", sortField === "confidence" && "bg-white/[0.08] text-white")}>
                Confidence
              </button>
              <div className="text-white/32">
                <ArrowUpDown size={14} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {paginated.map((match) => (
            <button
              key={match.id}
              onClick={() => (window.location.href = `/sports/${match.sport}/matches/${match.id}`)}
              className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300/20"
            >
              <div className="flex items-center justify-between gap-3">
                <div className={cn("rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]", sportTone(match.sport))}>{match.sport}</div>
                <div className={cn("rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]", outcomeTone(match.status))}>{match.status}</div>
              </div>

              <div className="mt-4">
                <div className="text-lg font-semibold tracking-[-0.03em] text-white">{match.home_name}</div>
                <div className="mt-1 text-sm text-white/32">vs</div>
                <div className="text-lg font-semibold tracking-[-0.03em] text-white">{match.away_name}</div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] border border-white/8 bg-black/15 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">League</div>
                  <div className="mt-2 line-clamp-2 text-sm text-white/72">{match.competition}</div>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-black/15 p-3">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/35">
                    <CalendarDays size={12} />
                    Start
                  </div>
                  <div className="mt-2 text-sm text-white/72">{formatDate(match.scheduled_at, "long")}</div>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-black/15 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Model lean</div>
                  <div className="mt-2 text-sm font-medium text-white">{predictedOutcome(match)}</div>
                  <div className="mt-1 text-xs text-emerald-200">{match.confidence != null ? formatPercent(match.confidence / 100) : "No confidence"}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {!loading && paginated.length === 0 && (
          <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-10 text-center">
            <div className="text-xl font-semibold text-white">No matches found</div>
            <div className="mt-2 text-sm text-white/50">Try a different sport filter or broaden your search.</div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/8 pt-4 text-sm text-white/50">
          <div>{filtered.length} total results · page {page} of {totalPages}</div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-4 py-2 text-white/70 transition disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-4 py-2 text-white/70 transition disabled:opacity-40"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
