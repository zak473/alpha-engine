"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { SportSlug } from "@/lib/api";
import type { SportMatchListItem } from "@/lib/types";

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls the full match list for a sport every 30s.
 * Returns the latest matches and a "lastUpdated" timestamp.
 * Initialises with the SSR snapshot so there's no loading flash.
 */
export function useLiveMatches(sport: SportSlug, initialMatches: SportMatchListItem[]) {
  const [matches, setMatches] = useState<SportMatchListItem[]>(initialMatches);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("alpha_engine_token") : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(
        `/api/v1/sports/${sport}/matches?limit=200`,
        { cache: "no-store", headers }
      );
      if (!res.ok) return;
      const data: { items: SportMatchListItem[] } = await res.json();
      if (data.items?.length) setMatches(data.items);
    } catch {
      // network error — keep stale values
    }
  }, [sport]);

  useEffect(() => {
    poll(); // immediate refresh on mount
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [poll]);

  return matches;
}
