import Link from "next/link";
import Image from "next/image";

const FEATURES = [
  {
    icon: "🧠",
    title: "AI-Powered Predictions",
    body: "Machine learning models trained on years of historical data give you calibrated win probabilities, not gut feelings.",
  },
  {
    icon: "⚡",
    title: "Live Market Intelligence",
    body: "Real-time odds across soccer, basketball, tennis, baseball, hockey and esports — with edge highlighted the moment it appears.",
  },
  {
    icon: "📊",
    title: "Edge Scoring",
    body: "Every match shows the gap between our fair odds and the bookmaker line. Back value, not noise.",
  },
  {
    icon: "🤖",
    title: "AI Sports Advisor",
    body: "Ask anything — match previews, bankroll strategy, accumulator ideas. Your personal analyst, available 24/7.",
  },
  {
    icon: "📈",
    title: "Bankroll & ROI Tracking",
    body: "Log picks, track P&L, and see your full performance history with Sharpe ratio, win rate, and drawdown metrics.",
  },
  {
    icon: "🏆",
    title: "Challenges & Tipsters",
    body: "Compete in weekly prediction challenges, follow the sharpest tipsters, and climb the leaderboard.",
  },
];

const SPORTS = [
  { icon: "⚽", label: "Soccer" },
  { icon: "🏀", label: "Basketball" },
  { icon: "🎾", label: "Tennis" },
  { icon: "⚾", label: "Baseball" },
  { icon: "🏒", label: "Hockey" },
  { icon: "🎮", label: "Esports" },
];

const STATS = [
  { value: "6", label: "Sports covered" },
  { value: "60%+", label: "Model accuracy" },
  { value: "10k+", label: "Matches analysed" },
  { value: "Live", label: "Real-time odds" },
];

export default function LandingPage() {
  return (
    <div
      className="min-h-screen text-white"
      style={{
        background: "linear-gradient(180deg, #06100a 0%, #08120e 40%, #0a1510 100%)",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* ── Top nav ──────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4"
        style={{ background: "rgba(6,16,10,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <Image src="/never-in-doubt-logo.png" alt="Never In Doubt" width={120} height={40} className="h-8 w-auto opacity-90" />
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-full px-4 py-2 text-sm font-medium transition-colors"
            style={{ color: "rgba(255,255,255,0.65)" }}
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-full px-4 py-2 text-sm font-semibold transition-all"
            style={{ background: "#2edb6c", color: "#07110d" }}
          >
            Get started free
          </Link>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center px-6 pt-40 pb-24 text-center overflow-hidden">
        {/* Glow orb */}
        <div
          className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2"
          style={{
            width: 700,
            height: 400,
            background: "radial-gradient(ellipse at top, rgba(54,242,143,0.18) 0%, transparent 70%)",
          }}
        />

        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
          style={{ borderColor: "rgba(54,242,143,0.24)", background: "rgba(54,242,143,0.08)", color: "#6ee7b7" }}>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 8px #6ee7b7" }} />
          AI Sports Intelligence
        </div>

        <h1 className="relative max-w-4xl text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl"
          style={{ lineHeight: 1.08, letterSpacing: "-0.04em" }}>
          Never bet{" "}
          <span style={{
            background: "linear-gradient(135deg, #36f28f 0%, #2edb6c 50%, #1ab858 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            in the dark
          </span>{" "}
          again.
        </h1>

        <p className="relative mt-6 max-w-2xl text-lg leading-relaxed"
          style={{ color: "rgba(237,247,240,0.60)" }}>
          Never In Doubt combines machine learning predictions, real-time market odds, and an AI advisor
          to give you a genuine edge across 6 sports — every single day.
        </p>

        <div className="relative mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/register"
            className="rounded-full px-8 py-3.5 text-base font-semibold transition-all hover:-translate-y-px"
            style={{
              background: "linear-gradient(135deg, #36f28f, #2edb6c)",
              color: "#07110d",
              boxShadow: "0 12px 32px rgba(54,242,143,0.30)",
            }}
          >
            Start for free →
          </Link>
          <Link
            href="/login"
            className="rounded-full border px-8 py-3.5 text-base font-medium transition-all hover:-translate-y-px"
            style={{ borderColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.75)", background: "rgba(255,255,255,0.04)" }}
          >
            Sign in
          </Link>
        </div>

        {/* Dashboard preview placeholder */}
        <div className="relative mt-16 w-full max-w-5xl">
          <div
            className="w-full rounded-3xl border overflow-hidden"
            style={{
              borderColor: "rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              boxShadow: "0 40px 100px rgba(0,0,0,0.60), 0 0 0 1px rgba(54,242,143,0.06)",
              minHeight: 280,
            }}
          >
            {/* Mock dashboard header */}
            <div className="flex items-center gap-2 border-b px-5 py-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#2edb6c", boxShadow: "0 0 8px #2edb6c" }} />
              <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>Never In Doubt — Live board</span>
            </div>
            {/* Mock match cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-5">
              {[
                { sport: "⚽", home: "Arsenal", away: "Man City", edge: "+4.2%", conf: "71%", status: "Live · 67'" },
                { sport: "🏀", home: "Lakers", away: "Celtics", edge: "+2.8%", conf: "63%", status: "Tonight 19:30" },
                { sport: "🎾", home: "Djokovic", away: "Alcaraz", edge: "+3.5%", conf: "68%", status: "Tomorrow" },
              ].map((m) => (
                <div key={m.home} className="rounded-2xl border p-4"
                  style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.40)" }}>{m.sport} {m.status}</span>
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "rgba(54,242,143,0.12)", color: "#6ee7b7" }}>
                      {m.edge} edge
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm truncate">{m.home}</span>
                    <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.35)" }}>vs</span>
                    <span className="font-semibold text-sm truncate text-right">{m.away}</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full" style={{ width: m.conf, background: "linear-gradient(90deg,#36f28f,#2edb6c)" }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                    <span>Model confidence</span><span>{m.conf}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Fade out at bottom */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 rounded-b-3xl"
            style={{ background: "linear-gradient(to bottom, transparent, #08120e)" }} />
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      <section className="px-6 py-12">
        <div className="mx-auto max-w-4xl grid grid-cols-2 sm:grid-cols-4 gap-6">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1 text-center">
              <span className="text-3xl font-bold" style={{ color: "#36f28f" }}>{s.value}</span>
              <span className="text-xs" style={{ color: "rgba(237,247,240,0.45)" }}>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Sports ───────────────────────────────────────────────────────── */}
      <section className="px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <p className="text-center text-xs font-bold uppercase tracking-[0.22em] mb-8"
            style={{ color: "rgba(255,255,255,0.30)" }}>
            Covering every major market
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {SPORTS.map((s) => (
              <div key={s.label}
                className="flex items-center gap-2.5 rounded-full border px-5 py-2.5"
                style={{ borderColor: "rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.04)" }}>
                <span className="text-xl">{s.icon}</span>
                <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.75)" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features grid ────────────────────────────────────────────────── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
              Everything the sharp money uses
            </h2>
            <p className="mt-3 text-base" style={{ color: "rgba(237,247,240,0.55)" }}>
              Built for serious bettors who want data, not tips.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-3xl border p-6 transition-all hover:-translate-y-px"
                style={{
                  borderColor: "rgba(255,255,255,0.08)",
                  background: "linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))",
                }}
              >
                <div className="mb-4 text-3xl">{f.icon}</div>
                <h3 className="mb-2 text-base font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(237,247,240,0.55)" }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="px-6 py-24">
        <div
          className="mx-auto max-w-3xl rounded-[32px] border p-12 text-center relative overflow-hidden"
          style={{
            borderColor: "rgba(54,242,143,0.16)",
            background: "linear-gradient(135deg,rgba(54,242,143,0.08),rgba(255,255,255,0.02))",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse at top, rgba(54,242,143,0.12) 0%, transparent 65%)" }}
          />
          <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
            Ready to find your edge?
          </h2>
          <p className="relative mt-4 text-base" style={{ color: "rgba(237,247,240,0.58)" }}>
            Join Never In Doubt and start betting with the confidence of a professional analyst.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="rounded-full px-8 py-3.5 text-base font-semibold transition-all hover:-translate-y-px"
              style={{
                background: "linear-gradient(135deg, #36f28f, #2edb6c)",
                color: "#07110d",
                boxShadow: "0 12px 32px rgba(54,242,143,0.28)",
              }}
            >
              Create free account →
            </Link>
            <Link
              href="/login"
              className="rounded-full border px-8 py-3.5 text-base font-medium transition-all"
              style={{ borderColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.70)" }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="px-6 py-10 border-t text-center" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <Image src="/never-in-doubt-logo.png" alt="Never In Doubt" width={100} height={34} className="h-7 w-auto opacity-50 mx-auto mb-4" />
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>
          © {new Date().getFullYear()} Never In Doubt · AI-powered sports intelligence · For entertainment purposes only · Please gamble responsibly
        </p>
      </footer>
    </div>
  );
}
