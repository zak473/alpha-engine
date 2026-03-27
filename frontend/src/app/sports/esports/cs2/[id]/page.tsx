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
    <AppShell
      title="CS2 Match Center"
      subtitle="BallDontLie GOAT · Live stats, round history, player performance"
      eyebrow="CS2 command board"
      stats={[
        { label: "Coverage", value: "Map-level", hint: "Round flow, player form, and team trend view", tone: "accent" },
        { label: "Live sync", value: "Active", hint: "Fast-refresh esports board", tone: "positive" },
        { label: "Mode", value: "Deep detail", hint: "Tournament, maps, and roster context", tone: "neutral" },
      ]}
    >
      <CS2MatchDetailPage matchId={params.id} />
    </AppShell>
  );
}
