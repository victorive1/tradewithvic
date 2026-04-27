// Lazy Anthropic client — never reads ANTHROPIC_API_KEY at module-import time.
// Next.js 16's build-time "collect page data" phase imports route modules
// without running their handlers; if we instantiate at module scope and the
// key isn't visible during build, the build crashes before the runtime ever
// gets to use it. Mirrors the same lazy-Proxy pattern as src/lib/prisma.ts.
//
// Returns null when no key is configured so callers can degrade gracefully
// (fall back to a "configuration missing" message instead of a 500).

import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null | undefined;

export function getAnthropicClient(): Anthropic | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.length < 16) {
    cached = null;
    return null;
  }
  cached = new Anthropic({ apiKey });
  return cached;
}
