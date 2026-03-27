"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#070b12] text-white">
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(0,255,132,0.05),transparent_22%),radial-gradient(circle_at_top_right,rgba(127,183,255,0.06),transparent_20%),linear-gradient(180deg,#070b12_0%,#0a1018_48%,#070b12_100%)]">
        <div className="mx-auto flex min-h-screen w-full max-w-[1240px] items-center px-4 py-10 sm:px-6 lg:px-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export function AuthGrid({ children }: { children: ReactNode }) {
  return <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-center">{children}</div>;
}

function SimpleStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.035] px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">{value}</p>
    </div>
  );
}

export function AuthMarketingPanel({
  eyebrow,
  title,
  subtitle,
  primaryLabel,
  primaryValue,
  primaryCopy,
  secondaryCards,
  bottomNotes,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  primaryLabel: string;
  primaryValue: string;
  primaryCopy: string;
  secondaryCards: { label: string; value: string; copy: string }[];
  bottomNotes: { label: string; value: string }[];
}) {
  const cards = secondaryCards.slice(0, 2);
  const notes = bottomNotes.slice(0, 3);

  return (
    <section className="order-2 lg:order-1">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-white/56 transition hover:text-white/82">
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>

      <div className="mt-8 max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8affc9]">{eyebrow}</p>
        <h1 className="mt-4 text-[36px] font-semibold leading-[1.02] tracking-[-0.05em] text-white sm:text-[48px] lg:text-[56px]">
          {title}
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-7 text-white/64">{subtitle}</p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <SimpleStat label={primaryLabel} value={primaryValue} />
        {cards.map((card) => (
          <SimpleStat key={card.label} label={card.label} value={card.value} />
        ))}
      </div>

      <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Inside the workspace</p>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-white/68">{primaryCopy}</p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {cards.map((card) => (
            <div key={card.label} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">{card.label}</p>
              <p className="mt-2 text-sm font-semibold text-white">{card.value}</p>
              <p className="mt-2 text-sm leading-6 text-white/60">{card.copy}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-[22px] border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">What to expect</p>
          <div className="mt-3 space-y-3">
            {notes.map((note) => (
              <div key={note.label} className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[rgba(0,255,132,0.18)] bg-[rgba(0,255,132,0.08)] text-[#95ffca]">
                  <Check className="h-3 w-3" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{note.label}</p>
                  <p className="mt-1 text-sm leading-6 text-white/60">{note.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function AuthFormPanel({
  badge,
  title,
  subtitle,
  statusTitle,
  statusValue,
  statusHint,
  quickItems,
  children,
  support,
}: {
  badge: string;
  title: string;
  subtitle: string;
  statusTitle: string;
  statusValue: string;
  statusHint: string;
  quickItems: string[];
  children: ReactNode;
  support: ReactNode;
}) {
  return (
    <section className="order-1 rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] lg:order-2 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center rounded-full border border-[rgba(0,255,132,0.16)] bg-[rgba(0,255,132,0.08)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#95ffca]">
            {badge}
          </div>
          <h2 className="mt-4 text-[30px] font-semibold leading-tight tracking-[-0.04em] text-white">{title}</h2>
          <p className="mt-3 max-w-sm text-[14px] leading-6 text-white/60">{subtitle}</p>
        </div>

        <div className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/36">{statusTitle}</p>
          <p className="mt-1 text-sm font-semibold text-white">{statusValue}</p>
          <p className="mt-1 text-xs text-[#8affc9]">{statusHint}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-2.5 sm:grid-cols-3">
        {quickItems.map((item) => (
          <div key={item} className="rounded-[18px] border border-white/10 bg-white/[0.035] px-3 py-3 text-center text-xs font-medium text-white/70">
            {item}
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-5">{children}</div>
      <div className="mt-6 space-y-4">{support}</div>
    </section>
  );
}

export function AuthField({ label, note, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; note?: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">{label}</label>
      <input
        {...props}
        className={cn(
          "h-[52px] rounded-2xl border border-white/[0.10] bg-white/[0.06] px-4 py-3 text-[15px] text-white placeholder:text-white/32 outline-none transition focus:border-[rgba(0,255,132,0.26)] focus:bg-white/[0.08]",
          className,
        )}
      />
      {note ? <p className="text-xs text-white/40">{note}</p> : null}
    </div>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-red-500/28 bg-red-500/10 px-4 py-3 text-sm text-red-300">{children}</div>;
}

export function AuthPrimaryButton({ children, disabled, type = "button" }: { children: ReactNode; disabled?: boolean; type?: "button" | "submit" | "reset" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      className="inline-flex h-[52px] items-center justify-center rounded-2xl border border-[rgba(0,255,132,0.14)] bg-[#00f884] px-5 py-3 text-[15px] font-semibold text-[#07110d] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {children}
    </button>
  );
}

export function AuthDivider() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-white/[0.10]" />
      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/28">or</span>
      <div className="h-px flex-1 bg-white/[0.10]" />
    </div>
  );
}

export function AuthGoogleButton() {
  return (
    <a
      href="/api/v1/auth/google"
      className="inline-flex h-[52px] items-center justify-center gap-3 rounded-2xl border border-white/[0.12] bg-white/[0.05] px-5 py-3 text-[15px] font-medium text-white transition hover:bg-white/[0.08]"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
      </svg>
      Continue with Google
    </a>
  );
}

export function AuthSwitchCard({
  eyebrow,
  copy,
  href,
  cta,
}: {
  eyebrow: string;
  copy: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/[0.10] bg-white/[0.04] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/48">{eyebrow}</p>
      <p className="mt-2 text-sm leading-6 text-white/60">{copy}</p>
      <Link
        href={href}
        className="mt-4 inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-[rgba(0,255,132,0.18)] bg-[rgba(0,255,132,0.08)] px-4 text-sm font-semibold text-[#95ffca] transition hover:bg-[rgba(0,255,132,0.14)]"
      >
        {cta}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export function AuthTrustNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 text-center text-xs text-white/38">
      <ShieldCheck className="h-3.5 w-3.5 text-[#7dffbf]" />
      <span>{children}</span>
    </div>
  );
}
