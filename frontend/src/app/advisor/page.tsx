import { AppShell } from "@/components/layout/AppShell";
import { AdvisorClient } from "./AdvisorClient";

export const dynamic = "force-dynamic";

export default function AdvisorPage() {
  return (
    <AppShell title="AI Advisor" subtitle="Sports intelligence, powered by Claude">
      <AdvisorClient />
    </AppShell>
  );
}
