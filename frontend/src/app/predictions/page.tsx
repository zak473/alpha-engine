import { AppShell } from "@/components/layout/AppShell";
import { getPredictions } from "@/lib/api";
import { PredictionsShell } from "./PredictionsShell";

export const dynamic = "force-dynamic";

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string; status?: string }>;
}) {
  const params = await searchParams;
  const sport = params.sport && params.sport !== "all" ? params.sport : undefined;
  const status = params.status && params.status !== "all" ? params.status : undefined;

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  let data;
  try {
    data = await getPredictions({
      sport,
      status,
      date_from: now.toISOString(),
      date_to: in24h.toISOString(),
      limit: 200,
    });
  } catch {
    data = { items: [], total: 0, sport: null, date_from: null, date_to: null };
  }

  return (
    <AppShell title="Tip Finder" subtitle="Model edges, confidence, and pre-match pricing">
      <PredictionsShell
        initialData={data}
        initialSport={params.sport ?? "all"}
        initialStatus={params.status ?? "all"}
      />
    </AppShell>
  );
}
