"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { updateProfile } from "@/lib/api";
import {
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";

function initialsFrom(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  if (!cleaned) return "NI";
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || cleaned.slice(0, 2).toUpperCase();
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-6 lg:px-6">
      <div className="h-[212px] animate-pulse rounded-[30px] border border-white/[0.08] bg-white/[0.03]" />
      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-6">
          <div className="h-[220px] animate-pulse rounded-[24px] border border-white/[0.08] bg-white/[0.03]" />
          <div className="h-[210px] animate-pulse rounded-[24px] border border-white/[0.08] bg-white/[0.03]" />
        </div>
        <div className="space-y-6">
          <div className="h-[240px] animate-pulse rounded-[24px] border border-white/[0.08] bg-white/[0.03]" />
          <div className="h-[330px] animate-pulse rounded-[24px] border border-white/[0.08] bg-white/[0.03]" />
        </div>
      </div>
    </div>
  );
}

function InlineMessage({ type, text }: { type: "ok" | "err"; text: string }) {
  return (
    <p
      className="inline-flex items-center gap-1 text-xs"
      style={{ color: type === "ok" ? "var(--positive)" : "var(--negative)" }}
    >
      {type === "ok" ? <CheckCircle2 size={12} /> : null}
      {text}
    </p>
  );
}

export function ProfileClient() {
  const { user, isLoggedIn, isReady } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
  }, [user?.displayName]);

  const userInitials = useMemo(
    () => initialsFrom(user?.displayName || user?.email || "Never In Doubt"),
    [user?.displayName, user?.email]
  );

  if (!isReady) {
    return <ProfileSkeleton />;
  }

  if (!isLoggedIn || !user) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 lg:px-6">
        <section className="overflow-hidden rounded-[30px] border border-white/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(0,255,132,0.1),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-6 lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,255,132,0.16)] bg-[rgba(0,255,132,0.08)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#95ffca]">
                <ShieldCheck size={13} />
                Account access
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-text-primary sm:text-[38px]">
                Sign in to manage your profile and security.
              </h2>
              <p className="mt-3 max-w-[64ch] text-sm leading-7 text-text-muted">
                This workspace holds your display name, account details, and password controls. Once you sign in,
                everything lives here in one cleaner settings page instead of scattered account screens.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link href="/login" className="btn btn-primary h-11 px-5 text-sm">
                Sign in
              </Link>
              <Link
                href="/register"
                className="btn h-11 border border-white/[0.1] bg-white/[0.03] px-5 text-sm text-text-primary transition-colors hover:bg-white/[0.05]"
              >
                Create account
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              {
                label: "Identity",
                copy: "Update the display name shown across your workspace and community surfaces.",
              },
              {
                label: "Security",
                copy: "Change your password without leaving the product and keep access under control.",
              },
              {
                label: "Navigation",
                copy: "Jump back to the dashboard, predictions, or performance whenever you are done.",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-4"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-text-primary/80">{item.copy}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  async function handleNameSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNameMsg(null);
    try {
      const trimmedName = displayName.trim();
      await updateProfile({ display_name: trimmedName || null });
      setDisplayName(trimmedName);
      setNameMsg({ type: "ok", text: "Display name updated." });
    } catch (err) {
      setNameMsg({ type: "err", text: err instanceof Error ? err.message : "Failed to update" });
    } finally {
      setSaving(false);
    }
  }

  async function handlePwSave(e: FormEvent) {
    e.preventDefault();
    if (!currentPw) {
      setPwMsg({ type: "err", text: "Enter your current password." });
      return;
    }
    if (!newPw || newPw.length < 6) {
      setPwMsg({ type: "err", text: "New password must be at least 6 characters." });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: "err", text: "New password and confirmation do not match." });
      return;
    }
    setPwSaving(true);
    setPwMsg(null);
    try {
      await updateProfile({ current_password: currentPw, new_password: newPw });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setPwMsg({ type: "ok", text: "Password changed successfully." });
    } catch (err) {
      setPwMsg({ type: "err", text: err instanceof Error ? err.message : "Failed to change password" });
    } finally {
      setPwSaving(false);
    }
  }

  const profileName = displayName.trim() || user.displayName || "Not set";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-6 lg:px-6">
      <section
        className="overflow-hidden rounded-[30px] border p-6 lg:p-7"
        style={{
          borderColor: "rgba(255,255,255,0.08)",
          background:
            "radial-gradient(circle at top left, rgba(0,255,132,0.10), transparent 34%), linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))",
        }}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] border border-[rgba(0,255,132,0.16)] bg-[rgba(0,255,132,0.08)] text-lg font-semibold text-[#8affc9]">
              {userInitials}
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">
                <ShieldCheck size={13} style={{ color: "var(--accent)" }} />
                Account settings
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-text-primary">
                Profile & security
              </h2>
              <p className="mt-3 max-w-[64ch] text-sm leading-7 text-text-muted">
                Manage the identity shown in your workspace, keep account access healthy, and move back into the
                product with clear quick links when you are done.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {[
                  { label: "Dashboard", href: "/dashboard" },
                  { label: "Predictions", href: "/predictions" },
                  { label: "Performance", href: "/performance" },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-text-primary/78 transition hover:bg-white/[0.06]"
                  >
                    {item.label}
                    <ArrowUpRight size={12} />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:w-[560px]">
            <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">Signed in as</p>
              <p className="mt-2 truncate text-sm font-semibold text-text-primary">{user.email}</p>
            </div>
            <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">Display name</p>
              <p className="mt-2 truncate text-sm font-semibold text-text-primary">{profileName}</p>
            </div>
            <div className="rounded-[20px] border border-[rgba(0,255,132,0.16)] bg-[rgba(0,255,132,0.08)] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">Security</p>
              <p className="mt-2 text-sm font-semibold text-[#8affc9]">Healthy</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-6">
          <div
            className="overflow-hidden rounded-[24px] border"
            style={{
              borderColor: "rgba(255,255,255,0.08)",
              background: "linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))",
            }}
          >
            <div
              className="flex items-center gap-2 border-b px-5 py-4"
              style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}
            >
              <Mail size={15} style={{ color: "var(--accent)" }} />
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-primary">Account overview</p>
            </div>

            <div className="grid gap-3 px-5 py-5">
              <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-text-muted" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Email</p>
                </div>
                <p className="mt-2 break-all text-sm font-semibold text-text-primary">{user.email}</p>
              </div>

              <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <div className="flex items-center gap-2">
                  <KeyRound size={14} className="text-text-muted" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">User ID</p>
                </div>
                <p className="mt-2 break-all font-mono text-[12px] text-text-muted">{user.userId}</p>
              </div>

              <div className="rounded-[18px] border border-[rgba(0,255,132,0.14)] bg-[rgba(0,255,132,0.06)] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Workspace status</p>
                <p className="mt-2 text-sm font-semibold text-text-primary">Signed in and ready</p>
                <p className="mt-1 text-xs leading-6 text-text-muted">
                  Your account details are available and profile changes can be made from this page.
                </p>
              </div>
            </div>
          </div>

          <div
            className="overflow-hidden rounded-[24px] border"
            style={{
              borderColor: "rgba(255,255,255,0.08)",
              background: "linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))",
            }}
          >
            <div
              className="flex items-center gap-2 border-b px-5 py-4"
              style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}
            >
              <BadgeCheck size={15} style={{ color: "var(--accent)" }} />
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-primary">Security guidance</p>
            </div>
            <div className="grid gap-3 px-5 py-5">
              {[
                "Use a unique password for this account rather than reusing one from another product.",
                "If anything looks unfamiliar, rotate your password immediately and review your saved devices.",
                "Keep your display name current so the workspace feels consistent wherever your account appears.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm leading-6 text-text-muted"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div
            className="overflow-hidden rounded-[24px] border"
            style={{
              borderColor: "rgba(255,255,255,0.08)",
              background: "linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))",
            }}
          >
            <div
              className="flex items-center gap-2 border-b px-5 py-4"
              style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}
            >
              <User size={15} style={{ color: "var(--accent)" }} />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-primary">Display name</p>
                <p className="mt-1 text-[11px] text-text-muted">Update the name shown across your workspace.</p>
              </div>
            </div>

            <form onSubmit={handleNameSave} className="flex flex-col gap-4 px-5 py-5">
              <div className="grid gap-2">
                <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">Display name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter display name"
                  className="input-field"
                  maxLength={100}
                />
              </div>

              <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-xs leading-6 text-text-muted">
                This name appears around the product wherever your account is shown. Leave it blank if you prefer to use email-only identity.
              </div>

              {nameMsg ? <InlineMessage type={nameMsg.type} text={nameMsg.text} /> : null}

              <div className="flex justify-end">
                <button type="submit" className="btn btn-primary h-10 px-5 text-xs" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>

          <div
            className="overflow-hidden rounded-[24px] border"
            style={{
              borderColor: "rgba(255,255,255,0.08)",
              background: "linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))",
            }}
          >
            <div
              className="flex items-center gap-2 border-b px-5 py-4"
              style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}
            >
              <Lock size={15} style={{ color: "var(--accent)" }} />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-primary">Change password</p>
                <p className="mt-1 text-[11px] text-text-muted">Choose a stronger password and keep account access secure.</p>
              </div>
            </div>

            <form onSubmit={handlePwSave} className="flex flex-col gap-4 px-5 py-5">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">Current password</label>
                  <input
                    type="password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="Current password"
                    className="input-field"
                    autoComplete="current-password"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">New password</label>
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="New password (min 6 chars)"
                    className="input-field"
                    autoComplete="new-password"
                    minLength={6}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">Confirm new password</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Re-enter new password"
                  className="input-field"
                  autoComplete="new-password"
                  minLength={6}
                />
              </div>

              <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-xs leading-6 text-text-muted">
                <div className="inline-flex items-center gap-2 font-semibold text-text-primary/78">
                  <Sparkles size={13} style={{ color: "var(--accent)" }} />
                  Quick check
                </div>
                <p className="mt-2">Use at least 6 characters and avoid reusing a password from other products.</p>
              </div>

              {pwMsg ? <InlineMessage type={pwMsg.type} text={pwMsg.text} /> : null}

              <div className="flex justify-end">
                <button type="submit" className="btn btn-primary h-10 px-5 text-xs" disabled={pwSaving}>
                  {pwSaving ? "Changing…" : "Update password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
