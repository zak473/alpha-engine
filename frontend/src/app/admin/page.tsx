import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { getHealth, getReady, getPerformance, runBacktest, type BacktestRunResult } from "@/lib/api";
import type { MvpModelMetrics } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const revalidate = 60;

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
  let liveModels: MvpModelMetrics[] = [];
  let backtestResults: BacktestRunResult[] = [];

  const [health, ready, perfData, ...btResults] = await Promise.allSettled([
    getHealth(),
    getReady(),
    getPerformance(),
    runBacktest({ sport: "soccer",     staking: "kelly" }),
    runBacktest({ sport: "tennis",     staking: "kelly" }),
    runBacktest({ sport: "esports",    staking: "kelly" }),
    runBacktest({ sport: "basketball", staking: "kelly" }),
    runBacktest({ sport: "baseball",   staking: "kelly" }),
  ]);

  if (health.status === "fulfilled") {
    apiOk  = health.value.status === "ok";
    apiEnv = health.value.env;
  }
  if (ready.status === "fulfilled") {
    dbOk = ready.value.db === true;
  }
  if (perfData.status === "fulfilled") {
    liveModels = perfData.value.models;
  }
  for (const r of btResults) {
    if (r.status === "fulfilled" && r.value.n_predictions > 0) {
      backtestResults.push(r.value);
    }
  }

  const liveCount = liveModels.filter((m) => m.is_live).length;

  const kpis = [
    { label: "Live Models",    value: String(liveCount) },
    { label: "Total Backtests", value: String(backtestResults.length) },
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
                    <Badge sport={m.sport }>{m.sport}</Badge>
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
            <SectionHeader title="Backtest Results" subtitle="Kelly staking, all-time" />
          </div>
          <Table>
            <TableHead>
              <tr>
                <TableHeader>Sport</TableHeader>
                <TableHeader>Accuracy</TableHeader>
                <TableHeader>ROI</TableHeader>
                <TableHeader>Sharpe</TableHeader>
                <TableHeader>Brier</TableHeader>
                <TableHeader>N</TableHeader>
              </tr>
            </TableHead>
            <TableBody>
              {backtestResults.length === 0 ? (
                <TableRow>
                  <TableCell className="text-text-muted text-xs" colSpan={6}>
                    No finished predictions yet
                  </TableCell>
                </TableRow>
              ) : (
                backtestResults.map((b) => {
                  const roi = `${b.roi >= 0 ? "+" : ""}${(b.roi * 100).toFixed(1)}%`;
                  return (
                    <TableRow key={b.sport}>
                      <TableCell>
                        <Badge sport={b.sport }>{b.sport}</Badge>
                      </TableCell>
                      <TableCell mono>{(b.accuracy * 100).toFixed(1)}%</TableCell>
                      <TableCell mono className={b.roi >= 0 ? "text-accent-green font-medium" : "text-accent-red font-medium"}>
                        {roi}
                      </TableCell>
                      <TableCell mono>{b.sharpe_ratio.toFixed(2)}</TableCell>
                      <TableCell mono>{b.brier_score.toFixed(3)}</TableCell>
                      <TableCell mono className="text-text-muted">{b.n_predictions}</TableCell>
                    </TableRow>
                  );
                })
              )}
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
