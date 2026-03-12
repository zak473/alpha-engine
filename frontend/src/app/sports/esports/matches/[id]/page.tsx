import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getEsportsMatchDetail } from "@/lib/api";
import { MatchDetailShell } from "@/app/sports/[sport]/matches/[id]/MatchDetailShell";

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

  return (
    <AppShell title={`${match.home.name} vs ${match.away.name}`} subtitle={match.league}>
      <MatchDetailShell match={match as any} sport="esports" />
    </AppShell>
  );
}
