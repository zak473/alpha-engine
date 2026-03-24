"use client";

import { useState } from "react";
import { createCheckoutSession } from "@/lib/api";

const PRO_FEATURES = [
  "AI match predictions across all sports",
  "Challenge leagues & leaderboards",
  "Pick tracker with ROI analytics",
  "All sports coverage (soccer, tennis, esports & more)",
  "Priority support",
];

export default function PricingPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    setLoading(true);
    setError(null);
    try {
      const { url } = await createCheckoutSession();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4 py-16">
      {/* Header */}
      <div className="text-center mb-12 max-w-xl">
        <h1 className="text-4xl font-bold text-white tracking-tight mb-3">
          Simple, transparent pricing
        </h1>
        <p className="text-[#8a8a8a] text-lg">
          One plan. Everything included. Cancel any time.
        </p>
      </div>

      {/* Pricing card */}
      <div className="relative w-full max-w-sm rounded-2xl border border-[#1f1f1f] bg-[#111111] p-8 shadow-2xl">
        {/* Green top accent bar */}
        <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-[#00c853]" />

        {/* Plan name + badge */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-xl font-semibold text-white">Pro</span>
          <span className="rounded-full bg-[#00c853]/10 px-3 py-0.5 text-xs font-medium text-[#00c853] ring-1 ring-[#00c853]/30">
            Most popular
          </span>
        </div>

        {/* Price */}
        <div className="mb-8">
          <div className="flex items-end gap-1">
            <span className="text-5xl font-bold text-white">£24</span>
            <span className="mb-1 text-2xl font-semibold text-white">.99</span>
            <span className="mb-2 ml-1 text-[#8a8a8a] text-sm">/ month</span>
          </div>
          <p className="mt-1 text-[#8a8a8a] text-sm">Billed monthly. No hidden fees.</p>
        </div>

        {/* Feature list */}
        <ul className="mb-8 space-y-3">
          {PRO_FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-sm text-[#cccccc]">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#00c853]/15 text-[#00c853]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 12 12"
                  fill="none"
                  className="h-2.5 w-2.5"
                >
                  <path
                    d="M2 6l3 3 5-5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {feature}
            </li>
          ))}
        </ul>

        {/* Error message */}
        {error && (
          <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400 ring-1 ring-red-500/20">
            {error}
          </p>
        )}

        {/* CTA button */}
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full rounded-xl bg-[#00c853] py-3 text-sm font-semibold text-black transition-all hover:bg-[#00e65b] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              Redirecting to checkout…
            </span>
          ) : (
            "Start subscription"
          )}
        </button>

        {/* Reassurance footnote */}
        <p className="mt-4 text-center text-xs text-[#555555]">
          Secured by Stripe · Cancel any time from your account
        </p>
      </div>
    </main>
  );
}
