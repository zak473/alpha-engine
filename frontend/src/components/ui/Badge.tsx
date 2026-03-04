import { cn, sportColor } from "@/lib/utils";

type SemanticVariant = "muted" | "positive" | "negative" | "warning";

interface BadgeProps {
  children: React.ReactNode;
  variant?: SemanticVariant;
  sport?: string;
  className?: string;
}

const variantClasses: Record<SemanticVariant, string> = {
  muted:    "text-text-muted bg-white/[0.04] border border-white/[0.06]",
  positive: "text-accent-green bg-accent-green/10 border border-accent-green/20",
  negative: "text-accent-red bg-accent-red/10 border border-accent-red/20",
  warning:  "text-accent-amber bg-accent-amber/10 border border-accent-amber/20",
};

const baseClasses =
  "inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium uppercase tracking-wide";

/** Sport badge — dynamic color via inline style (required for runtime color values) */
export function Badge({ children, sport, variant, className }: BadgeProps) {
  if (sport) {
    const color = sportColor(sport);
    return (
      <span
        className={cn(baseClasses, className)}
        style={{
          backgroundColor: `${color}18`,
          color,
          border: `1px solid ${color}30`,
        }}
      >
        {children}
      </span>
    );
  }

  return (
    <span className={cn(baseClasses, variant ? variantClasses[variant] : variantClasses.muted, className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    scheduled: { label: "Upcoming", color: "#3b82f6" },
    live:      { label: "Live",     color: "#22c55e" },
    finished:  { label: "Finished", color: "#71717a" },
    cancelled: { label: "Void",     color: "#ef4444" },
  };
  const { label, color } = map[status] ?? { label: status, color: "#71717a" };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-2xs font-medium"
      style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}30` }}
    >
      {status === "live" && (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: color }}
          />
          <span
            className="relative inline-flex rounded-full h-1.5 w-1.5"
            style={{ backgroundColor: color }}
          />
        </span>
      )}
      {label}
    </span>
  );
}

export function OutcomeBadge({ outcome }: { outcome?: string }) {
  if (!outcome) return <span className="text-text-muted text-xs">—</span>;
  const map: Record<string, { label: string; color: string }> = {
    home_win: { label: "Home Win", color: "#22c55e" },
    away_win: { label: "Away Win", color: "#ef4444" },
    draw:     { label: "Draw",     color: "#f59e0b" },
  };
  const { label, color } = map[outcome] ?? { label: outcome, color: "#71717a" };
  return (
    <span className="text-xs font-medium" style={{ color }}>
      {label}
    </span>
  );
}
