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
      className={cn(
        "mx-auto flex max-w-xl flex-col items-center justify-center rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] px-6 py-16 text-center shadow-[0_20px_50px_rgba(0,0,0,0.18)]",
        className
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-300/16 bg-emerald-300/8 text-emerald-200">
          <Icon size={24} strokeWidth={1.5} />
        </div>
      )}
      <p className="text-base font-semibold text-text-primary">{title}</p>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
