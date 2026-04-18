import { NextRequest } from "next/server";

const ADMIN_COOKIE = "tradewithvic_admin_billing";
const ADMIN_HEADER = "x-admin-billing-token";

export function isAdminBillingAuthorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_REFRESH_SECRET;
  if (!secret) return false;
  const header = req.headers.get(ADMIN_HEADER) ?? req.headers.get("authorization")?.replace("Bearer ", "") ?? null;
  if (header === secret) return true;
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  return cookie === secret;
}

export const ADMIN_BILLING_COOKIE = ADMIN_COOKIE;
export const ADMIN_BILLING_HEADER = ADMIN_HEADER;
