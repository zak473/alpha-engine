import { AppShell } from "@/components/layout/AppShell";
import { DeskPageIntro } from "@/components/layout/DeskPageIntro";
import { getChallenges } from "@/lib/api";
import type { Challenge } from "@/lib/types";
import { ChallengesClient } from "./ChallengesClient";

export const dynamic = "force-dynamic";

export default async function ChallengesPage() {
  let allChallenges: Challenge[] = [];
  let myChallenges: Challenge[] = [];

  try {
    [allChallenges, myChallenges] = await Promise.all([
      getChallenges({ mine: false }),
      getChallenges({ mine: true }),
    ]);
  } catch {
    // Data loads gracefully — empty state shown
  }

  return (
    <AppShell title="Challenges" subtitle="Compete on picks, leaderboards, and profit races" compact hideHero>
      <div className="space-y-4">
        <DeskPageIntro
          eyebrow="Challenges arena"
          title="Challenges"
          subtitle="Compete on picks, leaderboards, and profit races"
          metrics={[
            { label: "Open boards", value: `${allChallenges.length || 0} active`, tone: "accent" },
            { label: "My entries", value: `${myChallenges.length || 0} joined`, tone: "positive" },
            { label: "Format", value: "ROI + points", tone: "warning" },
          ]}
          primaryCta={{ label: "Enter a challenge", href: "/predictions" }}
          secondaryCta={{ label: "View tipsters", href: "/tipsters" }}
        />
        <ChallengesClient allChallenges={allChallenges} myChallenges={myChallenges} />
      </div>
    </AppShell>
  );
}
