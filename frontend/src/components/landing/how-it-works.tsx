"use client";

import { motion } from "framer-motion";
import { fadeUp, viewport } from "@/lib/motion";
import { Database, Brain, LineChart } from "lucide-react";

const steps = [
  {
    num: "01",
    icon: Database,
    title: "Ingest the full matchday picture",
    body: "Fixtures, form, ratings, odds movement, historical context, and sport-specific signals feed a single structured intelligence layer.",
    notes: ["Historical depth", "Live pricing context"],
  },
  {
    num: "02",
    icon: Brain,
    title: "Turn noise into conviction",
    body: "Models score markets into clearer probabilities and confidence bands, surfacing edges without forcing users to decode cluttered dashboards.",
    notes: ["Confidence bands", "Edge ranking"],
  },
  {
    num: "03",
    icon: LineChart,
    title: "Track what actually matters",
    body: "Every pick can feed hit rate, ROI, streaks, and bankroll context — so the platform feels accountable and premium, not decorative.",
    notes: ["Tracked ROI", "Bankroll context"],
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section-shell">
      <div className="site-container">
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-12 xl:gap-14">
          <div className="xl:col-span-4 xl:sticky xl:top-28 xl:self-start">
            <div className="section-index">02 / how it works</div>
            <div className="eyebrow mb-5 mt-4">Workflow</div>
            <h2 className="h2-display text-nid-text">
              From raw data
              <span className="block text-nid-accent">to sharper decisions</span>
            </h2>
            <p className="body-copy mt-6 max-w-[380px]">
              Three steps from raw match data to a decision you can act on — no noise, no guesswork, just structured intelligence surfaced at the right moment.
            </p>
          </div>

          <div className="xl:col-span-8">
            <div className="space-y-4 md:space-y-5">
              {steps.map((step, index) => (
                <motion.div
                  key={step.num}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={viewport}
                  transition={{ delay: index * 0.08 }}
                  className="glass-card relative grid grid-cols-1 gap-5 p-5 md:grid-cols-[112px_1fr] md:p-7"
                >
                  <div className="pointer-events-none absolute right-6 top-5 hidden font-display text-[84px] font-black leading-none tracking-[-0.06em] text-white/[0.04] md:block">
                    {step.num}
                  </div>
                  <div className="flex flex-row items-start gap-4 md:flex-col md:gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-nid-accentRing bg-nid-accentDim">
                      <step.icon className="h-5 w-5 text-nid-accent" />
                    </div>
                    <div className="mono-stat text-[22px] font-bold text-nid-accent">{step.num}</div>
                  </div>
                  <div>
                    <h3 className="text-[24px] font-bold tracking-[-0.03em] text-nid-text md:text-[30px]">{step.title}</h3>
                    <p className="mt-3 max-w-[700px] text-[15px] leading-8 text-nid-textSoft">{step.body}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {step.notes.map((note) => (
                        <span key={note} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-nid-textMute">
                          {note}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
