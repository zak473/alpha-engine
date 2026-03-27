"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreateChallengeModal } from "@/components/challenges/CreateChallengeModal";
import { joinChallenge } from "@/lib/api";
import type { Challenge } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Calendar,
  Flame,
  Lock,
  Plus,
  Shield,
  Target,
  Trophy,
  Users,
} from "lucide-react";

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

function sportScopeLabel(challenge: Challenge) {
  return challenge.sport_scope.length === 0 ? "All sports" : challenge.sport_scope.join(" · ");
}

function getStatus(challenge: Challenge) {
  const now = Date.now();
  const start = new Date(challenge.start_at).getTime();
  const end = new Date(challenge.end_at).getTime();

  if (now < start) {
    return {
      label: "Upcoming",
      tone: "warning" as const,
      pill: "border-amber-400/25 bg-amber-400/12 text-amber-200",
      line: "from-amber-300/70 to-orange-400/60",
    };
  }

  if (now > end) {
    return {
      label: "Ended",
      tone: "neutral" as const,
      pill: "border-white/10 bg-white/[0.05] text-white/55",
      line: "from-white/25 to-white/10",
    };
  }

  return {
    label: "Live",
    tone: "accent" as const,
    pill: "border-emerald-400/25 bg-emerald-400/12 text-emerald-300",
    line: "from-emerald-300/90 to-[#00FF84]/60",
  };
}

function applyJoinedFlag(challenges: Challenge[], id: string) {
  return challenges.map((challenge) =>
    challenge.id === id
      ? {
          ...challenge,
          is_member: true,
          member_count: challenge.member_count + (challenge.is_member ? 0 : 1),
        }
      : challenge
  );
}

function OverviewCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "accent" | "positive" | "warning" | "neutral";
}) {
  const toneClass =
    tone === "accent"
      ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300"
      : tone === "positive"
      ? "border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-200"
      : tone === "warning"
      ? "border-amber-400/20 bg-amber-400/[0.08] text-amber-200"
      : "border-white/10 bg-white/[0.04] text-white";

  return (
    <div className={cn("rounded-[22px] border px-4 py-4", toneClass)}>
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{label}</div>
      <div className="mt-2 text-[28px] font-black tracking-[-0.05em]">{value}</div>
      <div className="mt-1 text-[11px] text-white/45">{hint}</div>
    </div>
  );
}

function ChallengeCard({
  challenge,
  onJoined,
}: {
  challenge: Challenge;
  onJoined: (id: string) => void;
}) {
  const [joining, setJoining] = useState(false);
  const router = useRouter();
  const status = getStatus(challenge);

  async function handleJoin(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (joining || challenge.is_member) return;

    setJoining(true);
    try {
      await joinChallenge(challenge.id);
      onJoined(challenge.id);
      router.refresh();
    } catch {
      // fail quietly and allow user to open detail page
    } finally {
      setJoining(false);
    }
  }

  return (
    <Link href={`/challenges/${challenge.id}`} className="group block h-full">
      <article className="relative flex h-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/16 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))]">
        <div className={cn("pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r", status.line)} />

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]", status.pill)}>
                {status.label === "Live" ? <Flame size={11} /> : <Calendar size={11} />}
                {status.label}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
                {challenge.scoring_type}
              </span>
              {challenge.visibility === "private" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
                  <Lock size={10} /> Private
                </span>
              ) : null}
            </div>

            <h3 className="text-[20px] font-black tracking-[-0.04em] text-white">{challenge.name}</h3>
            {challenge.description ? (
              <p className="mt-2 line-clamp-3 text-[13px] leading-6 text-white/55">{challenge.description}</p>
            ) : (
              <p className="mt-2 text-[13px] leading-6 text-white/40">
                Join the board, stack your best reads, and climb the live standings.
              </p>
            )}
          </div>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-amber-200">
            <Trophy size={20} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/34">Members</div>
            <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
              <Users size={14} className="text-[#00FF84]" />
              <span>
                {challenge.member_count}
                {challenge.max_members ? `/${challenge.max_members}` : ""}
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/34">Scope</div>
            <div className="mt-2 text-sm font-semibold text-white/85">{sportScopeLabel(challenge)}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/34">Starts</div>
            <div className="mt-2 text-sm font-semibold text-white/85">{formatDate(challenge.start_at)}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/34">Ends</div>
            <div className="mt-2 text-sm font-semibold text-white/85">{formatDate(challenge.end_at)}</div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/8 pt-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/34">Challenge desk</div>
            <div className="mt-1 text-[12px] text-white/55">
              {challenge.is_member ? "You are already on this board." : "Open the board for rules, leaderboard, and entry flow."}
            </div>
          </div>

          {challenge.is_member ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/12 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">
              <Shield size={12} /> Joined
            </span>
          ) : (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="inline-flex items-center gap-2 rounded-full bg-[#00FF84] px-4 py-2 text-[12px] font-black uppercase tracking-[0.14em] text-[#07110d] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {joining ? "Joining…" : "Join board"}
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </article>
    </Link>
  );
}

export function ChallengesClient({ allChallenges, myChallenges }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [all, setAll] = useState(allChallenges);
  const [mine, setMine] = useState(myChallenges);

  const displayed = tab === "all" ? all : mine;

  const summary = useMemo(() => {
    const live = all.filter((challenge) => getStatus(challenge).label === "Live").length;
    const upcoming = all.filter((challenge) => getStatus(challenge).label === "Upcoming").length;
    const privateBoards = all.filter((challenge) => challenge.visibility === "private").length;
    const totalMembers = all.reduce((sum, challenge) => sum + challenge.member_count, 0);

    return { live, upcoming, privateBoards, totalMembers };
  }, [all]);

  const featured = useMemo(() => {
    const ranked = [...all].sort((a, b) => {
      const aStatus = getStatus(a).label === "Live" ? 2 : getStatus(a).label === "Upcoming" ? 1 : 0;
      const bStatus = getStatus(b).label === "Live" ? 2 : getStatus(b).label === "Upcoming" ? 1 : 0;
      if (aStatus !== bStatus) return bStatus - aStatus;
      return b.member_count - a.member_count;
    });
    return ranked.slice(0, 3);
  }, [all]);

  function onCreated(challenge: Challenge) {
    setAll((prev) => [challenge, ...prev]);
    setMine((prev) => [challenge, ...prev]);
    setTab("mine");
  }

  function onJoined(id: string) {
    const joinedChallenge = all.find((challenge) => challenge.id === id);
    setAll((prev) => applyJoinedFlag(prev, id));
    setMine((prev) => {
      if (prev.some((challenge) => challenge.id === id)) return applyJoinedFlag(prev, id);
      return joinedChallenge ? [{ ...joinedChallenge, is_member: true, member_count: joinedChallenge.member_count + 1 }, ...prev] : prev;
    });
  }

  return (
    <>
      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(0,255,132,0.14),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.22)] lg:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.09] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">
                <Target size={11} /> Challenge control room
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.06em] text-white lg:text-[40px]">
                Compete on live boards, streak races, and ROI ladders.
              </h2>
              <p className="mt-3 max-w-xl text-[14px] leading-7 text-white/58">
                Enter public boards, create private rooms for your group, and track how your reads stack up against the community in real time.
              </p>
            </div>

            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[#00FF84] px-4 py-2.5 text-[12px] font-black uppercase tracking-[0.14em] text-[#07110d]"
            >
              <Plus size={14} /> Create board
            </button>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {featured.length > 0 ? (
              featured.map((challenge) => {
                const status = getStatus(challenge);
                return (
                  <Link
                    href={`/challenges/${challenge.id}`}
                    key={challenge.id}
                    className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 transition-colors hover:border-white/16"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]", status.pill)}>
                        {status.label}
                      </span>
                      <span className="text-[11px] text-white/38">{challenge.member_count} joined</span>
                    </div>
                    <div className="mt-4 text-[18px] font-black tracking-[-0.04em] text-white">{challenge.name}</div>
                    <div className="mt-2 line-clamp-2 text-[12px] leading-6 text-white/50">
                      {challenge.description || "Fast board with live standings, leaderboard movement, and sharp-money bragging rights."}
                    </div>
                    <div className="mt-4 flex items-center justify-between text-[11px] text-white/42">
                      <span>{sportScopeLabel(challenge)}</span>
                      <span>{formatDate(challenge.end_at)}</span>
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm text-white/48 md:col-span-3">
                No boards yet. Create the first challenge and make the arena live.
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <OverviewCard label="Live boards" value={String(summary.live)} hint="Challenges currently scoring" tone="accent" />
          <OverviewCard label="Upcoming" value={String(summary.upcoming)} hint="Boards opening soon" tone="warning" />
          <OverviewCard label="My entries" value={String(mine.length)} hint="Joined or created boards" tone="positive" />
          <OverviewCard label="Community seats" value={String(summary.totalMembers)} hint="Total joined members across boards" tone="neutral" />
        </div>
      </section>

      <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.18)] lg:p-5">
        <div className="flex flex-col gap-4 border-b border-white/8 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {([
              ["all", "All challenges", all.length],
              ["mine", "My challenges", mine.length],
            ] as [Tab, string, number][]).map(([value, label, count]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-bold uppercase tracking-[0.14em] transition-all",
                  tab === value
                    ? "border-emerald-400/24 bg-emerald-400/[0.12] text-emerald-300"
                    : "border-white/10 bg-white/[0.03] text-white/48 hover:text-white/72"
                )}
              >
                {label}
                <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] leading-none">{count}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/42">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
              <Shield size={12} /> {summary.privateBoards} private rooms
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
              <Flame size={12} /> {summary.live} live now
            </span>
          </div>
        </div>

        {displayed.length === 0 ? (
          <div className="flex min-h-[340px] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-amber-200">
              <Trophy size={28} />
            </div>
            <div>
              <div className="text-[22px] font-black tracking-[-0.04em] text-white">
                {tab === "mine" ? "No joined boards yet" : "No challenge boards available"}
              </div>
              <p className="mt-2 max-w-md text-[13px] leading-6 text-white/50">
                {tab === "mine"
                  ? "Join a live board from the arena or spin up a private room for your own crew."
                  : "Create the first board to start a profit race, pick streak, or leaderboard battle."}
              </p>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[#00FF84] px-5 py-2.5 text-[12px] font-black uppercase tracking-[0.14em] text-[#07110d]"
            >
              <Plus size={14} /> Create challenge
            </button>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {displayed.map((challenge) => (
              <ChallengeCard key={challenge.id} challenge={challenge} onJoined={onJoined} />
            ))}
          </div>
        )}
      </section>

      <CreateChallengeModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={onCreated} />
    </>
  );
}
