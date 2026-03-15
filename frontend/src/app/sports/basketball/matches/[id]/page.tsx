import { AppShell } from "@/components/layout/AppShell";
import { notFound } from "next/navigation";
import { SGOMatchDetail } from "@/app/sports/[sport]/matches/[id]/SGOMatchDetail";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export default async function BasketballMatchPage({ params }: Props) {
  const apiKey = process.env.SGO_API_KEY ?? "";
  const res = await fetch(
    `https://api.sportsgameodds.com/v2/events/?apiKey=${apiKey}&eventID=${params.id}`,
    { cache: "no-store" }
  );
  if (!res.ok) notFound();
  const data = await res.json();
  const event = data.data?.[0];
  if (!event) notFound();

  return (
    <AppShell title={`${event.teams.home.names.long} vs ${event.teams.away.names.long}`} subtitle={event.leagueID}>
      <SGOMatchDetail event={event} sport="basketball" />
    </AppShell>
  );
}
