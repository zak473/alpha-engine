"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { createChallenge } from "@/lib/api";
import type { Challenge, ChallengeCreate } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (c: Challenge) => void;
}

const SPORTS = ["soccer", "tennis", "esports"];

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
    if (!form.start_at) errs.start_at = "Start date is required";
    if (!form.end_at) errs.end_at = "End date is required";
    if (form.start_at && form.end_at && form.end_at <= form.start_at)
      errs.end_at = "End must be after start";
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
    if (!loading) {
      setForm(INITIAL);
      setErrors({});
      setServerError(null);
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Create Challenge" className="max-w-xl">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Name */}
        <Field label="Name" error={errors.name}>
          <input
            className="input-field"
            placeholder="e.g. Premier League Season Cup"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength={200}
          />
        </Field>

        {/* Description */}
        <Field label="Description">
          <textarea
            className="input-field"
            style={{ resize: "none" }}
            placeholder="Optional — what's this challenge about?"
            rows={2}
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        {/* Visibility + Scoring */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Visibility">
            <Select
              value={form.visibility}
              onChange={(v) => set("visibility", v as "public" | "private")}
              options={[
                { value: "public",  label: "Public" },
                { value: "private", label: "Private" },
              ]}
            />
          </Field>
          <Field label="Scoring">
            <Select
              value={form.scoring_type}
              onChange={(v) => set("scoring_type", v as "points" | "brier")}
              options={[
                { value: "points", label: "Points (+1 correct)" },
                { value: "brier",  label: "Brier score" },
              ]}
            />
          </Field>
        </div>

        {/* Sport scope */}
        <Field label="Sports (leave empty for all)">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SPORTS.map((s) => {
              const active = form.sport_scope.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSport(s)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: "capitalize",
                    cursor: "pointer",
                    transition: "all 0.12s",
                    border: `1px solid ${active ? "var(--accent)" : "var(--border0)"}`,
                    background: active ? "color-mix(in srgb, var(--accent) 12%, var(--bg1))" : "var(--bg1)",
                    color: active ? "var(--accent)" : "var(--text2)",
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Dates */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Start" error={errors.start_at}>
            <input
              type="datetime-local"
              className="input-field"
              value={form.start_at}
              onChange={(e) => set("start_at", e.target.value)}
            />
          </Field>
          <Field label="End" error={errors.end_at}>
            <input
              type="datetime-local"
              className="input-field"
              value={form.end_at}
              onChange={(e) => set("end_at", e.target.value)}
            />
          </Field>
        </div>

        {/* Limits */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Max members">
            <input
              type="number"
              className="input-field"
              placeholder="Unlimited"
              min={1}
              value={form.max_members ?? ""}
              onChange={(e) =>
                set("max_members", e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </Field>
          <Field label="Entries per day">
            <input
              type="number"
              className="input-field"
              placeholder="Unlimited"
              min={1}
              value={form.entry_limit_per_day ?? ""}
              onChange={(e) =>
                set("entry_limit_per_day", e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </Field>
        </div>

        {/* Server error */}
        {serverError && (
          <div style={{
            fontSize: 11,
            color: "var(--negative)",
            background: "color-mix(in srgb, var(--negative) 10%, var(--bg1))",
            border: "1px solid color-mix(in srgb, var(--negative) 25%, transparent)",
            borderRadius: 6,
            padding: "8px 12px",
          }}>
            {serverError}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
          <button
            type="button"
            className="btn btn-md btn-ghost"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-md btn-primary"
            disabled={loading}
          >
            {loading ? "Creating…" : "Create challenge"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label className="label">{label}</label>
      {children}
      {error && (
        <p style={{ margin: 0, fontSize: 11, color: "var(--negative)" }}>{error}</p>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      className="input-field"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
