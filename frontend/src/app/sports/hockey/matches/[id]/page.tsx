import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { notFound } from "next/navigation";
import { SGOMatchDetail } from "@/app/sports/[sport]/matches/[id]/SGOMatchDetail";
import { fetchMatchPageData } from "@/app/sports/_lib/fetchMatchPageData";
import { getSportDetailShell, buildMatchMetadata } from "@/app/sports/_lib/display";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const data = await fetchMatchPageData("hockey", params.id).catch(() => null);
  if (!data) return {};
  return buildMatchMetadata("hockey", data);
}

export default async function HockeyMatchPage({ params }: { params: { id: string } }) {
  const data = await fetchMatchPageData("hockey", params.id);
  if (!data) notFound();
  const { event, backendMatch, eloHome, eloAway } = data;
  const shell = getSportDetailShell("hockey", event);

  return (
    <AppShell title={shell.title} subtitle={shell.subtitle} eyebrow={shell.eyebrow} stats={shell.stats}>
      <SGOMatchDetail event={event} sport="hockey" backendMatch={backendMatch} eloHome={eloHome} eloAway={eloAway} />
    </AppShell>
  );
}
