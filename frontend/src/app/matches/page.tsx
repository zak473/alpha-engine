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
    <AppShell title="Matches" subtitle={`${matches.length} matches`}>
      <MatchesTable initialMatches={matches} />
    </AppShell>
  );
}
