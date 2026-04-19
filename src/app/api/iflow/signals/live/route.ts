import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Ranked live board of active institutional signals (blueprint §6).
 * Default: top 50 by intentScore, excluding stale/invalidated.
 */
export async function GET(req: NextRequest) {
  const take = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("take") ?? 50)));
  const minScore = Math.max(0, Number(req.nextUrl.searchParams.get("minScore") ?? 0));
  const direction = req.nextUrl.searchParams.get("direction");
  const grade = req.nextUrl.searchParams.get("grade");

  const signals = await prisma.institutionalSignal.findMany({
    where: {
      active: true,
      intentScore: { gte: minScore },
      ...(direction ? { direction } : {}),
      ...(grade ? { confidenceGrade: grade } : {}),
    },
    orderBy: [{ intentScore: "desc" }, { capturedAt: "desc" }],
    take,
  });

  return NextResponse.json({ signals, count: signals.length, fetchedAt: Date.now() });
}
