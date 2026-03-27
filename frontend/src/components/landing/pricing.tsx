"use client";

import { motion } from "framer-motion";
import { scaleIn, viewport } from "@/lib/motion";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

const features = [
  "All 6 sport prediction models",
  "Live match data and market movement",
  "Performance analytics dashboard",
  "Bankroll and exposure tools",
  "Tipster leaderboard access",
  "AI advisor updates as they ship",
];

export function Pricing() {
  return (
    <section id="pricing" className="section-shell">
      <div className="site-container">
        <div className="grid grid-cols-1 items-start gap-10 xl:grid-cols-12 xl:gap-16">
          <div className="xl:col-span-6">
            <div className="section-index">05 / pricing</div>
            <div className="eyebrow mb-4 mt-4">Single offer</div>
            <h2 className="h2-display text-nid-text">
              One plan.
              <span className="block">Full access.</span>
              <span className="block text-nid-accent">No nonsense.</span>
            </h2>
            <p className="body-copy mt-6 max-w-[520px]">
              One flat price. Everything included — predictions, analytics, live data, bankroll tools, tipster leaderboard, and the AI advisor. No tiers, no upsells.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                "Cancel any time",
                "Instant access",
                "All 6 sports included",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-nid-border bg-white/[0.04] px-4 py-4 text-[13px] font-semibold text-nid-textSoft">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <motion.div
            variants={scaleIn}
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            className="xl:col-span-5 xl:col-start-8"
          >
            <div className="glass-card-strong overflow-hidden">
              <div className="h-[2px] bg-[linear-gradient(90deg,transparent,rgba(0,229,122,0.95),transparent)]" />
              <div className="p-6 md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="section-kicker">Pro membership</div>
                    <div className="mt-2 text-[15px] font-semibold text-nid-text">Everything included</div>
                  </div>
                  <div className="metric-chip">Best value</div>
                </div>

                <div className="mt-6 flex items-end gap-2">
                  <span className="text-[22px] font-semibold text-nid-text">£</span>
                  <span className="font-display text-[102px] font-black leading-[0.84] tracking-[-0.05em] text-nid-text">24.99</span>
                  <span className="mb-3 text-[14px] text-nid-textMute">/ month</span>
                </div>

                <div className="mt-3 text-[14px] leading-7 text-nid-textSoft">
                  Full access to Never In Doubt — AI predictions, live signals, performance analytics, bankroll tools, tipster leaderboard, and the AI advisor across all six sports.
                </div>

                <div className="my-7 grid grid-cols-3 gap-3">
                  {[
                    { label: "Sports", value: "6" },
                    { label: "Cancel", value: "Any time" },
                    { label: "Access", value: "Full" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
                      <div className="section-kicker">{item.label}</div>
                      <div className="mono-stat mt-2 text-[22px] font-bold text-nid-text">{item.value}</div>
                    </div>
                  ))}
                </div>

                <ul className="space-y-3">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-[14px] leading-7 text-nid-textSoft">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-nid-accent" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href="/register" className="btn-primary btn-primary-lg mt-8 w-full">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <div className="mt-4 text-center text-[12px] text-nid-textMute">£24.99/month. Cancel any time.</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
