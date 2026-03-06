import { AppShell } from "@/components/layout/AppShell";
import { BettingDashboard } from "@/components/betting/BettingDashboard";
import { getSportMatches, type SportSlug } from "@/lib/api";
import { adaptToMatchCard } from "@/lib/betting-adapters";
import type { BettingMatch } from "@/lib/betting-types";

export const revalidate = 30;

const SPORTS: SportSlug[] = ["soccer", "basketball", "tennis", "esports", "baseball"];

export default async function DashboardPage() {
  // Fetch matches from all sports in parallel
  const results = await Promise.allSettled(
    SPORTS.map((sport) =>
      getSportMatches(sport, { limit: 50 })
        .then((res) => res.items.map((item) => adaptToMatchCard(item, sport)))
    )
  );

  // Flatten all matches
  const allMatches: BettingMatch[] = results
    .filter((r): r is PromiseFulfilledResult<BettingMatch[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  // Sort: live first, then by edge, then by start time
  const sorted = [...allMatches].sort((a, b) => {
    if (a.status === "live" && b.status !== "live") return -1;
    if (b.status === "live" && a.status !== "live") return 1;
    const edgeDiff = (b.edgePercent ?? 0) - (a.edgePercent ?? 0);
    if (Math.abs(edgeDiff) > 0.5) return edgeDiff;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  return (
    <AppShell title="Today" subtitle="Find your edge" compact>
      <BettingDashboard matches={sorted} />
    </AppShell>
  );
}
