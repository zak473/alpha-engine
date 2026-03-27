"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrainCircuit, LayoutDashboard, MessageSquare, TrendingUp } from "lucide-react";

const items = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Predictions", href: "/predictions", icon: BrainCircuit },
  { label: "Stats", href: "/performance", icon: TrendingUp },
  { label: "Advisor", href: "/advisor", icon: MessageSquare },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottomnav-panel lg:hidden">
      <div className="grid grid-cols-4 gap-1">
        {items.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`bottomnav-link ${active ? "bottomnav-link--active" : ""}`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
