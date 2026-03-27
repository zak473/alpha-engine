"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, X, ArrowRight } from "lucide-react";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

const links = [
  { label: "Platform", href: "#platform" },
  { label: "Sports", href: "#sports" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export function Navbar() {
  const [solid, setSolid] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className={clsx(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300",
          solid ? "border-b border-nid-border bg-[rgba(5,8,17,0.78)] backdrop-blur-2xl" : "bg-transparent"
        )}
      >
        <div className="site-container flex h-[76px] items-center justify-between xl:h-20">
          <Link href="/" className="flex items-center">
            <Image src="/nidmainlogo.png" alt="Never In Doubt" width={160} height={44} className="h-28 w-auto [filter:invert(1)_hue-rotate(180deg)]" priority />
          </Link>

          <nav className="hidden items-center gap-8 lg:flex">
            {links.map((link, index) => (
              <a
                key={link.href}
                href={link.href}
                className="text-[13px] font-semibold tracking-[0.04em] text-nid-textMute transition-colors hover:text-nid-text"
              >
                <span className="mr-2 text-[10px] text-nid-textMute/60">0{index + 1}</span>
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <div className="eyebrow !min-h-[32px] !px-3 !text-[10px]">
              <span className="live-dot" />
              Models live
            </div>
            <Link href="/login" className="btn-secondary">
              Log in
            </Link>
            <Link href="/register" className="btn-primary">
              Sign up
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-nid-border bg-[rgba(255,255,255,0.04)] lg:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </motion.header>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-[rgba(5,8,17,0.94)] backdrop-blur-xl lg:hidden"
            style={{ top: 76 }}
          >
            <motion.nav
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="site-container flex flex-col gap-2 py-8"
            >
              {links.map((link, index) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 + 0.06 }}
                  className="flex min-h-[56px] items-center justify-between rounded-2xl border border-nid-border bg-[rgba(255,255,255,0.04)] px-4 text-[17px] font-semibold text-nid-text"
                >
                  <span>{link.label}</span>
                  <span className="section-kicker">0{index + 1}</span>
                </motion.a>
              ))}

              <div className="mt-5 grid grid-cols-1 gap-3">
                <Link href="/register" onClick={() => setMobileOpen(false)} className="btn-primary btn-primary-lg w-full">
                  Sign up
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/login" onClick={() => setMobileOpen(false)} className="btn-secondary btn-secondary-lg w-full">
                  Log in
                </Link>
              </div>
            </motion.nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
