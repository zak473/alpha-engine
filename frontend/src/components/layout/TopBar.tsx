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
  production: { label: "PROD", color: "#2d7f4f", bg: "#f0faf4" },
  staging: { label: "STAGE", color: "#1d4ed8", bg: "#eff6ff" },
  development: { label: "DEV", color: "#2d7f4f", bg: "#f0faf4" },
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
      <div className="flex items-center gap-2 rounded-full border border-[#d9e2d7] bg-[#f7f8f5] px-3 py-2.5 transition focus-within:border-[#b8d4c0] focus-within:bg-white">
        <Search size={15} className="text-[#8a9488]" />
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
          className="w-full bg-transparent text-sm text-[#111315] outline-none placeholder:text-[#8a9488]"
        />
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-50 overflow-hidden rounded-[24px] border border-[#d9e2d7] bg-white shadow-[0_20px_40px_rgba(17,19,21,0.08)]">
          {loading ? <div className="px-4 py-4 text-sm text-[#667066]">Searching…</div> : (
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
                  className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition hover:bg-[#f7f8f5]"
                >
                  <div>
                    <div className="text-sm font-semibold text-[#111315]">{result.title}</div>
                    <div className="mt-1 text-xs text-[#667066]">{result.subtitle}</div>
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
      <button onClick={toggle} className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d9e2d7] bg-white text-[#667066] transition hover:bg-[#f7f8f5]" aria-label="Notifications">
        <Bell size={16} />
        {count > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#2edb6c]" />}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[320px] overflow-hidden rounded-[24px] border border-[#d9e2d7] bg-white shadow-[0_20px_40px_rgba(17,19,21,0.08)]">
          <div className="border-b border-[#edf2ea] px-4 py-3">
            <div className="text-sm font-semibold text-[#111315]">Notifications</div>
            <div className="text-xs text-[#667066]">Recent system and betting activity</div>
          </div>
          <div className="max-h-[380px] overflow-y-auto p-2">
            {items.length === 0 ? <div className="px-3 py-4 text-sm text-[#667066]">Nothing new yet.</div> : items.map((n, idx) => (
              <div key={`${n.title}-${idx}`} className="rounded-2xl px-3 py-3 hover:bg-[#f7f8f5]">
                <div className="text-sm font-semibold text-[#111315]">{n.title}</div>
                {n.message && <div className="mt-1 text-xs text-[#667066]">{n.message}</div>}
                <div className="mt-2 text-[11px] text-[#8a9488]">{new Date(n.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            ))}
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
    <header className="sticky top-0 z-30 flex h-[74px] items-center gap-3 border-b border-[#d9e2d7] bg-[rgba(244,248,242,0.88)] px-4 backdrop-blur-xl lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d9e2d7] bg-white text-[#667066] lg:hidden" onClick={() => setOpen(true)} aria-label="Open sidebar">
          <Menu size={17} />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold tracking-[-0.03em] text-[#111315] sm:text-lg">{title}</h1>
            <span className="hidden rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] sm:inline-flex" style={{ color: badge.color, background: badge.bg, border: `1px solid ${badge.color}22` }}>{badge.label}</span>
          </div>
          {subtitle && <p className="truncate text-xs text-[#667066]">{subtitle}</p>}
        </div>
      </div>

      <div className="hidden flex-1 justify-center md:flex"><SearchBox /></div>

      <div className="flex items-center justify-end gap-2">
        <button onClick={() => setShowMobileSearch((v) => !v)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d9e2d7] bg-white text-[#667066] md:hidden" aria-label="Search">
          {showMobileSearch ? <X size={16} /> : <Search size={16} />}
        </button>
        <NotificationsMenu />
        {isLoggedIn ? (
          <button onClick={logout} className="hidden rounded-full border border-[#d9e2d7] bg-white px-4 py-2.5 text-sm font-medium text-[#111315] transition hover:bg-[#f7f8f5] sm:inline-flex">
            {user ? `Logout · ${user.displayName ?? user.email}` : "Logout"}
          </button>
        ) : (
          <Link href="/login" className="hidden items-center gap-2 rounded-full bg-[#111315] px-4 py-2.5 text-sm font-semibold text-white sm:inline-flex">
            <LogIn size={15} />
            Login
          </Link>
        )}
      </div>

      {showMobileSearch && (
        <div className="absolute left-0 right-0 top-[74px] z-40 border-b border-[#d9e2d7] bg-[rgba(244,248,242,0.96)] px-4 py-3 backdrop-blur-xl md:hidden">
          <SearchBox onClose={() => setShowMobileSearch(false)} />
        </div>
      )}
    </header>
  );
}
