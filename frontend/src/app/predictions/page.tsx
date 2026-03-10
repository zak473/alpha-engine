import { AppShell } from "@/components/layout/AppShell";
import { getPredictions } from "@/lib/api";
import { PredictionsShell } from "./PredictionsShell";

export const dynamic = "force-dynamic";

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string; status?: string; range?: string }>;
}) {
  const params = await searchParams;
  const sport = params.sport && params.sport !== "all" ? params.sport : undefined;
  const status = params.status && params.status !== "all" ? params.status : undefined;

  // Date range
  let dateFrom: string | undefined;
  const range = params.range ?? "7d";
  const now = new Date();
  if (range === "today") {
    dateFrom = now.toISOString().slice(0, 10);
  } else if (range === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    dateFrom = d.toISOString().slice(0, 10);
  } else if (range === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    dateFrom = d.toISOString().slice(0, 10);
  }

  let data;
  try {
    data = await getPredictions({ sport, status, date_from: dateFrom, limit: 200 });
  } catch {
    data = { items: [], total: 0, sport: null, date_from: null, date_to: null };
  }

  return (
    <AppShell title="Tip Finder" subtitle="Model edges, confidence, and pre-match pricing">
      <PredictionsShell
        initialData={data}
        initialSport={params.sport ?? "all"}
        initialStatus={params.status ?? "all"}
        initialRange={range}
      />
    </AppShell>
  );
}
