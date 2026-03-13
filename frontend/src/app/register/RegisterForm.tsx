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
        {/* Form panel */}
        <section className="rounded-[36px] border border-[#1f2a22] bg-[#111315] p-6 text-white shadow-[0_25px_80px_rgba(0,0,0,0.28)] lg:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
                Create Account
              </div>
              <h2 className="mt-4 text-[30px] font-semibold leading-tight text-white">
                Join Never In Doubt
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-white/55">
                Set up your account, follow top tipsters, and get straight into your
                dashboard, live markets, and multi-sport picks.
              </p>
            </div>

            <div className="hidden rounded-[20px] border border-white/10 bg-white/[0.05] px-4 py-3 sm:block">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Platform access
              </div>
              <div className="mt-2 text-sm font-semibold text-white">Instant setup</div>
              <div className="mt-1 text-xs text-emerald-400">Ready in minutes</div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Follow tipsters", "Track edges", "Access in-play"].map((item) => (
              <div
                key={item}
                className="rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/60"
              >
                {item}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/50">
                Display name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="h-14 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-[15px] text-white placeholder:text-white/30 outline-none transition focus:border-emerald-500/50 focus:bg-white/[0.09]"
                autoComplete="name"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/50">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-14 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-[15px] text-white placeholder:text-white/30 outline-none transition focus:border-emerald-500/50 focus:bg-white/[0.09]"
                required
                autoComplete="email"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/50">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-14 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-[15px] text-white placeholder:text-white/30 outline-none transition focus:border-emerald-500/50 focus:bg-white/[0.09]"
                required
                autoComplete="new-password"
                minLength={6}
              />
              <p className="text-xs text-white/35">
                Use at least 6 characters to secure your account.
              </p>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="inline-flex h-14 items-center justify-center rounded-2xl bg-[#2edb6c] px-5 text-[15px] font-semibold text-[#0f1a12] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={loading}
            >
              {loading ? "Creating account…" : "Join platform"}
            </button>
          </form>

          <div className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/50">
                  Already have an account?
                </div>
                <div className="mt-1 text-sm text-white/60">
                  Sign in and get back to your betting board.
                </div>
              </div>
              <Link
                href="/login"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
              >
                Sign in
              </Link>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-white/35">
            By creating an account, you&apos;re joining the Never In Doubt betting board.
          </p>
        </section>

        {/* Marketing panel */}
        <section className="relative overflow-hidden rounded-[36px] border border-[#1f2a22] bg-[#111315] p-6 text-white shadow-[0_25px_80px_rgba(0,0,0,0.28)] lg:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(46,219,108,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(46,219,108,0.08),transparent_28%)]" />
          <div className="relative z-10 flex h-full flex-col">
            <div className="inline-flex w-fit items-center rounded-full border border-[rgba(46,219,108,0.22)] bg-[rgba(46,219,108,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2edb6c]">
              Never In Doubt
            </div>

            <div className="mt-6 max-w-2xl">
              <h3 className="text-4xl font-semibold leading-[0.98] text-white lg:text-6xl">
                Build your account.
                <br />
                Follow better picks.
              </h3>
              <p className="mt-5 max-w-xl text-[15px] leading-7 text-white/72">
                Join the platform to access premium match boards, live edges,
                tipster performance, and cleaner multi-sport decision flow from day one.
              </p>
            </div>

            <div className="mt-7 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2edb6c]">
                      Member access
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      Your board starts here
                    </div>
                    <div className="mt-1 text-sm text-white/65">
                      Get picks, stats, live movement, and tipster tracking in one place
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                      Access
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[#2edb6c]">
                      Ready now
                    </div>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-[22px] border border-white/10 bg-black/20 p-3">
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
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                    Tipster focus
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-white">Follow the form</div>
                  <div className="mt-1 text-sm text-white/65">
                    Track ROI, streaks, and best-performing analysts
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                    Multi-sport board
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-white">All markets</div>
                  <div className="mt-1 text-sm text-white/65">
                    Soccer, tennis, basketball, baseball, and esports
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
                  className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-4"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2edb6c]">
                    {item.label}
                  </div>
                  <div className="mt-2 text-sm text-white/72">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
