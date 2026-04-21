import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "twv_session";

/**
 * Pages that must stay reachable without a session so users can actually
 * sign in or recover access. Everything else requires the session cookie.
 */
const PUBLIC_PAGES = new Set<string>([
  "/auth/signin",
  "/auth/signup",
  "/auth/forgot-password",
]);

function isStaticAsset(pathname: string): boolean {
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/static/")) return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  // Any path with a file extension (images, fonts, js, css bundled assets)
  if (/\.[a-z0-9]+$/i.test(pathname)) return true;
  return false;
}

/**
 * Presence-only check — we don't verify the JWT signature here because
 * jsonwebtoken doesn't work in Edge runtime. The API routes re-verify
 * via requireRole / readUserKey, so an invalid cookie still can't read
 * protected data. This gate is about routing users to the sign-in flow,
 * not about enforcing security (that's on the API layer).
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isStaticAsset(pathname)) return NextResponse.next();

  // Let API routes handle their own auth — they return proper JSON 401/403
  // and the client's AuthBootstrap clears stale localStorage on 401.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;
  const isPublicPage = PUBLIC_PAGES.has(pathname);

  // Already signed in on a sign-in/up page — send to dashboard so they don't
  // have to click through.
  if (hasSession && isPublicPage) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (isPublicPage) return NextResponse.next();
  if (hasSession) return NextResponse.next();

  // Not signed in, protected page → bounce to sign-in with a callback URL
  // so we can return them to what they were trying to reach.
  const signinUrl = new URL("/auth/signin", req.url);
  if (pathname !== "/") {
    signinUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
  }
  return NextResponse.redirect(signinUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
