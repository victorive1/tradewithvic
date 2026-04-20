import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { ADMIN_BILLING_COOKIE } from "@/lib/billing/admin-auth";

export const dynamic = "force-dynamic";

/**
 * Verifies the admin token and sets an HttpOnly cookie so the admin can operate
 * the billing console without embedding the secret in every client request.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_REFRESH_SECRET;
  if (!secret) return NextResponse.json({ error: "admin_not_configured" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : null;
  if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_BILLING_COOKIE, secret, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 2, // 2 hours — short TTL limits cookie-theft blast radius
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_BILLING_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return res;
}
