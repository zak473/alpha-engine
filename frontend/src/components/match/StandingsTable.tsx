import { cn } from "@/lib/utils";
import type { StandingsResponse } from "@/lib/types";

interface Props {
  standings: StandingsResponse;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
}

export default function StandingsTable({ standings, homeTeamId, awayTeamId }: Props) {
  if (!standings.table || standings.table.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* League header */}
      <div className="flex items-center gap-2">
        {standings.league_logo && (
          <img
            src={standings.league_logo}
            alt={standings.league_name}
            className="w-5 h-5 object-contain"
          />
        )}
        <span className="text-text-muted text-xs font-medium">
          {standings.league_name}
          {standings.season ? ` · ${standings.season}` : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="border-b border-surface-border/40">
              <th className="text-left text-text-subtle font-medium pb-2 w-8">#</th>
              <th className="text-left text-text-subtle font-medium pb-2">Team</th>
              <th className="text-center text-text-subtle font-medium pb-2 w-8">P</th>
              <th className="text-center text-text-subtle font-medium pb-2 w-8">W</th>
              <th className="text-center text-text-subtle font-medium pb-2 w-8">D</th>
              <th className="text-center text-text-subtle font-medium pb-2 w-8">L</th>
              <th className="text-center text-text-subtle font-medium pb-2 w-10">GF</th>
              <th className="text-center text-text-subtle font-medium pb-2 w-10">GA</th>
              <th className="text-center text-text-subtle font-medium pb-2 w-10">GD</th>
              <th className="text-center text-text-subtle font-medium pb-2 w-10 font-bold">Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.table.map((row, i) => {
              const isHome = homeTeamId != null && row.team_id === homeTeamId;
              const isAway = awayTeamId != null && row.team_id === awayTeamId;
              const highlight = isHome || isAway;
              return (
                <tr
                  key={row.team_id ?? i}
                  className={cn(
                    "border-b border-surface-border/20 last:border-0 transition-colors",
                    isHome && "bg-accent-blue/[0.07]",
                    isAway && "bg-amber-500/[0.07]",
                    !highlight && "hover:bg-white/[0.02]"
                  )}
                >
                  <td className={cn("py-1.5 pr-2 font-mono tabular-nums", highlight ? "text-text-primary" : "text-text-subtle")}>
                    {row.position ?? i + 1}
                  </td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1.5">
                      {row.team_logo ? (
                        <img src={row.team_logo} alt={row.team_name} className="w-4 h-4 object-contain shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-sm bg-white/[0.06] flex items-center justify-center text-2xs font-bold text-text-subtle shrink-0">
                          {row.team_name.slice(0, 1)}
                        </div>
                      )}
                      <span className={cn("truncate max-w-[140px]", highlight ? "text-text-primary font-semibold" : "text-text-muted")}>
                        {row.team_name}
                      </span>
                      {isHome && <span className="badge text-2xs bg-accent-blue/20 text-accent-blue border-0 ml-1">H</span>}
                      {isAway && <span className="badge text-2xs bg-amber-500/20 text-amber-400 border-0 ml-1">A</span>}
                    </div>
                  </td>
                  <td className="py-1.5 text-center font-mono tabular-nums text-text-muted">{row.played ?? "—"}</td>
                  <td className="py-1.5 text-center font-mono tabular-nums text-text-muted">{row.won ?? "—"}</td>
                  <td className="py-1.5 text-center font-mono tabular-nums text-text-muted">{row.drawn ?? "—"}</td>
                  <td className="py-1.5 text-center font-mono tabular-nums text-text-muted">{row.lost ?? "—"}</td>
                  <td className="py-1.5 text-center font-mono tabular-nums text-text-muted">{row.goals_for ?? "—"}</td>
                  <td className="py-1.5 text-center font-mono tabular-nums text-text-muted">{row.goals_against ?? "—"}</td>
                  <td className={cn("py-1.5 text-center font-mono tabular-nums", row.goal_diff != null && row.goal_diff > 0 ? "text-green-400" : row.goal_diff != null && row.goal_diff < 0 ? "text-red-400" : "text-text-muted")}>
                    {row.goal_diff != null ? (row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff) : "—"}
                  </td>
                  <td className={cn("py-1.5 text-center font-mono tabular-nums font-bold", highlight ? "text-text-primary" : "text-text-muted")}>
                    {row.points ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
