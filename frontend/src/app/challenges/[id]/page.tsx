import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getChallenge, getLeaderboard, getChallengeEntries } from "@/lib/api";
import type { Challenge, EntryFeedPage, LeaderboardOut } from "@/lib/types";
import { ChallengeDetailClient } from "./ChallengeDetailClient";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export default async function ChallengeDetailPage({ params }: Props) {
  let challenge: Challenge | null = null;
  let leaderboard: LeaderboardOut = { challenge_id: params.id, scoring_type: "points", rows: [] };
  let feedData: EntryFeedPage = { items: [], total: 0, page: 1, page_size: 20, has_next: false };

  try {
    [challenge, leaderboard, feedData] = await Promise.all([
      getChallenge(params.id),
      getLeaderboard(params.id),
      getChallengeEntries(params.id, { scope: "feed", page: 1, page_size: 20 }),
    ]);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("404")) notFound();
  }

  if (!challenge) notFound();

  return (
    <AppShell title={challenge.name} subtitle="Challenge detail">
      <ChallengeDetailClient
        challenge={challenge}
        leaderboard={leaderboard}
        feedData={feedData}
      />
    </AppShell>
  );
}
