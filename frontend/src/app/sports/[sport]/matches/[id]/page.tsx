import { AppShell } from "@/components/layout/AppShell";
import { getSportMatchDetail } from "@/lib/api";
import type { SportSlug } from "@/lib/api";
import { MatchDetailShell } from "./MatchDetailShell";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const VALID_SPORTS: SportSlug[] = ["soccer", "tennis", "esports", "basketball", "baseball", "hockey"];

interface PageProps {
  params: { sport: string; id: string };
}

export default async function SportMatchDetailPage({ params }: PageProps) {
  const sport = params.sport as SportSlug;
  if (!VALID_SPORTS.includes(sport)) notFound();

  let match: any = null;
  try {
    match = await getSportMatchDetail(sport, params.id);
  } catch {
    notFound();
  }

  const title = `${match.home.name} vs ${match.away.name}`;

  return (
    <AppShell title={title} subtitle={match.league}>
      <MatchDetailShell match={match} sport={sport} />
    </AppShell>
  );
}
