import { AppShell } from "@/components/layout/AppShell";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <AppShell
      title="Dashboard"
      subtitle="Your intelligence hub"
      compact
      hideHero
    >
      <DashboardClient />
    </AppShell>
  );
}
