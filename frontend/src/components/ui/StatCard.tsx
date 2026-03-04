import { cn, fmtDelta } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { KpiMetric } from "@/lib/types";

interface StatCardProps extends KpiMetric {
  compact?:   boolean;
  className?: string;
  /** Show the big number with gradient coloring */
  colorValue?: "positive" | "negative" | "neutral";
}

export function StatCard({ label, value, delta, compact = false, className, colorValue }: StatCardProps) {
  const isPos = delta !== undefined && delta > 0;
  const isNeg = delta !== undefined && delta < 0;

  const valueClass =
    colorValue === "positive" ? "metric-positive" :
    colorValue === "negative" ? "metric-negative" :
    "metric-hero";

  return (
    <div
      className={cn("stat-card", className)}
      style={{ cursor: "default" }}
    >
      <p className="label" style={{ marginBottom: 8 }}>{label}</p>
      <p
        className={compact ? `num` : valueClass}
        style={{
          fontSize:   compact ? 18 : 28,
          lineHeight: 1,
          display:    "block",
          ...(compact ? { fontWeight: 700, color: "var(--text0)" } : {}),
        }}
      >
        {value}
      </p>
      {delta !== undefined && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
          {isPos && <TrendingUp  size={9} style={{ color: "var(--positive)", flexShrink: 0 }} />}
          {isNeg && <TrendingDown size={9} style={{ color: "var(--negative)", flexShrink: 0 }} />}
          <span className="num" style={{
            fontSize: 10,
            color: isPos ? "var(--positive)" : isNeg ? "var(--negative)" : "var(--text2)",
          }}>
            {fmtDelta(delta)}
            {!compact && <span style={{ color: "var(--text2)", marginLeft: 4 }}>vs prior</span>}
          </span>
        </div>
      )}
    </div>
  );
}
