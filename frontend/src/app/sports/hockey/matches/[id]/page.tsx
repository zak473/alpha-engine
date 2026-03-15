import { AppShell } from "@/components/layout/AppShell";
import { notFound } from "next/navigation";
import { SGOMatchDetail } from "@/app/sports/[sport]/matches/[id]/SGOMatchDetail";
import { fetchMatchPageData } from "@/app/sports/_lib/fetchMatchPageData";

export const dynamic = "force-dynamic";

export default async function HockeyMatchPage({ params }: { params: { id: string } }) {
  const data = await fetchMatchPageData("hockey", params.id);
  if (!data) notFound();
  const { event, backendMatch, eloHome, eloAway } = data;
  return (
    <AppShell title={`${event.teams.home.names.long} vs ${event.teams.away.names.long}`} subtitle={String(event.leagueID)}>
      <SGOMatchDetail event={event} sport="hockey" backendMatch={backendMatch} eloHome={eloHome} eloAway={eloAway} />
    </AppShell>
  );
}
