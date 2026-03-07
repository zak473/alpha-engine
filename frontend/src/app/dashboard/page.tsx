import { AppShell } from "@/components/layout/AppShell";
import { BettingDashboard } from "@/components/betting/BettingDashboard";
import {
  getPredictions,
  getMockPredictions,
} from "@/lib/api";
import { mvpToBettingMatch, sortMatches } from "@/lib/betting-adapters";
import { MOCK_MATCHES } from "@/lib/mock-betting-data";
import type { BettingMatch } from "@/lib/betting-types";

export const revalidate = 30;

export default async function DashboardPage() {
  let matches: BettingMatch[] = [];

  try {
    // Fetch both live and scheduled in parallel
    const [liveResult, scheduledResult] = await Promise.allSettled([
      getPredictions({ status: "live", limit: 100 }),
      getPredictions({ status: "scheduled", limit: 100 }),
    ]);

    const liveItems = liveResult.status === "fulfilled" ? liveResult.value.items : [];
    const scheduledItems = scheduledResult.status === "fulfilled" ? scheduledResult.value.items : [];
    const allItems = [...liveItems, ...scheduledItems];

    if (allItems.length > 0) {
      matches = allItems.map(mvpToBettingMatch);
    } else {
      matches = getMockPredictions().map(mvpToBettingMatch);
    }
  } catch {
    matches = MOCK_MATCHES;
  }

  const sorted = sortMatches(matches);

  return (
    <AppShell title="Betting Board" subtitle="Never In Doubt live market view" compact>
      <BettingDashboard matches={sorted} />
    </AppShell>
  );
}
