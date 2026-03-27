"use client";

import { motion } from "framer-motion";
import { fadeUp, viewport } from "@/lib/motion";
import { Activity, Award, BrainCircuit, MessageSquare, PiggyBank, TrendingUp, Users } from "lucide-react";

const features = [
  { title: "AI Model Predictions", tag: "Signal", icon: BrainCircuit, copy: "Probability-led picks with cleaner confidence framing, stronger hierarchy, and a more original sports-data feel.", full: true },
  { title: "Real-time Data & Odds", tag: "Live", icon: Activity, copy: "Movement, context, and fixture updates surfaced without looking like a cluttered sportsbook clone." },
  { title: "Performance Analytics", tag: "Analytics", icon: TrendingUp, copy: "ROI, hit rate, confidence-band performance, and streak context presented like a premium dashboard." },
  { title: "Dynamic Ratings", tag: "Ratings", icon: Award, copy: "Team and player strength models made clearer through typography and card hierarchy." },
  { title: "Bankroll Tools", tag: "Tools", icon: PiggyBank, copy: "Sizing, exposure, and discipline workflows brought into the same design language." },
  { title: "Tipster Leaderboard", tag: "Community", icon: Users, copy: "Track people by results and accountability, not just loud win-rate claims." },
  { title: "AI Advisor Chat", tag: "Coming soon", icon: MessageSquare, copy: "Ask why confidence moved, where the edge is coming from, and what changed in the market." },
];

export function FeaturesMosaic() {
  return (
    <section className="section-shell">
      <div className="site-container">
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-12 xl:gap-12">
          <div className="xl:col-span-4">
            <div className="section-index">04 / feature stack</div>
            <div className="eyebrow mb-4 mt-4">Product system</div>
            <h2 className="h2-display text-nid-text">
              Everything serious
              <span className="block text-nid-accent">bettors need</span>
            </h2>
            <p className="body-copy mt-6 max-w-[380px]">
              Everything you need to find value, track performance, and stay accountable — built into one platform and updated in real time.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:col-span-8">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={viewport}
                transition={{ delay: i * 0.05 }}
                className={`feature-tile ${feature.full ? "md:col-span-2" : ""}`}
              >
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-nid-accentRing bg-nid-accentDim">
                      <feature.icon className="h-5 w-5 text-nid-accent" />
                    </div>
                    <span className="rounded-full border border-nid-accentRing bg-nid-accentMute px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-nid-accent">
                      {feature.tag}
                    </span>
                  </div>
                  {feature.full ? <span className="section-kicker">Flagship module</span> : null}
                </div>
                <h3 className="text-[24px] font-bold tracking-[-0.03em] text-nid-text">{feature.title}</h3>
                <p className="mt-3 max-w-[560px] text-[14px] leading-7 text-nid-textSoft">{feature.copy}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
