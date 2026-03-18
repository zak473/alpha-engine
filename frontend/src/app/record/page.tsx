import { AppShell } from "@/components/layout/AppShell";
import { RecordView } from "./RecordView";

export const dynamic = "force-dynamic";

export default async function RecordPage() {

  return (
    <AppShell title="Record">
      <RecordView />
    </AppShell>
  );
}
