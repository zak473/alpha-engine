import { AppShell } from "@/components/layout/AppShell";
import { EloComparisonChart } from "@/components/charts/EloComparisonChart";
import { SimulationDistributionChart } from "@/components/charts/SimulationDistributionChart";
import { FeatureDriverChart } from "@/components/charts/FeatureDriverChart";
import { Badge, OutcomeBadge, StatusBadge } from "@/components/ui/Badge";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { EmptyState } from "@/components/ui/EmptyState";
import { getMatchPrediction, getMockMatches, getMockSimulationBuckets } from "@/lib/api";
import { formatOdds, formatPercent, fmtRating } from "@/lib/utils";
import { notFound } from "next/navigation";
import type { MvpPrediction, SimBucket } from "@/lib/types";
import { BarChart2, Clock3, ShieldCheck, Sparkles, Trophy } from "lucide-react";

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

function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="detail-section-card">
      <div className="detail-section-card__header">
        <div>
          <div className="detail-section-card__title">{title}</div>
          {subtitle ? <div className="detail-section-card__subtitle">{subtitle}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div className="detail-section-card__body">{children}</div>
    </section>
  );
}

function ProbBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="detail-probbar">
      <div className="detail-probbar__fill" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="detail-stat-row">
      <span>{label}</span>
      <strong className="num">{value}</strong>
    </div>
  );
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
    homeName = prediction.participants.home.name;
    awayName = prediction.participants.away.name;
    competition = prediction.league;
    status = prediction.status;
    sport = prediction.sport;
  } catch {
    const matches = getMockMatches();
    const match = matches.find((m) => m.id === params.id);
    if (!match) notFound();
    homeName = match.home_name;
    awayName = match.away_name;
    competition = match.competition;
    status = match.status;
    sport = match.sport;
    homeScore = match.home_score;
    awayScore = match.away_score;
    matchOutcome = match.outcome;
  }

  const probs = prediction
    ? {
        p_home: prediction.probabilities.home_win,
        p_draw: prediction.probabilities.draw,
        p_away: prediction.probabilities.away_win,
      }
    : { p_home: 0.52, p_draw: 0.24, p_away: 0.24 };

  const confidence = prediction?.confidence ?? 68;
  const modelVersion = prediction?.model?.version ?? "—";
  const simBuckets: SimBucket[] = prediction?.simulation?.distribution?.length
    ? prediction.simulation.distribution
    : getMockSimulationBuckets();

  const drivers = prediction?.key_drivers?.length
    ? prediction.key_drivers
    : [
        { feature: "elo_diff", importance: 0.28, value: null },
        { feature: "home_xg_avg", importance: 0.19, value: null },
        { feature: "away_xg_avg", importance: 0.17, value: null },
        { feature: "h2h_home_win_pct", importance: 0.12, value: null },
        { feature: "rest_diff", importance: 0.09, value: null },
      ];

  const eloHistory = mockEloHistory(1780, 1740);
  const fairOdds = {
    home: probs.p_home > 0 ? formatOdds(1 / probs.p_home) : "—",
    draw: probs.p_draw > 0 ? formatOdds(1 / probs.p_draw) : "—",
    away: probs.p_away > 0 ? formatOdds(1 / probs.p_away) : "—",
  };

  const confidenceBadgeVariant = confidence >= 70 ? "positive" : confidence >= 50 ? "warning" : "negative";
  const matchupState = status === "finished" && homeScore !== undefined ? `${homeScore}–${awayScore}` : "VS";

  const probCols = [
    { label: "Home Win", value: probs.p_home, color: "var(--positive)", odds: fairOdds.home },
    { label: "Draw", value: probs.p_draw, color: "var(--warning)", odds: fairOdds.draw },
    { label: "Away Win", value: probs.p_away, color: "var(--info)", odds: fairOdds.away },
  ];

  const quickStats = [
    {
      icon: Sparkles,
      label: "Top edge",
      value: `${Math.round(Math.max(probs.p_home, probs.p_draw, probs.p_away) * 100)}%`,
      tone: "green",
    },
    {
      icon: ShieldCheck,
      label: "Model confidence",
      value: `${confidence}%`,
      tone: "neutral",
    },
    {
      icon: Clock3,
      label: "Status",
      value: status === "live" ? "Live market" : status === "finished" ? "Settled" : "Pre-match",
      tone: "neutral",
    },
    {
      icon: Trophy,
      label: "Competition",
      value: competition,
      tone: "warm",
    },
  ];

  return (
    <AppShell title={`${homeName} vs ${awayName}`} subtitle={`${competition} · Match board`}>
      <div className="detail-page">
        <section className="detail-hero">
          <div className="detail-hero__main">
            <div className="detail-hero__topline">
              <Badge sport={sport}>{sport}</Badge>
              <StatusBadge status={status as "scheduled" | "live" | "finished" | "cancelled"} />
              <span className="detail-hero__meta">Never In Doubt match board</span>
            </div>

            <div className="detail-matchup">
              <div className="detail-team">
                <span className="detail-team__side">Home</span>
                <h2>{homeName}</h2>
              </div>

              <div className="detail-scorebox">
                <span className="detail-scorebox__label">Match view</span>
                <strong className="num">{matchupState}</strong>
                <div className="detail-scorebox__sub">
                  {matchOutcome ? <OutcomeBadge outcome={matchOutcome} /> : <span>Model-led market read</span>}
                </div>
              </div>

              <div className="detail-team detail-team--away">
                <span className="detail-team__side">Away</span>
                <h2>{awayName}</h2>
              </div>
            </div>

            <div className="detail-pill-row">
              <span className="page-chip">Sharper market summary</span>
              <span className="page-chip">Cleaner odds layout</span>
              <span className="page-chip">Never In Doubt styling</span>
            </div>
          </div>

          <div className="detail-hero__stats">
            {quickStats.map(({ icon: Icon, label, value, tone }) => (
              <div key={label} className={`detail-quickstat detail-quickstat--${tone}`}>
                <div className="detail-quickstat__label">
                  <Icon size={14} />
                  <span>{label}</span>
                </div>
                <div className="detail-quickstat__value">{value}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="detail-grid">
          <div className="detail-grid__main">
            <SectionCard
              title="Market probabilities"
              subtitle="Cleaner outcome view with model confidence and fair prices"
              right={<span className={`badge badge-${confidenceBadgeVariant}`}><span className="num">{confidence}%</span></span>}
            >
              <div className="detail-prob-grid">
                {probCols.map(({ label, value, color, odds }) => (
                  <div key={label} className="detail-prob-card">
                    <div className="detail-prob-card__label">{label}</div>
                    <div className="detail-prob-card__value num" style={{ color }}>{formatPercent(value)}</div>
                    <div className="detail-prob-card__odds num">Fair {odds}</div>
                    <ProbBar value={value} color={color} />
                  </div>
                ))}
              </div>

              <div className="detail-meta-grid">
                <div className="detail-mini-card detail-mini-card--green">
                  <span className="detail-mini-card__label">Model version</span>
                  <strong className="num">{modelVersion}</strong>
                </div>
                <div className="detail-mini-card">
                  <span className="detail-mini-card__label">Expected goals</span>
                  <strong className="num">
                    {prediction?.simulation
                      ? `${prediction.simulation.mean_home_goals.toFixed(1)} – ${prediction.simulation.mean_away_goals.toFixed(1)}`
                      : "1.7 – 1.2"}
                  </strong>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Core match stats" subtitle="Fast-scan numbers for pricing and confidence checks">
              <div className="detail-stat-grid">
                <div className="detail-list-card">
                  <StatRow label="Confidence" value={`${confidence}%`} />
                  <StatRow label="Fair odds home" value={fairOdds.home} />
                  <StatRow label="Fair odds draw" value={fairOdds.draw} />
                  <StatRow label="Fair odds away" value={fairOdds.away} />
                </div>
                <div className="detail-list-card">
                  <StatRow label="Home ELO" value={fmtRating(1780)} />
                  <StatRow label="Away ELO" value={fmtRating(1740)} />
                  <StatRow label="Competition" value={competition} />
                  <StatRow label="Board state" value={status} />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Feature drivers" subtitle="What is pushing the model toward the current read">
              <FeatureDriverChart drivers={drivers} />
            </SectionCard>
          </div>

          <div className="detail-grid__side">
            <ErrorBoundary fallback={<EmptyState icon={BarChart2} title="Charts unavailable" />}>
              <SectionCard title="ELO rating history" subtitle="20-week trend comparison">
                <EloComparisonChart data={eloHistory} homeLabel={homeName} awayLabel={awayName} />
              </SectionCard>

              <SectionCard
                title="Scoreline distribution"
                subtitle={`${(prediction?.simulation?.n_simulations ?? 10000).toLocaleString()} simulations`}
              >
                <SimulationDistributionChart data={simBuckets} homeLabel={homeName} awayLabel={awayName} />
              </SectionCard>
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
