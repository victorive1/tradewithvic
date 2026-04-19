import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  const symbol = asset.toUpperCase();

  const active = await prisma.institutionalSignal.findMany({
    where: { assetSymbol: symbol, active: true },
    orderBy: { intentScore: "desc" },
    take: 10,
  });
  const history = await prisma.institutionalSignal.findMany({
    where: { assetSymbol: symbol, active: false },
    orderBy: { capturedAt: "desc" },
    take: 30,
  });

  const flowWindow = await prisma.flowEvent.findMany({
    where: { assetSymbol: symbol, capturedAt: { gte: new Date(Date.now() - 4 * 60 * 60 * 1000) } },
    orderBy: { capturedAt: "asc" },
  });

  return NextResponse.json({ symbol, active, history, flowWindow, fetchedAt: Date.now() });
}
