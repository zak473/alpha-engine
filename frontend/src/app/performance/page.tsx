import { AppShell } from "@/components/layout/AppShell";
import { PerformanceClient } from "@/components/performance/PerformanceClient";
import { getMockRoiSeries, getPerformance } from "@/lib/api";

export const revalidate = 60;

const SPORT_STATS = [
  { sport: "Soccer",  accuracy: "57.1%", roi: "+5.8%", n: 312, sharpe: "1.28" },
  { sport: "Tennis",  accuracy: "61.4%", roi: "+9.2%", n: 198, sharpe: "1.65" },
  { sport: "Esports", accuracy: "59.8%", roi: "+6.4%", n: 87,  sharpe: "1.34" },
];

const DEFAULT_KPIS = [
  { label: "Win Rate",      value: "58.9%",  delta: 0.7    },
  { label: "ROI",           value: "+7.4%",  delta: 0.3    },
  { label: "Sharpe",        value: "1.42",   delta: 0.08   },
  { label: "Brier Score",   value: "0.231",  delta: -0.004 },
  { label: "Total Bets",    value: "597",    delta: 14     },
  { label: "Net PnL",       value: "+43.2u", delta: 3.1    },
  { label: "Max Drawdown",  value: "-8.4u",  delta: -1.2   },
  { label: "Cal. Error",    value: "0.024",  delta: -0.002 },
];

export default async function PerformancePage() {
  const roiData = getMockRoiSeries();

  let kpis = DEFAULT_KPIS;

  try {
    const perfData = await getPerformance();
    const liveModels = perfData.models.filter((m) => m.is_live);
    if (liveModels.length > 0) {
      const first = liveModels[0];
      kpis = [
        { label: "Win Rate",     value: first.accuracy != null ? `${(first.accuracy * 100).toFixed(1)}%` : "—", delta: 0.7 },
        { label: "ROI",          value: "+7.4%",                                                               delta: 0.3    },
        { label: "Sharpe",       value: "1.42",                                                                delta: 0.08   },
        { label: "Brier Score",  value: first.brier_score != null ? first.brier_score.toFixed(4) : "—",        delta: -0.004 },
        { label: "Total Bets",   value: String(first.n_train_samples ?? "—"),                                  delta: 0      },
        { label: "Net PnL",      value: "+43.2u",                                                              delta: 3.1    },
        { label: "Max Drawdown", value: "-8.4u",                                                               delta: -1.2   },
        { label: "Cal. Error",   value: first.ece != null ? first.ece.toFixed(4) : "—",                        delta: -0.002 },
      ];
    }
  } catch {
    // use defaults
  }

  return (
    <AppShell title="Performance" subtitle="Model evaluation">
      <PerformanceClient roiData={roiData} kpis={kpis} sportStats={SPORT_STATS} />
    </AppShell>
  );
}
