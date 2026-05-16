import { NextResponse, type NextRequest } from "next/server";

// Paths that are always public (no auth redirect)
const PUBLIC_PATHS = ["/login", "/register", "/program"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public paths and Next.js internals
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Check for auth via httpOnly refresh cookie.
  // The actual token validation is done client-side via /auth/refresh on load.
  // Common cookie names used by FastAPI/Python auth libs:
  const hasSession =
    request.cookies.has("refresh_token") ||
    request.cookies.has("session") ||
    request.cookies.has("access_token");

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*$).*)",
  ],
};
