import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { notFound } from "next/navigation";
import { SGOMatchDetail } from "@/app/sports/[sport]/matches/[id]/SGOMatchDetail";
import { fetchMatchPageData } from "@/app/sports/_lib/fetchMatchPageData";
import { getSportDetailShell, buildMatchMetadata } from "@/app/sports/_lib/display";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const data = await fetchMatchPageData("basketball", params.id).catch(() => null);
  if (!data) return {};
  return buildMatchMetadata("basketball", data);
}

export default async function BasketballMatchPage({ params }: { params: { id: string } }) {
  const data = await fetchMatchPageData("basketball", params.id);
  if (!data) notFound();
  const { event, backendMatch, eloHome, eloAway } = data;
  const shell = getSportDetailShell("basketball", event);

  return (
    <AppShell title={shell.title} subtitle={shell.subtitle} eyebrow={shell.eyebrow} stats={shell.stats}>
      <SGOMatchDetail event={event} sport="basketball" backendMatch={backendMatch} eloHome={eloHome} eloAway={eloAway} />
    </AppShell>
  );
}
