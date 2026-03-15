import { AppShell } from "@/components/layout/AppShell";
import { NBAGameDetailPage } from "@/app/sports/nba/[id]/NBAGameDetailPage";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props) {
  return { title: `NBA Game #${params.id} — Never In Doubt` };
}

export default function BasketballMatchPage({ params }: Props) {
  return (
    <AppShell
      title="NBA Game Center"
      subtitle="BallDontLie GOAT · Live scores, box score, odds, H2H analysis"
    >
      <NBAGameDetailPage gameId={params.id} />
    </AppShell>
  );
}
