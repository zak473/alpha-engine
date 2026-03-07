import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { getHealth, getReady, getPerformance } from "@/lib/api";
import type { MvpModelMetrics } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const revalidate = 30;

const MOCK_MODELS: MvpModelMetrics[] = [
  { model_name: "soccer_xgb", version: "v1.0", algorithm: "XGBoost",  sport: "soccer",  is_live: true,  n_train_samples: 48230, accuracy: 0.571, brier_score: 0.231, log_loss: 0.648, ece: 0.024, trained_at: "2024-11-01T00:00:00Z", train_data_from: "2022-01-01", train_data_to: "2024-10-31", notes: null },
  { model_name: "tennis_xgb", version: "v1.0", algorithm: "XGBoost",  sport: "tennis",  is_live: true,  n_train_samples: 31100, accuracy: 0.614, brier_score: 0.219, log_loss: 0.621, ece: 0.019, trained_at: "2024-11-01T00:00:00Z", train_data_from: "2022-01-01", train_data_to: "2024-10-31", notes: null },
  { model_name: "esports_xgb",version: "v1.0", algorithm: "XGBoost",  sport: "esports", is_live: true,  n_train_samples: 12870, accuracy: 0.598, brier_score: 0.228, log_loss: 0.639, ece: 0.028, trained_at: "2024-11-01T00:00:00Z", train_data_from: "2022-01-01", train_data_to: "2024-10-31", notes: null },
  { model_name: "soccer_lr",  version: "v0.9", algorithm: "Logistic",  sport: "soccer",  is_live: false, n_train_samples: 32000, accuracy: 0.542, brier_score: 0.244, log_loss: 0.691, ece: 0.041, trained_at: "2024-09-15T00:00:00Z", train_data_from: "2022-01-01", train_data_to: "2024-08-31", notes: "Archived" },
];

const BACKTESTS = [
  { id: "bt-001", sport: "soccer",  strategy: "kelly_0.25", roi: "+7.8%", sharpe: "1.44", period: "Jan–Oct 2024" },
  { id: "bt-002", sport: "tennis",  strategy: "flat",        roi: "+9.1%", sharpe: "1.61", period: "Jan–Oct 2024" },
  { id: "bt-003", sport: "esports", strategy: "kelly_0.25", roi: "+5.9%", sharpe: "1.21", period: "Jan–Oct 2024" },
];

const API_ENDPOINTS = [
  "GET /soccer/predictions/:id",
  "GET /tennis/predictions/:id",
  "GET /esports/predictions/:id",
  "GET /soccer/ratings/:id",
  "GET /tennis/ratings/:id",
  "GET /esports/ratings/:id",
  "GET /soccer/h2h/:a/:b",
  "GET /health",
  "GET /ready",
  "GET /predictions",
];

export default async function AdminPage() {
  let apiOk = false;
  let dbOk = false;
  let apiEnv = "unknown";
  let liveModels = MOCK_MODELS;

  try {
    const [health, ready, perfData] = await Promise.allSettled([
      getHealth(),
      getReady(),
      getPerformance(),
    ]);

    if (health.status === "fulfilled") {
      apiOk  = health.value.status === "ok";
      apiEnv = health.value.env;
    }
    if (ready.status === "fulfilled") {
      dbOk = ready.value.db === true;
    }
    if (perfData.status === "fulfilled" && perfData.value.models.length > 0) {
      liveModels = perfData.value.models;
    }
  } catch {
    // silent — use mocks
  }

  const liveCount = liveModels.filter((m) => m.is_live).length;

  const kpis = [
    { label: "Live Models",    value: String(liveCount) },
    { label: "Total Backtests", value: "3"             },
    { label: "API",            value: apiOk ? "OK" : "—", delta: apiOk ? 1 : -1 },
    { label: "Database",       value: dbOk ? "OK" : "—",  delta: dbOk ? 1 : -1  },
  ];

  return (
    <AppShell title="Trading Desk Admin" subtitle={`System status, model stack, and deployment health · ${apiEnv.toUpperCase()}`}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Model registry */}
        <div className="card">
          <div className="px-4 pt-4 pb-1">
            <SectionHeader title="Model Registry" subtitle={`${liveCount} live`} />
          </div>
          <Table>
            <TableHead>
              <tr>
                <TableHeader>Model</TableHeader>
                <TableHeader>Sport</TableHeader>
                <TableHeader>Algorithm</TableHeader>
                <TableHeader>Accuracy</TableHeader>
                <TableHeader>Status</TableHeader>
              </tr>
            </TableHead>
            <TableBody>
              {liveModels.map((m) => (
                <TableRow key={`${m.model_name}-${m.version}`}>
                  <TableCell>
                    <span className="font-mono text-xs">{m.model_name}</span>
                    <span className="text-text-subtle text-xs ml-1">{m.version}</span>
                  </TableCell>
                  <TableCell>
                    <Badge sport={m.sport as "soccer" | "tennis" | "esports"}>{m.sport}</Badge>
                  </TableCell>
                  <TableCell className="text-text-muted">{m.algorithm}</TableCell>
                  <TableCell mono>
                    {m.accuracy != null ? `${(m.accuracy * 100).toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell>
                    {m.is_live ? (
                      <span className="flex items-center gap-1.5 text-accent-green text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
                        Live
                      </span>
                    ) : (
                      <span className="text-text-muted text-xs">Archived</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Backtest results */}
        <div className="card">
          <div className="px-4 pt-4 pb-1">
            <SectionHeader title="Backtest Results" />
          </div>
          <Table>
            <TableHead>
              <tr>
                <TableHeader>Sport</TableHeader>
                <TableHeader>Strategy</TableHeader>
                <TableHeader>ROI</TableHeader>
                <TableHeader>Sharpe</TableHeader>
                <TableHeader>Period</TableHeader>
              </tr>
            </TableHead>
            <TableBody>
              {BACKTESTS.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Badge sport={b.sport as "soccer" | "tennis" | "esports"}>{b.sport}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-text-muted text-xs">{b.strategy}</TableCell>
                  <TableCell
                    mono
                    className={b.roi.startsWith("+") ? "text-accent-green font-medium" : "text-accent-red font-medium"}
                  >
                    {b.roi}
                  </TableCell>
                  <TableCell mono>{b.sharpe}</TableCell>
                  <TableCell className="text-text-muted text-xs">{b.period}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* API endpoint status */}
        <div className="card px-4 py-4 lg:col-span-2">
          <SectionHeader
            title="API Endpoints"
            subtitle={apiOk ? "All systems operational" : "API unreachable"}
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {API_ENDPOINTS.map((path) => (
              <div
                key={path}
                className="flex items-start gap-2 p-2 rounded bg-surface-overlay border border-surface-border"
              >
                <span
                  className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                    apiOk ? "bg-accent-green" : "bg-text-subtle"
                  }`}
                />
                <span className="font-mono text-[11px] text-text-muted leading-relaxed">{path}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
