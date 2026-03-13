"use client";

import { Bell, LogIn, Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSidebar } from "./SidebarContext";
import { useAuth } from "@/lib/auth";
import { getNotifications, getUnreadNotificationCount, markAllNotificationsRead, searchMatches, type SearchResult } from "@/lib/api";

const ENV = process.env.NEXT_PUBLIC_ENV ?? "development";
const ENV_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  production: { label: "PROD", color: "#86efac", bg: "rgba(134,239,172,0.10)" },
  staging: { label: "STAGE", color: "#93c5fd", bg: "rgba(147,197,253,0.10)" },
  development: { label: "DEV", color: "#6ee7b7", bg: "rgba(110,231,183,0.10)" },
};
const badge = ENV_BADGE[ENV] ?? ENV_BADGE.development;

function SearchBox({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback((q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    searchMatches(q, 8)
      .then((r) => {
        setResults(r);
        setOpen(r.length > 0);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full max-w-xl">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2.5 backdrop-blur transition focus-within:border-emerald-300/25 focus-within:bg-white/[0.07]">
        <Search size={15} className="text-white/45" />
        <input
          value={query}
          onChange={(e) => {
            const q = e.target.value;
            setQuery(q);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => doSearch(q), 260);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
            if (e.key === "Enter" && results.length > 0) {
              router.push(results[0].href);
              setOpen(false);
              setQuery("");
              onClose?.();
            }
          }}
          placeholder="Search matches, leagues, or teams"
          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/34"
        />
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-50 overflow-hidden rounded-[24px] border border-white/10 bg-[#0a1410] shadow-[0_24px_50px_rgba(0,0,0,0.35)]">
          {loading ? (
            <div className="px-4 py-4 text-sm text-white/54">Searching…</div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto p-2">
              {results.map((result) => (
                <button
                  key={result.href}
                  onClick={() => {
                    router.push(result.href);
                    setOpen(false);
                    setQuery("");
                    onClose?.();
                  }}
                  className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition hover:bg-white/[0.05]"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">{result.title}</div>
                    <div className="mt-1 text-xs text-white/45">{result.subtitle}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Array<{ title: string; message?: string | null; created_at: string; is_read: boolean }>>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getUnreadNotificationCount().then(setCount).catch(() => {});
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      const res = await getNotifications(10).catch(() => []);
      setItems(res);
      if (count > 0) {
        markAllNotificationsRead().catch(() => {});
        setCount(0);
      }
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={toggle}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/72 transition hover:bg-white/[0.08]"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {count > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,255,178,0.8)]" />}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[320px] overflow-hidden rounded-[24px] border border-white/10 bg-[#0a1410] shadow-[0_24px_50px_rgba(0,0,0,0.35)]">
          <div className="border-b border-white/8 px-4 py-3">
            <div className="text-sm font-semibold text-white">Notifications</div>
            <div className="text-xs text-white/42">Recent system and betting activity</div>
          </div>
          <div className="max-h-[380px] overflow-y-auto p-2">
            {items.length === 0 ? (
              <div className="px-3 py-4 text-sm text-white/48">Nothing new yet.</div>
            ) : (
              items.map((n, idx) => (
                <div key={`${n.title}-${idx}`} className="rounded-2xl px-3 py-3 hover:bg-white/[0.04]">
                  <div className="text-sm font-semibold text-white">{n.title}</div>
                  {n.message && <div className="mt-1 text-xs text-white/48">{n.message}</div>}
                  <div className="mt-2 text-[11px] text-white/34">
                    {new Date(n.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const { setOpen } = useSidebar();
  const { user, isLoggedIn, logout } = useAuth();
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-[74px] items-center gap-3 border-b border-white/8 bg-white/[0.04] px-4 backdrop-blur-xl lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/72 lg:hidden"
          onClick={() => setOpen(true)}
          aria-label="Open sidebar"
        >
          <Menu size={17} />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold tracking-[-0.03em] text-white sm:text-lg">{title}</h1>
            <span className="hidden rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] sm:inline-flex" style={{ color: badge.color, background: badge.bg, border: `1px solid ${badge.color}26` }}>
              {badge.label}
            </span>
          </div>
          {subtitle && <p className="truncate text-xs text-white/42">{subtitle}</p>}
        </div>
      </div>

      <div className="hidden flex-1 justify-center md:flex">
        <SearchBox />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setShowMobileSearch((v) => !v)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/72 md:hidden"
          aria-label="Search"
        >
          {showMobileSearch ? <X size={16} /> : <Search size={16} />}
        </button>

        <NotificationsMenu />

        {isLoggedIn ? (
          <button
            onClick={logout}
            className="hidden rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/[0.08] sm:inline-flex"
          >
            {user ? `Logout · ${user.displayName ?? user.email}` : "Logout"}
          </button>
        ) : (
          <Link href="/login" className="hidden items-center gap-2 rounded-full bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-[#08120e] sm:inline-flex">
            <LogIn size={15} />
            Login
          </Link>
        )}
      </div>

      {showMobileSearch && (
        <div className="absolute left-0 right-0 top-[74px] z-40 border-b border-white/8 bg-white/[0.06] px-4 py-3 backdrop-blur-xl md:hidden">
          <SearchBox onClose={() => setShowMobileSearch(false)} />
        </div>
      )}
    </header>
  );
}
