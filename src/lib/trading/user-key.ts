import { NextRequest } from "next/server";
import { readSessionFromRequest } from "@/lib/auth/session";

/**
 * Resolve the user-scope key for trading/billing data. Order of preference:
 *   1. Signed session cookie (authoritative — set by /api/auth/register)
 *   2. Legacy x-trading-user-key header (client-sent, for transition)
 *
 * Returns null when the request is unauthenticated.
 */
export function readUserKey(req: NextRequest): string | null {
  const session = readSessionFromRequest(req);
  if (session?.email) {
    const email = session.email.trim().toLowerCase();
    if (email.length > 2) return `email:${email}`;
  }

  const header = req.headers.get("x-trading-user-key") ?? req.headers.get("x-billing-user-key");
  if (!header || header.length < 8) return null;
  return header;
}
