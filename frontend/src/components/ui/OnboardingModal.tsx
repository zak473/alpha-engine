"use client";

import { useState, useEffect } from "react";
import { X, TrendingUp, Users, ClipboardList, ChevronRight } from "lucide-react";
import Link from "next/link";

const STEPS = [
  {
    icon: <TrendingUp size={28} style={{ color: "var(--accent)" }} />,
    title: "Find your edge",
    body: "Our ELO models score every upcoming match and surface bets where your probability estimate beats the book. Check the Betting Board for today's top picks.",
    cta: { label: "Go to Betting Board", href: "/dashboard" },
  },
  {
    icon: <ClipboardList size={28} style={{ color: "var(--accent)" }} />,
    title: "Track your picks",
    body: "Add odds to your queue, then hit Track Picks to save them to your record. Your ROI, win rate, and CLV update automatically as results come in.",
    cta: { label: "View my record", href: "/record" },
  },
  {
    icon: <Users size={28} style={{ color: "var(--accent)" }} />,
    title: "Follow tipsters",
    body: "Browse community tipsters, follow the ones with strong track records, and tail their picks straight into your queue with one tap.",
    cta: { label: "Browse tipsters", href: "/tipsters" },
  },
];

const STORAGE_KEY = "ae_onboarding_done";

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {}
  }, []);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    setOpen(false);
  }

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "var(--bg1)", border: "1px solid var(--border0)", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === step ? 24 : 6,
                  background: i <= step ? "var(--accent)" : "var(--border1)",
                }}
              />
            ))}
          </div>
          <button onClick={dismiss} className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 flex flex-col gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-ring)" }}>
            {current.icon}
          </div>
          <div>
            <h2 className="text-base font-bold text-text-primary mb-1.5">{current.title}</h2>
            <p className="text-sm text-text-muted leading-relaxed">{current.body}</p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            {isLast ? (
              <Link
                href={current.cta.href}
                onClick={dismiss}
                className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-bold transition-all"
                style={{ background: "var(--accent)", color: "#0f2418" }}
              >
                {current.cta.label} <ChevronRight size={14} />
              </Link>
            ) : (
              <>
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-bold transition-all"
                  style={{ background: "var(--accent)", color: "#0f2418" }}
                >
                  Next <ChevronRight size={14} />
                </button>
                <button onClick={dismiss} className="h-10 px-4 rounded-xl text-sm text-text-muted hover:text-text-primary transition-colors">
                  Skip
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
