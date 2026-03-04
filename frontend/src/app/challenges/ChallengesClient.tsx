"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StateTabs } from "@/components/ui/Tabs";
import { PanelCard } from "@/components/ui/PanelCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateChallengeModal } from "@/components/challenges/CreateChallengeModal";
import { joinChallenge } from "@/lib/api";
import type { Challenge } from "@/lib/types";
import { Trophy, Plus, Users, Calendar, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "all" | "mine";

interface Props {
  allChallenges: Challenge[];
  myChallenges: Challenge[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function challengeStatus(c: Challenge): { label: string; color: string } {
  const now = Date.now();
  const start = new Date(c.start_at).getTime();
  const end = new Date(c.end_at).getTime();
  if (now < start) return { label: "Upcoming", color: "#3b82f6" };
  if (now > end)   return { label: "Ended",    color: "#71717a" };
  return { label: "Active", color: "#22c55e" };
}

function ChallengeCard({ challenge, onJoined }: { challenge: Challenge; onJoined?: () => void }) {
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(challenge.is_member);
  const router = useRouter();
  const status = challengeStatus(challenge);

  async function handleJoin(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (joined || joining) return;
    setJoining(true);
    try {
      await joinChallenge(challenge.id);
      setJoined(true);
      onJoined?.();
    } catch {
      // silently fail — user can click through to detail
    } finally {
      setJoining(false);
    }
  }

  return (
    <Link href={`/challenges/${challenge.id}`} className="block group">
      <div className="card p-4 hover:border-zinc-600 transition-colors h-full flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium uppercase tracking-wide"
                style={{ color: status.color, backgroundColor: `${status.color}18`, border: `1px solid ${status.color}30` }}
              >
                {status.label}
              </span>
              {challenge.visibility === "private" && (
                <span className="inline-flex items-center gap-1 text-2xs text-text-muted">
                  <Lock size={10} /> Private
                </span>
              )}
              <Badge sport={challenge.sport_scope[0] || "soccer"} className="capitalize">
                {challenge.sport_scope.length === 0
                  ? "All sports"
                  : challenge.sport_scope.join(", ")}
              </Badge>
            </div>
            <h3 className="text-sm font-semibold text-text-primary leading-snug truncate">
              {challenge.name}
            </h3>
          </div>
        </div>

        {/* Description */}
        {challenge.description && (
          <p className="text-xs text-text-muted line-clamp-2">{challenge.description}</p>
        )}

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-text-muted mt-auto">
          <span className="flex items-center gap-1">
            <Users size={11} />
            {challenge.member_count}
            {challenge.max_members ? `/${challenge.max_members}` : ""}
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={11} />
            {formatDate(challenge.end_at)}
          </span>
          <span className="capitalize">{challenge.scoring_type}</span>
        </div>

        {/* Join / View */}
        <div className="flex justify-end">
          {joined ? (
            <span className="btn-ghost text-xs text-accent-blue pointer-events-none">
              Joined ✓
            </span>
          ) : (
            <button
              className="btn-primary text-xs py-1 px-2.5"
              onClick={handleJoin}
              disabled={joining}
            >
              {joining ? "Joining…" : "Join"}
            </button>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ChallengesClient({ allChallenges, myChallenges }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [all, setAll] = useState(allChallenges);
  const [mine, setMine] = useState(myChallenges);
  const router = useRouter();

  const displayed = tab === "all" ? all : mine;

  function onCreated(c: Challenge) {
    setAll((prev) => [c, ...prev]);
    setMine((prev) => [c, ...prev]);
    setTab("mine");
  }

  function onJoined() {
    router.refresh();
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <StateTabs<Tab>
          items={[
            { label: "All challenges", value: "all" },
            { label: `My challenges (${mine.length})`, value: "mine" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <button className="btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={14} /> Create
        </button>
      </div>

      {/* Grid */}
      {displayed.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title={tab === "mine" ? "No challenges joined yet" : "No challenges available"}
          description={
            tab === "mine"
              ? "Join a public challenge or create your own."
              : "Be the first to create a challenge."
          }
          action={
            <button className="btn-primary" onClick={() => setModalOpen(true)}>
              <Plus size={14} /> Create challenge
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayed.map((c) => (
            <ChallengeCard key={c.id} challenge={c} onJoined={onJoined} />
          ))}
        </div>
      )}

      <CreateChallengeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={onCreated}
      />
    </>
  );
}
