"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { useBetting } from "./BettingContext";
import { MobileQueueDrawer } from "./MobileQueueDrawer";

/**
 * Global floating slip button — visible on every page when the queue has picks.
 * User taps the button to open the drawer; no auto-open to avoid blocking odds clicks.
 */
export function GlobalSlip() {
  const { queue } = useBetting();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating button — mobile center bottom */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 lg:hidden flex items-center gap-2.5 px-5 py-3 rounded-full text-sm font-bold shadow-xl transition-all"
          style={{
            background: queue.length > 0 ? "#22e283" : "rgba(255,255,255,0.08)",
            color: queue.length > 0 ? "#07110d" : "rgba(255,255,255,0.5)",
            boxShadow: queue.length > 0 ? "0 8px 24px rgba(34,226,131,0.35)" : "none",
            border: queue.length > 0 ? "none" : "1px solid rgba(255,255,255,0.12)",
          }}
        >
          {queue.length > 0 && (
            <span
              className="flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-black"
              style={{ background: "rgba(0,0,0,0.18)" }}
            >
              {queue.length}
            </span>
          )}
          Slip
        </button>
      )}

      {/* Desktop slip button — always visible in bottom-right corner */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="hidden lg:flex fixed bottom-6 right-6 z-30 items-center gap-2.5 px-4 py-2.5 rounded-full text-sm font-bold shadow-xl transition-all"
          style={{
            background: queue.length > 0 ? "#22e283" : "rgba(255,255,255,0.08)",
            color: queue.length > 0 ? "#07110d" : "rgba(255,255,255,0.5)",
            boxShadow: queue.length > 0 ? "0 8px 24px rgba(34,226,131,0.35)" : "none",
            border: queue.length > 0 ? "none" : "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <TrendingUp size={15} />
          <span>Slip</span>
          {queue.length > 0 && (
            <span
              className="flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-black"
              style={{ background: "rgba(0,0,0,0.18)" }}
            >
              {queue.length}
            </span>
          )}
        </button>
      )}

      <MobileQueueDrawer open={open} onClose={() => setOpen(false)} matches={[]} allowDesktop />
    </>
  );
}
