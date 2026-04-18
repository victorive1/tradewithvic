import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateProfile } from "@/lib/community/current-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_TYPES = new Set(["quick", "idea", "chart", "discussion"]);

export async function POST(req: NextRequest) {
  const me = await getOrCreateProfile(req);
  if (!me) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const type = ALLOWED_TYPES.has(body.type) ? body.type : "quick";
  const content = typeof body.body === "string" ? body.body.trim() : "";
  if (content.length === 0) return NextResponse.json({ error: "empty_body" }, { status: 400 });
  if (content.length > 4000) return NextResponse.json({ error: "body_too_long" }, { status: 400 });

  const instrumentSymbol = typeof body.instrumentSymbol === "string" && body.instrumentSymbol.length < 12 ? body.instrumentSymbol.toUpperCase() : null;

  const post = await prisma.$transaction(async (tx: any) => {
    const created = await tx.communityPost.create({
      data: {
        authorId: me.id,
        type,
        body: content,
        instrumentSymbol,
        timeframe: typeof body.timeframe === "string" ? body.timeframe : null,
        direction: body.direction === "bullish" || body.direction === "bearish" ? body.direction : null,
        entry: typeof body.entry === "number" ? body.entry : null,
        stopLoss: typeof body.stopLoss === "number" ? body.stopLoss : null,
        takeProfit1: typeof body.takeProfit1 === "number" ? body.takeProfit1 : null,
        confidenceScore: typeof body.confidenceScore === "number" ? Math.max(0, Math.min(100, Math.round(body.confidenceScore))) : null,
        imageUrl: typeof body.imageUrl === "string" && body.imageUrl.length < 500 ? body.imageUrl : null,
      },
    });
    await tx.communityProfile.update({ where: { id: me.id }, data: { postCount: { increment: 1 } } });
    return created;
  });

  return NextResponse.json(post);
}

export async function GET() {
  const latest = await prisma.communityPost.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { author: true },
  });
  return NextResponse.json({ posts: latest });
}
