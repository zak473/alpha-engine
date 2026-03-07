import { AppShell } from "@/components/layout/AppShell";
import { BettingDashboard } from "@/components/betting/BettingDashboard";
import { getSportMatches, type SportSlug } from "@/lib/api";
import { adaptToMatchCard } from "@/lib/betting-adapters";
import type { BettingMatch } from "@/lib/betting-types";
import { MOCK_MATCHES } from "@/lib/mock-betting-data";

export const dynamic = "force-dynamic";

const SPORTS: SportSlug[] = ["soccer", "basketball", "tennis", "esports", "baseball"];

async function getMatches(): Promise<BettingMatch[]> {
  try {
    // Try to fetch from backend
    const results = await Promise.allSettled(
      SPORTS.map((sport) =>
        getSportMatches(sport, { limit: 50 })
          .then((res) => res.items.map((item) => adaptToMatchCard(item, sport)))
      )
    );

    const allMatches: BettingMatch[] = results
      .filter((r): r is PromiseFulfilledResult<BettingMatch[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);

    // If we got data, use it; otherwise fall back to mock
    if (allMatches.length > 0) {
      return allMatches;
    }
    return MOCK_MATCHES;
  } catch {
    // Backend unavailable, use mock data
    return MOCK_MATCHES;
  }
}

export default async function DashboardPage() {
  const allMatches = await getMatches();

  // Sort: live first, then by edge, then by start time
  const sorted = [...allMatches].sort((a, b) => {
    if (a.status === "live" && b.status !== "live") return -1;
    if (b.status === "live" && a.status !== "live") return 1;
    const edgeDiff = (b.edgePercent ?? 0) - (a.edgePercent ?? 0);
    if (Math.abs(edgeDiff) > 0.5) return edgeDiff;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  return (
    <AppShell title="Betting Board" subtitle="Never In Doubt live market view" compact>
      <BettingDashboard matches={sorted} />
    </AppShell>
  );
}
