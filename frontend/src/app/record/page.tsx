import { AppShell } from "@/components/layout/AppShell";
import { RecordView } from "./RecordView";

export const dynamic = "force-dynamic";

export default function RecordPage() {
  return (
    <AppShell title="Bet Record" subtitle="Settled picks, outcomes, and slip history">
      <RecordView />
    </AppShell>
  );
}
