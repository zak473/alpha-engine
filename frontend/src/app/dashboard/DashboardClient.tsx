"use client";

import { useEffect, useState } from "react";
import { BettingDashboard } from "@/components/betting/BettingDashboard";
import { getSportMatches, type SportSlug, ApiError } from "@/lib/api";
import { adaptToMatchCard } from "@/lib/betting-adapters";
import type { BettingMatch } from "@/lib/betting-types";

const SPORTS: SportSlug[] = ["soccer", "basketball", "tennis", "esports", "baseball", "hockey"];

export function DashboardClient() {
  const [matches, setMatches] = useState<BettingMatch[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "auth" | "empty" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const results_: Promise<BettingMatch[]>[] = SPORTS.map((sport) =>
      getSportMatches(sport, { limit: 100 }).then((res) =>
        res.items.flatMap((item) => {
          try { return [adaptToMatchCard(item, sport)]; }
          catch { return []; }
        })
      )
    );

    Promise.allSettled(results_).then((results) => {
      const failures = results.filter((r) => r.status === "rejected");
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

      if (failures.length === SPORTS.length) {
        // All failed — check if it's auth
        const firstError = (results[0] as PromiseRejectedResult).reason;
        if (firstError instanceof ApiError && firstError.status === 401) {
          setStatus("auth");
          setErrorMsg("401 — token: " + (localStorage.getItem("alpha_engine_token")?.slice(0, 20) ?? "none"));
        } else {
          setStatus("error");
          setErrorMsg(String(firstError));
        }
      } else if (all.length === 0) {
        setStatus("empty");
      } else {
        setStatus("ok");
      }
    });
  }, []);

  if (status === "auth") {
    return (
      <div className="p-8 text-center text-red-400 text-sm">
        Authentication failed ({errorMsg}). Try logging out and back in.
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="p-8 text-center text-red-400 text-sm">
        API error: {errorMsg}
      </div>
    );
  }
  if (status === "empty") {
    return (
      <div className="p-8 text-center text-white/50 text-sm">
        No matches in the database yet. The scheduler will populate data once API keys are configured in Railway.
      </div>
    );
  }

  return <BettingDashboard matches={matches} />;
}
