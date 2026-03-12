import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PanelCardProps {
  title?:    string;
  subtitle?: string;
  action?:   ReactNode;
  toolbar?:  ReactNode;   // sits below header, full-width slot for tabs/filters
  children:  ReactNode;
  /** "normal" = 12px pad | "tight" = 8px/12px | "flush" = no padding */
  padding?:  "normal" | "tight" | "flush";
  className?: string;
}

export function PanelCard({
  title,
  subtitle,
  action,
  toolbar,
  children,
  padding = "normal",
  className,
}: PanelCardProps) {
  return (
    <div className={cn("card", className)}>
      {(title || action) && (
        <div className="panel-header">
          <div className="min-w-0 flex-1">
            {title && <p className="panel-title">{title}</p>}
            {subtitle && (
              <p style={{ fontSize: 11, color: "var(--text1)", marginTop: 2 }}>{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0 ml-3">{action}</div>}
        </div>
      )}
      {toolbar && (
        <div style={{ borderBottom: "1px solid var(--border0)" }}>{toolbar}</div>
      )}
      {padding === "normal" && <div className="panel-content">{children}</div>}
      {padding === "tight"  && <div className="panel-content-tight">{children}</div>}
      {padding === "flush"  && children}
    </div>
  );
}
