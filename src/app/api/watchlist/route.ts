// User watchlist. AUTH-GATED — userId from session, never from the
// request. Pre-fix any unauthenticated client could read/modify any
// user's watchlist (P0 found in the 2026-04-27 audit).

import { NextResponse } from "next/server";
import { getWatchlist, addToWatchlist, removeFromWatchlist } from "@/lib/store";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ success: true, data: getWatchlist(user.id) });
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const body = await req.json();
    const symbol = typeof body?.symbol === "string" ? body.symbol.trim() : "";
    if (!symbol) return NextResponse.json({ error: "symbol_required" }, { status: 400 });
    const item = addToWatchlist(user.id, symbol);
    return NextResponse.json({ success: true, data: item });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "add_failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol_required" }, { status: 400 });
  removeFromWatchlist(user.id, symbol);
  return NextResponse.json({ success: true });
}
