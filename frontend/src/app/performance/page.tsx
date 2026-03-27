import { AppShell } from "@/components/layout/AppShell";
import { DeskPageIntro } from "@/components/layout/DeskPageIntro";
import { PerformanceClient } from "@/components/performance/PerformanceClient";
import {
  getBacktestSummary,
  getBankroll,
  getPerformance,
  getPicks,
  getPicksStats,
  getPredictionAccuracy,
} from "@/lib/api";
import type {
  BacktestRunResult,
  BankrollStatsOut,
  PickOut,
  PicksStatsOut,
  PredictionAccuracy,
} from "@/lib/api";
import type { MvpPerformance, RoiPoint } from "@/lib/types";

export const dynamic = "force-dynamic";

const SPORTS = ["soccer", "tennis", "esports", "basketball", "baseball", "hockey"] as const;

function fmt(n: number, decimals = 1) {
  return n.toFixed(decimals);
}

function buildRoiSeries(picks: PickOut[]): RoiPoint[] {
  const settled = picks
    .filter((pick) => pick.outcome === "won" || pick.outcome === "lost")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let cumulative = 0;

  return settled.map((pick) => {
    const pnl = pick.outcome === "won" ? pick.odds - 1 : -1;
    cumulative += pnl;
    return {
      date: pick.created_at.split("T")[0],
      roi: Math.round(cumulative * 100) / 100,
      pnl: Math.round(pnl * 100) / 100,
      cumulative_pnl: Math.round(cumulative * 100) / 100,
    };
  });
}

export default async function PerformancePage() {
  const [picks, overallStats, perfData, bankroll, accuracy, backtestSummary, ...sportStatsList] = await Promise.all([
    getPicks({ limit: 500 }).catch((): PickOut[] => []),
    getPicksStats().catch(
      (): PicksStatsOut => ({
        total: 0,
        settled: 0,
        pending: 0,
        won: 0,
        lost: 0,
        void: 0,
        win_rate: 0,
        avg_odds: 0,
        avg_edge: 0,
        roi: 0,
        avg_clv: null,
        kelly_roi: null,
      })
    ),
    getPerformance().catch((): MvpPerformance => ({ models: [], sport: null })),
    getBankroll().catch(
      (): BankrollStatsOut => ({
        current_balance: 0,
        starting_balance: 0,
        peak_balance: 0,
        total_deposited: 0,
        total_withdrawn: 0,
        total_pnl: 0,
        roi: 0,
        max_drawdown: 0,
        sharpe: null,
        snapshots: [],
      })
    ),
    getPredictionAccuracy().catch(
      (): PredictionAccuracy => ({
        overall: { n: 0, accuracy: null, avg_brier: null },
        by_sport: {},
        recent: [],
      })
    ),
    getBacktestSummary().catch((): Record<string, BacktestRunResult> => ({})),
    ...SPORTS.map((sport) =>
      getPicksStats(sport)
        .catch(
          (): PicksStatsOut & { sport: string } => ({
            sport,
            total: 0,
            settled: 0,
            pending: 0,
            won: 0,
            lost: 0,
            void: 0,
            win_rate: 0,
            avg_odds: 0,
            avg_edge: 0,
            roi: 0,
            avg_clv: null,
            kelly_roi: null,
          })
        )
        .then((stats) => ({ ...stats, sport }))
    ),
  ]);

  const roiSeries = buildRoiSeries(picks);
  const recentPicks = [...picks]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);

  const liveModels = perfData.models.filter((model) => model.is_live).length;
  const bestBacktest = Object.entries(backtestSummary).sort(([, a], [, b]) => b.roi - a.roi)[0];

  return (
    <AppShell title="Performance" subtitle="ROI, bankroll movement, and model quality in one clearer analytics view" compact hideHero>
      <div className="space-y-4">
        <DeskPageIntro
          eyebrow="Bankroll analytics"
          title="Performance"
          subtitle="See what is working, what is dragging, and where your bankroll is moving without hunting across widgets."
          metrics={[
            {
              label: "Flat ROI",
              value: `${overallStats.roi >= 0 ? "+" : ""}${fmt(overallStats.roi * 100)}%`,
              tone: overallStats.roi >= 0 ? "positive" : "warning",
            },
            {
              label: "Settled picks",
              value: `${overallStats.settled} graded`,
              tone: "neutral",
            },
            {
              label: "Board pulse",
              value: bestBacktest && overallStats.settled > 0
                ? `${bestBacktest[0].replace(/[-_]/g, " ")} ${fmt(bestBacktest[1].roi * 100)}%`
                : overallStats.settled > 0
                  ? `${liveModels} live models`
                  : "Awaiting first graded picks",
              tone: "accent",
            },
          ]}
          primaryCta={{ label: "Browse predictions", href: "/predictions" }}
          secondaryCta={{ label: "View pick history", href: "/record" }}
        />
        <PerformanceClient
          overall={overallStats}
          roiSeries={roiSeries}
          sportStats={sportStatsList}
          models={perfData.models}
          recentPicks={recentPicks}
          allPicks={picks}
          bankroll={bankroll}
          accuracy={accuracy}
          backtestSummary={backtestSummary}
        />
      </div>
    </AppShell>
  );
}
