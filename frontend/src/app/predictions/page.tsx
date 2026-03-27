import { AppShell } from "@/components/layout/AppShell";
import { PredictionsShell } from "./PredictionsShell";

export const dynamic = "force-dynamic";

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>;
}) {
  const params = await searchParams;

  return (
    <AppShell title="Predictions" subtitle="High-conviction picks, clearer filters, and faster match-level decisions" compact hideHero>
      <PredictionsShell initialSport={params.sport ?? "all"} />
    </AppShell>
  );
}
