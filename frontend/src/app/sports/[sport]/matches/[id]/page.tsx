import { AppShell } from "@/components/layout/AppShell";
import { notFound } from "next/navigation";
import type { SportSlug } from "@/lib/api";
import { SGOMatchDetail } from "./SGOMatchDetail";
import { fetchMatchPageData } from "@/app/sports/_lib/fetchMatchPageData";

export const dynamic = "force-dynamic";

const VALID_SPORTS: SportSlug[] = ["soccer", "tennis", "esports", "basketball", "baseball", "hockey"];

interface PageProps {
  params: { sport: string; id: string };
}

export default async function SportMatchDetailPage({ params }: PageProps) {
  const sport = params.sport as SportSlug;
  if (!VALID_SPORTS.includes(sport)) notFound();

  const data = await fetchMatchPageData(sport, params.id);
  if (!data) notFound();

  const { event, backendMatch, eloHome, eloAway } = data;
  const homeName = event.teams.home.names.long;
  const awayName = event.teams.away.names.long;

  return (
    <AppShell title={`${homeName} vs ${awayName}`} subtitle={String(event.leagueID)}>
      <SGOMatchDetail event={event} sport={sport} backendMatch={backendMatch} eloHome={eloHome} eloAway={eloAway} />
    </AppShell>
  );
}
