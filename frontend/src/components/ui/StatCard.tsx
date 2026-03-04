import { cn, fmtDelta } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { KpiMetric } from "@/lib/types";

interface StatCardProps extends KpiMetric {
  compact?: boolean;
  className?: string;
}

export function StatCard({ label, value, delta, compact = false, className }: StatCardProps) {
  const isPositive = delta !== undefined && delta > 0;
  const isNegative = delta !== undefined && delta < 0;

  return (
    <div className={cn("card px-4 py-4", className)}>
      <p className="label mb-1.5">{label}</p>
      {compact ? (
        <p className="text-lg font-semibold num text-text-primary">{value}</p>
      ) : (
        <p className="text-2xl font-semibold num text-text-primary">{value}</p>
      )}
      {delta !== undefined && compact && (
        <div className="flex items-center gap-1 mt-0.5">
          {isPositive ? (
            <TrendingUp size={10} className="text-accent-green shrink-0" />
          ) : isNegative ? (
            <TrendingDown size={10} className="text-accent-red shrink-0" />
          ) : null}
          <span
            className={cn(
              "text-xs num",
              isPositive && "text-accent-green",
              isNegative && "text-accent-red",
              !isPositive && !isNegative && "text-text-muted"
            )}
          >
            {fmtDelta(delta)}
          </span>
        </div>
      )}
      {delta !== undefined && !compact && (
        <p
          className={cn(
            "text-xs num mt-1",
            isPositive && "text-accent-green",
            isNegative && "text-accent-red",
            !isPositive && !isNegative && "text-text-muted"
          )}
        >
          {fmtDelta(delta)}
          <span className="text-text-muted ml-1">vs last period</span>
        </p>
      )}
    </div>
  );
}
