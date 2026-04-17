import { NextResponse } from "next/server";
import { getWatchlist, addToWatchlist, removeFromWatchlist } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || "default";
  return NextResponse.json({ success: true, data: getWatchlist(userId) });
}

export async function POST(req: Request) {
  try {
    const { userId = "default", symbol } = await req.json();
    if (!symbol) return NextResponse.json({ error: "Symbol required" }, { status: 400 });
    const item = addToWatchlist(userId, symbol);
    return NextResponse.json({ success: true, data: item });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || "default";
  const symbol = searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "Symbol required" }, { status: 400 });
  removeFromWatchlist(userId, symbol);
  return NextResponse.json({ success: true });
}
