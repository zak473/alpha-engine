import { NextRequest, NextResponse } from "next/server";

// Pages that do not require a login
const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/auth/callback"];

// Fully public pages (no auth or subscription check)
const PUBLIC_PAGES = ["/", "/pricing"];

// Requires login but NOT a subscription (the payment handoff page)
const SUB_EXEMPT_PAGES = ["/subscribe"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API routes: let the backend handle its own auth
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Public pages — always accessible
  if (PUBLIC_PAGES.includes(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get("ae_token")?.value;
  const isSubscribed = req.cookies.get("ae_sub")?.value === "1";

  const isAuthPage = AUTH_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  // Logged-in user hitting login/register → send to dashboard
  if (isAuthPage && token) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Not logged in → redirect to login
  if (!isAuthPage && !token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Logged in but no active subscription → redirect to subscribe
  const isSubExempt = SUB_EXEMPT_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (token && !isSubscribed && !isAuthPage && !isSubExempt) {
    return NextResponse.redirect(new URL("/subscribe", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
