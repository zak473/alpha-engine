"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getBillingStatus } from "@/lib/api";

import { Check, Zap } from "lucide-react";

const FANBASIS_PAYMENT_LINK = "https://www.fanbasis.com/agency-checkout/never-in-doubt/B657N";

const PRO_FEATURES = [
  "AI match predictions across all sports",
  "Challenge leagues & leaderboards",
  "Pick tracker with ROI analytics",
  "All sports coverage (soccer, tennis, esports & more)",
  "Priority support",
];

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoggedIn } = useAuth();
  const [isActive, setIsActive] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  const cancelled = searchParams.get("checkout") === "cancelled";

  useEffect(() => {
    if (!isLoggedIn) { setCheckingStatus(false); return; }
    getBillingStatus()
      .then((s) => setIsActive(s.is_active))
      .catch(() => {})
      .finally(() => setCheckingStatus(false));
  }, [isLoggedIn]);

  function handleSubscribe() {
    if (!isLoggedIn) {
      router.push("/login?next=/pricing");
      return;
    }
    window.location.href = FANBASIS_PAYMENT_LINK;
  }

  function handleManage() {
    window.open("https://www.fanbasis.com/never-in-doubt", "_blank");
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{ background: "var(--bg0)" }}
    >
      {/* Header */}
      <div className="text-center mb-12 max-w-lg">
        <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full text-xs font-700 uppercase tracking-widest"
          style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-ring)", color: "var(--accent)" }}>
          <Zap size={11} />
          Never In Doubt Pro
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight mb-3" style={{ color: "var(--text0)", letterSpacing: "-0.04em" }}>
          Simple, transparent pricing
        </h1>
        <p className="text-base leading-relaxed" style={{ color: "var(--text1)" }}>
          One plan. Everything included. Cancel any time.
        </p>
      </div>

      {/* Cancelled notice */}
      {cancelled && (
        <div className="mb-6 w-full max-w-sm rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--warning-dim)", border: "1px solid rgba(251,191,36,0.20)", color: "var(--warning)" }}>
          Checkout cancelled — no charge was made.
        </div>
      )}

      {/* Pricing card */}
      <div className="relative w-full max-w-sm rounded-[var(--radius-xl)] p-8"
        style={{
          background: "var(--glass-bg)",
          border: "1px solid var(--border0)",
          boxShadow: "var(--shadow-2), var(--glass-inset)",
        }}>
        {/* Accent bar */}
        <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-[var(--radius-xl)]"
          style={{ background: "var(--accent)" }} />

        {/* Plan name + badge */}
        <div className="flex items-center justify-between mb-6 pt-1">
          <span className="text-xl font-bold" style={{ color: "var(--text0)" }}>Pro</span>
          {isActive ? (
            <span className="rounded-full px-3 py-0.5 text-xs font-semibold"
              style={{ background: "var(--positive-dim)", color: "var(--positive)", border: "1px solid rgba(74,222,128,0.25)" }}>
              Active
            </span>
          ) : (
            <span className="rounded-full px-3 py-0.5 text-xs font-semibold"
              style={{ background: "var(--accent-muted)", color: "var(--accent)", border: "1px solid var(--accent-ring)" }}>
              Most popular
            </span>
          )}
        </div>

        {/* Price */}
        <div className="mb-8">
          <div className="flex items-end gap-1">
            <span className="text-5xl font-extrabold" style={{ color: "var(--text0)", letterSpacing: "-0.04em" }}>£24</span>
            <span className="mb-1 text-2xl font-bold" style={{ color: "var(--text0)" }}>.99</span>
            <span className="mb-2 ml-1 text-sm" style={{ color: "var(--text2)" }}>/ month</span>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--text2)" }}>Billed monthly. No hidden fees.</p>
        </div>

        {/* Feature list */}
        <ul className="mb-8 space-y-3">
          {PRO_FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-sm" style={{ color: "var(--text1)" }}>
              <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-ring)" }}>
                <Check size={10} style={{ color: "var(--accent)" }} strokeWidth={2.5} />
              </span>
              {feature}
            </li>
          ))}
        </ul>

        {/* Error message */}
        {error && (
          <p className="mb-4 rounded-[var(--radius-md)] px-3 py-2 text-xs"
            style={{ background: "var(--negative-dim)", border: "1px solid rgba(251,113,133,0.20)", color: "var(--negative)" }}>
            {error}
          </p>
        )}

        {/* CTA */}
        {!checkingStatus && isActive ? (
          <button
            onClick={handleManage}
            className="w-full rounded-[var(--radius-md)] py-3 text-sm font-semibold transition-all"
            style={{
              background: "var(--bg2)",
              border: "1px solid var(--border0)",
              color: "var(--text0)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg3)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg2)"; }}
          >
            Manage subscription
          </button>
        ) : (
          <button
            onClick={handleSubscribe}
            disabled={checkingStatus}
            className="w-full rounded-[var(--radius-md)] py-3 text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "var(--accent)",
              color: "#0a1510",
              boxShadow: "0 4px 20px rgba(54,242,143,0.20)",
            }}
          >
            {!isLoggedIn ? "Sign in to subscribe" : checkingStatus ? "Loading…" : "Start subscription"}
          </button>
        )}

        <p className="mt-4 text-center text-xs" style={{ color: "var(--text2)" }}>
          Secured by Fanbasis · Cancel any time from your account
        </p>
      </div>
    </main>
  );
}

export default function PricingPage() {
  return (
    <Suspense>
      <PricingContent />
    </Suspense>
  );
}
