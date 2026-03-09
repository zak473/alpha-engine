import { AppShell } from "@/components/layout/AppShell";
import { MatchesTable } from "@/components/matches/MatchesTable";
import { getPredictions } from "@/lib/api";
import { mvpToMatch } from "@/lib/transforms";
import type { Match } from "@/lib/types";

export const revalidate = 30;

export default async function MatchesPage() {
  let matches: Match[];

  try {
    const data = await getPredictions({ limit: 100 });
    matches = data.items.map(mvpToMatch);
  } catch {
    matches = [];
  }

  return (
    <AppShell
      title="Market Board"
      subtitle={`${matches.length} matches across your betting board`}
    >
      <MatchesTable initialMatches={matches} />
    </AppShell>
  );
}
