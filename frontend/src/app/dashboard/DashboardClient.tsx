"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { IntelligenceDashboard } from "./IntelligenceDashboard";

export function DashboardClient() {
  const [showSuccess, setShowSuccess] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      setShowSuccess(true);
      router.replace("/dashboard", { scroll: false });
      const t = setTimeout(() => setShowSuccess(false), 6000);
      return () => clearTimeout(t);
    }
  }, [searchParams, router]);

  return (
    <>
      {showSuccess && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <span className="text-base">🎉</span>
          <div>
            <p className="font-semibold">You&apos;re now a Pro member!</p>
            <p className="text-[12px] text-emerald-300/70 mt-0.5">Your subscription is active. Enjoy full access.</p>
          </div>
        </div>
      )}
      <IntelligenceDashboard />
    </>
  );
}
