import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getSportMatchDetail } from "@/lib/api";
import { MatchDetailShell } from "@/app/sports/[sport]/matches/[id]/MatchDetailShell";

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

  return (
    <AppShell title={`${match.home.name} vs ${match.away.name}`} subtitle={match.league}>
      <MatchDetailShell match={match} sport="soccer" />
    </AppShell>
  );
}
