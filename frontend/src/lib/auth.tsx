"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

interface AuthUser {
  userId: string;
  email: string;
  displayName: string | null;
  token: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoggedIn: boolean;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "alpha_engine_token";
const USER_KEY = "alpha_engine_user";
const COOKIE_KEY = "ae_token";

function setCookie(value: string) {
  document.cookie = `${COOKIE_KEY}=${value}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

function clearCookie() {
  document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; SameSite=Lax`;
}

export function setSubCookie() {
  document.cookie = `ae_sub=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

export function clearSubCookie() {
  document.cookie = `ae_sub=; path=/; max-age=0; SameSite=Lax`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      if (stored) setUser(JSON.parse(stored));
    } catch {
      // ignore
    } finally {
      setIsReady(true);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/v1/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(err.detail ?? "Login failed");
    }
    const data = await res.json();
    const authUser: AuthUser = {
      userId: data.user_id,
      email: data.email,
      displayName: data.display_name ?? null,
      token: data.access_token,
    };
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(authUser));
    setCookie(data.access_token);
    setUser(authUser);

    // Set subscription cookie if active so middleware can gate protected routes
    try {
      const statusRes = await fetch("/api/v1/billing/status", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      if (statusRes.ok) {
        const { is_active } = await statusRes.json();
        if (is_active) setSubCookie();
      }
    } catch {
      // non-fatal — middleware will redirect to /subscribe if cookie missing
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    clearCookie();
    clearSubCookie();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, isReady, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Returns the stored JWT token (for attaching to API requests). */
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Read ae_token cookie — usable in Next.js server components via `cookies()`. */
export function getTokenFromCookieHeader(cookieHeader: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|; *)${COOKIE_KEY}=([^;]+)`));
  return match ? match[1] : null;
}
