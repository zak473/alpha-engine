"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const googleError = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [error, setError] = useState<string | null>(
    googleError === "google_cancelled"
      ? "Google sign-in was cancelled."
      : googleError === "google_failed"
        ? "Google sign-in failed. Please try again."
        : googleError === "google_no_email"
          ? "No email returned from Google."
          : null
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      const token = getStoredToken();
      const statusRes = await fetch("/api/v1/billing/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (statusRes.ok) {
        const { is_active } = await statusRes.json();
        if (!is_active) {
          router.push("/subscribe");
          return;
        }
      }
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell>
      <AuthGrid>
        <AuthFormPanel
          badge="Sign in"
          title="Welcome back"
          subtitle="Get straight to your board, saved context, and latest reads without the extra clutter."
          statusTitle="Access"
          statusValue="Ready"
          statusHint="Secure sign-in"
          quickItems={["Dashboard", "Predictions", "Live board"]}
          support={
            <>
              <AuthSwitchCard
                eyebrow="New here?"
                copy="Create an account to unlock the dashboard, tipsters, and live board from the same workspace."
                href="/register"
                cta="Create account"
              />
              <AuthTrustNote>Secure access keeps your picks, subscriptions, and account settings in one place.</AuthTrustNote>
            </>
          }
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <AuthField
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />

            <AuthField
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/62">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(event) => setRememberDevice(event.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-transparent accent-[#00f884]"
                />
                Keep this device signed in
              </label>
              <Link href="/forgot-password" className="font-semibold text-[#95ffca] transition-opacity hover:opacity-80">
                Password help
              </Link>
            </div>

            {error ? <AuthError>{error}</AuthError> : null}

            <AuthPrimaryButton type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Enter workspace"}
            </AuthPrimaryButton>

            <div className="rounded-[18px] border border-white/10 bg-white/[0.035] px-4 py-3 text-sm leading-6 text-white/60">
              If you still have access on another device, you can change your password later from <span className="font-semibold text-white/78">Profile &amp; Security</span> inside the workspace.
            </div>

            <AuthDivider />
            <AuthGoogleButton />
          </form>
        </AuthFormPanel>

        <AuthMarketingPanel
          eyebrow="Account access"
          title={
            <>
              Sign in and pick up
              <br />
              where you left off.
            </>
          }
          subtitle="A cleaner sign-in flow built to get returning users back into the product quickly and confidently."
          primaryLabel="Return"
          primaryValue="Everything in one place"
          primaryCopy="Open the same workspace for predictions, performance, tipsters, and live opportunities without jumping between disconnected screens."
          secondaryCards={[
            {
              label: "Predictions",
              value: "Start with the board",
              copy: "Open the strongest signals first and move into match-level context only when you need it.",
            },
            {
              label: "Tipsters",
              value: "Follow form quickly",
              copy: "See who is hot, what they are backing, and whether their recent results still hold up.",
            },
          ]}
          bottomNotes={[
            { label: "Dashboard", value: "A cleaner starting point for your daily workflow." },
            { label: "Performance", value: "Review what is working before you make the next decision." },
            { label: "Live board", value: "Stay close to active markets without losing context." },
          ]}
        />
      </AuthGrid>
    </AuthPageShell>
  );
}
