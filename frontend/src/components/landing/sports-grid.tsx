"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { fadeUp, viewport } from "@/lib/motion";
import { ArrowUpRight } from "lucide-react";

const sports = [
  { name: "Soccer", accent: "#2EDB6C", focus: "xG, pricing movement, form, matchup context", accuracy: "60.1%", href: "/sports/soccer/matches" },
  { name: "Tennis", accent: "#22C55E", focus: "Surface bias, serve-return profile, matchup dynamics", accuracy: "62.9%", href: "/sports/tennis/matches" },
  { name: "Basketball", accent: "#F59E0B", focus: "Efficiency, pace, rotation context, totals pressure", accuracy: "60.3%", href: "/sports/basketball/matches" },
  { name: "Baseball", accent: "#EF4444", focus: "Pitching, splits, bullpen risk, market drift", accuracy: "55.5%", href: "/sports/baseball/matches" },
  { name: "Hockey", accent: "#06B6D4", focus: "Goaltending, shot profile, line movement, pace", accuracy: "66.7%", href: "/sports/hockey/matches" },
  { name: "Esports", accent: "#8B5CF6", focus: "Map tendencies, momentum, team history, pools", accuracy: "60.6%", href: "/sports/esports/matches" },
];

export function SportsGrid() {
  return (
    <section id="sports" className="section-shell">
      <div className="site-container">
        <div className="mb-10 flex flex-col gap-5 xl:mb-14 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-[760px]">
            <div className="section-index">03 / sports coverage</div>
            <div className="eyebrow mb-4 mt-4">Multi-sport system</div>
            <h2 className="h2-display text-nid-text">
              Six sports.
              <span className="block text-nid-accent">One intelligence layer.</span>
            </h2>
          </div>
          <p className="body-copy max-w-[360px]">
            The color language flexes by sport, but the product stays coherent: same depth, same typography, same premium contrast discipline.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5">
          {sports.map((sport, i) => (
            <motion.div
              key={sport.name}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={viewport}
              transition={{ delay: i * 0.05 }}
            >
              <Link href={sport.href} className="sport-tile block">
                <div className="mb-5 h-[3px] w-full rounded-full" style={{ background: `linear-gradient(90deg, ${sport.accent}, transparent)` }} />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sport.accent }} />
                    <span className="section-kicker">{sport.name}</span>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-nid-textMute" />
                </div>

                <div className="mt-6">
                  <h3 className="text-[28px] font-bold tracking-[-0.03em] text-nid-text">{sport.name}</h3>
                  <p className="mt-3 text-[14px] leading-7 text-nid-textSoft">{sport.focus}</p>
                </div>

                <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-end justify-between">
                    <span className="mono-stat text-[30px] font-bold text-nid-text">{sport.accuracy}</span>
                    <span className="section-kicker">tracked accuracy</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{ width: sport.accuracy, backgroundColor: sport.accent }} />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
