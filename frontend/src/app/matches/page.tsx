import { AppShell } from "@/components/layout/AppShell";
import { MatchesClient } from "./MatchesClient";

export const dynamic = "force-dynamic";

export default function MatchesPage() {
  return (
    <AppShell title="Market Board" subtitle="Matches across your betting board">
      <MatchesClient />
    </AppShell>
  );
}
