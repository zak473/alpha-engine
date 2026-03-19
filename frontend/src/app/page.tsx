import Link from "next/link";
import Image from "next/image";

// ─── Edit these to change the page content ────────────────────────────────────

const HERO_BADGE    = "AI Sports Intelligence · Free to start";
const HERO_LINE1    = "Never bet";
const HERO_GREEN    = "in the dark";
const HERO_LINE2    = "again.";
const HERO_SUB      = "Never In Doubt gives you machine-learning predictions, live market odds, and a personal AI advisor across 6 sports — so every bet you place is backed by data.";

const STATS = [
  { value: "6",    label: "Sports" },
  { value: "60%+", label: "Model accuracy" },
  { value: "10k+", label: "Matches analysed" },
  { value: "Live", label: "Odds feed" },
];

const HOW = [
  {
    step: "01",
    title: "Browse today's matches",
    body: "Every match across soccer, basketball, tennis, baseball, hockey and esports — ranked by edge and confidence.",
  },
  {
    step: "02",
    title: "See the AI edge",
    body: "Our models output a fair probability for each outcome. Where the bookmaker's odds are worse, you see a positive edge — in plain english.",
  },
  {
    step: "03",
    title: "Track and improve",
    body: "Log your picks, watch your bankroll grow, and review your ROI over time. Know exactly where you're winning.",
  },
];

const FEATURES = [
  {
    icon: "🧠",
    title: "ML Predictions",
    body: "Logistic regression models trained on years of historical data give calibrated win probabilities, not gut feelings.",
    tag: "Core",
  },
  {
    icon: "⚡",
    title: "Live Odds Feed",
    body: "Real-time market odds updated continuously, with your edge highlighted the moment it appears.",
    tag: "Live",
  },
  {
    icon: "🤖",
    title: "AI Advisor",
    body: "Ask anything — match previews, bankroll strategy, accumulator ideas. Your personal analyst, 24/7.",
    tag: "AI",
  },
  {
    icon: "📈",
    title: "ROI Tracking",
    body: "Full P&L history with win rate, Sharpe ratio, drawdown, and Kelly-staked returns.",
    tag: "Analytics",
  },
  {
    icon: "📊",
    title: "Edge Scoring",
    body: "Every match card shows the gap between our fair odds and the bookmaker line — so you back value, not noise.",
    tag: "Core",
  },
  {
    icon: "🏆",
    title: "Challenges",
    body: "Compete in weekly prediction challenges, follow the sharpest tipsters, and climb the public leaderboard.",
    tag: "Social",
  },
];

const SPORTS = [
  { icon: "⚽", label: "Soccer",     color: "#3b82f6" },
  { icon: "🏀", label: "Basketball", color: "#f59e0b" },
  { icon: "🎾", label: "Tennis",     color: "#22c55e" },
  { icon: "⚾", label: "Baseball",   color: "#ef4444" },
  { icon: "🏒", label: "Hockey",     color: "#06b6d4" },
  { icon: "🎮", label: "Esports",    color: "#a855f7" },
];

const MOCK_MATCHES = [
  { sport: "⚽", league: "Premier League", home: "Arsenal", away: "Man City",   edge: "+4.2%", conf: 71, status: "LIVE · 67'",    edgePos: true },
  { sport: "🏀", league: "NBA",            home: "Lakers",  away: "Celtics",    edge: "+2.8%", conf: 63, status: "Tonight 21:30", edgePos: true },
  { sport: "🎾", league: "ATP",            home: "Djokovic",away: "Alcaraz",    edge: "+3.5%", conf: 68, status: "Tomorrow",      edgePos: true },
];

const TESTIMONIALS = [
  { quote: "Finally a platform that shows me why to bet, not just what to bet.", name: "James R.", role: "Recreational punter" },
  { quote: "The edge scoring alone is worth it. I've stopped backing odds I shouldn't.", name: "Sarah M.", role: "Value bettor" },
  { quote: "The AI advisor explained Kelly staking better than any article I've read.", name: "Tom K.", role: "Sports trader" },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen text-white overflow-x-hidden"
      style={{ background: "#07100c", fontFamily: "Inter, sans-serif" }}>

      {/* ─── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50"
        style={{ background: "rgba(7,16,12,0.80)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
          <Image src="/never-in-doubt-logo.png" alt="Never In Doubt" width={130} height={44} className="h-8 w-auto" />
          <div className="hidden sm:flex items-center gap-8 text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
            <a href="#how" className="hover:text-white transition-colors">How it works</a>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#sports" className="hover:text-white transition-colors">Sports</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden sm:block text-sm font-medium transition-colors hover:text-white"
              style={{ color: "rgba(255,255,255,0.55)" }}>
              Sign in
            </Link>
            <Link href="/register"
              className="rounded-full px-5 py-2 text-sm font-semibold transition-all hover:opacity-90 hover:-translate-y-px"
              style={{ background: "#2edb6c", color: "#07110d", boxShadow: "0 4px 14px rgba(46,219,108,0.35)" }}>
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center text-center px-6 pt-36 pb-8"
        style={{ minHeight: "100svh" }}>

        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 rounded-full"
            style={{ width: 900, height: 600, background: "radial-gradient(ellipse, rgba(46,219,108,0.15) 0%, transparent 65%)", filter: "blur(1px)" }} />
        </div>

        {/* Badge */}
        <div className="relative mb-8 inline-flex items-center gap-2.5 rounded-full border px-4 py-2 text-xs font-semibold"
          style={{ borderColor: "rgba(46,219,108,0.30)", background: "rgba(46,219,108,0.08)", color: "#5DF5A0", letterSpacing: "0.06em" }}>
          <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "#36f28f", boxShadow: "0 0 10px #36f28f" }} />
          {HERO_BADGE}
        </div>

        {/* Headline */}
        <h1 className="relative max-w-5xl font-bold" style={{ fontSize: "clamp(42px, 8vw, 88px)", lineHeight: 1.04, letterSpacing: "-0.045em" }}>
          {HERO_LINE1}{" "}
          <span style={{
            background: "linear-gradient(135deg, #5DF5A0 0%, #2edb6c 45%, #1ab858 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            {HERO_GREEN}
          </span>
          <br />{HERO_LINE2}
        </h1>

        {/* Subtitle */}
        <p className="relative mt-7 max-w-xl text-lg leading-relaxed"
          style={{ color: "rgba(237,247,240,0.55)", fontSize: "clamp(15px, 2vw, 18px)" }}>
          {HERO_SUB}
        </p>

        {/* CTAs */}
        <div className="relative mt-10 flex flex-wrap justify-center gap-4">
          <Link href="/register"
            className="rounded-full px-8 py-4 text-base font-bold transition-all hover:-translate-y-0.5 hover:shadow-2xl"
            style={{ background: "linear-gradient(135deg,#5DF5A0,#2edb6c)", color: "#07110d", boxShadow: "0 10px 40px rgba(46,219,108,0.40)" }}>
            Start for free →
          </Link>
          <Link href="/login"
            className="rounded-full border px-8 py-4 text-base font-medium transition-all hover:-translate-y-0.5"
            style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.75)", background: "rgba(255,255,255,0.05)" }}>
            Sign in
          </Link>
        </div>

        <p className="mt-4 text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>
          No credit card required · Free forever plan available
        </p>

        {/* App preview */}
        <div className="relative mt-16 w-full max-w-4xl">
          <div className="rounded-[20px] border overflow-hidden"
            style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", boxShadow: "0 0 0 1px rgba(46,219,108,0.08), 0 60px 120px rgba(0,0,0,0.70)" }}>

            {/* Window chrome */}
            <div className="flex items-center gap-2 px-5 py-3.5 border-b"
              style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
                <div className="h-3 w-3 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
                <div className="h-3 w-3 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
              </div>
              <div className="flex-1 mx-4">
                <div className="mx-auto w-48 h-5 rounded-md text-center text-[10px] flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.30)" }}>
                  neverindoubt.app/sports/soccer
                </div>
              </div>
              <div className="h-2 w-2 rounded-full" style={{ background: "#2edb6c", boxShadow: "0 0 8px #2edb6c" }} />
            </div>

            {/* Match cards */}
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.30)" }}>Today's top edges</span>
                <span className="text-xs rounded-full px-2.5 py-1" style={{ background: "rgba(46,219,108,0.10)", color: "#5DF5A0" }}>3 value bets found</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {MOCK_MATCHES.map((m) => (
                  <div key={m.home} className="rounded-2xl border p-4 flex flex-col gap-3"
                    style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                        {m.sport} {m.league}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: m.status.startsWith("LIVE") ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)", color: m.status.startsWith("LIVE") ? "#fca5a5" : "rgba(255,255,255,0.40)" }}>
                        {m.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm leading-tight">{m.home}</span>
                      <span className="text-[10px] shrink-0 px-2 py-0.5 rounded" style={{ color: "rgba(255,255,255,0.30)", background: "rgba(255,255,255,0.04)" }}>vs</span>
                      <span className="font-semibold text-sm leading-tight text-right">{m.away}</span>
                    </div>
                    <div>
                      <div className="h-1.5 rounded-full overflow-hidden mb-1.5" style={{ background: "rgba(255,255,255,0.07)" }}>
                        <div className="h-full rounded-full" style={{ width: `${m.conf}%`, background: "linear-gradient(90deg,#36f28f,#2edb6c)" }} />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.30)" }}>Confidence {m.conf}%</span>
                        <span className="text-[10px] font-bold" style={{ color: "#5DF5A0" }}>{m.edge} edge</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom fade */}
          <div className="pointer-events-none absolute bottom-0 inset-x-0 h-28 rounded-b-[20px]"
            style={{ background: "linear-gradient(to bottom, transparent, #07100c)" }} />
        </div>
      </section>

      {/* ─── Stats ───────────────────────────────────────────────────────── */}
      <section className="py-16 border-y" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-4xl px-6 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-2 text-center">
              <span className="font-bold" style={{ fontSize: 38, color: "#36f28f", lineHeight: 1, letterSpacing: "-0.04em" }}>{s.value}</span>
              <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── How it works ────────────────────────────────────────────────── */}
      <section id="how" className="py-28 px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-20">
            <p className="text-xs font-bold uppercase tracking-[0.22em] mb-4" style={{ color: "#36f28f" }}>How it works</p>
            <h2 className="font-bold" style={{ fontSize: "clamp(28px, 5vw, 48px)", letterSpacing: "-0.03em" }}>
              From match list to confident bet<br />in three steps
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-10 left-1/4 right-1/4 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(46,219,108,0.25), transparent)" }} />

            {HOW.map((h, i) => (
              <div key={h.step} className="flex flex-col gap-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-bold text-sm"
                    style={{ background: "rgba(46,219,108,0.10)", border: "1px solid rgba(46,219,108,0.25)", color: "#36f28f" }}>
                    {h.step}
                  </div>
                  {i < HOW.length - 1 && (
                    <div className="md:hidden flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                  )}
                </div>
                <h3 className="text-xl font-semibold" style={{ letterSpacing: "-0.02em" }}>{h.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(237,247,240,0.52)" }}>{h.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Sports ──────────────────────────────────────────────────────── */}
      <section id="sports" className="py-20 px-6 border-y" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}>
        <div className="mx-auto max-w-4xl">
          <p className="text-center text-xs font-bold uppercase tracking-[0.22em] mb-10" style={{ color: "rgba(255,255,255,0.30)" }}>
            Covering every major market
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {SPORTS.map((s) => (
              <div key={s.label}
                className="flex items-center gap-3 rounded-2xl border px-6 py-3.5 transition-all hover:-translate-y-px"
                style={{ borderColor: `${s.color}22`, background: `${s.color}0d` }}>
                <span className="text-2xl">{s.icon}</span>
                <span className="font-semibold text-sm" style={{ color: "rgba(255,255,255,0.80)" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ────────────────────────────────────────────────────── */}
      <section id="features" className="py-28 px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-20">
            <p className="text-xs font-bold uppercase tracking-[0.22em] mb-4" style={{ color: "#36f28f" }}>Features</p>
            <h2 className="font-bold" style={{ fontSize: "clamp(28px, 5vw, 48px)", letterSpacing: "-0.03em" }}>
              Everything the sharp money uses
            </h2>
            <p className="mt-4 text-base" style={{ color: "rgba(237,247,240,0.50)" }}>
              Built for serious bettors who want data, not tips.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title}
                className="group rounded-3xl border p-7 flex flex-col gap-4 transition-all hover:-translate-y-px hover:border-white/20"
                style={{ borderColor: "rgba(255,255,255,0.08)", background: "linear-gradient(160deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))" }}>
                <div className="flex items-start justify-between">
                  <span className="text-3xl">{f.icon}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(46,219,108,0.08)", color: "#5DF5A0", border: "1px solid rgba(46,219,108,0.15)" }}>
                    {f.tag}
                  </span>
                </div>
                <h3 className="text-base font-semibold" style={{ letterSpacing: "-0.02em" }}>{f.title}</h3>
                <p className="text-sm leading-relaxed flex-1" style={{ color: "rgba(237,247,240,0.50)" }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ────────────────────────────────────────────────── */}
      <section className="py-20 px-6 border-y" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}>
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-xs font-bold uppercase tracking-[0.22em] mb-12" style={{ color: "rgba(255,255,255,0.30)" }}>
            What bettors are saying
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="rounded-3xl border p-7 flex flex-col gap-5"
                style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => <span key={i} style={{ color: "#36f28f", fontSize: 14 }}>★</span>)}
                </div>
                <p className="text-sm leading-relaxed flex-1" style={{ color: "rgba(237,247,240,0.70)" }}>"{t.quote}"</p>
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-32 px-6">
        <div className="mx-auto max-w-3xl relative">
          {/* Glow behind CTA */}
          <div className="pointer-events-none absolute inset-0 rounded-[40px]"
            style={{ background: "radial-gradient(ellipse at center, rgba(46,219,108,0.20) 0%, transparent 65%)", filter: "blur(30px)" }} />

          <div className="relative rounded-[40px] border p-14 text-center"
            style={{ borderColor: "rgba(46,219,108,0.20)", background: "linear-gradient(160deg,rgba(46,219,108,0.07),rgba(255,255,255,0.02))" }}>
            <h2 className="font-bold" style={{ fontSize: "clamp(28px,5vw,48px)", letterSpacing: "-0.03em" }}>
              Ready to find your edge?
            </h2>
            <p className="mt-4 text-base max-w-md mx-auto" style={{ color: "rgba(237,247,240,0.55)" }}>
              Join Never In Doubt and start every bet with the confidence of a professional analyst.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link href="/register"
                className="rounded-full px-10 py-4 text-base font-bold transition-all hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg,#5DF5A0,#2edb6c)", color: "#07110d", boxShadow: "0 12px 40px rgba(46,219,108,0.45)" }}>
                Create free account →
              </Link>
              <Link href="/login"
                className="rounded-full border px-10 py-4 text-base font-medium transition-all hover:-translate-y-0.5"
                style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.70)" }}>
                Sign in
              </Link>
            </div>
            <p className="mt-5 text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
              No credit card required
            </p>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t px-6 py-12" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-5xl flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <Image src="/never-in-doubt-logo.png" alt="Never In Doubt" width={110} height={36} className="h-7 w-auto opacity-50" />
          <div className="flex gap-6 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            <Link href="/login" className="hover:text-white transition-colors">Sign in</Link>
            <Link href="/register" className="hover:text-white transition-colors">Register</Link>
          </div>
          <p className="text-xs text-center sm:text-right" style={{ color: "rgba(255,255,255,0.25)" }}>
            For entertainment only · Please gamble responsibly
          </p>
        </div>
      </footer>
    </div>
  );
}
