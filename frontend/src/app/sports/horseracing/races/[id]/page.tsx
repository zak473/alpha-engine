import { AppShell } from "@/components/layout/AppShell";
import { notFound } from "next/navigation";
import { RaceDetailClient } from "./RaceDetailClient";

export const dynamic = "force-dynamic";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function fetchRaceDetail(id: string) {
  try {
    const { cookies } = await import("next/headers");
    const token = cookies().get("ae_token")?.value;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(
      `${API_ORIGIN}/api/v1/sports/horseracing/races/${id}`,
      { headers, cache: "no-store" }
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function RaceDetailPage({ params }: { params: { id: string } }) {
  const race = await fetchRaceDetail(params.id);
  if (!race) notFound();

  const subtitle = [
    race.course,
    race.off_time,
    race.going ? `Going: ${race.going}` : null,
    race.prize,
  ].filter(Boolean).join(" · ");

  return (
    <AppShell title={race.race_name} subtitle={subtitle}>
      <RaceDetailClient race={race} />
    </AppShell>
  );
}
