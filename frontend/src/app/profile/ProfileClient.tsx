"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { updateProfile } from "@/lib/api";
import { User, Lock, CheckCircle2 } from "lucide-react";

export function ProfileClient() {
  const { user, isLoggedIn } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  if (!isLoggedIn || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm text-text-muted">Sign in to view your profile.</p>
      </div>
    );
  }

  async function handleNameSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNameMsg(null);
    try {
      await updateProfile({ display_name: displayName });
      setNameMsg({ type: "ok", text: "Display name updated." });
    } catch (err) {
      setNameMsg({ type: "err", text: err instanceof Error ? err.message : "Failed to update" });
    } finally {
      setSaving(false);
    }
  }

  async function handlePwSave(e: React.FormEvent) {
    e.preventDefault();
    if (!newPw || newPw.length < 6) { setPwMsg({ type: "err", text: "New password must be at least 6 characters" }); return; }
    setPwSaving(true);
    setPwMsg(null);
    try {
      await updateProfile({ current_password: currentPw, new_password: newPw });
      setCurrentPw("");
      setNewPw("");
      setPwMsg({ type: "ok", text: "Password changed successfully." });
    } catch (err) {
      setPwMsg({ type: "err", text: err instanceof Error ? err.message : "Failed to change password" });
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="px-4 py-6 lg:px-6 max-w-xl mx-auto flex flex-col gap-6">

      {/* Account info card */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border0)", background: "#fff" }}>
        <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
          <User size={14} style={{ color: "var(--accent)" }} />
          <p className="text-xs font-bold uppercase tracking-wider text-text-primary">Account</p>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Email</p>
            <p className="text-sm font-semibold text-text-primary">{user.email}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">User ID</p>
            <p className="text-[11px] font-mono text-text-muted">{user.userId}</p>
          </div>
        </div>
      </div>

      {/* Display name card */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border0)", background: "#fff" }}>
        <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
          <User size={14} style={{ color: "var(--accent)" }} />
          <p className="text-xs font-bold uppercase tracking-wider text-text-primary">Display Name</p>
        </div>
        <form onSubmit={handleNameSave} className="px-5 py-4 flex flex-col gap-3">
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Enter display name"
            className="input-field"
            maxLength={100}
          />
          {nameMsg && (
            <p className="text-xs flex items-center gap-1" style={{ color: nameMsg.type === "ok" ? "var(--positive)" : "var(--negative)" }}>
              {nameMsg.type === "ok" && <CheckCircle2 size={12} />}
              {nameMsg.text}
            </p>
          )}
          <button type="submit" className="btn btn-primary h-9 text-xs" disabled={saving}>
            {saving ? "Saving…" : "Save name"}
          </button>
        </form>
      </div>

      {/* Change password card */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border0)", background: "#fff" }}>
        <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
          <Lock size={14} style={{ color: "var(--accent)" }} />
          <p className="text-xs font-bold uppercase tracking-wider text-text-primary">Change Password</p>
        </div>
        <form onSubmit={handlePwSave} className="px-5 py-4 flex flex-col gap-3">
          <input
            type="password"
            value={currentPw}
            onChange={e => setCurrentPw(e.target.value)}
            placeholder="Current password"
            className="input-field"
            autoComplete="current-password"
          />
          <input
            type="password"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            placeholder="New password (min 6 chars)"
            className="input-field"
            autoComplete="new-password"
            minLength={6}
          />
          {pwMsg && (
            <p className="text-xs flex items-center gap-1" style={{ color: pwMsg.type === "ok" ? "var(--positive)" : "var(--negative)" }}>
              {pwMsg.type === "ok" && <CheckCircle2 size={12} />}
              {pwMsg.text}
            </p>
          )}
          <button type="submit" className="btn btn-primary h-9 text-xs" disabled={pwSaving}>
            {pwSaving ? "Changing…" : "Change password"}
          </button>
        </form>
      </div>
    </div>
  );
}
