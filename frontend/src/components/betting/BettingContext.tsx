"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { QueueSelection } from "@/lib/betting-types";

interface BettingContextValue {
  queue: QueueSelection[];
  addToQueue: (sel: QueueSelection) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  isInQueue: (id: string) => boolean;
}

const BettingContext = createContext<BettingContextValue | null>(null);

const STORAGE_KEY = "ae_queue_v2";

export function BettingProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueueSelection[]>([]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setQueue(JSON.parse(stored));
    } catch {}
  }, []);

  const persist = (items: QueueSelection[]) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
  };

  const addToQueue = useCallback((sel: QueueSelection) => {
    setQueue((prev) => {
      if (prev.some((q) => q.id === sel.id)) return prev;
      const next = [sel, ...prev];
      persist(next);
      return next;
    });
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => {
      const next = prev.filter((q) => q.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  const isInQueue = useCallback(
    (id: string) => queue.some((q) => q.id === id),
    [queue]
  );

  return (
    <BettingContext.Provider value={{ queue, addToQueue, removeFromQueue, clearQueue, isInQueue }}>
      {children}
    </BettingContext.Provider>
  );
}

export function useBetting() {
  const ctx = useContext(BettingContext);
  if (!ctx) throw new Error("useBetting must be used within BettingProvider");
  return ctx;
}
