"use client";

import { motion } from "framer-motion";
import { fadeUp, viewport } from "@/lib/motion";
import Link from "next/link";

const links = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Dashboard", href: "/dashboard" },
];

export function Footer() {
  return (
    <motion.footer
      initial="hidden"
      whileInView="show"
      viewport={viewport}
      variants={fadeUp}
      className="border-t border-nid-border py-10 md:py-12"
    >
      <div className="site-container flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-4 md:max-w-[520px]">
          <div>
            <div className="brand-wordmark text-[32px] leading-none text-nid-text">Never In Doubt</div>
            <div className="section-kicker mt-1">Elite signal terminal / slides 8–13 system</div>
          </div>
          <p className="text-[13px] leading-7 text-nid-textMute">
            AI-powered sports intelligence designed to feel sharper, more premium, and more accountable from first impression to daily workflow.
          </p>
          <span className="text-[12px] text-nid-textMute">© {new Date().getFullYear()} Never In Doubt. All rights reserved.</span>
        </div>
        <div className="flex flex-wrap gap-6">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-[12px] font-semibold text-nid-textMute transition-colors hover:text-nid-text">
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </motion.footer>
  );
}
