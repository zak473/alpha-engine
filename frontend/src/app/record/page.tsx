import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RecordView } from "./RecordView";

export const dynamic = "force-dynamic";

export default async function RecordPage() {
  const token = cookies().get("ae_token")?.value;
  if (!token) redirect("/login?next=/record");

  return (
    <AppShell title="Bet Record" subtitle="Settled picks, outcomes, and slip history" requireAuth>
      <RecordView />
    </AppShell>
  );
}
