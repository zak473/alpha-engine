import Link from "next/link";
import { PanelCard } from "@/components/ui/PanelCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Challenge, LeaderboardOut } from "@/lib/types";
import { Trophy, TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChallengesWidgetProps {
  challenges: Challenge[];
  leaderboards: LeaderboardOut[];
  userId: string;
  loading?: boolean;
}

function rankBadge(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function ChallengeRow({ challenge, leaderboard, userId }: {
  challenge: Challenge;
  leaderboard: LeaderboardOut | undefined;
  userId: string;
}) {
  const now = Date.now();
  const isActive = new Date(challenge.end_at).getTime() > now;
  const userRow = leaderboard?.rows.find((r) => r.user_id === userId);
  const rank = userRow?.rank;
  const totalPlayers = leaderboard?.rows.length ?? challenge.member_count;

  // Mock trend: if rank ≤ half of total, trending up, otherwise flat
  const trend = rank == null ? "neutral" : rank <= Math.ceil(totalPlayers / 2) ? "up" : "down";

  return (
    <Link
      href={`/challenges/${challenge.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.025] transition-colors group"
    >
      {/* Icon */}
      <div className="shrink-0 w-8 h-8 rounded-lg bg-accent-purple/10 border border-accent-purple/20 flex items-center justify-center text-sm">
        {rank ? rankBadge(rank) : "—"}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary truncate">{challenge.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {isActive ? (
            <span className="text-2xs text-accent-green">Active</span>
          ) : (
            <span className="text-2xs text-text-muted">Ended</span>
          )}
          <span className="text-text-subtle text-2xs">·</span>
          <span className="text-2xs text-text-muted capitalize">{challenge.scoring_type}</span>
          <span className="text-text-subtle text-2xs">·</span>
          <span className="text-2xs text-text-muted">{challenge.member_count} members</span>
        </div>
      </div>

      {/* Rank trend */}
      <div className="shrink-0 flex items-center gap-1">
        {rank != null && (
          <span className="num text-xs text-text-muted">
            {rank}/{totalPlayers}
          </span>
        )}
        {trend === "up" && <TrendingUp size={13} className="text-accent-green" />}
        {trend === "down" && <TrendingDown size={13} className="text-accent-red" />}
        {trend === "neutral" && <Minus size={13} className="text-text-subtle" />}
        <ArrowRight size={11} className="text-text-subtle opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
      </div>
    </Link>
  );
}

export function ChallengesWidget({ challenges, leaderboards, userId, loading }: ChallengesWidgetProps) {
  if (loading) {
    return (
      <PanelCard title="My Challenges" padding="flush">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-4 w-10" />
          </div>
        ))}
      </PanelCard>
    );
  }

  const active = challenges
    .filter((c) => new Date(c.end_at).getTime() > Date.now())
    .slice(0, 4);

  return (
    <PanelCard
      title="My Challenges"
      subtitle="Active competitions"
      padding="flush"
      action={
        <Link href="/challenges" className="text-xs text-accent-blue hover:underline">
          Browse all →
        </Link>
      }
    >
      {active.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No active challenges"
          description="Join a public challenge or create your own."
          action={
            <Link href="/challenges" className="btn-primary text-xs">
              Browse challenges
            </Link>
          }
        />
      ) : (
        <div className="divide-y divide-surface-border/50">
          {active.map((c) => (
            <ChallengeRow
              key={c.id}
              challenge={c}
              leaderboard={leaderboards.find((lb) => lb.challenge_id === c.id)}
              userId={userId}
            />
          ))}
        </div>
      )}
    </PanelCard>
  );
}
