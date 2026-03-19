import { cn } from "@/lib/utils";
import { colors } from "@/lib/tokens";

type SemanticVariant = "muted" | "positive" | "negative" | "warning" | "info" | "accent";

interface BadgeProps {
  children: React.ReactNode;
  variant?: SemanticVariant;
  sport?: string;
  className?: string;
}

const variantClass: Record<SemanticVariant, string> = {
  muted:    "badge-muted",
  positive: "badge-positive",
  negative: "badge-negative",
  warning:  "badge-warning",
  info:     "badge-info",
  accent:   "badge-accent",
};

export function Badge({ children, sport, variant, className }: BadgeProps) {
  if (sport) {
    const colorMap: Record<string, string> = {
      soccer:     colors.soccer,
      tennis:     colors.tennis,
      esports:    colors.esports,
      basketball: colors.basketball,
      baseball:   colors.baseball,
      hockey:     colors.hockey,
      horseracing: colors.horseracing,
    };
    const color = colorMap[sport.toLowerCase()] ?? colors.text1;
    return (
      <span
        className={cn("badge", className)}
        style={{
          backgroundColor: `${color}1a`,
          color,
          borderColor: `${color}30`,
        }}
      >
        {children}
      </span>
    );
  }

  return (
    <span className={cn("badge", variant ? variantClass[variant] : variantClass.muted, className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    scheduled: { label: "Scheduled", color: colors.info     },
    live:      { label: "Live",      color: colors.positive },
    finished:  { label: "Finished",  color: colors.text1    },
    cancelled: { label: "Void",      color: colors.negative },
  };
  const { label, color } = map[status] ?? { label: status, color: colors.text1 };
  return (
    <span
      className="badge"
      style={{
        backgroundColor: `${color}1a`,
        color,
        borderColor: `${color}30`,
      }}
    >
      {status === "live" && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: color, animation: "ping 1s cubic-bezier(0,0,0.2,1) infinite" }}
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
  if (!outcome) return <span style={{ color: colors.text1, fontSize: 11 }}>—</span>;
  const map: Record<string, { label: string; variant: SemanticVariant }> = {
    home_win: { label: "Home Win", variant: "positive" },
    away_win: { label: "Away Win", variant: "negative" },
    draw:     { label: "Draw",     variant: "warning"  },
  };
  const { label, variant } = map[outcome] ?? { label: outcome, variant: "muted" as const };
  return <Badge variant={variant}>{label}</Badge>;
}
