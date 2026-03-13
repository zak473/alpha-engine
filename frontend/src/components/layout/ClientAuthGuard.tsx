"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export function ClientAuthGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const hasToken = document.cookie
      .split(";")
      .some((c) => c.trim().startsWith("ae_token="));
    if (!hasToken) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [pathname, router]);

  return null;
}
