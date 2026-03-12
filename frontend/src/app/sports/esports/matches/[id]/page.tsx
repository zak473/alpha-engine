import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getEsportsMatchDetail, getEsportsTeamEloHistory } from "@/lib/api";
import { EsportsMatchDetail } from "./EsportsMatchDetail";

export const revalidate = 30;

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props) {
  try {
    const match = await getEsportsMatchDetail(params.id);
    const info = match.match_info;
    const desc = [match.league, info?.series_format?.toUpperCase(), info?.game_type?.toUpperCase()].filter(Boolean).join(" · ");
    return {
      title: `${match.home.name} vs ${match.away.name} — Never In Doubt`,
      description: desc,
    };
  } catch {
    return { title: "Match — Never In Doubt" };
  }
}

export default async function EsportsMatchPage({ params }: Props) {
  let match;
  try {
    match = await getEsportsMatchDetail(params.id);
  } catch {
    notFound();
  }

  // Fetch global ELO history for both teams
  const [eloHomeHistory, eloAwayHistory] = await Promise.all([
    getEsportsTeamEloHistory(match.elo_home?.team_id ?? match.home.id),
    getEsportsTeamEloHistory(match.elo_away?.team_id ?? match.away.id),
  ]);

  return (
    <AppShell title={`${match.home.name} vs ${match.away.name}`}>
      <EsportsMatchDetail
        match={match}
        eloHomeHistory={eloHomeHistory}
        eloAwayHistory={eloAwayHistory}
      />
    </AppShell>
  );
}
