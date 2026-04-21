import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "innov8-crm-default-secret-change-me"
);

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/setup", "/api/webhook/gmail", "/api/webhook/prospects", "/api/invoices/auto"];

// In-memory cache for verified JWTs. Cold-start safe (cache resets on new lambda).
// 60s TTL — short enough that revocation via logout still takes effect quickly.
const tokenCache = new Map<string, number>();
const TOKEN_TTL_MS = 60_000;
// Bound cache size so a bot/attacker can't balloon memory
const MAX_CACHE_SIZE = 500;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.endsWith(".svg") || pathname.endsWith(".png")) {
    return NextResponse.next();
  }

  // Check session cookie
  const token = request.cookies.get("innov8_session")?.value;
  if (!token) {
    // Redirect to login for pages, return 401 for API
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    // Check cache first — jwtVerify is expensive (~30ms per call in Edge runtime)
    const cachedExpiry = tokenCache.get(token);
    if (cachedExpiry && cachedExpiry > Date.now()) {
      return NextResponse.next();
    }
    await jwtVerify(token, SECRET);
    // Trim cache if it's getting too big
    if (tokenCache.size >= MAX_CACHE_SIZE) {
      const now = Date.now();
      for (const [k, exp] of tokenCache) {
        if (exp < now) tokenCache.delete(k);
      }
      // If still too big after trimming expired, drop oldest half
      if (tokenCache.size >= MAX_CACHE_SIZE) {
        const keys = Array.from(tokenCache.keys()).slice(0, MAX_CACHE_SIZE / 2);
        for (const k of keys) tokenCache.delete(k);
      }
    }
    tokenCache.set(token, Date.now() + TOKEN_TTL_MS);
    return NextResponse.next();
  } catch {
    tokenCache.delete(token);
    // Invalid token — clear it and redirect
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Session expired" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("innov8_session");
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
