import { AppShell } from "@/components/layout/AppShell";
import { notFound } from "next/navigation";
import { SGOMatchDetail } from "@/app/sports/[sport]/matches/[id]/SGOMatchDetail";
import { fetchMatchPageData } from "@/app/sports/_lib/fetchMatchPageData";

export const dynamic = "force-dynamic";

export default async function EsportsMatchPage({ params }: { params: { id: string } }) {
  const data = await fetchMatchPageData("esports", params.id);
  if (!data) notFound();
  const { event, backendMatch, eloHome, eloAway } = data;
  return (
    <AppShell title={`${event.teams.home.names.long} vs ${event.teams.away.names.long}`} subtitle={String(event.leagueID)}>
      <SGOMatchDetail event={event} sport="esports" backendMatch={backendMatch} eloHome={eloHome} eloAway={eloAway} />
    </AppShell>
  );
}
