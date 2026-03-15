import { AppShell } from "@/components/layout/AppShell";
import { notFound } from "next/navigation";
import { SGOMatchDetail } from "@/app/sports/[sport]/matches/[id]/SGOMatchDetail";
import { fetchMatchPageData } from "@/app/sports/_lib/fetchMatchPageData";

export const dynamic = "force-dynamic";

export default async function BaseballMatchPage({ params }: { params: { id: string } }) {
  const data = await fetchMatchPageData("baseball", params.id);
  if (!data) notFound();
  const { event, backendMatch, eloHome, eloAway } = data;
  return (
    <AppShell title={`${event.teams.home.names.long} vs ${event.teams.away.names.long}`} subtitle={String(event.leagueID)}>
      <SGOMatchDetail event={event} sport="baseball" backendMatch={backendMatch} eloHome={eloHome} eloAway={eloAway} />
    </AppShell>
  );
}
