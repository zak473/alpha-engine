import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] px-6 py-14 text-center shadow-[0_20px_48px_rgba(0,0,0,0.18)]", className)}>
      {Icon && (
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/14 bg-emerald-300/10 text-emerald-300">
          <Icon size={22} strokeWidth={1.6} />
        </div>
      )}
      <p className="text-sm font-semibold text-white">{title}</p>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-6 text-white/52">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
