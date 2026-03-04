"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StateTabs } from "@/components/ui/Tabs";
import { PanelCard } from "@/components/ui/PanelCard";
import { Badge } from "@/components/ui/Badge";
import { LeaderboardTable } from "@/components/challenges/LeaderboardTable";
import { EntryFeed } from "@/components/challenges/EntryFeed";
import { joinChallenge, leaveChallenge } from "@/lib/api";
import type { Challenge, EntryFeedPage, LeaderboardOut } from "@/lib/types";
import {
  Users, Calendar, Trophy, Target, Lock, Globe,
  ArrowLeft, LogIn, LogOut,
} from "lucide-react";
import Link from "next/link";

type Tab = "overview" | "leaderboard" | "feed" | "rules";

interface Props {
  challenge: Challenge;
  leaderboard: LeaderboardOut;
  feedData: EntryFeedPage;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function challengeStatus(c: Challenge) {
  const now = Date.now();
  const start = new Date(c.start_at).getTime();
  const end = new Date(c.end_at).getTime();
  if (now < start) return { label: "Upcoming", color: "#3b82f6" };
  if (now > end)   return { label: "Ended",    color: "#71717a" };
  return { label: "Active", color: "#22c55e" };
}

function OverviewTab({ challenge, leaderboard }: { challenge: Challenge; leaderboard: LeaderboardOut }) {
  const topThree = leaderboard.rows.slice(0, 3);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Stats */}
      <div className="lg:col-span-2 space-y-4">
        <PanelCard title="Details">
          <dl className="space-y-3">
            <Row label="Status">
              {(() => {
                const s = challengeStatus(challenge);
                return (
                  <span className="text-sm font-medium" style={{ color: s.color }}>
                    {s.label}
                  </span>
                );
              })()}
            </Row>
            <Row label="Scoring">
              <span className="text-sm text-text-primary capitalize">{challenge.scoring_type}</span>
              <span className="text-xs text-text-muted ml-2">
                {challenge.scoring_type === "points"
                  ? "+1 per correct pick"
                  : "Brier score (probability accuracy)"}
              </span>
            </Row>
            <Row label="Sports">
              <span className="text-sm text-text-primary">
                {challenge.sport_scope.length === 0
                  ? "All sports"
                  : challenge.sport_scope.map((s) => (
                      <Badge key={s} sport={s} className="mr-1 capitalize">{s}</Badge>
                    ))}
              </span>
            </Row>
            <Row label="Members">
              <span className="text-sm font-mono text-text-primary">
                {challenge.member_count}
                {challenge.max_members ? ` / ${challenge.max_members}` : ""}
              </span>
            </Row>
            {challenge.entry_limit_per_day && (
              <Row label="Entry limit">
                <span className="text-sm text-text-primary">{challenge.entry_limit_per_day} picks/day</span>
              </Row>
            )}
            <Row label="Starts">
              <span className="text-sm text-text-muted">{formatDate(challenge.start_at)}</span>
            </Row>
            <Row label="Ends">
              <span className="text-sm text-text-muted">{formatDate(challenge.end_at)}</span>
            </Row>
          </dl>
        </PanelCard>

        {challenge.description && (
          <PanelCard title="About">
            <p className="text-sm text-text-muted leading-relaxed">{challenge.description}</p>
          </PanelCard>
        )}
      </div>

      {/* Mini leaderboard */}
      <div>
        <PanelCard title="Top 3">
          {topThree.length === 0 ? (
            <p className="text-xs text-text-muted py-4 text-center">No scores yet</p>
          ) : (
            <div className="space-y-3">
              {topThree.map((row) => (
                <div key={row.user_id} className="flex items-center gap-3">
                  <span className="text-lg font-bold text-text-subtle w-5 text-center">
                    {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : "🥉"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {row.user_id.startsWith("user-") ? row.user_id.slice(5) : row.user_id}
                    </p>
                    <p className="text-xs text-text-muted">{row.entry_count} entries</p>
                  </div>
                  <span className="font-mono text-sm text-accent-blue font-semibold">
                    {challenge.scoring_type === "brier"
                      ? row.score.toFixed(4)
                      : row.score.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="label w-28 shrink-0">{label}</dt>
      <dd className="flex items-center gap-1 flex-wrap">{children}</dd>
    </div>
  );
}

function RulesTab({ challenge }: { challenge: Challenge }) {
  return (
    <PanelCard title="Challenge Rules">
      <div className="space-y-4 text-sm text-text-muted leading-relaxed">
        <p>
          <strong className="text-text-primary">Eligibility:</strong>{" "}
          You must be a member of this challenge to submit picks.
        </p>
        <p>
          <strong className="text-text-primary">Submission window:</strong>{" "}
          Picks must be submitted before the event starts. Once an event kicks off, entries are locked.
        </p>
        {challenge.entry_limit_per_day && (
          <p>
            <strong className="text-text-primary">Daily limit:</strong>{" "}
            A maximum of {challenge.entry_limit_per_day} pick
            {challenge.entry_limit_per_day > 1 ? "s" : ""} per day.
          </p>
        )}
        {challenge.max_members && (
          <p>
            <strong className="text-text-primary">Capacity:</strong>{" "}
            This challenge is capped at {challenge.max_members} members. First come, first served.
          </p>
        )}
        <p>
          <strong className="text-text-primary">Scoring ({challenge.scoring_type}):</strong>{" "}
          {challenge.scoring_type === "points"
            ? "Each correct pick earns 1 point. The member with the most points at the end wins."
            : "Each pick is scored using the Brier metric: score = 1 − (p − outcome)². A perfect prediction scores 1.0. The leaderboard ranks by average score (higher is better)."}
        </p>
        <p>
          <strong className="text-text-primary">Settlement:</strong>{" "}
          Picks are settled automatically once the event outcome is recorded. Scores update on the leaderboard in real time.
        </p>
      </div>
    </PanelCard>
  );
}

export function ChallengeDetailClient({ challenge, leaderboard, feedData }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [isMember, setIsMember] = useState(challenge.is_member);
  const [memberCount, setMemberCount] = useState(challenge.member_count);
  const [actionLoading, setActionLoading] = useState(false);
  const router = useRouter();

  async function handleJoin() {
    setActionLoading(true);
    try {
      await joinChallenge(challenge.id);
      setIsMember(true);
      setMemberCount((n) => n + 1);
    } catch {
      // error shown by router refresh
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLeave() {
    setActionLoading(true);
    try {
      await leaveChallenge(challenge.id);
      setIsMember(false);
      setMemberCount((n) => Math.max(0, n - 1));
    } catch {
      // silently fail
    } finally {
      setActionLoading(false);
    }
  }

  const status = challengeStatus(challenge);
  const isOwner = challenge.user_role === "owner";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <Link href="/challenges" className="btn-ghost text-xs mb-3 inline-flex">
          <ArrowLeft size={12} /> Challenges
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium uppercase tracking-wide"
                style={{ color: status.color, backgroundColor: `${status.color}18`, border: `1px solid ${status.color}30` }}
              >
                {status.label}
              </span>
              {challenge.visibility === "private" ? (
                <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                  <Lock size={11} /> Private
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                  <Globe size={11} /> Public
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                <Users size={11} /> {memberCount}{challenge.max_members ? `/${challenge.max_members}` : ""}
              </span>
            </div>
            <h1 className="text-xl font-semibold text-text-primary">{challenge.name}</h1>
          </div>

          {/* Join / Leave */}
          {!isOwner && (
            isMember ? (
              <button
                className="btn-ghost text-xs"
                onClick={handleLeave}
                disabled={actionLoading}
              >
                <LogOut size={13} /> Leave
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={handleJoin}
                disabled={actionLoading}
              >
                <LogIn size={14} /> {actionLoading ? "Joining…" : "Join challenge"}
              </button>
            )
          )}
        </div>
      </div>

      {/* Tabs */}
      <StateTabs<Tab>
        items={[
          { label: "Overview",    value: "overview" },
          { label: "Leaderboard", value: "leaderboard" },
          { label: "Feed",        value: "feed" },
          { label: "Rules",       value: "rules" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* Tab content */}
      <div>
        {tab === "overview" && (
          <OverviewTab challenge={challenge} leaderboard={leaderboard} />
        )}

        {tab === "leaderboard" && (
          <PanelCard title="Leaderboard" padding="flush">
            <LeaderboardTable data={leaderboard} />
          </PanelCard>
        )}

        {tab === "feed" && (
          <PanelCard title="Recent picks" padding="flush">
            <EntryFeed
              challengeId={challenge.id}
              scope="feed"
              initialData={feedData}
            />
          </PanelCard>
        )}

        {tab === "rules" && <RulesTab challenge={challenge} />}
      </div>
    </div>
  );
}
