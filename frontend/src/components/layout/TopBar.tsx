"use client";

import Image from "next/image";
import { Bell, Menu, Search, LogIn, TrendingUp, Swords, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import { useSidebar } from "./SidebarContext";
import { useAuth } from "@/lib/auth";
import { searchMatches, type SearchResult, getNotifications, getUnreadNotificationCount, markAllNotificationsRead } from "@/lib/api";

const ENV = process.env.NEXT_PUBLIC_ENV ?? "development";
const ENV_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  production: { label: "PROD", color: "#16a34a", bg: "rgba(22,163,74,0.10)" },
  staging: { label: "STAGE", color: "#2563eb", bg: "rgba(37,99,235,0.10)" },
  development: { label: "DEV", color: "#1d9a4d", bg: "rgba(29,154,77,0.10)" },
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
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    searchMatches(q, 8)
      .then((r) => { setResults(r); setOpen(r.length > 0); })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 280);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); setQuery(""); }
    if (e.key === "Enter" && results.length > 0) {
      router.push(results[0].href);
      setOpen(false); setQuery(""); onClose?.();
    }
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative w-[280px]">
      <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: loading ? "var(--accent)" : "var(--text2)", pointerEvents: "none", transition: "color 0.15s" }} />
      <input
        type="search"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search teams or matches…"
        className="input-field"
        style={{ paddingLeft: 30, fontSize: 12 }}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 rounded-xl border overflow-hidden shadow-lg z-50"
          style={{ background: "#fff", borderColor: "var(--border0)", boxShadow: "0 8px 32px rgba(0,0,0,0.10)" }}
        >
          {results.map((r) => (
            <Link
              key={r.id}
              href={r.href}
              onClick={() => { setOpen(false); setQuery(""); onClose?.(); }}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg2)] transition-colors"
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={{ background: r.type === "match" ? "rgba(31,208,106,0.10)" : "rgba(96,165,250,0.10)" }}
              >
                {r.type === "match" ? <Swords size={13} style={{ color: "var(--positive)" }} /> : <TrendingUp size={13} style={{ color: "#60a5fa" }} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-text-primary">{r.title}</p>
                <p className="truncate text-[10px] text-text-muted">{r.subtitle}</p>
              </div>
              {r.status && (
                <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                  style={r.status === "live"
                    ? { background: "rgba(34,197,94,0.15)", color: "var(--positive)" }
                    : { background: "var(--bg2)", color: "var(--text1)" }
                  }
                >
                  {r.status === "scheduled" ? "upcoming" : r.status}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const { isLoggedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<import("@/lib/api").Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    getNotifications(20).then(setNotifications).catch(() => {});
    getUnreadNotificationCount().then(setUnread).catch(() => {});
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const id = setInterval(() => {
      getUnreadNotificationCount().then(setUnread).catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !open) return;
    getNotifications(20).then(setNotifications).catch(() => {});
  }, [open, isLoggedIn]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleMarkAll() {
    await markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnread(0);
  }

  if (!isLoggedIn) return null;

  return (
    <div ref={wrapRef} className="relative hidden sm:block">
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14, border: "1px solid var(--border0)", background: "#fff", color: "var(--text1)", position: "relative" }}
        aria-label="Notifications"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ background: "var(--positive)", minWidth: 16 }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl border overflow-hidden shadow-xl z-50"
          style={{ background: "#fff", borderColor: "var(--border0)" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border0)" }}>
            <p className="text-xs font-bold text-text-primary">Notifications</p>
            {unread > 0 && (
              <button onClick={handleMarkAll} className="text-[10px] font-semibold" style={{ color: "var(--accent)" }}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-center py-8 text-sm text-text-muted">No notifications yet</p>
            ) : (
              notifications.map(n => (
                <div key={n.id}
                  className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-[var(--bg2)] transition-colors"
                  style={{ borderColor: "var(--border0)", background: n.is_read ? "transparent" : "rgba(34,226,131,0.04)" }}>
                  <div className="mt-0.5 h-2 w-2 rounded-full shrink-0" style={{ background: n.is_read ? "transparent" : "var(--positive)" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text-primary leading-tight">{n.title}</p>
                    {n.message && <p className="text-[11px] text-text-muted mt-0.5">{n.message}</p>}
                    <p className="text-[10px] text-text-subtle mt-1">{new Date(n.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
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

interface TopBarProps { title: string; subtitle?: string; }

export function TopBar({ title, subtitle }: TopBarProps) {
  const { setOpen } = useSidebar();
  const { user, isLoggedIn, logout } = useAuth();
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  return (
    <header style={{ height: "64px", display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1px solid var(--border0)", background: "rgba(246,248,244,0.94)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", position: "sticky", top: 0, zIndex: 30, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <button className="lg:hidden" onClick={() => setOpen(true)} style={{ padding: "6px", borderRadius: 12, color: "var(--text1)", background: "#fff", border: "1px solid var(--border0)", cursor: "pointer", display: "flex", alignItems: "center" }} aria-label="Open sidebar">
          <Menu size={16} />
        </button>

        <div className="hidden sm:flex items-center gap-3 rounded-2xl border px-3 py-2" style={{ borderColor: "var(--border0)", background: "#fff" }}>
          <div className="overflow-hidden rounded-xl border p-1.5" style={{ borderColor: "var(--border0)", background: "var(--bg0)" }}>
            <Image src="/never-in-doubt-logo.png" alt="Never In Doubt logo" width={96} height={48} className="h-8 w-auto" />
          </div>
          <div className="hidden md:block">
            <div className="text-[10px] uppercase tracking-[0.22em] text-text-subtle">Never In Doubt</div>
            <div className="text-xs font-medium text-text-primary">Premium board</div>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 15, fontWeight: 700, color: "var(--text0)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>{title}</h1>
            <span className="hidden sm:inline-flex" style={{ padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: badge.color, background: badge.bg, border: `1px solid ${badge.color}25` }}>{badge.label}</span>
          </div>
          {subtitle && <p style={{ fontSize: 11, color: "var(--text1)", marginTop: 2 }}>{subtitle}</p>}
        </div>
      </div>

      <div className="hidden md:flex" style={{ justifyContent: "center" }}>
        <SearchBox />
      </div>
      {/* Mobile search overlay */}
      {showMobileSearch && (
        <div className="md:hidden absolute left-0 right-0 top-[64px] z-40 border-b px-4 py-3 flex items-center gap-2"
          style={{ background: "rgba(246,248,244,0.98)", backdropFilter: "blur(18px)", borderColor: "var(--border0)" }}>
          <div className="flex-1">
            <SearchBox onClose={() => setShowMobileSearch(false)} />
          </div>
          <button onClick={() => setShowMobileSearch(false)} className="shrink-0 p-1.5 rounded-lg text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
        <button
          className="flex md:hidden"
          onClick={() => setShowMobileSearch(v => !v)}
          style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 14, border: "1px solid var(--border0)", background: "#fff", color: "var(--text1)" }}
          aria-label="Search"
        >
          <Search size={15} />
        </button>
        <NotificationBell />

        {isLoggedIn && user ? (
          <div className="flex items-center gap-2 rounded-2xl border px-2 py-1.5" style={{ borderColor: "var(--border0)", background: "#fff" }}>
            <Link href="/profile" style={{ width: 32, height: 32, borderRadius: 12, background: "rgba(46,219,108,0.10)", border: "1px solid rgba(46,219,108,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--positive)", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", textDecoration: "none" }}>
              {(user.displayName ?? user.email).slice(0, 2).toUpperCase()}
            </Link>
            <div className="hidden sm:block leading-tight">
              <div className="text-[11px] font-semibold text-text-primary">{user.displayName ?? user.email}</div>
              <button onClick={logout} title="Click to log out" className="text-[10px] text-text-subtle hover:text-text-primary transition-colors" style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>Signed in</button>
            </div>
          </div>
        ) : (
          <Link href="/login" className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-[12px] font-semibold transition-colors hover:opacity-90" style={{ borderColor: "rgba(46,219,106,0.18)", background: "rgba(46,219,106,0.10)", color: "var(--positive)" }}>
            <LogIn size={14} /> Log in
          </Link>
        )}
      </div>
    </header>
  );
}
