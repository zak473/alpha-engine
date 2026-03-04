import { AppShell } from "@/components/layout/AppShell";
import { EloComparisonChart } from "@/components/charts/EloComparisonChart";
import { SimulationDistributionChart } from "@/components/charts/SimulationDistributionChart";
import { FeatureDriverChart } from "@/components/charts/FeatureDriverChart";
import { Badge, OutcomeBadge, StatusBadge } from "@/components/ui/Badge";
import { PanelCard } from "@/components/ui/PanelCard";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { EmptyState } from "@/components/ui/EmptyState";
import { getMatchPrediction, getMockMatches, getMockSimulationBuckets } from "@/lib/api";
import { formatOdds, formatPercent, fmtRating } from "@/lib/utils";
import { notFound } from "next/navigation";
import type { MvpPrediction, SimBucket } from "@/lib/types";
import { BarChart2 } from "lucide-react";

export const revalidate = 30;

function mockEloHistory(homeBase: number, awayBase: number) {
  const data = [];
  let h = homeBase - 80;
  let a = awayBase - 60;
  for (let i = 0; i < 20; i++) {
    const seed = (homeBase + awayBase + i * 37) % 100;
    h += (seed / 100 - 0.48) * 12;
    a += ((seed * 3 + 17) % 100) / 100 - 0.52 < 0 ? -6 : 6;
    const date = new Date(Date.now() - (20 - i) * 7 * 86400 * 1000);
    data.push({ date: date.toISOString().slice(0, 10), home: Math.round(h), away: Math.round(a) });
  }
  return data;
}

export default async function MatchDetailPage({ params }: { params: { id: string } }) {
  let prediction: MvpPrediction | null = null;
  let homeName = "Home";
  let awayName = "Away";
  let competition = "";
  let status = "scheduled";
  let matchOutcome: string | undefined;
  let homeScore: number | undefined;
  let awayScore: number | undefined;
  let sport = "soccer";

  try {
    prediction = await getMatchPrediction(params.id);
    homeName    = prediction.participants.home.name;
    awayName    = prediction.participants.away.name;
    competition = prediction.league;
    status      = prediction.status;
    sport       = prediction.sport;
  } catch {
    const matches = getMockMatches();
    const match   = matches.find((m) => m.id === params.id);
    if (!match) notFound();
    homeName    = match.home_name;
    awayName    = match.away_name;
    competition = match.competition;
    status      = match.status;
    sport       = match.sport;
    homeScore   = match.home_score;
    awayScore   = match.away_score;
    matchOutcome = match.outcome;
  }

  const probs = prediction
    ? {
        p_home: prediction.probabilities.home_win,
        p_draw: prediction.probabilities.draw,
        p_away: prediction.probabilities.away_win,
      }
    : { p_home: 0.52, p_draw: 0.24, p_away: 0.24 };

  const confidence  = prediction?.confidence ?? 68;
  const modelVersion = prediction?.model.version ?? "—";

  const simBuckets: SimBucket[] = prediction?.simulation?.distribution?.length
    ? prediction.simulation.distribution
    : getMockSimulationBuckets();

  const drivers = prediction?.key_drivers?.length
    ? prediction.key_drivers
    : [
        { feature: "elo_diff",         importance: 0.28, value: null },
        { feature: "home_xg_avg",      importance: 0.19, value: null },
        { feature: "away_xg_avg",      importance: 0.17, value: null },
        { feature: "h2h_home_win_pct", importance: 0.12, value: null },
        { feature: "rest_diff",        importance: 0.09, value: null },
      ];

  const eloHistory = mockEloHistory(1780, 1740);

  const fairOdds = {
    home: probs.p_home > 0 ? formatOdds(1 / probs.p_home) : "—",
    draw: probs.p_draw > 0 ? formatOdds(1 / probs.p_draw) : "—",
    away: probs.p_away > 0 ? formatOdds(1 / probs.p_away) : "—",
  };

  return (
    <AppShell
      title={`${homeName} vs ${awayName}`}
      subtitle={`${competition} · #${params.id.slice(0, 8)}`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left column — data (wider) */}
        <div className="lg:col-span-2 space-y-4">

          {/* Summary */}
          <PanelCard title="Summary">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Badge sport={sport as "soccer" | "tennis" | "esports"}>{sport}</Badge>
                <span className="text-xs text-text-muted">{competition}</span>
              </div>
              <StatusBadge status={status as "scheduled" | "live" | "finished" | "cancelled"} />
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="text-left">
                <p className="text-xl font-semibold text-text-primary">{homeName}</p>
                <p className="text-xs text-text-muted mt-1">Home</p>
              </div>
              <div className="text-center">
                {status === "finished" && homeScore !== undefined ? (
                  <p className="text-3xl font-semibold num">{homeScore} – {awayScore}</p>
                ) : (
                  <p className="text-sm text-text-muted">vs</p>
                )}
                {matchOutcome && (
                  <div className="mt-1">
                    <OutcomeBadge outcome={matchOutcome} />
                  </div>
                )}
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold text-text-primary">{awayName}</p>
                <p className="text-xs text-text-muted mt-1">Away</p>
              </div>
            </div>
          </PanelCard>

          {/* Probabilities */}
          <PanelCard title="Model Probabilities">
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Home Win", value: probs.p_home, color: "text-accent-green", odds: fairOdds.home },
                { label: "Draw",     value: probs.p_draw, color: "text-accent-amber", odds: fairOdds.draw },
                { label: "Away Win", value: probs.p_away, color: "text-accent-red",   odds: fairOdds.away },
              ].map(({ label, value, color, odds }) => (
                <div
                  key={label}
                  className="text-center py-4 rounded-lg bg-surface-raised border border-surface-border"
                >
                  <p className="label mb-2">{label}</p>
                  <p className={`num text-2xl font-semibold ${color}`}>
                    {formatPercent(value)}
                  </p>
                  <p className="num text-xs text-text-muted mt-1">{odds}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-6 pt-3 border-t border-surface-border text-xs">
              <div>
                <p className="label">Confidence</p>
                <p className="num text-text-primary font-medium mt-0.5">{formatPercent(confidence / 100)}</p>
              </div>
              <div>
                <p className="label">Model</p>
                <p className="font-mono text-text-muted mt-0.5">{modelVersion}</p>
              </div>
              {prediction?.simulation && (
                <div>
                  <p className="label">Exp. Goals</p>
                  <p className="num text-text-primary font-medium mt-0.5">
                    {prediction.simulation.mean_home_goals.toFixed(1)} –{" "}
                    {prediction.simulation.mean_away_goals.toFixed(1)}
                  </p>
                </div>
              )}
            </div>
          </PanelCard>

          {/* Key stats */}
          <PanelCard title="Key Stats">
            <div className="space-y-3">
              {[
                { label: "Confidence",    value: `${confidence}%` },
                { label: "Model",         value: modelVersion },
                { label: "Fair Odds H",   value: fairOdds.home },
                { label: "Fair Odds D",   value: fairOdds.draw },
                { label: "Fair Odds A",   value: fairOdds.away },
                { label: "ELO (Home)",    value: fmtRating(1780) },
                { label: "ELO (Away)",    value: fmtRating(1740) },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center">
                  <p className="text-xs text-text-muted">{label}</p>
                  <p className="num text-sm text-text-primary font-medium">{value}</p>
                </div>
              ))}
            </div>
          </PanelCard>

          {/* Feature drivers */}
          <PanelCard title="Feature Drivers">
            <FeatureDriverChart drivers={drivers} />
          </PanelCard>
        </div>

        {/* Right column — charts (narrower) */}
        <div className="space-y-4">
          <ErrorBoundary fallback={<EmptyState icon={BarChart2} title="Charts unavailable" />}>
            {/* ELO history */}
            <PanelCard title="ELO Rating History" subtitle="20 weeks">
              <EloComparisonChart
                data={eloHistory}
                homeLabel={homeName}
                awayLabel={awayName}
              />
            </PanelCard>

            {/* Simulation distribution */}
            <PanelCard
              title="Scoreline Distribution"
              subtitle={`${(prediction?.simulation?.n_simulations ?? 10000).toLocaleString()} simulations`}
            >
              <SimulationDistributionChart
                data={simBuckets}
                homeLabel={homeName}
                awayLabel={awayName}
              />
            </PanelCard>
          </ErrorBoundary>
        </div>
      </div>
    </AppShell>
  );
}
