import { AppShell } from "@/components/layout/AppShell";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <AppShell title="Betting Board" subtitle="Never In Doubt live market view" compact>
      <DashboardClient />
    </AppShell>
  );
}
