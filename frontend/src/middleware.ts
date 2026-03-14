import { NextRequest, NextResponse } from "next/server";

// Pages that do not require a login
const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/auth/callback"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API routes: let the backend handle its own auth (returns 401, not a redirect)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("ae_token")?.value;

  const isAuthPage = AUTH_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  // Logged-in user hitting login/register → send to dashboard
  if (isAuthPage && token) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Unauthenticated user hitting any other page → send to login
  if (!isAuthPage && !token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on every route except Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
