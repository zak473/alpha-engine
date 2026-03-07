import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface TooltipProps {
  content:    ReactNode;
  children:   ReactNode;
  className?: string;
  position?:  "top" | "bottom" | "left" | "right";
}

/**
 * CSS-only tooltip — zero JS, zero dependencies.
 * Compact quant style: bg2, border1, mono values.
 */
export function Tooltip({ content, children, className, position = "top" }: TooltipProps) {
  const posClass = {
    top:    "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left:   "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right:  "left-full top-1/2 -translate-y-1/2 ml-1.5",
  }[position];

  return (
    <span className={cn("relative group/tt inline-flex", className)}>
      {children}
      <span
        className={cn("absolute z-50 pointer-events-none", posClass)}
        style={{
          background:   "var(--bg2)",
          border:       "1px solid var(--border1)",
          borderRadius: "var(--radius-md)",
          padding:      "4px 8px",
          fontSize:     11,
          fontFamily:   "'JetBrains Mono', monospace",
          color:        "var(--text0)",
          whiteSpace:   "nowrap",
          boxShadow:    "0 2px 8px rgba(0,0,0,0.5)",
          opacity:      0,
          transition:   "opacity 120ms",
        }}
        // CSS: group-hover makes this visible
      />
      <span
        className={cn(
          "absolute z-50 pointer-events-none whitespace-nowrap",
          "opacity-0 group-hover/tt:opacity-100 transition-opacity duration-100",
          posClass
        )}
        style={{
          background:   "var(--bg2)",
          border:       "1px solid var(--border1)",
          borderRadius: "var(--radius-md)",
          padding:      "4px 8px",
          fontSize:     11,
          fontFamily:   "'JetBrains Mono', monospace",
          color:        "var(--text0)",
          boxShadow:    "0 2px 8px rgba(0,0,0,0.5)",
        }}
      >
        {content}
      </span>
    </span>
  );
}
