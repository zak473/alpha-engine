"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken } from "@/lib/auth";
import { ShieldCheck } from "lucide-react";
import Image from "next/image";

const FANBASIS_PAYMENT_LINK = "https://www.fanbasis.com/agency-checkout/never-in-doubt/B657N";

export default function SubscribePage() {
  const router = useRouter();

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    window.location.href = FANBASIS_PAYMENT_LINK;
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#06060e] px-4 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,255,132,0.10),transparent_24%)]" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image
            src="/nidmainlogo.jpg"
            alt="Never In Doubt"
            width={200}
            height={56}
            sizes="(max-width: 768px) 100px, 132px"
            className="h-12 w-auto [filter:invert(1)_hue-rotate(180deg)]"
            priority
          />
        </div>

        <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.04] p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.40)]">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(0,255,132,0.20)] bg-[rgba(0,255,132,0.08)]">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[rgba(0,255,132,0.3)] border-t-[#00ff84]" />
          </div>
          <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-white">
            Taking you to checkout…
          </h1>
          <p className="mt-3 text-[14px] leading-6 text-white/50">
            You&apos;ll be redirected to complete your £24.99/month subscription.
          </p>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-white/30">
            <ShieldCheck className="h-3.5 w-3.5 text-[#7dffbf]" />
            Secure payment via Fanbasis · Cancel any time
          </div>
        </div>
      </div>
    </div>
  );
}
