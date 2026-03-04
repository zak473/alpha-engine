"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";

/* ─── NavTabs — Link-based (sport filter, keeps SSR prefetch) ─── */

interface NavTabItem {
  label: string;
  href: string;
  active: boolean;
}

interface NavTabsProps {
  items: NavTabItem[];
  className?: string;
}

export function NavTabs({ items, className }: NavTabsProps) {
  return (
    <div className={cn("tab-underline-root", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="tab-underline-item"
          data-active={item.active ? "true" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

/* ─── StateTabs — Button-based (time range, purely local state) ─── */

interface StateTabItem<T extends string = string> {
  label: string;
  value: T;
}

interface StateTabsProps<T extends string = string> {
  items: StateTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function StateTabs<T extends string = string>({
  items,
  value,
  onChange,
  className,
}: StateTabsProps<T>) {
  return (
    <div className={cn("tab-underline-root", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className="tab-underline-item"
          data-active={item.value === value ? "true" : undefined}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
