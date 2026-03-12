import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getTennisMatchDetail } from "@/lib/api";
import { MatchDetailShell } from "@/app/sports/[sport]/matches/[id]/MatchDetailShell";

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

  return (
    <AppShell title={`${match.home.name} vs ${match.away.name}`} subtitle={match.league}>
      <MatchDetailShell match={match as any} sport="tennis" />
    </AppShell>
  );
}
