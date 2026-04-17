import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || "default";
    const items = await prisma.watchlist.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ success: true, data: items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId = "default", symbol } = await req.json();
    if (!symbol) return NextResponse.json({ error: "Symbol required" }, { status: 400 });

    const existing = await prisma.watchlist.findUnique({ where: { userId_symbol: { userId, symbol } } });
    if (existing) return NextResponse.json({ success: true, data: existing, message: "Already in watchlist" });

    const item = await prisma.watchlist.create({ data: { userId, symbol } });
    return NextResponse.json({ success: true, data: item });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || "default";
    const symbol = searchParams.get("symbol");
    if (!symbol) return NextResponse.json({ error: "Symbol required" }, { status: 400 });

    await prisma.watchlist.deleteMany({ where: { userId, symbol } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
