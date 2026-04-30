// GET /api/flow/zones?symbol=EURUSD — active liquidity zones for the
// liquidity-map panel. Filters out filled + violated by default.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const symbol = sp.get("symbol");
  const includeFilled = sp.get("includeFilled") === "1";

  if (!symbol) return NextResponse.json({ zones: [], error: "missing_symbol" }, { status: 400 });

  try {
    const where: Record<string, unknown> = { symbol, isViolated: false };
    if (!includeFilled) where.isFilled = false;
    const zones = await prisma.liquidityZone.findMany({
      where,
      orderBy: [{ strengthScore: "desc" }, { formedAt: "desc" }],
      take: 50,
    });
    return NextResponse.json(
      {
        zones: zones.map((z) => ({
          id: z.id,
          symbol: z.symbol,
          timeframe: z.timeframe,
          zoneType: z.zoneType,
          direction: z.direction,
          priceLow: z.priceLow,
          priceHigh: z.priceHigh,
          strengthScore: z.strengthScore,
          formedAt: z.formedAt.toISOString(),
          isFilled: z.isFilled,
          isViolated: z.isViolated,
        })),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    return NextResponse.json(
      { zones: [], error: err instanceof Error ? err.message : "flow_zones_failed" },
      { status: 500 },
    );
  }
}
