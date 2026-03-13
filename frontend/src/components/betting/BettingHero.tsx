"use client";

import { Activity, ArrowRight, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import type { BettingMatch } from "@/lib/betting-types";

interface BettingHeroProps {
  matches: BettingMatch[];
  filteredCount: number;
  activeSportLabel: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/[0.05] p-4 backdrop-blur">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/40">
        <Icon size={13} className="text-emerald-200" />
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{value}</div>
      <div className="mt-2 text-sm text-white/52">{subtext}</div>
    </div>
  );
}

export function BettingHero({ matches, filteredCount, activeSportLabel }: BettingHeroProps) {
  const liveCount = matches.filter((m) => m.status === "live").length;
  const topEdge = matches.reduce((max, m) => Math.max(max, m.edgePercent ?? 0), 0);
  const predictedMatches = matches.filter((m) => m.modelConfidence != null);
  const avgConfidence = predictedMatches.length
    ? Math.round(predictedMatches.reduce((sum, m) => sum + m.modelConfidence! * 100, 0) / predictedMatches.length)
    : null;

  return (
    <section className="px-4 pb-4 pt-4 lg:px-6 lg:pb-5 lg:pt-6">
      <div className="sportsbook-hero overflow-hidden rounded-[34px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(55,242,144,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.24)] backdrop-blur-xl lg:p-7">
        <div className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/16 bg-emerald-300/8 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,255,178,0.85)]" />
              {activeSportLabel} board
            </div>

            <h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-[0.96] tracking-[-0.06em] text-white lg:text-[3.45rem]">
              A calmer, sharper betting board designed to surface the right signal faster.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60 lg:text-[15px]">
              The updated interface makes edge, live status, and confidence easier to scan while giving the whole product a more premium sportsbook presence.
            </p>

            <div className="mt-6 flex flex-wrap gap-3 text-xs text-white/58">
              {[activeSportLabel, `${filteredCount} visible markets`, "Premium dark shell", "Live-first ranking"].map((item) => (
                <span key={item} className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-2">
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <button className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#07110d] transition hover:-translate-y-0.5">
                Review best spots
                <ArrowRight size={15} />
              </button>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/62">
                <Sparkles size={15} className="text-emerald-200" />
                Cleaner market hierarchy now applied across the board
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard icon={Activity} label="Live now" value={`${liveCount}`} subtext="Matches currently in play" />
            <StatCard icon={TrendingUp} label="Top edge" value={`+${topEdge.toFixed(1)}%`} subtext="Best ranked opportunity on the board" />
            <StatCard icon={ShieldCheck} label="Confidence" value={avgConfidence != null ? `${avgConfidence}%` : "—"} subtext="Average model confidence" />
            <StatCard icon={Sparkles} label="Workflow" value="Refined" subtext="Less noise. Faster decisions." />
          </div>
        </div>
      </div>
    </section>
  );
}
