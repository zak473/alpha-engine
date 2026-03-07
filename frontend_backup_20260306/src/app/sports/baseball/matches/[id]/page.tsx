import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getBaseballMatchDetail, getBaseballTeamEloHistory } from "@/lib/api";
import { BaseballMatchDetail } from "./BaseballMatchDetail";

export const revalidate = 30;

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props) {
  try {
    const match = await getBaseballMatchDetail(params.id);
    const desc = [match.league, match.match_info?.ballpark, match.starter_home?.name, "vs", match.starter_away?.name].filter(Boolean).join(" · ");
    return {
      title: `${match.home.name} vs ${match.away.name} — Alpha Engine`,
      description: desc,
    };
  } catch {
    return { title: "Match — Alpha Engine" };
  }
}

export default async function BaseballMatchPage({ params }: Props) {
  let match;
  try {
    match = await getBaseballMatchDetail(params.id);
  } catch {
    notFound();
  }

  const [eloHomeHistory, eloAwayHistory] = await Promise.all([
    getBaseballTeamEloHistory(match.elo_home?.team_id ?? match.home.id),
    getBaseballTeamEloHistory(match.elo_away?.team_id ?? match.away.id),
  ]);

  return (
    <AppShell title={`${match.home.name} vs ${match.away.name}`}>
      <BaseballMatchDetail
        match={match}
        eloHomeHistory={eloHomeHistory}
        eloAwayHistory={eloAwayHistory}
      />
    </AppShell>
  );
}
