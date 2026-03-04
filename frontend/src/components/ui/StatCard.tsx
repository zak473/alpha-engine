import { cn, fmtDelta } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { KpiMetric } from "@/lib/types";

interface StatCardProps extends KpiMetric {
  compact?:   boolean;
  className?: string;
}

export function StatCard({ label, value, delta, compact = false, className }: StatCardProps) {
  const isPos = delta !== undefined && delta > 0;
  const isNeg = delta !== undefined && delta < 0;

  return (
    <div className={cn("stat-card", className)}>
      <p className="label" style={{ marginBottom: 6 }}>{label}</p>
      <p
        className="num"
        style={{
          fontSize:   compact ? 18 : 26,
          fontWeight: 600,
          color:      "var(--text0)",
          lineHeight: 1,
        }}
      >
        {value}
      </p>
      {delta !== undefined && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
          {isPos && <TrendingUp  size={10} style={{ color: "var(--positive)", flexShrink: 0 }} />}
          {isNeg && <TrendingDown size={10} style={{ color: "var(--negative)", flexShrink: 0 }} />}
          <span
            className="num"
            style={{
              fontSize: 11,
              color: isPos ? "var(--positive)" : isNeg ? "var(--negative)" : "var(--text1)",
            }}
          >
            {fmtDelta(delta)}
            {!compact && (
              <span style={{ color: "var(--text1)", marginLeft: 4 }}>vs prior</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
