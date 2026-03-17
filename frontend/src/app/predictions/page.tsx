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
    <AppShell title="Intelligence" subtitle="Today's best picks · top tipsters · strongest edges">
      <PredictionsShell initialSport={params.sport ?? "all"} />
    </AppShell>
  );
}
