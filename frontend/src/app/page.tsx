import Link from "next/link";
import { ArrowRight, BrainCircuit, ShieldCheck, Sparkles, Trophy, Zap } from "lucide-react";

const highlights = [
  { label: "Live markets", value: "6 sports" },
  { label: "Model layer", value: "AI-ranked picks" },
  { label: "Workflow", value: "Fast board scanning" },
];

const pillars = [
  {
    icon: BrainCircuit,
    title: "Signal-first board",
    body: "A calmer dashboard hierarchy makes confidence, edge, and market timing easier to process at a glance.",
  },
  {
    icon: Zap,
    title: "Built for live decision-making",
    body: "Track active matches, surface the strongest opportunities, and move from analysis to action with less friction.",
  },
  {
    icon: ShieldCheck,
    title: "Premium product feel",
    body: "A darker shell, polished spacing, and stronger visual rhythm turn the app into a more credible premium experience.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(61,242,145,0.16),transparent_24%),linear-gradient(180deg,#07110d_0%,#091510_45%,#0b1712_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between gap-4 rounded-full border border-white/10 bg-white/5 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#36f28f_0%,#15a95b_100%)] text-[#041109] shadow-[0_12px_30px_rgba(54,242,143,0.28)]">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-200/70">Never In Doubt</div>
              <div className="text-sm font-semibold text-white/95">AI sports betting platform</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden rounded-full border border-white/12 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5 sm:inline-flex">
              Log in
            </Link>
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#36f28f_0%,#1ac96b_100%)] px-5 py-2.5 text-sm font-semibold text-[#041109] shadow-[0_18px_40px_rgba(54,242,143,0.22)] transition hover:-translate-y-0.5">
              Open dashboard
              <ArrowRight size={16} />
            </Link>
          </div>
        </header>

        <section className="relative flex flex-1 items-center py-12 lg:py-20">
          <div className="grid w-full items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/18 bg-emerald-300/8 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,255,178,0.9)]" />
                Redesigned premium experience
              </div>

              <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[0.94] tracking-[-0.06em] text-white sm:text-6xl lg:text-7xl">
                Sharper picks, cleaner signals, and a sportsbook UI that finally feels elite.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-white/68 lg:text-lg">
                This redesign gives Never In Doubt a stronger premium identity: darker framing, cleaner data surfaces,
                tighter navigation, and a clearer path from live market discovery to confident decision-making.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-[#07110d] transition hover:-translate-y-0.5">
                  Explore the board
                  <ArrowRight size={16} />
                </Link>
                <Link href="/predictions" className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-6 py-3 text-sm font-semibold text-white/88 transition hover:bg-white/8">
                  View predictions
                </Link>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {highlights.map((item) => (
                  <div key={item.label} className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4 backdrop-blur">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">{item.label}</div>
                    <div className="mt-2 text-xl font-semibold tracking-[-0.03em] text-white">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 rounded-[32px] bg-[radial-gradient(circle_at_top,rgba(54,242,143,0.22),transparent_48%)] blur-2xl" />
              <div className="relative rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.04))] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">Today’s board</div>
                      <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">Signal overview</div>
                    </div>
                    <div className="rounded-full border border-emerald-300/18 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                      Live synced
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[22px] border border-white/8 bg-white/5 p-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">Top edge</div>
                      <div className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-emerald-300">+12.4%</div>
                      <div className="mt-2 text-sm text-white/52">Highest-ranked market on the board</div>
                    </div>
                    <div className="rounded-[22px] border border-white/8 bg-white/5 p-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">Live matches</div>
                      <div className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-white">18</div>
                      <div className="mt-2 text-sm text-white/52">Auto-sorted into a calmer scanning flow</div>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {[
                      ["Arsenal vs Milan", "Model confidence 78%", "+8.2% edge"],
                      ["Nuggets vs Celtics", "Live watchlist", "+5.4% edge"],
                      ["T1 vs G2", "Momentum signal", "+6.1% edge"],
                    ].map(([match, meta, edge]) => (
                      <div key={match} className="flex items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{match}</div>
                          <div className="mt-1 text-xs text-white/46">{meta}</div>
                        </div>
                        <div className="rounded-full bg-emerald-300/10 px-3 py-1 text-sm font-semibold text-emerald-200">{edge}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pb-10 lg:pb-16">
          <div className="grid gap-4 lg:grid-cols-3">
            {pillars.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-300/10 text-emerald-200">
                  <Icon size={20} />
                </div>
                <h2 className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-white">{title}</h2>
                <p className="mt-3 text-sm leading-7 text-white/62">{body}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-white/5 px-6 py-5 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-emerald-200">
                <Trophy size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">The updated frontend is ready to review</div>
                <div className="text-sm text-white/55">Dashboard, shell, and core visual system have all been refreshed.</div>
              </div>
            </div>
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#36f28f_0%,#1ac96b_100%)] px-5 py-2.5 text-sm font-semibold text-[#041109]">
              Launch app
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
