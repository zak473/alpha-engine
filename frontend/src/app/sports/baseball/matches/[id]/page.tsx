import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { notFound } from "next/navigation";
import { SGOMatchDetail } from "@/app/sports/[sport]/matches/[id]/SGOMatchDetail";
import { fetchMatchPageData } from "@/app/sports/_lib/fetchMatchPageData";
import { getSportDetailShell, buildMatchMetadata } from "@/app/sports/_lib/display";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const data = await fetchMatchPageData("baseball", params.id).catch(() => null);
  if (!data) return {};
  return buildMatchMetadata("baseball", data);
}

export default async function BaseballMatchPage({ params }: { params: { id: string } }) {
  const data = await fetchMatchPageData("baseball", params.id);
  if (!data) notFound();
  const { event, backendMatch, eloHome, eloAway } = data;
  const shell = getSportDetailShell("baseball", event);

  return (
    <AppShell title={shell.title} subtitle={shell.subtitle} eyebrow={shell.eyebrow} stats={shell.stats}>
      <SGOMatchDetail event={event} sport="baseball" backendMatch={backendMatch} eloHome={eloHome} eloAway={eloAway} />
    </AppShell>
  );
}
