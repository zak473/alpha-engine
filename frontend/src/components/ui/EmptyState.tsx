import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface EmptyStateProps {
  title:        string;
  description?: string;
  icon?:        LucideIcon;
  action?:      ReactNode;
  className?:   string;
}

export function EmptyState({ title, description, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center py-16 px-6 text-center", className)}
    >
      {Icon && (
        <div style={{ color: "var(--text2)", marginBottom: 12 }}>
          <Icon size={28} strokeWidth={1.5} />
        </div>
      )}
      <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text1)" }}>{title}</p>
      {description && (
        <p style={{ fontSize: 11, color: "var(--text2)", marginTop: 4, maxWidth: 280 }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
