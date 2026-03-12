"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreateChallengeModal } from "@/components/challenges/CreateChallengeModal";
import { joinChallenge } from "@/lib/api";
import type { Challenge } from "@/lib/types";
import { Trophy, Plus, Users, Calendar, Lock } from "lucide-react";

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

function challengeStatus(c: Challenge): { label: string; cssColor: string; badgeClass: string } {
  const now = Date.now();
  const start = new Date(c.start_at).getTime();
  const end = new Date(c.end_at).getTime();
  if (now < start) return { label: "Upcoming", cssColor: "var(--info)",     badgeClass: "badge badge-accent" };
  if (now > end)   return { label: "Ended",    cssColor: "var(--text2)",    badgeClass: "badge badge-muted" };
  return             { label: "Active",   cssColor: "var(--positive)", badgeClass: "badge badge-positive" };
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
    <Link href={`/challenges/${challenge.id}`} style={{ display: "block", textDecoration: "none" }}>
      <div className="card" style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        height: "100%",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border1)")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border0)")}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              <span className={status.badgeClass} style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {status.label}
              </span>
              {challenge.visibility === "private" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--text2)" }}>
                  <Lock size={10} /> Private
                </span>
              )}
              <span className="badge badge-muted" style={{ textTransform: "capitalize" }}>
                {challenge.sport_scope.length === 0
                  ? "All sports"
                  : challenge.sport_scope.join(", ")}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {challenge.name}
            </div>
          </div>
        </div>

        {/* Description */}
        {challenge.description && (
          <p style={{
            fontSize: 11,
            color: "var(--text2)",
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            margin: 0,
          }}>
            {challenge.description}
          </p>
        )}

        {/* Meta */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 11,
          color: "var(--text2)",
          marginTop: "auto",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Users size={11} />
            <span className="num">
              {challenge.member_count}
              {challenge.max_members ? `/${challenge.max_members}` : ""}
            </span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Calendar size={11} />
            {formatDate(challenge.end_at)}
          </span>
          <span style={{ textTransform: "capitalize" }}>{challenge.scoring_type}</span>
        </div>

        {/* Join / View */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {joined ? (
            <span style={{
              fontSize: 11,
              color: "var(--positive)",
              fontWeight: 500,
              pointerEvents: "none",
            }}>
              Joined ✓
            </span>
          ) : (
            <button
              className="btn btn-md btn-primary"
              onClick={handleJoin}
              disabled={joining}
              style={{ fontSize: 11 }}
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        {/* Segmented tabs */}
        <div className="tabs-segmented">
          <button
            className={`tab-seg-item${tab === "all" ? " active" : ""}`}
            onClick={() => setTab("all")}
          >
            All Challenges
          </button>
          <button
            className={`tab-seg-item${tab === "mine" ? " active" : ""}`}
            onClick={() => setTab("mine")}
          >
            My Challenges
            <span className="num" style={{
              marginLeft: 6,
              fontSize: 10,
              background: "var(--bg2)",
              borderRadius: 8,
              padding: "1px 6px",
              color: "var(--text2)",
            }}>
              {mine.length}
            </span>
          </button>
        </div>

        <button className="btn btn-md btn-primary" onClick={() => setModalOpen(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Plus size={14} /> Create
        </button>
      </div>

      {/* Grid or empty state */}
      {displayed.length === 0 ? (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: "60px 20px",
          color: "var(--text2)",
          textAlign: "center",
        }}>
          <Trophy size={32} style={{ opacity: 0.3 }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>
            {tab === "mine" ? "No challenges joined yet" : "No challenges available"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text2)", maxWidth: 280 }}>
            {tab === "mine"
              ? "Join a public challenge or create your own."
              : "Be the first to create a challenge."}
          </div>
          <button
            className="btn btn-md btn-primary"
            onClick={() => setModalOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4 }}
          >
            <Plus size={14} /> Create challenge
          </button>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}>
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
