import Link from "next/link";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import { AuthPageShell } from "@/app/auth/AuthExperience";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell>
      <div className="mx-auto grid w-full max-w-[1100px] gap-8 lg:grid-cols-[minmax(0,0.9fr)_420px] lg:items-center">
        <section>
          <Link href="/login" className="inline-flex items-center gap-2 text-sm font-medium text-white/56 transition hover:text-white/82">
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>

          <div className="mt-8 max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8affc9]">Password help</p>
            <h1 className="mt-4 text-[36px] font-semibold leading-[1.02] tracking-[-0.05em] text-white sm:text-[48px] lg:text-[56px]">
              Need help getting back into your account?
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-white/64">
              Password recovery is being kept intentionally simple. If you still have access on another device, update
              your password from Profile &amp; Security inside the workspace. If you originally signed in with Google,
              you can use Google again from the login page.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Signed in elsewhere", value: "Change password from Profile" },
              { label: "Google account", value: "Use Google sign-in again" },
              { label: "No active session", value: "Create a fresh account if needed" },
            ].map((item) => (
              <div key={item.label} className="rounded-[22px] border border-white/10 bg-white/[0.035] px-4 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">{item.label}</p>
                <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] lg:p-8">
          <div className="inline-flex items-center rounded-full border border-[rgba(0,255,132,0.16)] bg-[rgba(0,255,132,0.08)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#95ffca]">
            Password recovery
          </div>

          <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(0,255,132,0.16)] bg-[rgba(0,255,132,0.08)] text-[#95ffca]">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Fastest route back in</p>
                <p className="mt-1 text-sm text-white/60">Use the account method you joined with most recently.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {[
                "Try Google sign-in if your account was created with Google.",
                "If you are already signed in somewhere, update the password from the profile page.",
                "If you are brand new, create a fresh account and continue into setup.",
              ].map((item) => (
                <div key={item} className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white/64">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            <Link href="/login" className="inline-flex h-[52px] items-center justify-center rounded-2xl border border-[rgba(0,255,132,0.14)] bg-[#00f884] px-5 py-3 text-[15px] font-semibold text-[#07110d] transition hover:brightness-95">
              Back to sign in
            </Link>
            <Link href="/register" className="inline-flex h-[52px] items-center justify-center rounded-2xl border border-white/[0.12] bg-white/[0.05] px-5 py-3 text-[15px] font-medium text-white transition hover:bg-white/[0.08]">
              Create account instead
            </Link>
          </div>

          <div className="mt-5 flex items-center gap-2 text-xs text-white/40">
            <ShieldCheck className="h-3.5 w-3.5 text-[#7dffbf]" />
            Security-first guidance without sending you through confusing dead ends.
          </div>
        </section>
      </div>
    </AuthPageShell>
  );
}
