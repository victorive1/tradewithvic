import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { type AccessTag, type Role, hasAccess, normalizeRole } from "@/lib/auth/roles";

export const SESSION_COOKIE_NAME = "twv_session";
const SESSION_DAYS = 7;

function getSecret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "SESSION_SECRET is not set (must be at least 16 chars). Add it to .env.local and Vercel env.",
    );
  }
  return s;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

interface SessionPayload {
  sub: string;
  email: string;
  role: string;
}

export function signSession(user: SessionUser): string {
  const payload: SessionPayload = { sub: user.id, email: user.email, role: user.role };
  return jwt.sign(payload, getSecret(), { expiresIn: `${SESSION_DAYS}d` });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as SessionPayload;
    if (!decoded?.sub || !decoded?.email) return null;
    return decoded;
  } catch {
    return null;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE_NAME, token, cookieOptions());
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE_NAME, "", { ...cookieOptions(), maxAge: 0 });
}

export function readSessionFromRequest(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

/**
 * Server-side helper for server components, layouts, and route handlers
 * that don't have a NextRequest in hand. Joins the cookie with the User row.
 */
export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifySession(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, role: true },
  });
  return user;
}

/**
 * Role guard for API route handlers. Returns the authenticated user when
 * their role grants the requested access tag; otherwise returns a
 * NextResponse with the appropriate error code (401 unauthenticated,
 * 403 forbidden). Usage:
 *
 *   const gate = await requireRole(req, "admin");
 *   if (gate instanceof NextResponse) return gate;
 *   const user = gate;
 */
export async function requireRole(
  req: NextRequest,
  tag: AccessTag,
): Promise<SessionUser | NextResponse> {
  const payload = readSessionFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const role: Role = normalizeRole(payload.role);
  if (!hasAccess(role, tag)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 401 });
  }
  // Re-check against the DB row in case the role was revoked after the
  // session was issued — cookie still valid, but permissions changed.
  const dbRole: Role = normalizeRole(user.role);
  if (!hasAccess(dbRole, tag)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return user;
}
