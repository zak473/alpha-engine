"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

export function RegisterForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, display_name: displayName || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Registration failed" }));
        throw new Error(err.detail ?? "Registration failed");
      }
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 py-8 lg:px-6 lg:py-10">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        {/* Create account form */}
        <section className="rounded-[36px] border border-b0 bg-bg1 p-6 shadow-[0_20px_70px_rgba(17,19,21,0.08)] lg:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center rounded-full border border-b0 bg-bg2 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-positive">
                Create Account
              </div>
              <h2 className="mt-4 text-[30px] font-semibold leading-tight text-t0">
                Join Never In Doubt
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-t1">
                Set up your account, follow top tipsters, and get straight into your
                dashboard, live markets, and multi-sport picks.
              </p>
            </div>

            <div className="hidden rounded-[20px] border border-b0 bg-bg2 px-4 py-3 sm:block">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-t2">
                Platform access
              </div>
              <div className="mt-2 text-sm font-semibold text-t0">Instant setup</div>
              <div className="mt-1 text-xs text-positive">Ready in minutes</div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Follow tipsters", "Track edges", "Access in-play"].map((item) => (
              <div
                key={item}
                className="rounded-[18px] border border-b0 bg-bg2 px-4 py-3 text-sm font-medium text-t1"
              >
                {item}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="label">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="input-field-lg"
                autoComplete="name"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input-field-lg"
                required
                autoComplete="email"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field-lg"
                required
                autoComplete="new-password"
                minLength={6}
              />
              <p className="text-xs text-t2">Use at least 6 characters to secure your account.</p>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
              {loading ? "Creating account…" : "Join platform"}
            </button>
          </form>

          <div className="mt-6 rounded-[24px] border border-b0 bg-bg2 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="label">Already have an account?</div>
                <div className="mt-1 text-sm text-t1">
                  Sign in and get back to your betting board.
                </div>
              </div>
              <Link href="/login" className="btn btn-secondary btn-md">
                Sign in
              </Link>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-t2">
            By creating an account, you&apos;re joining the Never In Doubt betting board.
          </p>
        </section>

        {/* Brand / value prop */}
        <section className="relative overflow-hidden rounded-[36px] border border-b0 bg-bg1 p-6 shadow-[0_25px_80px_rgba(17,19,21,0.08)] lg:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(46,219,108,0.16),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(46,219,108,0.08),transparent_30%)]" />
          <div className="relative z-10 flex h-full flex-col">
            <div className="inline-flex w-fit items-center rounded-full border border-b0 bg-bg2 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-positive">
              Never In Doubt
            </div>

            <div className="mt-6 max-w-2xl">
              <h3 className="text-4xl font-semibold leading-[0.98] text-t0 lg:text-6xl">
                Build your account.
                <br />
                Follow better picks.
              </h3>
              <p className="mt-5 max-w-xl text-[15px] leading-7 text-t1">
                Join the platform to access premium match boards, live edges,
                tipster performance, and cleaner multi-sport decision flow from day one.
              </p>
            </div>

            <div className="mt-7 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="overflow-hidden rounded-[28px] border border-b0 bg-bg2 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-positive">
                      Member access
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-t0">
                      Your board starts here
                    </div>
                    <div className="mt-1 text-sm text-t1">
                      Get picks, stats, live movement, and tipster tracking in one place
                    </div>
                  </div>
                  <div className="rounded-2xl border border-b0 bg-bg1 px-4 py-3 text-right">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-t2">
                      Access
                    </div>
                    <div className="mt-1 text-sm font-semibold text-positive">
                      Ready now
                    </div>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-[22px] border border-b0 bg-bg1 p-3">
                  <Image
                    src="/never-in-doubt-logo.png"
                    alt="Never In Doubt logo"
                    width={900}
                    height={600}
                    className="h-auto w-full"
                    priority
                  />
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-[24px] border border-b0 bg-bg2 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-t2">
                    Tipster focus
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-t0">Follow the form</div>
                  <div className="mt-1 text-sm text-t1">
                    Track ROI, streaks, and best-performing analysts
                  </div>
                </div>

                <div className="rounded-[24px] border border-b0 bg-bg2 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-t2">
                    Multi-sport board
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-t0">All markets</div>
                  <div className="mt-1 text-sm text-t1">
                    Soccer, tennis, basketball, baseball, esports
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Live value", value: "Scan sharper opportunities" },
                { label: "Tipster feed", value: "Follow who is in form" },
                { label: "Premium flow", value: "Cleaner board experience" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[22px] border border-b0 bg-bg2 px-4 py-4"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-positive">
                    {item.label}
                  </div>
                  <div className="mt-2 text-sm text-t1">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
