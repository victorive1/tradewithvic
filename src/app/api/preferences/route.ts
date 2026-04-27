// Per-user preferences. AUTH-GATED — userId comes from the session
// cookie, never from the request body or query string.
//
// Pre-fix this route accepted `userId` from `searchParams` / body which
// meant any unauthenticated client could read or write any user's prefs
// (P0 cross-user leak found in the 2026-04-27 audit).
//
// The underlying store (`src/lib/store.ts`) is still in-memory and
// per-Lambda — that's a separate persistence ticket — but the auth gate
// here stops the leak immediately.

import { NextResponse } from "next/server";
import { getPreferences, savePreferences } from "@/lib/store";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ success: true, data: getPreferences(user.id) });
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const body = await req.json();
    // Drop any client-supplied userId — session is the source of truth.
    const { userId: _ignored, ...patch } = (body ?? {}) as Record<string, unknown>;
    void _ignored;
    const prefs = savePreferences(user.id, patch);
    return NextResponse.json({ success: true, data: prefs });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "save_failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
