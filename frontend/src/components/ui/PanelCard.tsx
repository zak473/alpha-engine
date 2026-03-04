import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PanelCardProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  /** "normal" = px-4 py-4 | "tight" = px-4 py-3 | "flush" = no padding (children control spacing) */
  padding?: "normal" | "tight" | "flush";
  className?: string;
}

export function PanelCard({
  title,
  subtitle,
  action,
  children,
  padding = "normal",
  className,
}: PanelCardProps) {
  return (
    <div className={cn("card", className)}>
      {title && (
        <div className="panel-header">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">{title}</p>
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0 ml-4">{action}</div>}
        </div>
      )}
      {padding === "normal" && <div className="panel-content">{children}</div>}
      {padding === "tight" && <div className="panel-content-tight">{children}</div>}
      {padding === "flush" && children}
    </div>
  );
}
