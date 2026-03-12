"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { SportSlug } from "@/lib/api";

export interface LiveScoreUpdate {
  id: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  liveClock: string | null;
}

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls the sport matches endpoint every 30s and returns a map of
 * match_id → score update. Only active when there is at least one live match.
 */
export function useLiveScores(sport: SportSlug, hasLive: boolean) {
  const [updates, setUpdates] = useState<Map<string, LiveScoreUpdate>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/v1/sports/${sport}/matches?status=live&limit=50`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data: { items: any[] } = await res.json();
      const map = new Map<string, LiveScoreUpdate>();
      for (const m of data.items) {
        map.set(m.id, {
          id:         m.id,
          homeScore:  m.home_score ?? null,
          awayScore:  m.away_score ?? null,
          status:     m.status ?? "live",
          liveClock:  m.live_clock ?? null,
        });
      }
      setUpdates(map);
    } catch {
      // network error — keep stale values
    }
  }, [sport]);

  useEffect(() => {
    if (!hasLive) {
      setUpdates(new Map());
      return;
    }

    // Poll immediately then on interval
    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [hasLive, poll]);

  return updates;
}
