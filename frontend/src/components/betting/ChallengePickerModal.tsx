"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Trophy, Loader2, CheckCircle2, ChevronRight, Users, Calendar } from "lucide-react";
import type { QueueSelection } from "@/lib/betting-types";
import type { Challenge } from "@/lib/types";
import { getChallenges, submitChallengeEntry, trackPicks } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ChallengePickerModalProps {
  queue: QueueSelection[];
  onClose: () => void;
  onSuccess: () => void; // called after successful submission (clear queue)
}

export function ChallengePickerModal({ queue, onClose, onSuccess }: ChallengePickerModalProps) {
  const router = useRouter();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    getChallenges({ mine: true })
      .then((all) => {
        // Only active challenges (started and not yet ended)
        const now = Date.now();
        setChallenges(
          all.filter((c) => new Date(c.start_at).getTime() <= now && new Date(c.end_at).getTime() > now)
        );
      })
      .catch(() => setChallenges([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit() {
    if (!selected || submitting || queue.length === 0) return;
    setSubmitting(true);
    setErrors([]);
    try {
      // Submit entries one by one so we can collect per-pick errors
      const entryResults = await Promise.allSettled(
        queue.map((sel) => {
          // If match has already started, push event_start_at 1 minute into future
          // so the backend accepts it (challenge picks allow pre-game tips only)
          const startTime = new Date(sel.startTime).getTime() <= Date.now()
            ? new Date(Date.now() + 60_000).toISOString()
            : sel.startTime;

          return submitChallengeEntry(selected, {
            event_id: sel.matchId,
            sport: sel.sport,
            event_start_at: startTime,
            pick_type: sel.marketName,
            pick_payload: {
              match_label: sel.matchLabel,
              selection_label: sel.selectionLabel,
              market_name: sel.marketName,
              odds: sel.odds,
              edge: sel.edge,
            },
          });
        })
      );

      const failed = entryResults
        .map((r, i) => ({ r, sel: queue[i] }))
        .filter(({ r }) => r.status === "rejected")
        .map(({ r, sel }) => `${sel.matchLabel}: ${r.status === "rejected" ? (r.reason as Error).message : "failed"}`);

      const succeeded = entryResults.filter((r) => r.status === "fulfilled").length;

      if (succeeded > 0) {
        // Also track to personal record
        trackPicks(
          queue.map((sel) => ({
            match_id: sel.matchId,
            match_label: sel.matchLabel,
            sport: sel.sport,
            league: sel.league,
            start_time: sel.startTime,
            market_name: sel.marketName,
            selection_label: sel.selectionLabel,
            odds: sel.odds,
            edge: sel.edge ?? undefined,
          }))
        ).catch(() => null);

        setDone(true);
        onSuccess();
        setTimeout(() => {
          onClose();
          // Hard navigation to bypass Next.js router cache and open straight to Picks tab
          window.location.href = `/challenges/${selected}?tab=picks`;
        }, 1200);
      } else if (failed.length > 0) {
        setErrors(failed);
      }
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Submission failed"]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-md rounded-2xl overflow-hidden pointer-events-auto"
          style={{
            background: "rgba(8,12,22,0.98)",
            border: "1px solid var(--border0)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: "var(--border0)" }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.25)" }}
              >
                <Trophy size={14} style={{ color: "#f59e0b" }} />
              </div>
              <div>
                <p className="text-sm font-bold text-text-primary">Post to Challenge</p>
                <p className="text-[11px] text-text-muted">
                  {queue.length} pick{queue.length !== 1 ? "s" : ""} · select a challenge
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-text-muted" />
              </div>
            ) : challenges.length === 0 ? (
              <div className="text-center py-10">
                <Trophy size={28} className="mx-auto mb-3 text-text-subtle" />
                <p className="text-sm font-semibold text-text-primary">No active challenges</p>
                <p className="text-xs text-text-muted mt-1">Join or create a challenge first</p>
                <button
                  onClick={() => { onClose(); router.push("/challenges"); }}
                  className="mt-4 text-xs font-semibold px-4 py-2 rounded-full transition-all"
                  style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
                >
                  Browse challenges →
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {challenges.map((c) => {
                  const isSelected = selected === c.id;
                  const daysLeft = Math.ceil((new Date(c.end_at).getTime() - Date.now()) / 86_400_000);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelected(isSelected ? null : c.id)}
                      className={cn(
                        "w-full text-left rounded-xl border px-4 py-3 transition-all",
                        isSelected
                          ? "border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.08)]"
                          : "border-[var(--border0)] bg-[var(--bg2)] hover:border-zinc-600"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate">{c.name}</p>
                          {c.description && (
                            <p className="text-[11px] text-text-muted mt-0.5 line-clamp-1">{c.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="flex items-center gap-1 text-[10px] text-text-muted">
                              <Users size={9} /> {c.member_count} members
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-text-muted">
                              <Calendar size={9} /> {daysLeft}d left
                            </span>
                          </div>
                        </div>
                        <div
                          className={cn(
                            "w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 transition-all",
                            isSelected
                              ? "border-[#f59e0b] bg-[#f59e0b]"
                              : "border-white/20"
                          )}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {challenges.length > 0 && (
            <div
              className="px-4 pb-4 pt-2 border-t"
              style={{ borderColor: "var(--border0)" }}
            >
              {errors.length > 0 && (
                <div className="mb-3 rounded-lg p-3" style={{ background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)" }}>
                  {errors.map((e, i) => (
                    <p key={i} style={{ fontSize: 11, color: "var(--negative)", margin: 0, lineHeight: 1.5 }}>{e}</p>
                  ))}
                </div>
              )}
              <button
                onClick={handleSubmit}
                disabled={!selected || submitting || done}
                className={cn(
                  "w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all",
                  selected && !submitting && !done
                    ? "bg-[#f59e0b] text-[#0a0a0a] hover:bg-[#f59e0b]/90"
                    : "bg-white/[0.06] text-text-muted cursor-not-allowed"
                )}
              >
                {done ? (
                  <><CheckCircle2 size={15} /> Posted!</>
                ) : submitting ? (
                  <><Loader2 size={15} className="animate-spin" /> Submitting...</>
                ) : (
                  <>Post {queue.length} pick{queue.length !== 1 ? "s" : ""} <ChevronRight size={14} /></>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
