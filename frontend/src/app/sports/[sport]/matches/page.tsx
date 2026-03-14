import { AppShell } from "@/components/layout/AppShell";
import { SportMatchesView } from "./SportMatchesView";
import { notFound } from "next/navigation";
import type { SportSlug } from "@/lib/api";

export const dynamic = "force-dynamic";

const VALID_SPORTS: SportSlug[] = ["soccer", "tennis", "esports", "basketball", "baseball", "hockey"];

const SPORT_LABELS: Record<SportSlug, string> = {
  soccer:     "Soccer",
  tennis:     "Tennis",
  esports:    "Esports",
  basketball: "Basketball",
  baseball:   "Baseball",
  hockey:     "Hockey",
};

const SPORT_ICONS: Record<SportSlug, string> = {
  soccer:     "⚽",
  tennis:     "🎾",
  esports:    "🎮",
  basketball: "🏀",
  baseball:   "⚾",
  hockey:     "🏒",
};

interface PageProps {
  params: { sport: string };
}

export default function SportMatchesPage({ params }: PageProps) {
  const sport = params.sport as SportSlug;
  if (!VALID_SPORTS.includes(sport)) notFound();

  const label = SPORT_LABELS[sport];
  const icon = SPORT_ICONS[sport];

  return (
    <AppShell title={`${icon} ${label} Hub`} subtitle="Fixtures, live prices, and in-play reads">
      <SportMatchesView sport={sport} matches={[]} total={0} />
    </AppShell>
  );
}
