import { AppShell } from "@/components/layout/AppShell";
import { MatchesTable } from "@/components/matches/MatchesTable";
import { getPredictions, getMockMatches } from "@/lib/api";
import { mvpToMatch } from "@/lib/transforms";
import type { Match } from "@/lib/types";

export const revalidate = 30;

export default async function MatchesPage() {
  let matches: Match[];

  try {
    const data = await getPredictions({ limit: 100 });
    matches = data.items.map(mvpToMatch);
  } catch {
    matches = getMockMatches();
  }

  return (
    <AppShell
      title="Matches"
      subtitle={`${matches.length} matches`}
    >
      {/* Page header */}
      <div
        style={{
          display:        "flex",
          alignItems:     "baseline",
          justifyContent: "space-between",
          marginBottom:   16,
          paddingBottom:  12,
          borderBottom:   "1px solid var(--border0)",
        }}
      >
        <div>
          <h1
            style={{
              fontSize:   18,
              fontWeight: 600,
              color:      "var(--text0)",
              margin:     0,
              lineHeight: 1.2,
            }}
          >
            Matches
          </h1>
          <p
            style={{
              fontSize:   11,
              color:      "var(--text1)",
              marginTop:  4,
              marginBottom: 0,
            }}
          >
            <span className="num">{matches.length}</span>
            {" "}predictions loaded
          </p>
        </div>
      </div>

      <MatchesTable initialMatches={matches} />
    </AppShell>
  );
}
