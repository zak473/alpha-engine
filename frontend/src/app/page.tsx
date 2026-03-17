import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  ChevronRight,
  LineChart,
  Radar,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────

const features = [
  {
    icon: BrainCircuit,
    headline: "Model-backed predictions",
    body: "Proprietary ML models trained on historical match data assign edge scores and confidence ratings to every market — so you know exactly where the value is.",
  },
  {
    icon: Radar,
    headline: "Live across 6 sports",
    body: "Soccer, tennis, basketball, baseball, hockey, and esports. All tracked live, all ranked in real time. One board, every edge.",
  },
  {
    icon: TrendingUp,
    headline: "Track your record",
    body: "Every pick you log is analysed against model predictions. See where you're winning, where you're drifting, and how to sharpen your edge over time.",
  },
  {
    icon: LineChart,
    headline: "ELO and form analysis",
    body: "We go deeper than headline odds. Team ELO ratings, recent form, head-to-head history — surfaced and ranked so you don't have to dig.",
  },
];

const steps = [
  {
    n: "01",
    title: "Scan live markets",
    body: "Open the board to see every upcoming and live match across all sports, ranked by model edge. No spreadsheets, no browser tabs.",
  },
  {
    n: "02",
    title: "Review the edge",
    body: "Each match shows AI confidence, edge percentage, team ELO, and form — all in one view. Skip the noise, focus on the signal.",
  },
  {
    n: "03",
    title: "Back your conviction",
    body: "Add picks to your queue, log your bets, and track your record over time. Know what's working and why.",
  },
];

const stats = [
  { value: "6", label: "Sports covered" },
  { value: "62%+", label: "Model accuracy" },
  { value: "Live", label: "Market data" },
  { value: "AI", label: "Ranked picks" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Mock product preview rows (visual only)
// ─────────────────────────────────────────────────────────────────────────────

const previewRows = [
  { sport: "⚽", match: "Arsenal vs AC Milan", conf: 78, edge: "+8.2%", status: "live" },
  { sport: "🎾", match: "Sinner vs Alcaraz", conf: 71, edge: "+5.8%", status: "upcoming" },
  { sport: "🏀", match: "Celtics vs Nuggets", conf: 66, edge: "+4.1%", status: "upcoming" },
  { sport: "🎮", match: "G2 vs T1", conf: 63, edge: "+3.7%", status: "upcoming" },
  { sport: "🏒", match: "Rangers vs Bruins", conf: 59, edge: "+2.9%", status: "upcoming" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <main className="overflow-x-hidden bg-[linear-gradient(180deg,#07110d_0%,#091510_55%,#0c1a12_100%)] text-white">

      {/* ── Navigation ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#07110d]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#36f28f_0%,#15a95b_100%)] shadow-[0_0_18px_rgba(54,242,143,0.35)]">
              <Sparkles size={14} className="text-[#041109]" />
            </div>
            <span className="text-[15px] font-semibold tracking-[-0.02em] text-white">Never In Doubt</span>
          </div>

          <nav className="hidden items-center gap-7 md:flex">
            {[["Features", "#features"], ["How it works", "#how-it-works"], ["Predictions", "/predictions"]].map(([label, href]) => (
              <Link key={label} href={href} className="text-[13px] text-white/55 transition hover:text-white">{label}</Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden text-[13px] font-medium text-white/60 transition hover:text-white sm:block">
              Log in
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#36f28f_0%,#1ac96b_100%)] px-4 py-2 text-[13px] font-semibold text-[#041109] shadow-[0_8px_24px_rgba(54,242,143,0.22)] transition hover:-translate-y-px hover:shadow-[0_12px_32px_rgba(54,242,143,0.30)]"
            >
              Open board
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl px-6 pb-0 pt-20 lg:px-10 lg:pt-28">

        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(54,242,143,0.13),transparent_70%)] blur-3xl" />
        </div>

        {/* Two-column */}
        <div className="relative grid items-center gap-16 lg:grid-cols-[1fr_1fr]">

          {/* Left — copy */}
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
              Sports prediction platform
            </div>

            <h1 className="mt-7 text-[2.9rem] font-bold leading-[1.03] tracking-[-0.05em] text-white sm:text-5xl lg:text-[3.5rem]">
              Bet smarter with{" "}
              <span className="text-emerald-400">AI-ranked</span>{" "}
              sports predictions.
            </h1>

            <p className="mt-6 text-[1.0625rem] leading-[1.75] text-white/58">
              Never In Doubt gives serious bettors model-backed edge scores,
              live market tracking, and ranked picks across six sports.
              Stop guessing — start backing real edge.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#36f28f_0%,#1ac96b_100%)] px-6 py-3 text-[14px] font-semibold text-[#041109] shadow-[0_16px_40px_rgba(54,242,143,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(54,242,143,0.32)]"
              >
                Open the board
                <ArrowRight size={15} />
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-6 py-3 text-[14px] font-medium text-white/75 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
              >
                How it works
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>

          {/* Right — product preview in browser chrome */}
          <div className="relative">
            {/* Glow behind card */}
            <div className="pointer-events-none absolute -inset-4 rounded-[36px] bg-[radial-gradient(ellipse_at_top,rgba(54,242,143,0.18),transparent_60%)] blur-2xl" />

            {/* Browser chrome */}
            <div className="relative overflow-hidden rounded-[20px] border border-white/[0.12] bg-[#0b1a10] shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
              {/* Chrome bar */}
              <div className="flex items-center gap-2 border-b border-white/[0.08] bg-[#0d1f14] px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                <div className="ml-3 flex h-6 flex-1 items-center rounded-md bg-white/[0.06] px-3 text-[11px] text-white/30">
                  app.neverindoubt.co/dashboard
                </div>
              </div>

              {/* App header bar */}
              <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#0c1b11] px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-md bg-emerald-400/20" />
                  <span className="text-[12px] font-semibold text-white/80">Betting Board</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
                  <span className="text-[10px] text-emerald-300/70">Live</span>
                </div>
              </div>

              {/* Match rows */}
              <div className="divide-y divide-white/[0.05]">
                {previewRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-5 text-center text-[14px]">{row.sport}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium text-white/90">{row.match}</div>
                      <div className="mt-0.5 text-[10px] text-white/38">
                        {row.status === "live" ? "● Live now" : "Upcoming"} · {row.conf}% confidence
                      </div>
                    </div>
                    <div className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      i === 0
                        ? "bg-emerald-400/15 text-emerald-300"
                        : "bg-white/[0.06] text-white/60"
                    }`}>
                      {row.edge}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom bar */}
              <div className="border-t border-white/[0.06] bg-[#0c1b11] px-4 py-2.5">
                <div className="text-[10px] text-white/30">5 predictions · sorted by edge · updated just now</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats strip ─────────────────────────────────────────────────────── */}
      <div className="mx-auto mt-20 max-w-7xl px-6 lg:px-10">
        <div className="grid grid-cols-2 gap-px rounded-2xl border border-white/[0.08] bg-white/[0.08] overflow-hidden sm:grid-cols-4">
          {stats.map(({ value, label }) => (
            <div key={label} className="bg-[#091510] px-6 py-5 text-center">
              <div className="text-[1.75rem] font-bold tracking-[-0.04em] text-emerald-300">{value}</div>
              <div className="mt-1 text-[12px] text-white/42">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" className="mx-auto mt-32 max-w-7xl px-6 lg:px-10">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400/70">What you get</p>
          <h2 className="mt-4 text-[2.2rem] font-bold leading-[1.08] tracking-[-0.04em] text-white">
            The tools that give you a genuine edge.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/50">
            Built for bettors who treat it seriously — not a picks service, not a tipster forum.
            A full intelligence platform.
          </p>
        </div>

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, headline, body }) => (
            <div key={headline} className="flex flex-col gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300">
                <Icon size={18} strokeWidth={1.75} />
              </div>
              <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-white">{headline}</h3>
              <p className="text-[13px] leading-[1.7] text-white/48">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="mx-auto mt-32 max-w-7xl px-6 lg:px-10">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400/70">How it works</p>
          <h2 className="mt-4 text-[2.2rem] font-bold leading-[1.08] tracking-[-0.04em] text-white">
            From live markets to confident picks.
          </h2>
        </div>

        <div className="relative mt-16">
          {/* Connecting line — desktop only */}
          <div className="absolute left-0 right-0 top-[22px] hidden h-px bg-gradient-to-r from-transparent via-emerald-400/20 to-transparent lg:block" />

          <div className="grid gap-10 lg:grid-cols-3">
            {steps.map(({ n, title, body }) => (
              <div key={n} className="relative flex flex-col gap-5">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-400/25 bg-[#091510] text-[13px] font-bold tracking-[-0.02em] text-emerald-300 shadow-[0_0_24px_rgba(54,242,143,0.12)]">
                  {n}
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-white">{title}</h3>
                  <p className="mt-2.5 text-[13px] leading-[1.7] text-white/48">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product showcase ────────────────────────────────────────────────── */}
      <section className="mx-auto mt-32 max-w-7xl px-6 lg:px-10">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400/70">The platform</p>
          <h2 className="mt-4 text-[2.2rem] font-bold leading-[1.08] tracking-[-0.04em] text-white">
            Every edge, in one place.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-white/50">
            A live betting board designed for speed. Ranked signals, AI predictions, and market data — all visible at once.
          </p>
        </div>

        {/* Wide browser mockup */}
        <div className="relative mt-14">
          <div className="pointer-events-none absolute -inset-8 rounded-[40px] bg-[radial-gradient(ellipse_at_50%_0%,rgba(54,242,143,0.14),transparent_65%)] blur-3xl" />

          <div className="relative overflow-hidden rounded-[18px] border border-white/[0.10] shadow-[0_60px_140px_rgba(0,0,0,0.6)]">
            {/* Chrome */}
            <div className="flex items-center gap-2 border-b border-white/[0.08] bg-[#0a1a0e] px-5 py-3.5">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              <div className="ml-4 flex h-7 flex-1 max-w-sm items-center rounded-lg bg-white/[0.06] px-3 text-[12px] text-white/28">
                app.neverindoubt.co/dashboard
              </div>
              <div className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1 text-[11px] font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live — updating now
              </div>
            </div>

            {/* Simulated app shell */}
            <div className="flex min-h-[460px] bg-[#091510]">
              {/* Sidebar */}
              <div className="hidden w-44 shrink-0 flex-col border-r border-white/[0.06] bg-[#07110d] p-3 lg:flex">
                <div className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                  <div className="h-2 w-20 rounded-full bg-white/10" />
                  <div className="mt-2 h-1.5 w-14 rounded-full bg-white/[0.06]" />
                </div>
                {["Betting Board", "Predictions", "Challenges", "Record", "Performance"].map((item, i) => (
                  <div
                    key={item}
                    className={`mb-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[11px] font-medium ${
                      i === 0
                        ? "bg-emerald-400/[0.12] text-emerald-300 border border-emerald-400/20"
                        : "text-white/38"
                    }`}
                  >
                    <div className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-emerald-400" : "bg-white/15"}`} />
                    {item}
                  </div>
                ))}
              </div>

              {/* Main content */}
              <div className="flex-1 overflow-hidden p-5">
                {/* KPI strip */}
                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Events Today", value: "24", sub: "⚽ 8 · 🎾 6 · 🏀 5 · 🎮 5" },
                    { label: "Open Signals", value: "18", sub: "147 total predictions" },
                    { label: "Active Model", value: "LR_V6", sub: "Trained 3 Mar" },
                    { label: "Pipeline", value: "Online", sub: "All systems OK" },
                  ].map(({ label, value, sub }) => (
                    <div key={label} className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-3">
                      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">{label}</div>
                      <div className="mt-2 text-[18px] font-bold tracking-[-0.03em] text-white">{value}</div>
                      <div className="mt-0.5 text-[9px] text-white/30">{sub}</div>
                    </div>
                  ))}
                </div>

                {/* Match rows */}
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                  <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Live Board · Today</span>
                    <span className="text-[10px] text-white/25">sorted by edge ↓</span>
                  </div>
                  {previewRows.map((row, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0 ${
                        i === 0 ? "bg-emerald-400/[0.04]" : ""
                      }`}
                    >
                      <span className="text-[13px]">{row.sport}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold text-white/85">{row.match}</div>
                        <div className="text-[9px] text-white/30">{row.conf}% confidence</div>
                      </div>
                      {row.status === "live" && (
                        <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] font-semibold text-emerald-300">LIVE</span>
                      )}
                      <span className={`text-[11px] font-bold ${i < 2 ? "text-emerald-300" : "text-white/50"}`}>
                        {row.edge}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────────── */}
      <section className="mx-auto mt-32 max-w-7xl px-6 pb-28 lg:px-10">
        <div className="relative overflow-hidden rounded-[28px] border border-emerald-400/[0.14] bg-[linear-gradient(135deg,rgba(54,242,143,0.07),rgba(54,242,143,0.03))] px-8 py-14 text-center">
          {/* Glow */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-0 h-[200px] w-[600px] -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(54,242,143,0.15),transparent_70%)] blur-3xl" />
          </div>

          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400/70">Get started today</p>
            <h2 className="mx-auto mt-5 max-w-2xl text-[2.4rem] font-bold leading-[1.06] tracking-[-0.045em] text-white">
              Your edge is already there. You just need to see it.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-white/50">
              Join serious bettors using AI-ranked predictions to back real edge across six sports.
              No fluff. No noise. Just the signal.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#36f28f_0%,#1ac96b_100%)] px-7 py-3.5 text-[14px] font-semibold text-[#041109] shadow-[0_16px_48px_rgba(54,242,143,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_56px_rgba(54,242,143,0.36)]"
              >
                Open the board
                <ArrowRight size={15} />
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.05] px-7 py-3.5 text-[14px] font-medium text-white/75 transition hover:border-white/22 hover:bg-white/[0.08] hover:text-white"
              >
                Create free account
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] px-6 py-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#36f28f_0%,#15a95b_100%)]">
              <Sparkles size={12} className="text-[#041109]" />
            </div>
            <span className="text-[13px] font-semibold text-white/70">Never In Doubt</span>
          </div>
          <p className="text-[12px] text-white/28">Please gamble responsibly. For entertainment purposes only.</p>
          <div className="flex items-center gap-5">
            {[["Dashboard", "/dashboard"], ["Predictions", "/predictions"], ["Log in", "/login"]].map(([label, href]) => (
              <Link key={label} href={href} className="text-[12px] text-white/35 transition hover:text-white/70">{label}</Link>
            ))}
          </div>
        </div>
      </footer>

    </main>
  );
}
