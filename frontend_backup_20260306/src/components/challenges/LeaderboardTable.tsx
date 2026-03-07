import { EmptyState } from "@/components/ui/EmptyState";
import type { LeaderboardOut } from "@/lib/types";
import { Trophy } from "lucide-react";

interface Props {
  data: LeaderboardOut;
}

// rank → color token
const RANK_COLOR: Record<number, string> = {
  1: "var(--accent)",
  2: "var(--positive)",
  3: "var(--warning)",
};

function shortId(userId: string) {
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
      <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "var(--text2)" }}>
        <Trophy size={28} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>No scores yet</div>
        <div style={{ fontSize: 11 }}>Entries will appear here once events are settled.</div>
      </div>
    );
  }

  const isBrier = data.scoring_type === "brier";

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th className="col-right" style={{ width: 48 }}>#</th>
            <th>User</th>
            <th className="col-right">{isBrier ? "Avg Score" : "Points"}</th>
            {isBrier && <th className="col-right">Accuracy</th>}
            <th className="col-right">Entries</th>
            <th className="col-right">Last Pick</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const rankColor = RANK_COLOR[row.rank] ?? "var(--text2)";
            const initial = shortId(row.user_id).charAt(0).toUpperCase();
            return (
              <tr key={row.user_id} className="tr-hover">
                {/* Rank */}
                <td className="col-right">
                  <span className="num" style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: rankColor,
                  }}>
                    {row.rank}
                  </span>
                </td>

                {/* User */}
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Avatar circle */}
                    <span style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: `color-mix(in srgb, ${rankColor} 12%, var(--bg2))`,
                      border: `1px solid color-mix(in srgb, ${rankColor} 30%, transparent)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: rankColor,
                      flexShrink: 0,
                    }}>
                      {initial}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text0)" }}>
                      {shortId(row.user_id)}
                    </span>
                    {row.rank === 1 && (
                      <span className="badge badge-warning" style={{ fontSize: 10 }}>Leader</span>
                    )}
                  </div>
                </td>

                {/* Score */}
                <td className="col-right num" style={{ fontSize: 12, color: "var(--text0)", fontWeight: 600 }}>
                  {formatScore(row.score, data.scoring_type)}
                </td>

                {/* Accuracy (brier only) */}
                {isBrier && (
                  <td className="col-right num" style={{ fontSize: 12, color: "var(--text1)" }}>
                    {row.accuracy_score != null
                      ? `${(row.accuracy_score * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                )}

                {/* Entries */}
                <td className="col-right num" style={{ fontSize: 12, color: "var(--text2)" }}>
                  {row.entry_count}
                </td>

                {/* Last pick */}
                <td className="col-right" style={{ fontSize: 11, color: "var(--text2)" }}>
                  {formatDate(row.last_activity)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
