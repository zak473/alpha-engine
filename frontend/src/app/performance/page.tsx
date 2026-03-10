import { AppShell } from "@/components/layout/AppShell";
import { PerformanceClient } from "@/components/performance/PerformanceClient";
import { getPicks, getPicksStats, getPerformance, getBankroll, getPredictionAccuracy } from "@/lib/api";
import type { PickOut, PicksStatsOut, BankrollStatsOut, PredictionAccuracy } from "@/lib/api";
import type { RoiPoint, MvpPerformance } from "@/lib/types";

export const dynamic = "force-dynamic";

const SPORTS = ["soccer", "tennis", "esports", "basketball", "baseball", "hockey"] as const;

function buildRoiSeries(picks: PickOut[]): RoiPoint[] {
  const settled = picks
    .filter((p) => p.outcome === "won" || p.outcome === "lost")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let cum = 0;
  return settled.map((p) => {
    const pnl = p.outcome === "won" ? p.odds - 1 : -1;
    cum += pnl;
    return {
      date: p.created_at.split("T")[0],
      roi: Math.round(cum * 100) / 100,   // same as cumulative for compatibility
      pnl: Math.round(pnl * 100) / 100,
      cumulative_pnl: Math.round(cum * 100) / 100,
    };
  });
}

export default async function PerformancePage() {
  // Fetch everything in parallel, gracefully degrade on failure
  const [picks, overallStats, perfData, bankroll, accuracy, ...sportStatsList] = await Promise.all([
    getPicks({ limit: 500 }).catch((): PickOut[] => []),
    getPicksStats().catch((): PicksStatsOut => ({
      total: 0, settled: 0, pending: 0, won: 0, lost: 0, void: 0,
      win_rate: 0, avg_odds: 0, avg_edge: 0, roi: 0, avg_clv: null, kelly_roi: null,
    })),
    getPerformance().catch((): MvpPerformance => ({ models: [], sport: null })),
    getBankroll().catch((): BankrollStatsOut => ({
      current_balance: 0, starting_balance: 0, peak_balance: 0,
      total_deposited: 0, total_withdrawn: 0, total_pnl: 0,
      roi: 0, max_drawdown: 0, sharpe: null, snapshots: [],
    })),
    getPredictionAccuracy().catch((): PredictionAccuracy => ({
      overall: { n: 0, accuracy: null, avg_brier: null },
      by_sport: {},
      recent: [],
    })),
    ...SPORTS.map((s) =>
      getPicksStats(s).catch((): PicksStatsOut & { sport: string } => ({
        sport: s, total: 0, settled: 0, pending: 0, won: 0, lost: 0, void: 0,
        win_rate: 0, avg_odds: 0, avg_edge: 0, roi: 0, avg_clv: null, kelly_roi: null,
      })).then((stats) => ({ ...stats, sport: s }))
    ),
  ]);

  const roiSeries = buildRoiSeries(picks);
  const recentPicks = [...picks]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);

  return (
    <AppShell title="Performance Lab" subtitle="ROI, bankroll trends, and model output analytics">
      <PerformanceClient
        overall={overallStats}
        roiSeries={roiSeries}
        sportStats={sportStatsList}
        models={perfData.models}
        recentPicks={recentPicks}
        bankroll={bankroll}
        accuracy={accuracy}
      />
    </AppShell>
  );
}
