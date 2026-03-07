import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getTennisMatchDetail, getTennisPlayerEloHistory } from "@/lib/api";
import { TennisMatchDetail } from "./TennisMatchDetail";

export const revalidate = 30;

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props) {
  try {
    const match = await getTennisMatchDetail(params.id);
    const info = match.tennis_info;
    const desc = [match.league, info?.round_name, info?.surface].filter(Boolean).join(" · ");
    return {
      title: `${match.home.name} vs ${match.away.name} — Never In Doubt`,
      description: desc || `Tennis · ${match.league}`,
    };
  } catch {
    return { title: "Match — Never In Doubt" };
  }
}

export default async function TennisMatchPage({ params }: Props) {
  let match;
  try {
    match = await getTennisMatchDetail(params.id);
  } catch {
    notFound();
  }

  const surface = match.tennis_info?.surface;

  // Fetch ELO history for both players (overall + surface) in parallel
  const [eloHomeOverall, eloAwayOverall, eloHomeSurface, eloAwaySurface] = await Promise.all([
    getTennisPlayerEloHistory(match.elo_home?.player_id ?? match.home.id),
    getTennisPlayerEloHistory(match.elo_away?.player_id ?? match.away.id),
    surface ? getTennisPlayerEloHistory(match.elo_home?.player_id ?? match.home.id, surface) : Promise.resolve([]),
    surface ? getTennisPlayerEloHistory(match.elo_away?.player_id ?? match.away.id, surface) : Promise.resolve([]),
  ]);

  return (
    <AppShell title={`${match.home.name} vs ${match.away.name}`}>
      <TennisMatchDetail
        match={match}
        eloHomeOverall={eloHomeOverall}
        eloAwayOverall={eloAwayOverall}
        eloHomeSurface={eloHomeSurface}
        eloAwaySurface={eloAwaySurface}
      />
    </AppShell>
  );
}
