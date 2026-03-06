import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getBasketballMatchDetail, getBasketballTeamEloHistory } from "@/lib/api";
import { BasketballMatchDetail } from "./BasketballMatchDetail";

export const revalidate = 30;

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props) {
  try {
    const match = await getBasketballMatchDetail(params.id);
    const desc = [match.league, match.match_info?.arena, match.match_info?.season_phase?.toUpperCase()].filter(Boolean).join(" · ");
    return {
      title: `${match.home.name} vs ${match.away.name} — Alpha Engine`,
      description: desc,
    };
  } catch {
    return { title: "Match — Alpha Engine" };
  }
}

export default async function BasketballMatchPage({ params }: Props) {
  let match;
  try {
    match = await getBasketballMatchDetail(params.id);
  } catch {
    notFound();
  }

  const [eloHomeHistory, eloAwayHistory] = await Promise.all([
    getBasketballTeamEloHistory(match.elo_home?.team_id ?? match.home.id),
    getBasketballTeamEloHistory(match.elo_away?.team_id ?? match.away.id),
  ]);

  return (
    <AppShell title={`${match.home.name} vs ${match.away.name}`}>
      <BasketballMatchDetail
        match={match}
        eloHomeHistory={eloHomeHistory}
        eloAwayHistory={eloAwayHistory}
      />
    </AppShell>
  );
}
