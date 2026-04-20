import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

const ADMIN_COOKIE = "tradewithvic_admin_billing";
const ADMIN_HEADER = "x-admin-billing-token";

function safeEqual(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function isAdminBillingAuthorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_REFRESH_SECRET;
  if (!secret) return false;
  const header = req.headers.get(ADMIN_HEADER) ?? req.headers.get("authorization")?.replace("Bearer ", "") ?? null;
  if (safeEqual(header, secret)) return true;
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  return safeEqual(cookie, secret);
}

export const ADMIN_BILLING_COOKIE = ADMIN_COOKIE;
export const ADMIN_BILLING_HEADER = ADMIN_HEADER;
