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
    <div className="flex items-center justify-center px-4 py-10 lg:py-16">
      <div className="auth-brand-panel brand-grid grid w-full max-w-5xl gap-6 overflow-hidden rounded-[32px] p-4 lg:grid-cols-[1.05fr_0.95fr] lg:p-6">
        <div className="rounded-[28px] border border-white/8 bg-black/35 p-6 lg:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(124,255,79,0.2)] bg-[rgba(124,255,79,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Never In Doubt</div>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-white lg:text-5xl lg:leading-[1]">Lock into a betting board that looks like your brand.</h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-text-muted lg:text-[15px]">Track sharper picks, scan live markets faster, and keep your decision flow inside a proper premium sportsbook-style experience.</p>
          <div className="mt-6 overflow-hidden rounded-[24px] border border-white/10 bg-black/60 p-4">
            <Image src="/never-in-doubt-logo.png" alt="Never In Doubt logo" width={900} height={600} className="h-auto w-full" priority />
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Live model signals", "Multi-sport tips", "Cleaner pick flow"].map((item) => (
              <div key={item} className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-xs text-text-muted">{item}</div>
            ))}
          </div>
        </div>

        <div className="card flex w-full flex-col gap-6 rounded-[28px] p-8">
          <div>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: "var(--text0)" }}>Sign in</h3>
            <p style={{ fontSize: 13, color: "var(--text1)", marginTop: 4 }}>Access your Never In Doubt account</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="label">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="input-field" required autoComplete="email" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="label">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="input-field" required autoComplete="current-password" />
            </div>

            {error && <p style={{ fontSize: 12, color: "var(--negative)" }}>{error}</p>}

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Signing in…" : "Enter platform"}
            </button>
          </form>

          <p style={{ fontSize: 12, color: "var(--text1)", textAlign: "center" }}>
            No account? <Link href="/register" style={{ color: "var(--accent)" }}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
