import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { notFound } from "next/navigation";
import type { SportSlug } from "@/lib/api";
import { SGOMatchDetail } from "./SGOMatchDetail";
import { fetchMatchPageData } from "@/app/sports/_lib/fetchMatchPageData";
import { VALID_SPORTS, getSportDetailShell, buildMatchMetadata } from "@/app/sports/_lib/display";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { sport: string; id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const sport = params.sport as SportSlug;
  if (!VALID_SPORTS.includes(sport)) return {};
  const data = await fetchMatchPageData(sport, params.id).catch(() => null);
  if (!data) return {};
  return buildMatchMetadata(sport, data);
}

export default async function SportMatchDetailPage({ params }: PageProps) {
  const sport = params.sport as SportSlug;
  if (!VALID_SPORTS.includes(sport)) notFound();

  const data = await fetchMatchPageData(sport, params.id);
  if (!data) notFound();

  const { event, backendMatch, eloHome, eloAway } = data;
  const shell = getSportDetailShell(sport, event);

  return (
    <AppShell title={shell.title} subtitle={shell.subtitle} eyebrow={shell.eyebrow} stats={shell.stats}>
      <SGOMatchDetail event={event} sport={sport} backendMatch={backendMatch} eloHome={eloHome} eloAway={eloAway} />
    </AppShell>
  );
}
