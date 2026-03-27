import { AppShell } from "@/components/layout/AppShell";
import { SportMatchesView } from "./SportMatchesView";
import { notFound } from "next/navigation";
import type { SportSlug } from "@/lib/api";
import { VALID_SPORTS, getSportHubShell } from "@/app/sports/_lib/display";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { sport: string };
}

export default function SportMatchesPage({ params }: PageProps) {
  const sport = params.sport as SportSlug;
  if (!VALID_SPORTS.includes(sport)) notFound();

  const shell = getSportHubShell(sport);

  return (
    <AppShell title={shell.title} subtitle={shell.subtitle} eyebrow={shell.eyebrow} stats={shell.stats} compact hideHero>
      <SportMatchesView sport={sport} />
    </AppShell>
  );
}
