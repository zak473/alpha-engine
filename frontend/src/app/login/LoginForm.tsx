"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 py-8 lg:px-6 lg:py-10">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[1.12fr_0.88fr]">
        <section className="relative overflow-hidden rounded-[36px] border border-[#1f2a22] bg-[#111315] p-6 text-white shadow-[0_25px_80px_rgba(0,0,0,0.28)] lg:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(46,219,108,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(46,219,108,0.08),transparent_28%)]" />
          <div className="relative z-10 flex h-full flex-col">
            <div className="inline-flex w-fit items-center rounded-full border border-[rgba(46,219,108,0.22)] bg-[rgba(46,219,108,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2edb6c]">
              Never In Doubt
            </div>

            <div className="mt-6 max-w-2xl">
              <h2 className="text-4xl font-semibold leading-[0.98] text-white lg:text-6xl">
                Follow sharper tipsters.
                <br />
                Track better value.
              </h2>
              <p className="mt-5 max-w-xl text-[15px] leading-7 text-white/72">
                Sign in to access your betting board, in-play edges, live market movement,
                and the tipsters driving the strongest picks across every sport.
              </p>
            </div>

            <div className="mt-7 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2edb6c]">
                      Platform access
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      Betting board live
                    </div>
                    <div className="mt-1 text-sm text-white/65">
                      Premium access to picks, stats, and in-play movement
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                      Status
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[#2edb6c]">
                      Online now
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
                  <div className="mt-3 text-3xl font-semibold text-white">4 top analysts</div>
                  <div className="mt-1 text-sm text-white/65">
                    Follow form, ROI, and live picks
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                    Today&apos;s board
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-white">54 live markets</div>
                  <div className="mt-1 text-sm text-white/65">
                    Soccer, tennis, basketball, baseball, esports
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Live value", value: "Odds, momentum, edges" },
                { label: "Tipster feed", value: "Track who is in form" },
                { label: "Multi-sport", value: "One board across all sports" },
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

        <section className="rounded-[36px] border border-[#d9e2d7] bg-white p-6 shadow-[0_20px_70px_rgba(17,19,21,0.08)] lg:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center rounded-full border border-[#dce6da] bg-[#f6faf5] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2d7f4f]">
                Account Access
              </div>
              <h3 className="mt-4 text-[30px] font-semibold leading-tight text-[#111315]">
                Welcome back
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#667066]">
                Access your dashboard, follow our tipsters, and scan live opportunities in seconds.
              </p>
            </div>

            <div className="hidden rounded-[20px] border border-[#d9e2d7] bg-[#f7f8f5] px-4 py-3 sm:block">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7b857b]">
                Board status
              </div>
              <div className="mt-2 text-sm font-semibold text-[#111315]">Live data synced</div>
              <div className="mt-1 text-xs text-[#2d7f4f]">Ready to go</div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Follow tipsters", "Track edges", "View in-play"].map((item) => (
              <div
                key={item}
                className="rounded-[18px] border border-[#d9e2d7] bg-[#f7f8f5] px-4 py-3 text-sm font-medium text-[#4f5950]"
              >
                {item}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#667066]">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-14 rounded-2xl border border-[#d9e2d7] bg-[#f7f8f5] px-4 text-[15px] text-[#111315] outline-none transition focus:border-[#2edb6c] focus:bg-white"
                required
                autoComplete="email"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#667066]">
                  Password
                </label>
                <Link
                  href="#"
                  className="text-[12px] font-medium text-[#2d7f4f] transition hover:opacity-80"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-14 rounded-2xl border border-[#d9e2d7] bg-[#f7f8f5] px-4 text-[15px] text-[#111315] outline-none transition focus:border-[#2edb6c] focus:bg-white"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="inline-flex h-14 items-center justify-center rounded-2xl bg-[#2edb6c] px-5 text-[15px] font-semibold text-[#0f1a12] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Enter platform"}
            </button>
          </form>

          <div className="mt-6 rounded-[24px] border border-[#d9e2d7] bg-[#f7f8f5] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#667066]">
                  New here?
                </div>
                <div className="mt-1 text-sm text-[#4f5950]">
                  Create an account and start following picks and tipsters.
                </div>
              </div>
              <Link
                href="/register"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl border border-[#cfe6d4] bg-white px-4 text-sm font-semibold text-[#2d7f4f] transition hover:bg-[#f4fbf6]"
              >
                Create account
              </Link>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-[#7b857b]">
            By continuing, you&apos;re accessing the Never In Doubt betting board.
          </p>
        </section>
      </div>
    </div>
  );
}
