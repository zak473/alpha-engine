"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { useBetting } from "./BettingContext";
import { MobileQueueDrawer } from "./MobileQueueDrawer";

/**
 * Global floating slip button — visible on every page when the queue has picks.
 * Renders the full MobileQueueDrawer so the slip is accessible anywhere.
 */
export function GlobalSlip() {
  const { queue } = useBetting();
  const [open, setOpen] = useState(false);

  if (queue.length === 0 && !open) return null;

  return (
    <>
      {/* Floating button — hidden on lg where QueueRail is shown inline */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 lg:hidden flex items-center gap-2.5 px-5 py-3 rounded-full text-sm font-bold shadow-xl transition-all"
          style={{ background: "#22e283", color: "#07110d", boxShadow: "0 8px 24px rgba(34,226,131,0.35)" }}
        >
          <span
            className="flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-black"
            style={{ background: "rgba(0,0,0,0.18)" }}
          >
            {queue.length}
          </span>
          View Slip
        </button>
      )}

      {/* Desktop slip button — for pages that don't have a QueueRail */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="hidden lg:flex fixed bottom-6 right-6 z-30 items-center gap-2.5 px-4 py-2.5 rounded-full text-sm font-bold shadow-xl transition-all"
          style={{ background: "#22e283", color: "#07110d", boxShadow: "0 8px 24px rgba(34,226,131,0.35)" }}
        >
          <TrendingUp size={15} />
          <span>Slip</span>
          <span
            className="flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-black"
            style={{ background: "rgba(0,0,0,0.18)" }}
          >
            {queue.length}
          </span>
        </button>
      )}

      <MobileQueueDrawer open={open} onClose={() => setOpen(false)} matches={[]} />
    </>
  );
}
