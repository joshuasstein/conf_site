import { NextResponse, type NextRequest } from "next/server";

// Auth protection is handled client-side by AuthProvider + layout redirects,
// since the refresh_token cookie is set on the API domain (not this domain)
// and is therefore invisible to this middleware.
export function middleware(request: NextRequest) {
  return NextResponse.next();
}
