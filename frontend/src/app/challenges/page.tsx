import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getChallenges } from "@/lib/api";
import type { Challenge } from "@/lib/types";
import { ChallengesClient } from "./ChallengesClient";

export const revalidate = 0;

export default async function ChallengesPage() {
  const token = cookies().get("ae_token")?.value;
  if (!token) redirect("/login?next=/challenges");

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
    <AppShell title="Challenges Arena" subtitle="Compete on picks, leaderboards, and profit races">
      <ChallengesClient
        allChallenges={allChallenges}
        myChallenges={myChallenges}
      />
    </AppShell>
  );
}
