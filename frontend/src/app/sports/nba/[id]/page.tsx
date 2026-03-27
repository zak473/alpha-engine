import { AppShell } from "@/components/layout/AppShell";
import { NBAGameDetailPage } from "./NBAGameDetailPage";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props) {
  return { title: `NBA Game #${params.id} — Never In Doubt` };
}

export default function NBAGamePage({ params }: Props) {
  return (
    <AppShell
      title="NBA Game Center"
      subtitle="BallDontLie GOAT · Live scores, box score, odds, H2H analysis"
      eyebrow="NBA command board"
      stats={[
        { label: "Coverage", value: "Live", hint: "Scores, odds, and play-by-play in one board", tone: "positive" },
        { label: "Mode", value: "Deep detail", hint: "Box score plus trend context", tone: "accent" },
        { label: "League", value: "NBA", hint: "Primary basketball intelligence feed", tone: "neutral" },
      ]}
    >
      <NBAGameDetailPage gameId={params.id} />
    </AppShell>
  );
}
