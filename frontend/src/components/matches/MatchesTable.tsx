"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlignJustify, List, Search } from "lucide-react";
import { StateTabs } from "@/components/ui/Tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { PanelCard } from "@/components/ui/PanelCard";
import { formatDate, formatPercent, cn } from "@/lib/utils";
import type { Match } from "@/lib/types";
import { Inbox } from "lucide-react";

type SortField = "scheduled_at" | "confidence" | "competition";
type SortDir = "asc" | "desc";
type Density = "normal" | "compact";

const SPORTS = [
  { label: "All",     value: "all" },
  { label: "Soccer",  value: "soccer" },
  { label: "Tennis",  value: "tennis" },
  { label: "Esports", value: "esports" },
];

const PAGE_SIZE = 20;

interface MatchesTableProps {
  initialMatches: Match[];
}

export function MatchesTable({ initialMatches }: MatchesTableProps) {
  const [sport, setSport] = useState("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("scheduled_at");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [density, setDensity] = useState<Density>("normal");

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
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <StateTabs items={SPORTS} value={sport} onChange={handleSportChange} />
        <div className="flex items-center gap-2">
          {/* Density toggle */}
          <div className="flex items-center gap-0.5 border border-surface-border rounded-md p-0.5">
            <button
              onClick={() => setDensity("normal")}
              className={cn(
                "p-1.5 rounded transition-colors",
                density === "normal"
                  ? "bg-white/[0.08] text-text-primary"
                  : "text-text-subtle hover:text-text-muted"
              )}
              title="Comfortable"
            >
              <AlignJustify size={13} />
            </button>
            <button
              onClick={() => setDensity("compact")}
              className={cn(
                "p-1.5 rounded transition-colors",
                density === "compact"
                  ? "bg-white/[0.08] text-text-primary"
                  : "text-text-subtle hover:text-text-muted"
              )}
              title="Compact"
            >
              <List size={13} />
            </button>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-subtle pointer-events-none" />
            <input
              type="search"
              placeholder="Search teams, competitions..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className={cn(
                "pl-8 pr-3 py-1.5 text-sm rounded-md w-64",
                "bg-surface-overlay border border-surface-border",
                "text-text-primary placeholder:text-text-subtle",
                "focus:outline-none focus:border-accent-blue/50 transition-colors"
              )}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <PanelCard padding="flush">
        {paginated.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No matches found"
            description="Try adjusting your sport filter or search query."
          />
        ) : (
          <Table density={density}>
            <TableHead>
              <tr>
                <TableHeader>Sport</TableHeader>
                <TableHeader>Match</TableHeader>
                <TableHeader
                  sortable
                  sortDir={sortField === "competition" ? sortDir : null}
                  onSort={() => handleSort("competition")}
                >
                  Competition
                </TableHeader>
                <TableHeader
                  numeric
                  sortable
                  sortDir={sortField === "scheduled_at" ? sortDir : null}
                  onSort={() => handleSort("scheduled_at")}
                >
                  Date
                </TableHeader>
                <TableHeader
                  numeric
                  sortable
                  sortDir={sortField === "confidence" ? sortDir : null}
                  onSort={() => handleSort("confidence")}
                >
                  Confidence
                </TableHeader>
                <TableHeader>Status</TableHeader>
              </tr>
            </TableHead>
            <TableBody>
              {paginated.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Badge sport={m.sport}>{m.sport}</Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/matches/${m.id}`}
                      className="hover:text-accent-blue transition-colors"
                    >
                      <span className="font-medium">{m.home_name}</span>
                      <span className="text-text-muted mx-1.5">vs</span>
                      <span className="font-medium">{m.away_name}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-text-muted">{m.competition}</TableCell>
                  <TableCell numeric>{formatDate(m.scheduled_at, "long")}</TableCell>
                  <TableCell numeric>
                    {m.confidence != null ? (
                      <span
                        className={
                          m.confidence >= 70
                            ? "text-accent-green"
                            : m.confidence >= 50
                            ? "text-accent-amber"
                            : "text-text-muted"
                        }
                      >
                        {formatPercent(m.confidence)}
                      </span>
                    ) : (
                      <span className="text-text-subtle">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={m.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PanelCard>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>
            {filtered.length} result{filtered.length !== 1 ? "s" : ""} ·{" "}
            page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
