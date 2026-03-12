import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getBasketballMatchDetail } from "@/lib/api";
import { MatchDetailShell } from "@/app/sports/[sport]/matches/[id]/MatchDetailShell";

export const revalidate = 30;

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props) {
  try {
    const match = await getBasketballMatchDetail(params.id);
    const desc = [match.league, match.match_info?.arena, match.match_info?.season_phase?.toUpperCase()].filter(Boolean).join(" · ");
    return {
      title: `${match.home.name} vs ${match.away.name} — Never In Doubt`,
      description: desc,
    };
  } catch {
    return { title: "Match — Never In Doubt" };
  }
}

export default async function BasketballMatchPage({ params }: Props) {
  let match;
  try {
    match = await getBasketballMatchDetail(params.id);
  } catch {
    notFound();
  }

  return (
    <AppShell title={`${match.home.name} vs ${match.away.name}`} subtitle={match.league}>
      <MatchDetailShell match={match as any} sport="basketball" />
    </AppShell>
  );
}
