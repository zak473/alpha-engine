"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer, viewport } from "@/lib/motion";

const stats = [
  { value: "1M+", label: "Games analysed", copy: "Historical volume feeding the probability layer across every supported sport.", accent: "text-nid-text" },
  { value: "63.4%", label: "7-day hit rate", copy: "Proof and performance brought forward instead of buried deep in the product.", accent: "text-nid-accent" },
  { value: "+12.4%", label: "30-day ROI trend", copy: "Sharper framing around return, streaks, and confidence-band accountability.", accent: "text-nid-positive" },
  { value: "24", label: "Live signals today", copy: "Real-time signal layer designed to be scanned fast under pressure.", accent: "text-nid-text" },
];

export function StatsWall() {
  return (
    <section className="section-shell" id="platform">
      <div className="site-container">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:gap-6">
          <div className="glass-card-strong overflow-hidden p-6 md:p-8 xl:col-span-5">
            <div className="section-index">01 / performance wall</div>
            <div className="eyebrow mb-5 mt-4">Proof system</div>
            <h2 className="h2-display max-w-[720px] text-nid-text">
              Built on volume.
              <span className="block text-nid-accent">Shaped for conviction.</span>
            </h2>
            <p className="body-copy mt-6 max-w-[540px]">
              Our models are trained on millions of historical matches and updated in real time — giving you a clear, data-driven edge across every market we cover.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                "AI models trained on 1M+ historical fixtures",
                "Confidence scores — not vague tipster opinions",
                "Live odds movement tracked across all markets",
                "Full performance history, hit rate & ROI logged",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-nid-border bg-white/[0.04] px-4 py-4 text-[13px] leading-6 text-nid-textSoft">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:col-span-7"
          >
            {stats.map((stat, index) => (
              <motion.div key={stat.label} variants={fadeUp} className={`stat-tile flex flex-col justify-between ${index === 1 ? "md:row-span-2 md:min-h-[456px]" : ""}`}>
                <div>
                  <div className="section-kicker">{stat.label}</div>
                  <div className={`mono-stat mt-4 text-[42px] font-bold md:text-[50px] ${stat.accent}`}>{stat.value}</div>
                </div>
                <div>
                  {index === 1 ? (
                    <div className="mb-6 rounded-[18px] border border-nid-accentRing bg-nid-accentDim p-4">
                      <div className="section-kicker">Readout</div>
                      <div className="mt-2 text-[14px] leading-7 text-nid-textSoft">Our 7-day hit rate is tracked live across all graded picks — no cherry-picking, no selective memory.</div>
                    </div>
                  ) : null}
                  <p className="max-w-[300px] text-[14px] leading-7 text-nid-textSoft">{stat.copy}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
