"use client";

import { useState } from "react";
import { X, Trophy, Loader2, CheckCircle2, Globe, Lock, Users, Calendar, Zap } from "lucide-react";
import { createChallenge } from "@/lib/api";
import type { Challenge, ChallengeCreate } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (c: Challenge) => void;
}

const SPORTS = [
  { value: "soccer",     label: "Soccer",     icon: "⚽" },
  { value: "tennis",     label: "Tennis",     icon: "🎾" },
  { value: "basketball", label: "Basketball", icon: "🏀" },
  { value: "baseball",   label: "Baseball",   icon: "⚾" },
  { value: "hockey",     label: "Hockey",     icon: "🏒" },
  { value: "esports",    label: "Esports",    icon: "🎮" },
];

const INITIAL: ChallengeCreate = {
  name: "",
  description: "",
  visibility: "public",
  sport_scope: [],
  start_at: "",
  end_at: "",
  max_members: undefined,
  entry_limit_per_day: undefined,
  scoring_type: "points",
};

export function CreateChallengeModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState<ChallengeCreate>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof ChallengeCreate, string>>>({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!open) return null;

  function set<K extends keyof ChallengeCreate>(key: K, value: ChallengeCreate[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function toggleSport(sport: string) {
    set(
      "sport_scope",
      form.sport_scope.includes(sport)
        ? form.sport_scope.filter((s) => s !== sport)
        : [...form.sport_scope, sport]
    );
  }

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.start_at) errs.start_at = "Required";
    if (!form.end_at) errs.end_at = "Required";
    if (form.start_at && form.end_at && form.end_at <= form.start_at)
      errs.end_at = "Must be after start";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setServerError(null);
    try {
      const created = await createChallenge(form);
      onCreated(created);
      setForm(INITIAL);
      onClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Failed to create challenge");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (loading) return;
    setForm(INITIAL);
    setErrors({});
    setServerError(null);
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-lg rounded-2xl overflow-hidden pointer-events-auto"
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
                <p className="text-sm font-bold text-text-primary">Create Challenge</p>
                <p className="text-[11px] text-text-muted">Set up a new competition</p>
              </div>
            </div>
            <button onClick={handleClose} className="text-text-muted hover:text-text-primary p-1 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit}>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">

              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Challenge Name</label>
                <input
                  className={cn(
                    "w-full rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-white/[0.05] border outline-none transition-colors placeholder:text-white/25",
                    errors.name ? "border-red-500/50 focus:border-red-400" : "border-white/[0.08] focus:border-white/20"
                  )}
                  placeholder="e.g. Premier League Season Cup"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  maxLength={200}
                />
                {errors.name && <p className="text-[11px] text-red-400">{errors.name}</p>}
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Description <span className="normal-case font-normal text-white/30">(optional)</span></label>
                <textarea
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-white/[0.05] border border-white/[0.08] focus:border-white/20 outline-none transition-colors placeholder:text-white/25 resize-none"
                  placeholder="What's this challenge about?"
                  rows={2}
                  value={form.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>

              {/* Visibility + Scoring */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Visibility</label>
                  <div className="flex rounded-xl overflow-hidden border border-white/[0.08]">
                    {[
                      { value: "public",  label: "Public",  icon: Globe },
                      { value: "private", label: "Private", icon: Lock },
                    ].map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => set("visibility", value as "public" | "private")}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-all",
                          form.visibility === value
                            ? "bg-white/[0.1] text-white"
                            : "text-white/40 hover:text-white/70"
                        )}
                      >
                        <Icon size={11} />{label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Scoring</label>
                  <div className="flex rounded-xl overflow-hidden border border-white/[0.08]">
                    {[
                      { value: "points", label: "Points" },
                      { value: "brier",  label: "Brier" },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => set("scoring_type", value as "points" | "brier")}
                        className={cn(
                          "flex-1 flex items-center justify-center py-2.5 text-xs font-semibold transition-all",
                          form.scoring_type === value
                            ? "bg-white/[0.1] text-white"
                            : "text-white/40 hover:text-white/70"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sport scope */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  Sports <span className="normal-case font-normal text-white/30">(all sports if none selected)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {SPORTS.map(({ value, label, icon }) => {
                    const active = form.sport_scope.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleSport(value)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                          active
                            ? "border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.1)] text-[#f59e0b]"
                            : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white/80 hover:border-white/20"
                        )}
                      >
                        <span>{icon}</span>{label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1">
                    <Calendar size={10} /> Start
                  </label>
                  <input
                    type="datetime-local"
                    className={cn(
                      "w-full rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-white/[0.05] border outline-none transition-colors",
                      errors.start_at ? "border-red-500/50" : "border-white/[0.08] focus:border-white/20"
                    )}
                    value={form.start_at}
                    onChange={(e) => set("start_at", e.target.value)}
                  />
                  {errors.start_at && <p className="text-[11px] text-red-400">{errors.start_at}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1">
                    <Calendar size={10} /> End
                  </label>
                  <input
                    type="datetime-local"
                    className={cn(
                      "w-full rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-white/[0.05] border outline-none transition-colors",
                      errors.end_at ? "border-red-500/50" : "border-white/[0.08] focus:border-white/20"
                    )}
                    value={form.end_at}
                    onChange={(e) => set("end_at", e.target.value)}
                  />
                  {errors.end_at && <p className="text-[11px] text-red-400">{errors.end_at}</p>}
                </div>
              </div>

              {/* Limits */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1">
                    <Users size={10} /> Max Members
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-white/[0.05] border border-white/[0.08] focus:border-white/20 outline-none transition-colors placeholder:text-white/25"
                    placeholder="Unlimited"
                    min={2}
                    value={form.max_members ?? ""}
                    onChange={(e) => set("max_members", e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1">
                    <Zap size={10} /> Picks Per Day
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-white/[0.05] border border-white/[0.08] focus:border-white/20 outline-none transition-colors placeholder:text-white/25"
                    placeholder="Unlimited"
                    min={1}
                    value={form.entry_limit_per_day ?? ""}
                    onChange={(e) => set("entry_limit_per_day", e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
              </div>

              {/* Server error */}
              {serverError && (
                <div className="rounded-xl px-4 py-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20">
                  {serverError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-end gap-3 px-5 py-4 border-t"
              style={{ borderColor: "var(--border0)" }}
            >
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white/50 hover:text-white/80 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                style={{ background: "#f59e0b", color: "#0a0a0a" }}
              >
                {loading ? (
                  <><Loader2 size={14} className="animate-spin" /> Creating…</>
                ) : (
                  <><Trophy size={14} /> Create Challenge</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
