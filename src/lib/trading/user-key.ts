import { NextRequest } from "next/server";

/**
 * Read the browser-set user key that fronts all per-user storage
 * until NextAuth is fully wired. Same pattern as billing.
 */
export function readUserKey(req: NextRequest): string | null {
  const k = req.headers.get("x-trading-user-key") ?? req.headers.get("x-billing-user-key");
  if (!k || k.length < 8) return null;
  return k;
}
