import { AppShell } from "@/components/layout/AppShell";
import { CS2MatchDetailPage } from "./CS2MatchDetailPage";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props) {
  return {
    title: `CS2 Match #${params.id} — Never In Doubt`,
  };
}

export default function CS2MatchPage({ params }: Props) {
  return (
    <AppShell title="CS2 Match Center" subtitle="BallDontLie GOAT · Live stats, round history, player performance">
      <CS2MatchDetailPage matchId={params.id} />
    </AppShell>
  );
}
