import { AppShell } from "@/components/layout/AppShell";
import { LiveView } from "./LiveView";

export const dynamic = "force-dynamic";

export default function LivePage() {
  return (
    <AppShell title="Live Now" subtitle="Live matches from Sports Hub">
      <LiveView />
    </AppShell>
  );
}
