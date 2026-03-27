"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { fadeUp, viewport } from "@/lib/motion";

export function FinalCta() {
  return (
    <section className="section-shell relative overflow-hidden bg-cta-glow py-24 md:py-32 xl:py-36">
      <div className="divider-grid absolute inset-0 opacity-20" />
      <div className="absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(0,229,122,0.11),transparent_58%)] blur-3xl" />
      <div className="absolute right-[7%] top-[12%] hidden font-display text-[220px] font-black leading-none tracking-[-0.06em] text-white/[0.03] xl:block">
        MOVE
      </div>

      <div className="site-container relative text-center">
        <div className="mx-auto max-w-[900px]">
          <div className="eyebrow mb-6 justify-center">
            <span className="live-dot" />
            Models live now
          </div>

          <h2 className="h2-display text-nid-text">
            Stop guessing.
            <span className="block text-nid-accent">Start moving with data.</span>
          </h2>

          <p className="lead-copy mx-auto mt-6 max-w-[660px] text-balance">
            Join thousands of bettors using Never In Doubt to cut through noise, find real edges, and track every pick with full accountability — across six sports, in real time.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {[
              "6 sports covered",
              "AI-powered confidence scores",
              "Full ROI & hit rate tracking",
            ].map((item) => (
              <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-nid-textMute">
                {item}
              </span>
            ))}
          </div>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"
          >
            <a href="/register" className="btn-primary btn-primary-lg">
              Get Started
              <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#platform" className="btn-secondary btn-secondary-lg">
              Explore Platform
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
