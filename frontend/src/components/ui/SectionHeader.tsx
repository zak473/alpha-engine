import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({ title, subtitle, action, className }: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-surface-border pb-3 mb-4",
        className
      )}
    >
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        {subtitle && <span className="text-xs text-text-muted">{subtitle}</span>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
