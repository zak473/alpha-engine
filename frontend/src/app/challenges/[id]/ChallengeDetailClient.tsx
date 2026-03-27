"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Globe, Lock, LogIn, LogOut, Plus, Trophy, Users, X } from "lucide-react";
import { LeaderboardTable } from "@/components/challenges/LeaderboardTable";
import { EntryFeed } from "@/components/challenges/EntryFeed";
import { joinChallenge, leaveChallenge, submitChallengeEntry } from "@/lib/api";
import type { Challenge, EntryFeedPage, LeaderboardOut } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "overview" | "leaderboard" | "feed" | "rules";
type PickScope = "feed" | "mine";

interface Props {
  challenge: Challenge;
  leaderboard: LeaderboardOut;
  feedData: EntryFeedPage;
  initialTab?: string;
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

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function challengeStatus(c: Challenge) {
  const now = Date.now();
  const start = new Date(c.start_at).getTime();
  const end = new Date(c.end_at).getTime();

  if (now < start) {
    return {
      label: "Upcoming",
      tone: "rgba(125,183,255,0.16)",
      color: "var(--info)",
    };
  }

  if (now > end) {
    return {
      label: "Ended",
      tone: "rgba(255,255,255,0.08)",
      color: "var(--text2)",
    };
  }

  return {
    label: "Active",
    tone: "rgba(53,230,160,0.16)",
    color: "var(--positive)",
  };
}

function scoringCopy(type: string) {
  return type === "points" ? "+1 per correct pick" : "Brier accuracy scoring";
}

function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-[24px] border"
      style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.035)" }}
    >
      <div
        className="flex items-center justify-between gap-4 border-b px-5 py-4"
        style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.03)" }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text0)" }}>{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SummaryTile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div
      className="rounded-[20px] border px-4 py-4"
      style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.03)" }}
    >
      <p className="section-kicker" style={{ margin: 0 }}>{label}</p>
      <p style={{ margin: "8px 0 0", fontSize: 20, fontWeight: 700, color: "var(--text0)", letterSpacing: "-0.03em" }}>{value}</p>
      {caption ? <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>{caption}</p> : null}
    </div>
  );
}

function DetailRow({ label, value, children }: { label: string; value?: React.ReactNode; children?: React.ReactNode }) {
  const content = children ?? value;
  return (
    <div
      className="flex flex-col gap-2 border-b py-3 sm:flex-row sm:items-start sm:justify-between"
      style={{ borderColor: "var(--border0)" }}
    >
      <dt style={{ fontSize: 12, color: "var(--text2)", minWidth: 120 }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 13, color: "var(--text0)", textAlign: "left" }}>{content}</dd>
    </div>
  );
}

function TopThree({ challenge, leaderboard }: { challenge: Challenge; leaderboard: LeaderboardOut }) {
  const topThree = leaderboard.rows.slice(0, 3);

  return (
    <div className="space-y-3">
      {topThree.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text2)" }}>No scores yet.</p>
      ) : (
        topThree.map((row) => (
          <div
            key={row.user_id}
            className="flex items-center gap-3 rounded-[18px] border px-4 py-3"
            style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.025)" }}
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: row.rank === 1 ? "rgba(0,255,132,0.14)" : "rgba(255,255,255,0.06)", color: row.rank === 1 ? "var(--accent)" : "var(--text1)" }}
            >
              <span style={{ fontSize: 13, fontWeight: 700 }}>#{row.rank}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.user_id.startsWith("user-") ? row.user_id.slice(5) : row.user_id}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text2)" }}>{row.entry_count} entries</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p className="mono-stat" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: row.rank === 1 ? "var(--accent)" : "var(--text0)" }}>
                {challenge.scoring_type === "brier" ? row.score.toFixed(4) : row.score.toFixed(0)}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function PicksTab({ challengeId, feedData }: { challengeId: string; feedData: EntryFeedPage }) {
  const [scope, setScope] = useState<PickScope>("feed");

  return (
    <SectionCard
      title="Picks"
      action={
        <div className="flex items-center gap-2">
          {([
            { label: "Everyone", value: "feed" },
            { label: "Mine", value: "mine" },
          ] as { label: string; value: PickScope }[]).map((item) => (
            <button
              key={item.value}
              onClick={() => setScope(item.value)}
              className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
              style={
                scope === item.value
                  ? { background: "var(--accent)", color: "#07110d" }
                  : { background: "rgba(255,255,255,0.04)", color: "var(--text2)" }
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      }
    >
      <EntryFeed
        challengeId={challengeId}
        scope={scope}
        initialData={scope === "feed" ? feedData : { items: [], total: 0, page: 1, page_size: 20, has_next: false }}
        key={scope}
      />
    </SectionCard>
  );
}

function OverviewTab({ challenge, leaderboard, memberCount }: { challenge: Challenge; leaderboard: LeaderboardOut; memberCount: number }) {
  const status = challengeStatus(challenge);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Status" value={status.label} caption={challenge.visibility === "private" ? "Private challenge" : "Public challenge"} />
        <SummaryTile label="Members" value={`${memberCount}${challenge.max_members ? ` / ${challenge.max_members}` : ""}`} caption={challenge.max_members ? "Capacity shown" : "No fixed member cap"} />
        <SummaryTile label="Scoring" value={challenge.scoring_type === "points" ? "Points" : "Brier"} caption={scoringCopy(challenge.scoring_type)} />
        <SummaryTile label="Window" value={`${formatShortDate(challenge.start_at)} → ${formatShortDate(challenge.end_at)}`} caption={challenge.entry_limit_per_day ? `${challenge.entry_limit_per_day} picks per day` : "No daily entry limit"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <SectionCard title="Challenge details">
          <dl style={{ margin: 0 }}>
            <DetailRow label="Status">
              <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ background: status.tone, color: status.color }}>
                {status.label}
              </span>
            </DetailRow>
            <DetailRow label="Scoring">{challenge.scoring_type} · {scoringCopy(challenge.scoring_type)}</DetailRow>
            <DetailRow label="Sports">
              {challenge.sport_scope.length === 0 ? (
                "All sports"
              ) : (
                <div className="flex flex-wrap gap-2">
                  {challenge.sport_scope.map((sport) => (
                    <span key={sport} className="rounded-full px-2.5 py-1 text-[11px] font-medium capitalize" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text1)" }}>
                      {sport}
                    </span>
                  ))}
                </div>
              )}
            </DetailRow>
            <DetailRow label="Members">{memberCount}{challenge.max_members ? ` / ${challenge.max_members}` : ""}</DetailRow>
            {challenge.entry_limit_per_day ? <DetailRow label="Daily limit">{challenge.entry_limit_per_day} picks per day</DetailRow> : null}
            <DetailRow label="Starts">{formatDate(challenge.start_at)}</DetailRow>
            <DetailRow label="Ends">{formatDate(challenge.end_at)}</DetailRow>
          </dl>
        </SectionCard>

        <SectionCard title="Top performers">
          <TopThree challenge={challenge} leaderboard={leaderboard} />
        </SectionCard>
      </div>

      {challenge.description ? (
        <SectionCard title="About this challenge">
          <p style={{ margin: 0, fontSize: 14, color: "var(--text1)", lineHeight: 1.8 }}>{challenge.description}</p>
        </SectionCard>
      ) : null}
    </div>
  );
}

function RulesTab({ challenge }: { challenge: Challenge }) {
  const rules = [
    "You must be a member of the challenge to submit picks.",
    "Picks must be entered before the event starts.",
    challenge.entry_limit_per_day ? `You can submit up to ${challenge.entry_limit_per_day} pick${challenge.entry_limit_per_day > 1 ? "s" : ""} per day.` : null,
    challenge.max_members ? `This challenge is capped at ${challenge.max_members} members.` : null,
    challenge.scoring_type === "points"
      ? "Each correct pick earns one point. Highest total wins."
      : "Each pick is scored on Brier accuracy. Higher average score ranks better.",
    "Scores update automatically once results are settled.",
  ].filter(Boolean) as string[];

  return (
    <SectionCard title="Rules">
      <div className="space-y-3">
        {rules.map((rule, index) => (
          <div
            key={index}
            className="flex gap-3 rounded-[18px] border px-4 py-4"
            style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.025)" }}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text1)", fontSize: 11, fontWeight: 700 }}>
              {index + 1}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text1)", lineHeight: 1.7 }}>{rule}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function SubmitEntryModal({
  challengeId,
  sportScope,
  onClose,
  onSubmitted,
}: {
  challengeId: string;
  sportScope: string[];
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const SPORTS = ["soccer", "tennis", "basketball", "baseball", "hockey", "esports"] as const;
  const availableSports = sportScope.length > 0 ? sportScope : [...SPORTS];
  const [sport, setSport] = useState(availableSports[0] ?? "soccer");
  const [matchLabel, setMatchLabel] = useState("");
  const [eventStartAt, setEventStartAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [pickType, setPickType] = useState("moneyline");
  const [selection, setSelection] = useState("");
  const [odds, setOdds] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matchLabel.trim()) {
      setError("Enter a match or event");
      return;
    }
    if (!eventStartAt) {
      setError("Enter the event date/time");
      return;
    }
    if (!selection.trim()) {
      setError("Enter your selection");
      return;
    }

    const oddsNum = Number(odds);
    if (!odds || Number.isNaN(oddsNum) || oddsNum < 1.01) {
      setError("Enter valid decimal odds (≥ 1.01)");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await submitChallengeEntry(challengeId, {
        event_id: matchLabel.trim().toLowerCase().replace(/\s+/g, "-"),
        sport,
        event_start_at: new Date(eventStartAt).toISOString(),
        pick_type: pickType,
        pick_payload: { selection, odds: oddsNum, match_label: matchLabel },
        prediction_payload: {},
      });
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.64)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-xl rounded-[26px] border p-6" style={{ borderColor: "var(--border0)", background: "#08111a" }}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text0)" }}>Submit pick</h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text2)" }}>Add one pick to this challenge.</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-text-muted transition-colors hover:bg-white/[0.04] hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="label">Sport</label>
            <div className="flex flex-wrap gap-2">
              {availableSports.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSport(s)}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-all"
                  style={
                    sport === s
                      ? { background: "rgba(0,255,132,0.12)", borderColor: "rgba(0,255,132,0.28)", color: "var(--accent)" }
                      : { background: "transparent", borderColor: "var(--border0)", color: "var(--text1)" }
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="label">Match / event</label>
              <input value={matchLabel} onChange={(e) => setMatchLabel(e.target.value)} placeholder="e.g. Arsenal vs Chelsea" className="input-field" />
            </div>
            <div className="space-y-2">
              <label className="label">Event date & time</label>
              <input type="datetime-local" value={eventStartAt} onChange={(e) => setEventStartAt(e.target.value)} className="input-field" />
            </div>
            <div className="space-y-2">
              <label className="label">Pick type</label>
              <select value={pickType} onChange={(e) => setPickType(e.target.value)} className="input-field">
                <option value="moneyline">Moneyline</option>
                <option value="spread">Spread</option>
                <option value="over_under">Over / Under</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="label">Selection</label>
              <input value={selection} onChange={(e) => setSelection(e.target.value)} placeholder="Home win, Over 2.5…" className="input-field" />
            </div>
            <div className="space-y-2">
              <label className="label">Odds</label>
              <input type="number" step="0.01" min="1.01" value={odds} onChange={(e) => setOdds(e.target.value)} placeholder="1.85" className="input-field" />
            </div>
          </div>

          {error ? <p style={{ margin: 0, fontSize: 12, color: "var(--negative)" }}>{error}</p> : null}

          <div className="flex items-center justify-end gap-3">
            <button type="button" className="btn btn-ghost h-10 px-4" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary h-10 px-4" disabled={saving}>
              {saving ? "Submitting…" : "Submit pick"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ChallengeDetailClient({ challenge, leaderboard, feedData, initialTab = "overview" }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab as Tab);
  const [isMember, setIsMember] = useState(challenge.is_member);
  const [memberCount, setMemberCount] = useState(challenge.member_count);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  async function handleJoin() {
    setActionLoading(true);
    setActionError(null);
    try {
      await joinChallenge(challenge.id);
      setIsMember(true);
      setMemberCount((n) => n + 1);
    } catch {
      setActionError("Failed to join challenge. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLeave() {
    setActionLoading(true);
    setActionError(null);
    try {
      await leaveChallenge(challenge.id);
      setIsMember(false);
      setMemberCount((n) => Math.max(0, n - 1));
    } catch {
      setActionError("Failed to leave challenge. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  const status = challengeStatus(challenge);
  const isOwner = challenge.user_role === "owner";
  const isFull = !!challenge.max_members && memberCount >= challenge.max_members;

  const tabs: { label: string; value: Tab }[] = [
    { label: "Overview", value: "overview" },
    { label: "Leaderboard", value: "leaderboard" },
    { label: "Picks", value: "feed" },
    { label: "Rules", value: "rules" },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link href="/challenges" className="inline-flex items-center gap-2 text-sm font-medium text-white/56 transition hover:text-white/82">
          <ArrowLeft size={14} />
          Back to challenges
        </Link>

        <section
          className="rounded-[28px] border p-5 sm:p-6"
          style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.035)" }}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ background: status.tone, color: status.color }}>
                  {status.label}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: "rgba(255,255,255,0.04)", color: "var(--text2)" }}>
                  {challenge.visibility === "private" ? <Lock size={12} /> : <Globe size={12} />}
                  {challenge.visibility === "private" ? "Private" : "Public"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: "rgba(255,255,255,0.04)", color: "var(--text2)" }}>
                  <Users size={12} />
                  {memberCount}{challenge.max_members ? `/${challenge.max_members}` : ""} members
                </span>
              </div>

              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, color: "var(--text0)", letterSpacing: "-0.04em" }}>{challenge.name}</h1>
              <p style={{ margin: "10px 0 0", maxWidth: 760, fontSize: 14, color: "var(--text2)", lineHeight: 1.8 }}>
                {challenge.description || "Track the leaderboard, submit picks, and see how members are performing in one place."}
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <SummaryTile label="Scoring" value={challenge.scoring_type === "points" ? "Points" : "Brier"} caption={scoringCopy(challenge.scoring_type)} />
                <SummaryTile label="Starts" value={formatShortDate(challenge.start_at)} caption={formatDate(challenge.start_at)} />
                <SummaryTile label="Ends" value={formatShortDate(challenge.end_at)} caption={formatDate(challenge.end_at)} />
              </div>
            </div>

            {!isOwner ? (
              <div className="flex min-w-[220px] flex-col gap-3 lg:items-end">
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {isMember && status.label === "Active" ? (
                    <button className="btn btn-primary h-10 px-4" onClick={() => setShowSubmitModal(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Plus size={14} />
                      Submit pick
                    </button>
                  ) : null}

                  {isMember ? (
                    <button className="btn btn-ghost h-10 px-4" onClick={handleLeave} disabled={actionLoading} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <LogOut size={14} />
                      {actionLoading ? "Leaving…" : "Leave"}
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary h-10 px-4"
                      onClick={handleJoin}
                      disabled={actionLoading || isFull}
                      title={isFull ? "Challenge is full" : undefined}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <LogIn size={14} />
                      {actionLoading ? "Joining…" : isFull ? "Challenge full" : "Join challenge"}
                    </button>
                  )}
                </div>

                {actionError ? <p style={{ margin: 0, fontSize: 12, color: "var(--negative)" }}>{actionError}</p> : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.value}
            onClick={() => setTab(item.value)}
            className={cn("rounded-full px-4 py-2 text-sm font-semibold transition-all", tab === item.value ? "text-[#07110d]" : "text-text-muted")}
            style={tab === item.value ? { background: "var(--accent)" } : { background: "rgba(255,255,255,0.04)" }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <OverviewTab challenge={challenge} leaderboard={leaderboard} memberCount={memberCount} /> : null}

      {tab === "leaderboard" ? (
        <SectionCard title="Leaderboard" action={<div className="inline-flex items-center gap-2 text-[12px] text-text-muted"><Trophy size={14} />Live standings</div>}>
          <LeaderboardTable data={leaderboard} />
        </SectionCard>
      ) : null}

      {tab === "feed" ? <PicksTab challengeId={challenge.id} feedData={feedData} /> : null}

      {tab === "rules" ? <RulesTab challenge={challenge} /> : null}

      {showSubmitModal ? (
        <SubmitEntryModal
          challengeId={challenge.id}
          sportScope={challenge.sport_scope}
          onClose={() => setShowSubmitModal(false)}
          onSubmitted={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
