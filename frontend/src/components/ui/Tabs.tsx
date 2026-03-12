"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";

/* ── NavTabs — Link-based (URL-driven navigation) ─────────────────────────── */

interface NavTabItem {
  label:   string;
  href:    string;
  active:  boolean;
  count?:  number;
}

interface NavTabsProps {
  items:      NavTabItem[];
  className?: string;
  style?:     "underline" | "segmented";
}

export function NavTabs({ items, className, style = "underline" }: NavTabsProps) {
  if (style === "segmented") {
    return (
      <div className={cn("tabs-segmented", className)}>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="tab-seg-item"
            data-active={item.active ? "true" : undefined}
          >
            {item.label}
            {item.count !== undefined && (
              <span style={{ color: "var(--text2)", marginLeft: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                {item.count}
              </span>
            )}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("tabs-underline", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="tab-item"
          data-active={item.active ? "true" : undefined}
        >
          {item.label}
          {item.count !== undefined && (
            <span style={{ color: "var(--text2)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
              {item.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

/* ── StateTabs — Button-based (local state, time ranges, etc.) ─────────────── */

interface StateTabItem<T extends string = string> {
  label:  string;
  value:  T;
  count?: number;
}

interface StateTabsProps<T extends string = string> {
  items:      StateTabItem<T>[];
  value:      T;
  onChange:   (value: T) => void;
  className?: string;
  style?:     "underline" | "segmented";
}

export function StateTabs<T extends string = string>({
  items,
  value,
  onChange,
  className,
  style = "underline",
}: StateTabsProps<T>) {
  if (style === "segmented") {
    return (
      <div className={cn("tabs-segmented", className)}>
        {items.map((item) => (
          <button
            key={item.value}
            onClick={() => onChange(item.value)}
            className="tab-seg-item"
            data-active={item.value === value ? "true" : undefined}
          >
            {item.label}
            {item.count !== undefined && (
              <span style={{ color: "var(--text2)", marginLeft: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                {item.count}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("tabs-underline", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className="tab-item"
          data-active={item.value === value ? "true" : undefined}
        >
          {item.label}
          {item.count !== undefined && (
            <span style={{ color: "var(--text2)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
