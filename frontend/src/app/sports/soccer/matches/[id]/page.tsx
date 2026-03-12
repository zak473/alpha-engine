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
      title: `${match.home.name} vs ${match.away.name} — Never In Doubt`,
      description: `${match.league} · ${new Date(match.kickoff_utc).toLocaleDateString("en-GB")}`,
    };
  } catch {
    return { title: "Match — Never In Doubt" };
  }
}

export default async function SoccerMatchPage({ params }: Props) {
  let match;
  try {
    match = await getSportMatchDetail("soccer", params.id);
  } catch {
    notFound();
  }

  const [eloHome, eloAway] = await Promise.all([
    getSoccerTeamEloHistory(match.home.id, 30),
    getSoccerTeamEloHistory(match.away.id, 30),
  ]);

  return (
    <AppShell title={`${match.home.name} vs ${match.away.name}`} subtitle={match.league}>
      <SoccerMatchDetail match={match} eloHome={eloHome} eloAway={eloAway} />
    </AppShell>
  );
}
