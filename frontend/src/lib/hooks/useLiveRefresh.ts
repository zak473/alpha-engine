"use client";

import { useState, useEffect } from "react";

/**
 * Returns a tick counter that increments every `intervalMs` when `enabled`.
 * Use this as a dependency to trigger data re-fetches for live matches.
 */
export function useLiveRefresh(enabled: boolean, intervalMs = 30_000): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);

  return tick;
}
