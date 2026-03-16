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
    <AppShell title="Tip Finder" subtitle="Model edges, confidence, and pre-match pricing">
      <PredictionsShell initialSport={params.sport ?? "all"} />
    </AppShell>
  );
}
