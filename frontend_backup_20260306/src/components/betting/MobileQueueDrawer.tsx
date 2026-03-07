"use client";

import { useState } from "react";
import { ShoppingBag, X } from "lucide-react";
import { useBetting } from "./BettingContext";
import { cn } from "@/lib/utils";
import { QueueRail } from "./QueueRail";
import type { BettingMatch } from "@/lib/betting-types";

interface MobileQueueDrawerProps {
  matches: BettingMatch[];
}

export function MobileQueueDrawer({ matches }: MobileQueueDrawerProps) {
  const { queue } = useBetting();
  const [open, setOpen] = useState(false);

  if (queue.length === 0 && !open) return null;

  return (
    <>
      {/* Floating queue pill — sits just above bottom nav */}
      {!open && queue.length > 0 && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-16 right-4 z-40 lg:hidden flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg border transition-all"
          style={{
            background:  "var(--accent-dim)",
            borderColor: "rgba(34,211,238,0.4)",
            color:       "var(--accent)",
          }}
        >
          <ShoppingBag size={15} />
          <span className="text-sm font-semibold">{queue.length} in queue</span>
        </button>
      )}

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer — slides up from bottom */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 lg:hidden transition-transform duration-300 rounded-t-2xl overflow-hidden",
          open ? "translate-y-0" : "translate-y-full"
        )}
        style={{
          maxHeight: "80vh",
          background: "rgba(10,10,28,0.98)",
          border: "1px solid var(--border0)",
          borderBottom: "none",
        }}
      >
        {/* Handle + header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: "var(--border0)" }}
        >
          <div className="w-8 h-1 rounded-full bg-white/20 absolute left-1/2 -translate-x-1/2 top-2" />
          <p className="text-sm font-semibold text-text-primary">Queue</p>
          <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable queue content — reuses QueueRail internals */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(80vh - 48px)" }}>
          <QueueRail matches={matches} />
        </div>
      </div>
    </>
  );
}
