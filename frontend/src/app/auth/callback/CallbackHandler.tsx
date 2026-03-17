"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const TOKEN_KEY = "alpha_engine_token";
const USER_KEY  = "alpha_engine_user";
const COOKIE_KEY = "ae_token";

export function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token       = params.get("token");
    const userId      = params.get("user_id");
    const email       = params.get("email");
    const displayName = params.get("display_name") ?? null;

    if (!token || !userId || !email) {
      router.replace("/login?error=google_failed");
      return;
    }

    // Store exactly the same way as a normal login
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify({ userId, email, displayName, token }));
    document.cookie = `${COOKIE_KEY}=${token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;

    router.replace("/dashboard");
  }, [params, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
      <p className="text-sm text-white/50">Signing you in…</p>
    </div>
  );
}
