import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
  className?: string;
  position?: "top" | "bottom";
}

/**
 * CSS-only tooltip using Tailwind group-hover. Zero JS — no dependencies.
 * Wraps trigger in a relative inline-flex container.
 */
export function Tooltip({ content, children, className, position = "top" }: TooltipProps) {
  return (
    <span className={cn("relative group inline-flex", className)}>
      {children}
      <span
        className={cn(
          "absolute left-1/2 -translate-x-1/2 z-50 whitespace-nowrap",
          "bg-surface-overlay border border-surface-border text-xs text-text-primary",
          "px-2 py-1 rounded pointer-events-none",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
          position === "top" ? "-top-8" : "top-full mt-1"
        )}
      >
        {content}
      </span>
    </span>
  );
}
