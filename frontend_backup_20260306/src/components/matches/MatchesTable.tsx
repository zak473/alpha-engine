"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlignJustify, List, Search, ChevronUp, ChevronDown, Inbox } from "lucide-react";
import { Badge, StatusBadge, OutcomeBadge } from "@/components/ui/Badge";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { formatDate, formatPercent, cn } from "@/lib/utils";
import type { Match } from "@/lib/types";

type SortField = "scheduled_at" | "confidence" | "competition";
type SortDir   = "asc" | "desc";
type Density   = "normal" | "compact";

const SPORTS = [
  { label: "All",     value: "all" },
  { label: "Soccer",  value: "soccer" },
  { label: "Tennis",  value: "tennis" },
  { label: "Esports", value: "esports" },
];

const PAGE_SIZE = 20;

interface MatchesTableProps {
  initialMatches: Match[];
  loading?: boolean;
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) {
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 0, opacity: 0.3, marginLeft: 3 }}>
        <ChevronUp  size={8} />
        <ChevronDown size={8} />
      </span>
    );
  }
  return sortDir === "asc"
    ? <ChevronUp   size={10} style={{ marginLeft: 3, color: "var(--accent)" }} />
    : <ChevronDown size={10} style={{ marginLeft: 3, color: "var(--accent)" }} />;
}

function ConfidenceCell({ value }: { value: number | null | undefined }) {
  if (value == null) {
    return <span style={{ color: "var(--text2)" }}>—</span>;
  }
  const color =
    value >= 70 ? "var(--positive)" :
    value >= 50 ? "var(--warning)"  :
                  "var(--negative)";
  return (
    <span className="num" style={{ color, fontSize: 12 }}>
      {formatPercent(value / 100)}
    </span>
  );
}

export function MatchesTable({ initialMatches, loading = false }: MatchesTableProps) {
  const router  = useRouter();
  const [sport,     setSport]     = useState("all");
  const [search,    setSearch]    = useState("");
  const [sortField, setSortField] = useState<SortField>("scheduled_at");
  const [sortDir,   setSortDir]   = useState<SortDir>("asc");
  const [page,      setPage]      = useState(1);
  const [density,   setDensity]   = useState<Density>("normal");

  const filtered = useMemo(() => {
    let items = initialMatches;

    if (sport !== "all") {
      items = items.filter((m) => m.sport === sport);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (m) =>
          m.home_name.toLowerCase().includes(q) ||
          m.away_name.toLowerCase().includes(q) ||
          m.competition.toLowerCase().includes(q)
      );
    }

    items = [...items].sort((a, b) => {
      const mult = sortDir === "asc" ? 1 : -1;
      if (sortField === "scheduled_at") {
        return mult * (new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
      }
      if (sortField === "confidence") {
        return mult * ((a.confidence ?? 0) - (b.confidence ?? 0));
      }
      return mult * a.competition.localeCompare(b.competition);
    });

    return items;
  }, [initialMatches, sport, search, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  }

  function handleSportChange(value: string) {
    setSport(value);
    setPage(1);
  }

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  const isCompact = density === "compact";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── Controls bar ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>

        {/* Sport filter chips */}
        <div style={{ display: "flex", gap: 4 }}>
          {SPORTS.map((s) => {
            const active = sport === s.value;
            return (
              <button
                key={s.value}
                onClick={() => handleSportChange(s.value)}
                style={{
                  padding:         "3px 10px",
                  fontSize:        11,
                  fontWeight:      500,
                  borderRadius:    "var(--radius-sm)",
                  border:          `1px solid ${active ? "var(--accent)" : "var(--border0)"}`,
                  background:      active ? "var(--accent-muted)" : "transparent",
                  color:           active ? "var(--accent)" : "var(--text1)",
                  cursor:          "pointer",
                  transition:      "all 120ms",
                  letterSpacing:   "0.03em",
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Density toggle */}
          <div
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          2,
              background:   "var(--bg2)",
              border:       "1px solid var(--border0)",
              borderRadius: "var(--radius-md)",
              padding:      2,
            }}
          >
            {(["normal", "compact"] as Density[]).map((d) => {
              const active = density === d;
              return (
                <button
                  key={d}
                  onClick={() => setDensity(d)}
                  title={d === "normal" ? "Comfortable" : "Compact"}
                  style={{
                    display:      "flex",
                    alignItems:   "center",
                    justifyContent: "center",
                    width:        26,
                    height:       22,
                    borderRadius: "var(--radius-sm)",
                    border:       "none",
                    background:   active ? "var(--border1)" : "transparent",
                    color:        active ? "var(--text0)" : "var(--text1)",
                    cursor:       "pointer",
                    transition:   "all 120ms",
                  }}
                >
                  {d === "normal" ? <AlignJustify size={12} /> : <List size={12} />}
                </button>
              );
            })}
          </div>

          {/* Search input */}
          <div style={{ position: "relative" }}>
            <Search
              size={12}
              style={{
                position:  "absolute",
                left:      9,
                top:       "50%",
                transform: "translateY(-50%)",
                color:     "var(--text2)",
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              placeholder="Search teams, competitions..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="input-field"
              style={{ paddingLeft: 28, width: 240, fontSize: 12 }}
            />
          </div>
        </div>
      </div>

      {/* ── Table card ───────────────────────────────────────────────── */}
      <div className="card" style={{ overflow: "hidden" }}>

        {loading ? (
          <div style={{ padding: 12 }}>
            <SkeletonTable rows={8} cols={8} />
          </div>
        ) : paginated.length === 0 ? (
          /* Empty state */
          <div
            style={{
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              justifyContent: "center",
              gap:            8,
              padding:        "48px 24px",
              color:          "var(--text1)",
            }}
          >
            <Inbox size={28} style={{ color: "var(--text2)" }} />
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", margin: 0 }}>No matches found</p>
            <p style={{ fontSize: 11, color: "var(--text2)", margin: 0 }}>Try adjusting your sport filter or search query.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className={cn("data-table", isCompact && "compact")}>
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Sport</th>
                  <th>Match</th>
                  <th
                    onClick={() => handleSort("competition")}
                    style={{ cursor: "pointer" }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center" }}>
                      League
                      <SortIcon field="competition" sortField={sortField} sortDir={sortDir} />
                    </span>
                  </th>
                  <th
                    className="col-right"
                    onClick={() => handleSort("scheduled_at")}
                    style={{ cursor: "pointer" }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", width: "100%" }}>
                      Start Time
                      <SortIcon field="scheduled_at" sortField={sortField} sortDir={sortDir} />
                    </span>
                  </th>
                  <th style={{ width: 90 }}>Status</th>
                  <th
                    className="col-right"
                    onClick={() => handleSort("confidence")}
                    style={{ cursor: "pointer", width: 100 }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", width: "100%" }}>
                      Confidence
                      <SortIcon field="confidence" sortField={sortField} sortDir={sortDir} />
                    </span>
                  </th>
                  <th>Prediction</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((m) => (
                  <tr
                    key={m.id}
                    className="tr-hover"
                    onClick={() => window.open(`/sports/${m.sport}/matches/${m.id}`, "_blank")}
                  >
                    {/* Sport */}
                    <td>
                      <Badge sport={m.sport}>{m.sport}</Badge>
                    </td>

                    {/* Match */}
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text0)" }}>
                          {m.home_name}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--text2)", fontWeight: 400 }}>vs</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text0)" }}>
                          {m.away_name}
                        </span>
                      </span>
                    </td>

                    {/* League */}
                    <td style={{ color: "var(--text1)", fontSize: 12 }}>
                      {m.competition}
                    </td>

                    {/* Start Time */}
                    <td className="col-right num" style={{ fontSize: 11, color: "var(--text1)" }}>
                      {formatDate(m.scheduled_at, "long")}
                    </td>

                    {/* Status */}
                    <td>
                      <StatusBadge status={m.status} />
                    </td>

                    {/* Confidence */}
                    <td className="col-right">
                      <ConfidenceCell value={m.confidence} />
                    </td>

                    {/* Prediction */}
                    <td>
                      {m.p_home != null && m.p_draw != null && m.p_away != null ? (
                        <span style={{ fontSize: 11, color: "var(--text1)" }}>
                          {m.p_home >= m.p_draw && m.p_home >= m.p_away
                            ? "Home Win"
                            : m.p_away > m.p_home && m.p_away > m.p_draw
                            ? "Away Win"
                            : "Draw"}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text2)", fontSize: 11 }}>—</span>
                      )}
                    </td>

                    {/* Outcome */}
                    <td>
                      <OutcomeBadge outcome={m.outcome} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            fontSize:       11,
            color:          "var(--text1)",
          }}
        >
          <span className="num">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            <span style={{ color: "var(--text2)", margin: "0 4px" }}>·</span>
            page {page} of {totalPages}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className="btn btn-ghost btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
