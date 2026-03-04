import { AppShell } from "@/components/layout/AppShell";
import {
  getPredictions,
  getPerformance,
  getHealth,
  getReady,
  getMockPredictions,
  getChallenges,
  getLeaderboard,
} from "@/lib/api";
import { mvpToMatch } from "@/lib/transforms";
import type { MvpPrediction, MvpPerformance, Challenge, LeaderboardOut } from "@/lib/types";
import { DashboardShell } from "./DashboardShell";
import type { SportFilter, RangeFilter } from "@/components/dashboard/FilterBar";

export const revalidate = 30;

interface PageProps {
  searchParams: { sport?: string; range?: string };
}

export default async function DashboardPage({ searchParams }: PageProps) {
  // Parse URL filters
  const sport  = (["soccer", "tennis", "esports"].includes(searchParams.sport ?? "")
    ? searchParams.sport as SportFilter
    : "all");
  const range  = (["today", "7d", "30d"].includes(searchParams.range ?? "")
    ? searchParams.range as RangeFilter
    : "today");

  // ── Data fetching ──────────────────────────────────────────────────────────
  let predictions: MvpPrediction[] = [];
  let performance: MvpPerformance | null = null;
  let myChallenges: Challenge[] = [];
  let leaderboards: LeaderboardOut[] = [];
  let apiOk = false;
  let dbOk  = false;

  const [predResult, perfResult, healthResult, readyResult, challengeResult] =
    await Promise.allSettled([
      getPredictions({ status: "scheduled", limit: 50 }),
      getPerformance("soccer"),
      getHealth(),
      getReady(),
      getChallenges({ mine: true }),
    ]);

  if (predResult.status === "fulfilled") {
    predictions = predResult.value.items;
  }
  if (perfResult.status === "fulfilled") {
    performance = perfResult.value;
  }
  if (healthResult.status === "fulfilled") {
    apiOk = healthResult.value.status === "ok";
  }
  if (readyResult.status === "fulfilled") {
    dbOk = readyResult.value.db === true;
    if (readyResult.value.status === "ok") apiOk = true;
  }
  if (challengeResult.status === "fulfilled") {
    myChallenges = challengeResult.value;
  }

  // Fallback to rich mock predictions when API has no data
  if (predictions.length === 0) {
    predictions = getMockPredictions();
  }

  // Fetch leaderboards for each active challenge
  if (myChallenges.length > 0) {
    const lbResults = await Promise.allSettled(
      myChallenges
        .filter((c) => new Date(c.end_at).getTime() > Date.now())
        .slice(0, 4)
        .map((c) => getLeaderboard(c.id))
    );
    leaderboards = lbResults
      .filter((r): r is PromiseFulfilledResult<LeaderboardOut> => r.status === "fulfilled")
      .map((r) => r.value);
  }

  return (
    <AppShell title="Dashboard" subtitle="Command Center" compact>
      <DashboardShell
        predictions={predictions}
        performance={performance}
        myChallenges={myChallenges}
        leaderboards={leaderboards}
        systemStatus={{ api: apiOk, db: dbOk, env: "development" }}
        initialSport={sport}
        initialRange={range}
        userId="user-demo"
      />
    </AppShell>
  );
}
