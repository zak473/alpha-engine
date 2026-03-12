import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getHockeyMatchDetail, getHockeyTeamEloHistory } from "@/lib/api";
import { HockeyMatchDetail } from "./HockeyMatchDetail";

export const revalidate = 30;

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props) {
  try {
    const match = await getHockeyMatchDetail(params.id);
    return {
      title: `${match.home.name} vs ${match.away.name} — Never In Doubt`,
      description: `${match.league}${match.season ? " · " + match.season : ""}`,
    };
  } catch {
    return { title: "Match — Never In Doubt" };
  }
}

export default async function HockeyMatchPage({ params }: Props) {
  let match;
  try {
    match = await getHockeyMatchDetail(params.id);
  } catch {
    notFound();
  }

  const [eloHomeHistory, eloAwayHistory] = await Promise.all([
    getHockeyTeamEloHistory(match.home.id, 30),
    getHockeyTeamEloHistory(match.away.id, 30),
  ]);

  return (
    <AppShell title={`${match.home.name} vs ${match.away.name}`} subtitle={match.league}>
      <HockeyMatchDetail
        match={match}
        eloHomeHistory={eloHomeHistory}
        eloAwayHistory={eloAwayHistory}
      />
    </AppShell>
  );
}
