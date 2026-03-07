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
    <div className="flex items-center justify-center px-4 py-10 lg:py-16">
      <div className="auth-brand-panel brand-grid grid w-full max-w-5xl gap-6 overflow-hidden rounded-[32px] p-4 lg:grid-cols-[0.98fr_1.02fr] lg:p-6">
        <div className="card flex w-full flex-col gap-6 rounded-[28px] p-8 order-2 lg:order-1">
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text0)" }}>Create account</h2>
            <p style={{ fontSize: 13, color: "var(--text1)", marginTop: 4 }}>Join Never In Doubt to track your picks</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="label">Display name (optional)</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="input-field" autoComplete="name" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="label">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="input-field" required autoComplete="email" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="label">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="input-field" required autoComplete="new-password" minLength={6} />
            </div>
            {error && <p style={{ fontSize: 12, color: "var(--negative)" }}>{error}</p>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Creating account…" : "Join platform"}
            </button>
          </form>

          <p style={{ fontSize: 12, color: "var(--text1)", textAlign: "center" }}>
            Already have an account? <Link href="/login" style={{ color: "var(--accent)" }}>Sign in</Link>
          </p>
        </div>

        <div className="rounded-[28px] border border-white/8 bg-black/35 p-6 lg:p-8 order-1 lg:order-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(124,255,79,0.2)] bg-[rgba(124,255,79,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Never In Doubt</div>
          <h3 className="mt-4 text-3xl font-semibold leading-tight text-white lg:text-5xl lg:leading-[1]">Turn sharper data into a branded betting experience.</h3>
          <p className="mt-4 max-w-xl text-sm leading-6 text-text-muted lg:text-[15px]">Create your account and get straight into live cards, match breakdowns, and decision-ready market layouts designed around your platform identity.</p>
          <div className="mt-6 overflow-hidden rounded-[24px] border border-white/10 bg-black/60 p-4">
            <Image src="/never-in-doubt-logo.png" alt="Never In Doubt logo" width={900} height={600} className="h-auto w-full" priority />
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Premium shell", "Live betting flow", "Brand-first polish"].map((item) => (
              <div key={item} className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-xs text-text-muted">{item}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
