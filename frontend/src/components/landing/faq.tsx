"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { fadeUp, viewport } from "@/lib/motion";

const items = [
  { q: "How does Never In Doubt make predictions?", a: "The platform combines large-scale historical analysis, live sports inputs, pricing context, and AI/statistical modelling to generate probability-led predictions across six sports." },
  { q: "What sports are included?", a: "Soccer, tennis, basketball, baseball, hockey, and esports are all included in the membership." },
  { q: "Are the confidence scores real probabilities?", a: "They are designed to reflect model conviction in a structured, usable way so the product feels clearer and more trustworthy." },
  { q: "Is this for beginners or experienced bettors?", a: "Both. Beginners get clearer guidance and experienced bettors get deeper tracking, analytics, and sharper market context." },
  { q: "What do I get with my subscription?", a: "Full platform access including AI predictions across all 6 sports, live market data, performance analytics, bankroll tools, tipster leaderboard, and the AI advisor — everything for £24.99/month." },
  { q: "Can I cancel any time?", a: "Yes. No contracts and no lock-ins." },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="section-shell">
      <div className="site-container">
        <div className="mx-auto max-w-[920px]">
          <div className="section-index">06 / faq</div>
          <div className="eyebrow mb-4 mt-4">Common questions</div>
          <h2 className="h2-display text-nid-text">
            Clear answers.
            <span className="block text-nid-accent">No filler.</span>
          </h2>

          <div className="mt-10 space-y-3 md:mt-12">
            {items.map((item, i) => {
              const isOpen = open === i;
              return (
                <motion.div
                  key={item.q}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={viewport}
                  transition={{ delay: i * 0.04 }}
                  className="faq-row"
                >
                  <button onClick={() => setOpen(isOpen ? null : i)} className="flex w-full items-center justify-between gap-4 text-left">
                    <span className="text-[16px] font-semibold tracking-[-0.02em] text-nid-text md:text-[20px]">{item.q}</span>
                    <Plus className={`h-5 w-5 shrink-0 transition-all duration-300 ${isOpen ? "rotate-45 text-nid-accent" : "text-nid-textMute"}`} />
                  </button>
                  <AnimatePresence>
                    {isOpen ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <p className="pt-4 max-w-[760px] text-[14px] leading-7 text-nid-textSoft">{item.a}</p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
