"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  if (now < start) return { label: "Upcoming", color: "var(--info)",     badgeClass: "badge badge-accent" };
  if (now > end)   return { label: "Ended",    color: "var(--text2)",    badgeClass: "badge badge-muted" };
  return             { label: "Active",   color: "var(--positive)", badgeClass: "badge badge-positive" };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, paddingTop: 8, paddingBottom: 8, borderBottom: "1px solid var(--border0)" }}>
      <dt className="label" style={{ width: 110, flexShrink: 0 }}>{label}</dt>
      <dd style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", margin: 0 }}>{children}</dd>
    </div>
  );
}

const RANK_MEDALS = ["", "🥇", "🥈", "🥉"] as const;
const RANK_COLORS = ["", "var(--accent)", "var(--positive)", "var(--warning)"] as const;

function OverviewTab({ challenge, leaderboard }: { challenge: Challenge; leaderboard: LeaderboardOut }) {
  const topThree = leaderboard.rows.slice(0, 3);
  const status = challengeStatus(challenge);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 16,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        {/* Details card */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="panel-header">
            <div className="panel-title">Details</div>
          </div>
          <div style={{ padding: "4px 20px 16px" }}>
            <dl style={{ margin: 0 }}>
              <Row label="Status">
                <span className={status.badgeClass}>{status.label}</span>
              </Row>
              <Row label="Scoring">
                <span style={{ fontSize: 12, color: "var(--text0)", textTransform: "capitalize" }}>{challenge.scoring_type}</span>
                <span style={{ fontSize: 11, color: "var(--text2)" }}>
                  {challenge.scoring_type === "points"
                    ? "+1 per correct pick"
                    : "Brier score (probability accuracy)"}
                </span>
              </Row>
              <Row label="Sports">
                <span style={{ fontSize: 12, color: "var(--text0)" }}>
                  {challenge.sport_scope.length === 0
                    ? "All sports"
                    : challenge.sport_scope.map((s) => (
                        <span key={s} className="badge badge-muted" style={{ marginRight: 4, textTransform: "capitalize" }}>{s}</span>
                      ))}
                </span>
              </Row>
              <Row label="Members">
                <span className="num" style={{ fontSize: 12, color: "var(--text0)" }}>
                  {challenge.member_count}
                  {challenge.max_members ? ` / ${challenge.max_members}` : ""}
                </span>
              </Row>
              {challenge.entry_limit_per_day && (
                <Row label="Entry limit">
                  <span style={{ fontSize: 12, color: "var(--text0)" }}>{challenge.entry_limit_per_day} picks/day</span>
                </Row>
              )}
              <Row label="Starts">
                <span style={{ fontSize: 11, color: "var(--text2)" }}>{formatDate(challenge.start_at)}</span>
              </Row>
              <Row label="Ends">
                <span style={{ fontSize: 11, color: "var(--text2)" }}>{formatDate(challenge.end_at)}</span>
              </Row>
            </dl>
          </div>
        </div>

        {/* Top 3 mini leaderboard */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="panel-header">
            <div className="panel-title">Top 3</div>
          </div>
          <div style={{ padding: "8px 16px 16px" }}>
            {topThree.length === 0 ? (
              <p style={{ fontSize: 11, color: "var(--text2)", textAlign: "center", padding: "16px 0" }}>No scores yet</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {topThree.map((row) => (
                  <div key={row.user_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18, width: 24, textAlign: "center", flexShrink: 0 }}>
                      {RANK_MEDALS[row.rank] ?? row.rank}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text0)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.user_id.startsWith("user-") ? row.user_id.slice(5) : row.user_id}
                      </p>
                      <p style={{ fontSize: 10, color: "var(--text2)", margin: "2px 0 0" }}>{row.entry_count} entries</p>
                    </div>
                    <span className="num" style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: RANK_COLORS[row.rank] ?? "var(--text1)",
                    }}>
                      {challenge.scoring_type === "brier"
                        ? row.score.toFixed(4)
                        : row.score.toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {challenge.description && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="panel-header">
            <div className="panel-title">About</div>
          </div>
          <div style={{ padding: "4px 20px 16px" }}>
            <p style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.65, margin: 0 }}>{challenge.description}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function RulesTab({ challenge }: { challenge: Challenge }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="panel-header">
        <div className="panel-title">Challenge Rules</div>
      </div>
      <div style={{ padding: "8px 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        {[
          {
            heading: "Eligibility",
            body: "You must be a member of this challenge to submit picks.",
          },
          {
            heading: "Submission window",
            body: "Picks must be submitted before the event starts. Once an event kicks off, entries are locked.",
          },
          ...(challenge.entry_limit_per_day ? [{
            heading: "Daily limit",
            body: `A maximum of ${challenge.entry_limit_per_day} pick${challenge.entry_limit_per_day > 1 ? "s" : ""} per day.`,
          }] : []),
          ...(challenge.max_members ? [{
            heading: "Capacity",
            body: `This challenge is capped at ${challenge.max_members} members. First come, first served.`,
          }] : []),
          {
            heading: `Scoring (${challenge.scoring_type})`,
            body: challenge.scoring_type === "points"
              ? "Each correct pick earns 1 point. The member with the most points at the end wins."
              : "Each pick is scored using the Brier metric: score = 1 − (p − outcome)². A perfect prediction scores 1.0. The leaderboard ranks by average score (higher is better).",
          },
          {
            heading: "Settlement",
            body: "Picks are settled automatically once the event outcome is recorded. Scores update on the leaderboard in real time.",
          },
        ].map(({ heading, body }) => (
          <p key={heading} style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.65, margin: 0 }}>
            <strong style={{ color: "var(--text0)", fontWeight: 600 }}>{heading}: </strong>
            {body}
          </p>
        ))}
      </div>
    </div>
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

  const TABS: { label: string; value: Tab }[] = [
    { label: "Overview",    value: "overview" },
    { label: "Leaderboard", value: "leaderboard" },
    { label: "Feed",        value: "feed" },
    { label: "Rules",       value: "rules" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Page header */}
      <div>
        <Link href="/challenges" style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 11, color: "var(--text2)", textDecoration: "none",
          marginBottom: 12,
        }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text1)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text2)")}
        >
          <ArrowLeft size={12} /> Challenges
        </Link>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <span className={status.badgeClass} style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {status.label}
              </span>
              {challenge.visibility === "private" ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text2)" }}>
                  <Lock size={11} /> Private
                </span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text2)" }}>
                  <Globe size={11} /> Public
                </span>
              )}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text2)" }}>
                <Users size={11} />
                <span className="num">{memberCount}{challenge.max_members ? `/${challenge.max_members}` : ""}</span>
              </span>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text0)", margin: 0 }}>{challenge.name}</h1>
          </div>

          {/* Join / Leave */}
          {!isOwner && (
            isMember ? (
              <button
                className="btn btn-md btn-ghost"
                onClick={handleLeave}
                disabled={actionLoading}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
              >
                <LogOut size={13} /> Leave
              </button>
            ) : (
              <button
                className="btn btn-md btn-primary"
                onClick={handleJoin}
                disabled={actionLoading}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <LogIn size={14} /> {actionLoading ? "Joining…" : "Join challenge"}
              </button>
            )
          )}
        </div>
      </div>

      {/* Underline tabs */}
      <div className="tabs-underline">
        {TABS.map((t) => (
          <button
            key={t.value}
            className={`tab-item${tab === t.value ? " active" : ""}`}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === "overview" && (
          <OverviewTab challenge={challenge} leaderboard={leaderboard} />
        )}

        {tab === "leaderboard" && (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="panel-header">
              <div className="panel-title">Leaderboard</div>
            </div>
            <LeaderboardTable data={leaderboard} />
          </div>
        )}

        {tab === "feed" && (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="panel-header">
              <div className="panel-title">Recent Picks</div>
            </div>
            <EntryFeed
              challengeId={challenge.id}
              scope="feed"
              initialData={feedData}
            />
          </div>
        )}

        {tab === "rules" && <RulesTab challenge={challenge} />}
      </div>
    </div>
  );
}
