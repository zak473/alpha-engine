import { AppShell } from "@/components/layout/AppShell";
import { notFound } from "next/navigation";
import type { SportSlug } from "@/lib/api";
import { SGOMatchDetail } from "./SGOMatchDetail";

export const dynamic = "force-dynamic";

const VALID_SPORTS: SportSlug[] = ["soccer", "tennis", "esports", "basketball", "baseball", "hockey"];

interface PageProps {
  params: { sport: string; id: string };
}

export default async function SportMatchDetailPage({ params }: PageProps) {
  const sport = params.sport as SportSlug;
  if (!VALID_SPORTS.includes(sport)) notFound();

  const apiKey = process.env.SGO_API_KEY ?? "";
  const res = await fetch(
    `https://api.sportsgameodds.com/v2/events/?apiKey=${apiKey}&eventID=${params.id}`,
    { cache: "no-store" }
  );

  if (!res.ok) notFound();
  const data = await res.json();
  const event = data.data?.[0];
  if (!event) notFound();

  const homeName = event.teams.home.names.long;
  const awayName = event.teams.away.names.long;

  return (
    <AppShell title={`${homeName} vs ${awayName}`} subtitle={event.leagueID}>
      <SGOMatchDetail event={event} sport={sport} />
    </AppShell>
  );
}
