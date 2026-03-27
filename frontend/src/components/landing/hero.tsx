"use client";

import { ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { blurIn, fadeUp, staggerContainer, heroBoard, floatCard } from "@/lib/motion";

const featuredRows = [
  { sport: "Soccer", accent: "#2edb6c", title: "Arsenal vs Brighton", market: "Home win", edge: "+6.8% edge", pct: "86%", tag: "Highest confidence" },
  { sport: "Basketball", accent: "#f59e0b", title: "Lakers vs Suns", market: "Over 228.5", edge: "+4.1% edge", pct: "71%", tag: "Momentum rising" },
  { sport: "Esports", accent: "#8b5cf6", title: "G2 vs Fnatic", market: "Map 1 winner", edge: "+5.2% edge", pct: "74%", tag: "Steam detected" },
];

const proof = [
  { value: "63.4%", label: "7D hit rate" },
  { value: "182", label: "graded picks" },
];

const floatingStats = [
  { label: "Live signals", value: "24", meta: "updated today", icon: Zap },
  { label: "Best model", value: "86%", meta: "Arsenal vs Brighton", icon: ShieldCheck },
];

const boardMetrics = [
  { label: "Today", value: "24 picks" },
  { label: "7D hit", value: "63.4%" },
  { label: "Avg edge", value: "+5.7%" },
];

export function Hero() {
  return (
    <section className="section-shell relative overflow-hidden pt-28 md:pt-32 xl:pt-36">
      <div className="divider-grid absolute inset-0 opacity-30" />
      <div className="hero-angle-line hidden xl:block" />
      <div className="absolute left-[-10%] top-10 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(0,229,122,0.14),transparent_62%)] blur-3xl" />
      <div className="absolute right-[-8%] top-24 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(114,173,255,0.14),transparent_60%)] blur-3xl" />
      <div className="absolute right-[4%] top-[16%] hidden font-display text-[240px] font-black leading-none tracking-[-0.06em] text-white/[0.03] xl:block">
        EDGE
      </div>

      <div className="site-container relative">
        <div className="grid min-h-[calc(100vh-120px)] grid-cols-1 gap-12 xl:grid-cols-12 xl:gap-10">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="flex flex-col justify-center xl:col-span-6 xl:pr-10"
          >
            <motion.div variants={fadeUp} className="eyebrow mb-7">
              <span className="live-dot" />
              Models live now
            </motion.div>

            <motion.div variants={fadeUp} className="section-kicker mb-5">
              Sports intelligence · 6 sports · AI-powered predictions
            </motion.div>

            <motion.h1 variants={blurIn} className="h1-display max-w-[780px] text-nid-text">
              <span className="block">The edge</span>
              <span className="block">isn&apos;t luck.</span>
              <span className="block text-nid-accent">It&apos;s modelled.</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="lead-copy mt-6 max-w-[640px] text-balance">
              Never In Doubt combines AI models, live market data, and historical depth across six sports — surfacing high-conviction picks with confidence scores, edge analysis, and full performance tracking.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
              {proof.map((item) => (
                <div key={item.label} className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-nid-border bg-white/[0.04] px-4 text-[12px] font-semibold text-nid-textSoft">
                  <span className="mono-stat text-[13px] font-bold text-nid-text">{item.value}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </motion.div>

            <motion.div variants={fadeUp} className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href="/register" className="btn-primary btn-primary-lg">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#platform" className="btn-secondary btn-secondary-lg">
                Explore Platform
              </a>
            </motion.div>

          </motion.div>

          <div className="relative xl:col-span-6 xl:self-center">
            <motion.div
              variants={heroBoard}
              initial="hidden"
              animate="show"
              className="glass-card-strong relative mx-auto max-w-[720px] overflow-hidden"
            >
              <div className="absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(90deg,transparent,rgba(0,229,122,0.95),transparent)]" />
              <div className="grid gap-0 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="border-b border-nid-border xl:border-b-0 xl:border-r">
                  <div className="flex items-center justify-between px-5 py-4 md:px-6">
                    <div>
                      <div className="section-kicker">Live edge board</div>
                      <div className="mt-1 text-[14px] font-semibold text-nid-text">Featured markets</div>
                    </div>
                    <div className="eyebrow !min-h-[32px] !px-3 !text-[10px]">
                      <span className="live-dot" />
                      Real-time sync
                    </div>
                  </div>

                  <div className="px-4 pb-4 md:px-6 md:pb-6">
                    <div className="rounded-[22px] border border-nid-accentRing bg-[linear-gradient(180deg,rgba(0,229,122,0.14),rgba(0,229,122,0.05))] p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="section-kicker">Top confidence</div>
                          <div className="mt-2 text-[22px] font-bold tracking-[-0.03em] text-nid-text md:text-[28px]">Arsenal vs Brighton</div>
                          <div className="mt-2 text-[13px] leading-6 text-nid-textSoft">Home win · Market drift aligned · Model edge +6.8%</div>
                        </div>
                        <div className="text-right">
                          <div className="mono-stat text-[44px] font-bold leading-none text-nid-text md:text-[58px]">86%</div>
                          <div className="section-kicker mt-2">confidence</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {featuredRows.map((row, index) => (
                        <div key={row.title} className={`grid grid-cols-[1fr_auto] gap-4 rounded-[18px] border px-4 py-4 md:px-5 ${index === 0 ? "border-white/10 bg-white/[0.03]" : "border-nid-border bg-white/[0.02]"}`}>
                          <div>
                            <div className="mb-2 flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.accent }} />
                              <span className="section-kicker">{row.sport}</span>
                              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-nid-textMute">
                                {row.tag}
                              </span>
                            </div>
                            <div className="text-[16px] font-bold tracking-[-0.02em] text-nid-text md:text-[18px]">{row.title}</div>
                            <div className="mt-1 text-[12px] leading-6 text-nid-textSoft">{row.market} · {row.edge}</div>
                          </div>
                          <div className="text-right">
                            <div className="mono-stat text-[24px] font-bold text-nid-text md:text-[28px]">{row.pct}</div>
                            <div className="section-kicker mt-1">signal</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]">
                  <div className="px-5 py-4 md:px-6">
                    <div className="section-kicker">Market context</div>
                    <div className="mt-1 text-[14px] font-semibold text-nid-text">What the board is telling you</div>
                  </div>

                  <div className="space-y-3 px-5 pb-5 md:px-6 md:pb-6">
                    {[
                      { label: "Signal quality", value: "A+", meta: "high-conviction slate" },
                      { label: "Sharp movement", value: "07", meta: "tracked shifts today" },
                      { label: "Model cadence", value: "Live", meta: "refresh every cycle" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-[18px] border border-nid-border bg-black/20 p-4">
                        <div className="section-kicker">{item.label}</div>
                        <div className="mono-stat mt-3 text-[28px] font-bold text-nid-text">{item.value}</div>
                        <div className="mt-1 text-[12px] text-nid-textSoft">{item.meta}</div>
                      </div>
                    ))}

                    <div className="rounded-[18px] border border-nid-border bg-black/20 p-4">
                      <div className="section-kicker">Confidence spread</div>
                      <div className="mt-4 space-y-3">
                        {[
                          { label: "Elite", width: "86%" },
                          { label: "Playable", width: "71%" },
                          { label: "Watchlist", width: "58%" },
                        ].map((item) => (
                          <div key={item.label}>
                            <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-nid-textMute">
                              <span>{item.label}</span>
                              <span className="mono">{item.width}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-[linear-gradient(90deg,#00e57a,#72adff)]" style={{ width: item.width }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-px border-t border-nid-border bg-nid-border">
                {boardMetrics.map((metric) => (
                  <div key={metric.label} className="signal-board__metric px-3 py-4 text-center">
                    <div className="section-kicker">{metric.label}</div>
                    <div className="mono-stat mt-1 text-[16px] font-bold text-nid-text">{metric.value}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3 xl:absolute xl:-bottom-8 xl:left-1/2 xl:w-[92%] xl:-translate-x-1/2">
              {floatingStats.map((card, index) => (
                <motion.div
                  key={card.label}
                  variants={floatCard}
                  initial="hidden"
                  animate="show"
                  transition={{ delay: 0.35 + index * 0.08 }}
                  className="glass-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-nid-accentRing bg-nid-accentDim">
                      <card.icon className="h-4 w-4 text-nid-accent" />
                    </div>
                    <div className="section-kicker">{card.label}</div>
                  </div>
                  <div className="mono-stat mt-4 text-[26px] font-bold text-nid-text">{card.value}</div>
                  <div className="mt-1 text-[12px] text-nid-textSoft">{card.meta}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
