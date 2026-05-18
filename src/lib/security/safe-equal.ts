import { timingSafeEqual } from "crypto";

// Constant-time string compare. Use for any secret check (cron tokens,
// per-account webhook secrets, admin headers) so attackers can't recover
// the secret byte-by-byte from response timing.
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
