import { AppShell } from "@/components/layout/AppShell";
import { getSportMatches } from "@/lib/api";
import type { SportSlug } from "@/lib/api";
import { SportMatchesView } from "./SportMatchesView";
import { notFound } from "next/navigation";

export const revalidate = 30;

const VALID_SPORTS: SportSlug[] = ["soccer", "tennis", "esports", "basketball", "baseball"];

const SPORT_LABELS: Record<SportSlug, string> = {
  soccer:     "Soccer",
  tennis:     "Tennis",
  esports:    "Esports",
  basketball: "Basketball",
  baseball:   "Baseball",
};

const SPORT_ICONS: Record<SportSlug, string> = {
  soccer:     "⚽",
  tennis:     "🎾",
  esports:    "🎮",
  basketball: "🏀",
  baseball:   "⚾",
};

interface PageProps {
  params: { sport: string };
  searchParams: { status?: string; league?: string; date_from?: string; date_to?: string };
}

export default async function SportMatchesPage({ params, searchParams }: PageProps) {
  const sport = params.sport as SportSlug;
  if (!VALID_SPORTS.includes(sport)) notFound();

  // Default: show from 2 days ago so stale old scheduled matches don't surface
  const defaultDateFrom = new Date();
  defaultDateFrom.setDate(defaultDateFrom.getDate() - 2);
  const dateFrom = searchParams.date_from ?? defaultDateFrom.toISOString().split("T")[0];

  let data: { items: any[]; total: number } = { items: [], total: 0 };
  try {
    data = await getSportMatches(sport, {
      status: searchParams.status,
      league: searchParams.league,
      date_from: dateFrom,
      date_to: searchParams.date_to,
      limit: 100,
    });
  } catch {
    // Render empty state rather than crashing
  }

  const label = SPORT_LABELS[sport];
  const icon = SPORT_ICONS[sport];

  return (
    <AppShell title={`${icon} ${label}`} subtitle="Games">
      <SportMatchesView
        sport={sport}
        matches={data.items}
        total={data.total}
      />
    </AppShell>
  );
}
