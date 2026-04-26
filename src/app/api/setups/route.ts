import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * Generic TradeSetup list endpoint, filtered by status / grade / setupType.
 * Used by the Quant Algo page to show the live queue of A+/A setups it's
 * about to route on the next runtime tick. Read-only, returns the same
 * fields a client card needs — no narrative bloat.
 *
 * Query params (all optional):
 *   - statuses: csv of TradeSetup.status values (default "active")
 *   - grades:   csv of qualityGrade values     (default — no filter)
 *   - types:    csv of setupType values        (default — no filter)
 *   - symbols:  csv of symbols                 (default — no filter)
 *   - limit:    max rows to return (1-100, default 30)
 */
function csv(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const statuses = csv(sp.get("statuses"));
  const grades = csv(sp.get("grades"));
  const types = csv(sp.get("types"));
  const symbols = csv(sp.get("symbols"));
  const rawLimit = parseInt(sp.get("limit") ?? "30", 10);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 30;

  const where: Record<string, unknown> = {};
  where.status = statuses.length > 0 ? { in: statuses } : "active";
  if (grades.length > 0) where.qualityGrade = { in: grades };
  if (types.length > 0) where.setupType = { in: types };
  if (symbols.length > 0) where.symbol = { in: symbols };

  const setups = await prisma.tradeSetup.findMany({
    where,
    orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      symbol: true,
      direction: true,
      setupType: true,
      timeframe: true,
      qualityGrade: true,
      confidenceScore: true,
      riskReward: true,
      entry: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ setups });
}
