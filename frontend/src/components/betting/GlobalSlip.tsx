"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { useBetting } from "./BettingContext";
import { MobileQueueDrawer } from "./MobileQueueDrawer";

const HIDDEN_ROUTES = ["/", "/login", "/register", "/forgot-password", "/pricing", "/subscribe"];

export function GlobalSlip() {
  const pathname = usePathname();
  const { queue } = useBetting();
  const [open, setOpen] = useState(false);
  const hasQueue = queue.length > 0;
  const shouldHide = HIDDEN_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (shouldHide || !hasQueue) {
    return null;
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-full px-5 py-3 text-sm font-bold shadow-xl transition-all hover:scale-[1.01] lg:hidden"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.4rem)",
            background: "#22e283",
            color: "#07110d",
            boxShadow: "0 12px 28px rgba(34,226,131,0.35)",
          }}
          aria-label={`Open betting slip with ${queue.length} pick${queue.length === 1 ? "" : "s"}`}
        >
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black"
            style={{ background: "rgba(0,0,0,0.18)" }}
          >
            {queue.length}
          </span>
          Open slip
        </button>
      )}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-30 hidden items-center gap-2.5 rounded-full px-4 py-3 text-sm font-bold shadow-xl transition-all hover:-translate-y-0.5 lg:flex"
          style={{
            background: "#22e283",
            color: "#07110d",
            boxShadow: "0 12px 28px rgba(34,226,131,0.35)",
          }}
          aria-label={`Open betting slip with ${queue.length} pick${queue.length === 1 ? "" : "s"}`}
        >
          <TrendingUp size={15} />
          <span>Slip</span>
          <span
            className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-black"
            style={{ background: "rgba(0,0,0,0.18)" }}
          >
            {queue.length}
          </span>
        </button>
      )}

      <MobileQueueDrawer open={open} onClose={() => setOpen(false)} matches={[]} allowDesktop />
    </>
  );
}
