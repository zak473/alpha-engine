import { AppShell } from "@/components/layout/AppShell";
import { EloComparisonChart } from "@/components/charts/EloComparisonChart";
import { SimulationDistributionChart } from "@/components/charts/SimulationDistributionChart";
import { FeatureDriverChart } from "@/components/charts/FeatureDriverChart";
import { Badge, OutcomeBadge, StatusBadge } from "@/components/ui/Badge";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getMatchPrediction,
  getSoccerTeamEloHistory,
  getTennisPlayerEloHistory,
  getEsportsTeamEloHistory,
  getBasketballTeamEloHistory,
  getBaseballTeamEloHistory,
  getMatchReasoning,
} from "@/lib/api";
import { formatOdds, formatPercent } from "@/lib/utils";
import { notFound } from "next/navigation";
import type { MvpPrediction, SimBucket } from "@/lib/types";
import { BarChart2, Clock, Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

/* ── Reusable card primitives ───────────────────────────────────────────── */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="card" style={{ overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

function CardHeader({
  title,
  subtitle,
  right,
}: {
  title:     string;
  subtitle?: string;
  right?:    React.ReactNode;
}) {
  return (
    <div className="panel-header">
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="panel-title">{title}</span>
        {subtitle && (
          <span style={{ fontSize: 10, color: "var(--text2)" }}>{subtitle}</span>
        )}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

function CardBody({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="panel-content" style={style}>
      {children}
    </div>
  );
}

/* ── Probability bar ────────────────────────────────────────────────────── */
function ProbBar({ value, color }: { value: number; color: string }) {
  return (
    <div
      style={{
        height:       3,
        background:   "var(--border0)",
        borderRadius: 2,
        marginTop:    8,
        overflow:     "hidden",
      }}
    >
      <div
        style={{
          height:       "100%",
          width:        `${Math.round(value * 100)}%`,
          background:   color,
          borderRadius: 2,
          transition:   "width 400ms ease",
        }}
      />
    </div>
  );
}

/* ── Key stat row ───────────────────────────────────────────────────────── */
function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        display:        "flex",
        justifyContent: "space-between",
        alignItems:     "center",
        padding:        "5px 0",
        borderBottom:   "1px solid var(--border0)",
      }}
    >
      <span style={{ fontSize: 11, color: "var(--text1)" }}>{label}</span>
      <span className="num" style={{ fontSize: 12, color: "var(--text0)", fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default async function MatchDetailPage({ params }: { params: { id: string } }) {
  let prediction: MvpPrediction | null = null;
  let homeName     = "Home";
  let awayName     = "Away";
  let competition  = "";
  let status       = "scheduled";
  let matchOutcome: string | undefined;
  let homeScore:   number | undefined;
  let awayScore:   number | undefined;
  let sport        = "soccer";

  try {
    prediction   = await getMatchPrediction(params.id);
    homeName     = prediction.participants.home.name;
    awayName     = prediction.participants.away.name;
    competition  = prediction.league;
    status       = prediction.status;
    sport        = prediction.sport;
    matchOutcome = prediction.outcome ?? undefined;
    homeScore    = prediction.home_score ?? undefined;
    awayScore    = prediction.away_score ?? undefined;
  } catch {
    notFound();
  }

  const probs = {
    p_home: prediction?.probabilities.home_win ?? 0,
    p_draw: prediction?.probabilities.draw ?? 0,
    p_away: prediction?.probabilities.away_win ?? 0,
  };

  const confidence   = prediction?.confidence ?? 0;
  const modelVersion = prediction?.model?.version ?? "—";

  const simBuckets: SimBucket[] = prediction?.simulation?.distribution ?? [];

  // Fetch real ELO history for both teams
  const homeId = prediction?.participants.home.id ?? "";
  const awayId = prediction?.participants.away.id ?? "";
  async function fetchEloHistory(id: string, s: string) {
    if (!id) return [];
    try {
      switch (s) {
        case "tennis":    return await getTennisPlayerEloHistory(id, "global", 20);
        case "esports":   return await getEsportsTeamEloHistory(id, undefined, 20);
        case "basketball":return await getBasketballTeamEloHistory(id, 20);
        case "baseball":  return await getBaseballTeamEloHistory(id, 20);
        default:          return await getSoccerTeamEloHistory(id, 20);
      }
    } catch { return []; }
  }
  const [homeElo, awayElo, reasoning] = await Promise.all([
    fetchEloHistory(homeId, sport),
    fetchEloHistory(awayId, sport),
    getMatchReasoning(params.id),
  ]);

  // Merge into combined history keyed by date
  const eloMap = new Map<string, { date: string; home: number; away: number }>();
  homeElo.forEach((p) => eloMap.set(p.date, { date: p.date, home: p.rating, away: 0 }));
  awayElo.forEach((p) => {
    const existing = eloMap.get(p.date);
    if (existing) existing.away = p.rating;
    else eloMap.set(p.date, { date: p.date, home: 0, away: p.rating });
  });
  const eloHistory = Array.from(eloMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const drivers = prediction?.key_drivers ?? [];

  const fairOdds = {
    home: probs.p_home > 0 ? formatOdds(1 / probs.p_home) : "—",
    draw: probs.p_draw > 0 ? formatOdds(1 / probs.p_draw) : "—",
    away: probs.p_away > 0 ? formatOdds(1 / probs.p_away) : "—",
  };

  const confidenceBadgeVariant =
    confidence >= 70 ? "positive" :
    confidence >= 50 ? "warning"  :
                       "negative";

  const probCols = [
    { label: "Home Win", value: probs.p_home, color: "var(--positive)", odds: fairOdds.home },
    { label: "Draw",     value: probs.p_draw, color: "var(--warning)",  odds: fairOdds.draw },
    { label: "Away Win", value: probs.p_away, color: "var(--negative)", odds: fairOdds.away },
  ];

  return (
    <AppShell
      title={`${homeName} vs ${awayName}`}
      subtitle={`${competition} · #${params.id.slice(0, 8)}`}
    >
      {/* ── 2-column layout: 60% / 40% ──────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap:     16,
          alignItems: "flex-start",
        }}
      >

        {/* ── LEFT COLUMN (60%) ──────────────────────────────────────── */}
        <div style={{ flex: "0 0 60%", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Match header card */}
          <Card>
            <CardHeader
              title="Match"
              right={<StatusBadge status={status as "scheduled" | "live" | "finished" | "cancelled"} />}
            />
            <CardBody>
              {/* League + sport row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <Badge sport={sport as "soccer" | "tennis" | "esports"}>{sport}</Badge>
                <span style={{ fontSize: 11, color: "var(--text1)" }}>{competition}</span>
              </div>

              {/* Teams row */}
              <div
                style={{
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "space-between",
                  gap:            12,
                }}
              >
                {/* Home */}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 20, fontWeight: 600, color: "var(--text0)", margin: 0, lineHeight: 1.2 }}>
                    {homeName}
                  </p>
                  <p style={{ fontSize: 10, color: "var(--text2)", marginTop: 4, marginBottom: 0 }}>
                    HOME
                  </p>
                </div>

                {/* Score / vs */}
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  {status === "finished" && homeScore !== undefined ? (
                    <>
                      <p
                        className="num"
                        style={{
                          fontSize:   32,
                          fontWeight: 600,
                          color:      "var(--text0)",
                          margin:     0,
                          lineHeight: 1,
                        }}
                      >
                        {homeScore}
                        <span style={{ color: "var(--text2)", margin: "0 6px" }}>–</span>
                        {awayScore}
                      </p>
                      {matchOutcome && (
                        <div style={{ marginTop: 6 }}>
                          <OutcomeBadge outcome={matchOutcome} />
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      style={{
                        display:        "flex",
                        alignItems:     "center",
                        justifyContent: "center",
                        width:          40,
                        height:         40,
                        background:     "var(--bg1)",
                        border:         "1px solid var(--border0)",
                        borderRadius:   "var(--radius-md)",
                      }}
                    >
                      <span style={{ fontSize: 11, color: "var(--text1)", fontWeight: 500 }}>vs</span>
                    </div>
                  )}
                </div>

                {/* Away */}
                <div style={{ flex: 1, textAlign: "right" }}>
                  <p style={{ fontSize: 20, fontWeight: 600, color: "var(--text0)", margin: 0, lineHeight: 1.2 }}>
                    {awayName}
                  </p>
                  <p style={{ fontSize: 10, color: "var(--text2)", marginTop: 4, marginBottom: 0 }}>
                    AWAY
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Probabilities card */}
          <Card>
            <CardHeader
              title="Model Probabilities"
              right={
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: "var(--text1)" }}>Confidence</span>
                  <span className={`badge badge-${confidenceBadgeVariant}`}>
                    <span className="num">{confidence}%</span>
                  </span>
                </div>
              }
            />
            <CardBody>
              {/* 3-column grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
                {probCols.map(({ label, value, color, odds }) => (
                  <div
                    key={label}
                    style={{
                      padding:      "14px 12px",
                      background:   "var(--bg1)",
                      border:       "1px solid var(--border0)",
                      borderRadius: "var(--radius-md)",
                      textAlign:    "center",
                    }}
                  >
                    <p className="label" style={{ marginBottom: 8 }}>{label}</p>
                    <p
                      className="num"
                      style={{
                        fontSize:   26,
                        fontWeight: 600,
                        color,
                        margin:     0,
                        lineHeight: 1,
                      }}
                    >
                      {formatPercent(value)}
                    </p>
                    <p
                      className="num"
                      style={{ fontSize: 11, color: "var(--text1)", marginTop: 4, marginBottom: 0 }}
                    >
                      {odds}
                    </p>
                    <ProbBar value={value} color={color} />
                  </div>
                ))}
              </div>

              {/* Meta row */}
              <div
                style={{
                  display:    "flex",
                  gap:        24,
                  paddingTop: 12,
                  borderTop:  "1px solid var(--border0)",
                }}
              >
                <div>
                  <p className="label" style={{ marginBottom: 4 }}>Model</p>
                  <p className="num" style={{ fontSize: 12, color: "var(--text0)", margin: 0 }}>
                    {modelVersion}
                  </p>
                </div>
                {prediction?.simulation && (
                  <div>
                    <p className="label" style={{ marginBottom: 4 }}>Exp. Goals</p>
                    <p className="num" style={{ fontSize: 12, color: "var(--text0)", margin: 0 }}>
                      {prediction.simulation.mean_home_goals.toFixed(1)}
                      <span style={{ color: "var(--text2)", margin: "0 4px" }}>–</span>
                      {prediction.simulation.mean_away_goals.toFixed(1)}
                    </p>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Key stats card */}
          <Card>
            <CardHeader title="Key Stats" />
            <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
              <div>
                {[
                  { label: "Confidence",  value: `${confidence}%` },
                  { label: "Model",       value: modelVersion },
                  { label: "Fair Odds H", value: fairOdds.home },
                  { label: "Fair Odds D", value: fairOdds.draw },
                  { label: "Fair Odds A", value: fairOdds.away },
                ].map(({ label, value }, i, arr) => (
                  <div
                    key={label}
                    style={{
                      display:        "flex",
                      justifyContent: "space-between",
                      alignItems:     "center",
                      padding:        "7px 0",
                      borderBottom:   i < arr.length - 1 ? "1px solid var(--border0)" : "none",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "var(--text1)" }}>{label}</span>
                    <span className="num" style={{ fontSize: 12, color: "var(--text0)", fontWeight: 500 }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Feature drivers card */}
          <Card>
            <CardHeader title="Feature Drivers" />
            <CardBody>
              <FeatureDriverChart drivers={drivers} />
            </CardBody>
          </Card>

          {/* AI reasoning card */}
          {reasoning && (
            <Card>
              <CardHeader
                title="AI Analysis"
                right={
                  <span style={{ fontSize: 10, color: "var(--text2)", fontStyle: "italic" }}>
                    Claude Haiku
                  </span>
                }
              />
              <CardBody>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text1)", margin: 0 }}>
                  {reasoning}
                </p>
              </CardBody>
            </Card>
          )}
        </div>

        {/* ── RIGHT COLUMN (40%) ─────────────────────────────────────── */}
        <div style={{ flex: "0 0 40%", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <ErrorBoundary fallback={<EmptyState icon={BarChart2} title="Charts unavailable" />}>

            {/* ELO history card */}
            <Card>
              <CardHeader
                title="ELO Rating History"
                subtitle="20 weeks"
              />
              <CardBody>
                <EloComparisonChart
                  data={eloHistory}
                  homeLabel={homeName}
                  awayLabel={awayName}
                />
              </CardBody>
            </Card>

            {/* Simulation distribution card */}
            <Card>
              <CardHeader
                title="Scoreline Distribution"
                subtitle={`${(prediction?.simulation?.n_simulations ?? 10000).toLocaleString()} simulations`}
              />
              <CardBody>
                <SimulationDistributionChart
                  data={simBuckets}
                  homeLabel={homeName}
                  awayLabel={awayName}
                />
              </CardBody>
            </Card>

          </ErrorBoundary>
        </div>
      </div>
    </AppShell>
  );
}
