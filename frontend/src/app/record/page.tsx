import { AppShell } from "@/components/layout/AppShell";
import { RecordView } from "./RecordView";

export const dynamic = "force-dynamic";

export default function RecordPage() {
  return (
    <AppShell title="📋 Record" subtitle="Pick History">
      <RecordView />
    </AppShell>
  );
}
