import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  const symbol = asset.toUpperCase();

  const [defendedLevels, activeSignals] = await Promise.all([
    prisma.liquidityLevel.findMany({
      where: { symbol, status: "active" },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.institutionalSignal.findMany({
      where: { assetSymbol: symbol, active: true, defendedLevel: { not: null } },
      select: {
        id: true,
        direction: true,
        defendedLevel: true,
        invalidationLevel: true,
        intentScore: true,
        capturedAt: true,
        classification: true,
      },
      orderBy: { capturedAt: "desc" },
      take: 10,
    }),
  ]);

  return NextResponse.json({ symbol, defendedLevels, activeSignals, fetchedAt: Date.now() });
}
