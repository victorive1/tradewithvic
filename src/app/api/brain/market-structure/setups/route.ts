import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const setups = await prisma.tradeSetup.findMany({
    where: {
      setupType: { in: ["market_structure_bos", "market_structure_choch"] },
      status: "active",
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      symbol: true,
      timeframe: true,
      direction: true,
      setupType: true,
      entry: true,
      stopLoss: true,
      takeProfit1: true,
      takeProfit2: true,
      riskReward: true,
      confidenceScore: true,
      qualityGrade: true,
      explanation: true,
      invalidation: true,
      createdAt: true,
      validUntil: true,
    },
  });
  return NextResponse.json({ setups });
}
