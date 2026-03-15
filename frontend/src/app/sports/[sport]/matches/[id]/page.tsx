import { AppShell } from "@/components/layout/AppShell";
import { getSportMatchDetail } from "@/lib/api";
import type { SportSlug } from "@/lib/api";
import { MatchDetailShell } from "./MatchDetailShell";
import { notFound, redirect } from "next/navigation";
import { NBAGameDetailPage } from "@/app/sports/nba/[id]/NBAGameDetailPage";

export const dynamic = "force-dynamic";

const VALID_SPORTS: SportSlug[] = ["soccer", "tennis", "esports", "basketball", "baseball", "hockey"];

interface PageProps {
  params: { sport: string; id: string };
}

export default async function SportMatchDetailPage({ params }: PageProps) {
  const sport = params.sport as SportSlug;
  if (!VALID_SPORTS.includes(sport)) notFound();

  // Basketball uses BallDontLie — no backend route exists
  if (sport === "basketball") {
    return (
      <AppShell title="NBA Game Center" subtitle="BallDontLie GOAT · Live scores, box score, odds, H2H analysis">
        <NBAGameDetailPage gameId={params.id} />
      </AppShell>
    );
  }

  let match: any = null;
  try {
    match = await getSportMatchDetail(sport, params.id);
  } catch {
    notFound();
  }

  const title = `${match.home.name} vs ${match.away.name}`;

  return (
    <AppShell title={title} subtitle={match.league}>
      <MatchDetailShell match={match} sport={sport} />
    </AppShell>
  );
}
