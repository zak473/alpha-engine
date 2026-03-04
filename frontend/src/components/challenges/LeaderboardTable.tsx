import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { LeaderboardOut } from "@/lib/types";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

type BadgeVariant = "muted" | "positive" | "negative" | "warning";

interface Props {
  data: LeaderboardOut;
}

const RANK_COLORS: Record<number, string> = {
  1: "text-accent-amber",
  2: "text-zinc-300",
  3: "text-amber-700",
};

function shortId(userId: string) {
  // Display friendly label: strip "user-" prefix if present
  return userId.startsWith("user-") ? userId.slice(5) : userId;
}

function formatScore(score: number, scoringType: "brier" | "points") {
  if (scoringType === "brier") return score.toFixed(4);
  return score.toFixed(0);
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function LeaderboardTable({ data }: Props) {
  if (data.rows.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="No scores yet"
        description="Entries will appear here once events are settled."
      />
    );
  }

  const isBrier = data.scoring_type === "brier";

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-surface-overlay">
          <TableRow>
            <TableHead className="w-14 text-right">#</TableHead>
            <TableHead>User</TableHead>
            <TableHead className="text-right tabular-nums">
              {isBrier ? "Avg score" : "Points"}
            </TableHead>
            {isBrier && (
              <TableHead className="text-right tabular-nums">Accuracy</TableHead>
            )}
            <TableHead className="text-right tabular-nums">Entries</TableHead>
            <TableHead className="text-right">Last pick</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={row.user_id} className="tr-hover">
              <TableCell className="text-right">
                <span className={cn("font-mono font-semibold text-sm", RANK_COLORS[row.rank] ?? "text-text-muted")}>
                  {row.rank}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-xs font-medium text-accent-blue uppercase">
                    {shortId(row.user_id).charAt(0)}
                  </span>
                  <span className="text-sm font-medium text-text-primary">{shortId(row.user_id)}</span>
                  {row.rank === 1 && (
                    <Badge variant="warning">Leader</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums font-mono text-sm">
                {formatScore(row.score, data.scoring_type)}
              </TableCell>
              {isBrier && (
                <TableCell className="text-right tabular-nums font-mono text-sm">
                  {row.accuracy_score != null
                    ? `${(row.accuracy_score * 100).toFixed(1)}%`
                    : "—"}
                </TableCell>
              )}
              <TableCell className="text-right tabular-nums text-sm text-text-muted">
                {row.entry_count}
              </TableCell>
              <TableCell className="text-right text-sm text-text-muted">
                {formatDate(row.last_activity)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
