import { AppShell } from "@/components/layout/AppShell";
import { HorseRacingClient } from "./HorseRacingClient";

export const dynamic = "force-dynamic";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function fetchTodayRaces() {
  const today = new Date().toISOString().split("T")[0];
  try {
    const { cookies } = await import("next/headers");
    const token = cookies().get("ae_token")?.value;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(
      `${API_ORIGIN}/api/v1/sports/horseracing/races?date=${today}&limit=200`,
      { headers, cache: "no-store" }
    );
    if (!res.ok) return { items: [], total: 0 };
    return res.json();
  } catch {
    return { items: [], total: 0 };
  }
}

export default async function HorseRacingPage() {
  const data = await fetchTodayRaces();

  return (
    <AppShell title="Horse Racing" subtitle="Today's UK & International Racecards">
      <HorseRacingClient initialRaces={data.items ?? []} />
    </AppShell>
  );
}
