import { AppShell } from "@/components/layout/AppShell";
import { TipstersView } from "./TipstersView";
import { getTipsters } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tipsters",
};

export default async function TipstersPage() {
  const tipsters = await getTipsters().catch(() => []);
  return (
    <AppShell title="Tipsters" subtitle="Follow community tipsters and tail their picks">
      <TipstersView initialTipsters={tipsters} />
    </AppShell>
  );
}
