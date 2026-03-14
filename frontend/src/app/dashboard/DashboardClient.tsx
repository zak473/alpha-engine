"use client";

import { useEffect, useState } from "react";
import { BettingDashboard } from "@/components/betting/BettingDashboard";
import { getSportMatches, type SportSlug } from "@/lib/api";
import { adaptToMatchCard } from "@/lib/betting-adapters";
import type { BettingMatch } from "@/lib/betting-types";

const SPORTS: SportSlug[] = ["soccer", "basketball", "tennis", "esports", "baseball", "hockey"];

export function DashboardClient() {
  const [matches, setMatches] = useState<BettingMatch[]>([]);

  useEffect(() => {
    Promise.allSettled(
      SPORTS.map((sport) =>
        getSportMatches(sport, { limit: 100 }).then((res) =>
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

  return <BettingDashboard matches={matches} />;
}
