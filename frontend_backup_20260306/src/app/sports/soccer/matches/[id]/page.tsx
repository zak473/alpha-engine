import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getSportMatchDetail, getSoccerTeamEloHistory } from "@/lib/api";
import { SoccerMatchDetail } from "./SoccerMatchDetail";

export const revalidate = 30;

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props) {
  try {
    const match = await getSportMatchDetail("soccer", params.id);
    return {
      title: `${match.home.name} vs ${match.away.name} — Alpha Engine`,
      description: `${match.league} · ${new Date(match.kickoff_utc).toLocaleDateString("en-GB")}`,
    };
  } catch {
    return { title: "Match — Alpha Engine" };
  }
}

export default async function SoccerMatchPage({ params }: Props) {
  let match;
  try {
    match = await getSportMatchDetail("soccer", params.id);
  } catch {
    notFound();
  }

  // Fetch ELO history for both teams in parallel
  const [eloHome, eloAway] = await Promise.all([
    getSoccerTeamEloHistory(match.elo_home?.team_id ?? match.home.id),
    getSoccerTeamEloHistory(match.elo_away?.team_id ?? match.away.id),
  ]);

  return (
    <AppShell title={`${match.home.name} vs ${match.away.name}`}>
      <SoccerMatchDetail match={match} eloHome={eloHome} eloAway={eloAway} />
    </AppShell>
  );
}
