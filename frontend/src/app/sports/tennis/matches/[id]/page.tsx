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

  const surface = match.tennis_info?.surface ?? undefined;

  const [eloHomeOverall, eloAwayOverall, eloHomeSurface, eloAwaySurface] = await Promise.all([
    getTennisPlayerEloHistory(match.home.id, undefined, 30),
    getTennisPlayerEloHistory(match.away.id, undefined, 30),
    getTennisPlayerEloHistory(match.home.id, surface, 30),
    getTennisPlayerEloHistory(match.away.id, surface, 30),
  ]);

  return (
    <AppShell title={`${match.home.name} vs ${match.away.name}`} subtitle={match.league}>
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
