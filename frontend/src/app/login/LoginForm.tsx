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
        {/* Brand / value prop (kept inside AppShell per request) */}
        <section className="relative overflow-hidden rounded-[36px] border border-b0 bg-bg1 p-6 shadow-[0_25px_80px_rgba(17,19,21,0.08)] lg:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(46,219,108,0.16),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(46,219,108,0.08),transparent_30%)]" />
          <div className="relative z-10 flex h-full flex-col">
            <div className="inline-flex w-fit items-center rounded-full border border-b0 bg-bg2 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-positive">
              Never In Doubt
            </div>

            <div className="mt-6 max-w-2xl">
              <h2 className="text-4xl font-semibold leading-[0.98] text-t0 lg:text-6xl">
                Follow sharper tipsters.
                <br />
                Track better value.
              </h2>
              <p className="mt-5 max-w-xl text-[15px] leading-7 text-t1">
                Sign in to access your betting board, in-play edges, live market movement,
                and the tipsters driving the strongest picks across every sport.
              </p>
            </div>

            <div className="mt-7 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="overflow-hidden rounded-[28px] border border-b0 bg-bg2 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-positive">
                      Platform access
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-t0">
                      Betting board live
                    </div>
                    <div className="mt-1 text-sm text-t1">
                      Premium access to picks, stats, and in-play movement
                    </div>
                  </div>
                  <div className="rounded-2xl border border-b0 bg-bg1 px-4 py-3 text-right">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-t2">
                      Status
                    </div>
                    <div className="mt-1 text-sm font-semibold text-positive">
                      Online now
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
                  <div className="mt-3 text-3xl font-semibold text-t0">4 top analysts</div>
                  <div className="mt-1 text-sm text-t1">
                    Follow form, ROI, and live picks
                  </div>
                </div>

                <div className="rounded-[24px] border border-b0 bg-bg2 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-t2">
                    Today&apos;s board
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-t0">54 live markets</div>
                  <div className="mt-1 text-sm text-t1">
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

        {/* Sign-in form */}
        <section className="rounded-[36px] border border-b0 bg-bg1 p-6 shadow-[0_20px_70px_rgba(17,19,21,0.08)] lg:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center rounded-full border border-b0 bg-bg2 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-positive">
                Account Access
              </div>
              <h3 className="mt-4 text-[30px] font-semibold leading-tight text-t0">
                Welcome back
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-t1">
                Access your dashboard, follow our tipsters, and scan live opportunities in seconds.
              </p>
            </div>

            <div className="hidden rounded-[20px] border border-b0 bg-bg2 px-4 py-3 sm:block">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-t2">
                Board status
              </div>
              <div className="mt-2 text-sm font-semibold text-t0">Live data synced</div>
              <div className="mt-1 text-xs text-positive">Ready to go</div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Follow tipsters", "Track edges", "View in-play"].map((item) => (
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
              <div className="flex items-center justify-between gap-3">
                <label className="label">Password</label>
                <Link
                  href="#"
                  className="text-[12px] font-medium text-positive transition hover:opacity-80"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field-lg"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
              {loading ? "Signing in…" : "Enter platform"}
            </button>
          </form>

          <div className="mt-6 rounded-[24px] border border-b0 bg-bg2 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="label">New here?</div>
                <div className="mt-1 text-sm text-t1">
                  Create an account and start following picks and tipsters.
                </div>
              </div>
              <Link
                href="/register"
                className="btn btn-secondary btn-md"
              >
                Create account
              </Link>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-t2">
            By continuing, you&apos;re accessing the Never In Doubt betting board.
          </p>
        </section>
      </div>
    </div>
  );
}
