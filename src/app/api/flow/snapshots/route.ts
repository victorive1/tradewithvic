// GET /api/flow/snapshots — latest FlowSnapshot per symbol.
//
// Default: returns one row per MVP symbol = the most recent snapshot.
// Optional `?history=1&symbol=EURUSD` returns the last 24 snapshots
// for trend charts later.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FLOW_VISION_SYMBOLS } from "@/lib/flow/scan";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const history = sp.get("history") === "1";
  const symbol = sp.get("symbol");

  try {
    if (history && symbol) {
      const rows = await prisma.flowSnapshot.findMany({
        where: { symbol },
        orderBy: { createdAt: "desc" },
        take: 24,
        include: { instrument: { select: { displayName: true, decimalPlaces: true } } },
      });
      return NextResponse.json(
        { snapshots: rows.map(serialize), timestamp: Date.now() },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    // Latest per symbol — one Prisma call per symbol since GROUP BY isn't
    // first-class via the Prisma client. Symbol set is small (7) so this
    // is fine.
    const latestPerSymbol = await Promise.all(
      FLOW_VISION_SYMBOLS.map((sym) =>
        prisma.flowSnapshot.findFirst({
          where: { symbol: sym },
          orderBy: { createdAt: "desc" },
          include: { instrument: { select: { displayName: true, decimalPlaces: true } } },
        }),
      ),
    );

    return NextResponse.json(
      {
        snapshots: latestPerSymbol.filter((r): r is NonNullable<typeof r> => r !== null).map(serialize),
        timestamp: Date.now(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    return NextResponse.json(
      { snapshots: [], error: err instanceof Error ? err.message : "flow_snapshots_failed", timestamp: Date.now() },
      { status: 500 },
    );
  }
}

type Row = Awaited<ReturnType<typeof prisma.flowSnapshot.findFirst>> & {
  instrument?: { displayName: string | null; decimalPlaces: number | null } | null;
};
function serialize(r: NonNullable<Row>) {
  let metadata: unknown = null;
  let reasons: unknown = null;
  if (r.metadataJson) { try { metadata = JSON.parse(r.metadataJson); } catch { /* malformed */ } }
  if (r.reasonsJson)  { try { reasons  = JSON.parse(r.reasonsJson);  } catch { /* malformed */ } }
  return {
    id: r.id,
    symbol: r.symbol,
    displayName: r.instrument?.displayName ?? r.symbol,
    decimalPlaces: r.instrument?.decimalPlaces ?? 5,
    timeframe: r.timeframe,
    retailLongPct: r.retailLongPct,
    retailShortPct: r.retailShortPct,
    retailCrowding: r.retailCrowding,
    retailDataSource: r.retailDataSource,
    retailBuyScore: r.retailBuyScore,
    retailSellScore: r.retailSellScore,
    institutionalBuyScore: r.institutionalBuyScore,
    institutionalSellScore: r.institutionalSellScore,
    syntheticCvd: r.syntheticCvd,
    vwapPosition: r.vwapPosition,
    vwapSlope: r.vwapSlope,
    volumeZScore: r.volumeZScore,
    oiChange: r.oiChange,
    cotNet: r.cotNet,
    trapScore: r.trapScore,
    trapType: r.trapType,
    finalBias: r.finalBias,
    confidence: r.confidence,
    invalidation: r.invalidation,
    targetLiquidity: r.targetLiquidity,
    expectedHoldMinutes: r.expectedHoldMinutes,
    narrative: r.narrative,
    reasons,
    session: r.session,
    biasState: r.biasState,
    metadata,
    createdAt: r.createdAt.toISOString(),
  };
}
