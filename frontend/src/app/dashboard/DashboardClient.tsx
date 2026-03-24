"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { BettingDashboard } from "@/components/betting/BettingDashboard";
import { getSportMatches, type SportSlug } from "@/lib/api";
import { adaptToMatchCard } from "@/lib/betting-adapters";
import type { BettingMatch } from "@/lib/betting-types";

const SPORTS: SportSlug[] = ["soccer", "basketball", "tennis", "esports", "baseball", "hockey"];

export function DashboardClient() {
  const [matches, setMatches] = useState<BettingMatch[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      setShowSuccess(true);
      // Remove query param without re-render loop
      router.replace("/dashboard", { scroll: false });
      const t = setTimeout(() => setShowSuccess(false), 6000);
      return () => clearTimeout(t);
    }
  }, [searchParams, router]);

  useEffect(() => {
    Promise.allSettled(
      SPORTS.map((sport) =>
        getSportMatches(sport, { limit: 50 }).then((res) =>
          res.items.flatMap((item) => {
            try { return [adaptToMatchCard(item, sport)]; }
            catch { return []; }
          })
        )
      )
    ).then((results) => {
      const all = results
        .filter((r): r is PromiseFulfilledResult<BettingMatch[]> => r.status === "fulfilled")
        .flatMap((r) => r.value)
        .sort((a, b) => {
          if (a.status === "live" && b.status !== "live") return -1;
          if (b.status === "live" && a.status !== "live") return 1;
          const edgeDiff = (b.edgePercent ?? 0) - (a.edgePercent ?? 0);
          if (Math.abs(edgeDiff) > 0.5) return edgeDiff;
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });
      setMatches(all);
    });
  }, []);

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
      <BettingDashboard matches={matches} />
    </>
  );
}
