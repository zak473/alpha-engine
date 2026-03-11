import { AppShell } from "@/components/layout/AppShell";
import { getLiveMatches } from "@/lib/api";
import { LiveView } from "./LiveView";

export const revalidate = 15;

export default async function LivePage() {
  let matches = [];
  try {
    matches = await getLiveMatches();
  } catch {
    matches = [];
  }

  const liveCount = matches.filter((m) => m.is_live).length;
  const subtitle = liveCount > 0
    ? `${liveCount} match${liveCount !== 1 ? "es" : ""} live now`
    : "No live matches — showing next fixtures";

  return (
    <AppShell title="Live Now" subtitle={subtitle}>
      <LiveView initialMatches={matches} />
    </AppShell>
  );
}
