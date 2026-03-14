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
    >
      <NBAGameDetailPage gameId={params.id} />
    </AppShell>
  );
}
