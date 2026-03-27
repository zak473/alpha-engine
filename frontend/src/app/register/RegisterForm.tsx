"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AuthDivider,
  AuthError,
  AuthField,
  AuthFormPanel,
  AuthGoogleButton,
  AuthGrid,
  AuthMarketingPanel,
  AuthPageShell,
  AuthPrimaryButton,
  AuthSwitchCard,
  AuthTrustNote,
} from "@/app/auth/AuthExperience";
import { useAuth, getStoredToken } from "@/lib/auth";

export function RegisterForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [acceptedSetup, setAcceptedSetup] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Use at least 6 characters for your password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Password and confirmation do not match.");
      return;
    }

    if (!acceptedSetup) {
      setError("Please confirm that you understand setup continues to plan activation.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, display_name: displayName.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Registration failed" }));
        throw new Error(err.detail ?? "Registration failed");
      }
      await login(email, password);
      const token = getStoredToken();
      const checkoutRes = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (checkoutRes.ok) {
        const { url } = await checkoutRes.json();
        window.location.href = url;
      } else {
        router.push("/subscribe");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell>
      <AuthGrid>
        <AuthFormPanel
          badge="Create account"
          title="Create your account"
          subtitle="A simpler setup flow that gets you into the workspace quickly, then moves you into billing only when your account is ready."
          statusTitle="Setup"
          statusValue="Guided"
          statusHint="Ready in minutes"
          quickItems={["Create profile", "Open workspace", "Activate plan"]}
          support={
            <>
              <AuthSwitchCard
                eyebrow="Already have an account?"
                copy="Sign in and jump straight back to your dashboard, predictions, and live board."
                href="/login"
                cta="Sign in"
              />
              <AuthTrustNote>You will create your account first, then continue to plan activation. Nothing feels hidden or abrupt.</AuthTrustNote>
            </>
          }
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <AuthField
              label="Display name"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />

            <AuthField
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />

            <div className="grid gap-5 md:grid-cols-2">
              <AuthField
                label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                minLength={6}
                note="Use at least 6 characters to secure your account."
              />

              <AuthField
                label="Confirm password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                minLength={6}
                note="Re-enter the same password once more."
              />
            </div>

            <div className="rounded-[18px] border border-white/10 bg-white/[0.035] px-4 py-3 text-sm leading-6 text-white/60">
              After signup, you will continue to plan activation before entering the full product. <Link href="/pricing" className="font-semibold text-[#95ffca] transition-opacity hover:opacity-80">Review plan framing</Link>
            </div>

            <label className="flex items-start gap-3 rounded-[18px] border border-white/10 bg-white/[0.035] px-4 py-3 text-sm leading-6 text-white/62">
              <input
                type="checkbox"
                checked={acceptedSetup}
                onChange={(event) => setAcceptedSetup(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent accent-[#00f884]"
              />
              <span>I understand account creation comes first and plan activation happens next.</span>
            </label>

            {error ? <AuthError>{error}</AuthError> : null}

            <AuthPrimaryButton type="submit" disabled={loading}>
              {loading ? "Setting up…" : "Create account"}
            </AuthPrimaryButton>

            <AuthDivider />
            <AuthGoogleButton />
          </form>
        </AuthFormPanel>

        <AuthMarketingPanel
          eyebrow="Member setup"
          title={
            <>
              Start clean,
              <br />
              then activate access.
            </>
          }
          subtitle="The signup flow now explains the handoff into billing more clearly, so the product feels premium instead of abrupt."
          primaryLabel="Setup"
          primaryValue="One account for the full platform"
          primaryCopy="Create one account, keep one workspace, and use the same product flow for predictions, performance, tipsters, and live market tracking."
          secondaryCards={[
            {
              label: "Predictions",
              value: "Start with conviction",
              copy: "Open the strongest reads first instead of wading through filler and empty framing.",
            },
            {
              label: "Performance",
              value: "Track what works",
              copy: "Move from picks to ROI, bankroll movement, and model quality in a cleaner analytics flow.",
            },
          ]}
          bottomNotes={[
            { label: "Tipsters", value: "Compare recent form and tracked performance without the visual clutter." },
            { label: "Live board", value: "Stay close to active markets while keeping the rest of the workspace coherent." },
            { label: "Billing", value: "Account creation comes first, then plan activation with clearer expectations." },
          ]}
        />
      </AuthGrid>
    </AuthPageShell>
  );
}
