// GET /api/flow/setups — actionable trade setups derived from the
// FlowVision path prediction. Returns active TradeSetup rows with
// setupType="flow_vision_path", optionally filtered by symbol.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const symbol = sp.get("symbol");
  const take = Math.min(50, parseInt(sp.get("take") ?? "30", 10));

  try {
    const where: Record<string, unknown> = {
      setupType: "flow_vision_path",
      status: "active",
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    };
    if (symbol) where.symbol = symbol;

    const rows = await prisma.tradeSetup.findMany({
      where,
      orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
      take,
      include: {
        instrument: { select: { displayName: true, decimalPlaces: true, category: true } },
      },
    });

    return NextResponse.json(
      {
        setups: rows.map((r) => {
          let metadata: unknown = null;
          if (r.metadataJson) {
            try { metadata = JSON.parse(r.metadataJson); } catch { /* malformed */ }
          }
          return {
            id: r.id,
            symbol: r.symbol,
            displayName: r.instrument?.displayName ?? r.symbol,
            decimalPlaces: r.instrument?.decimalPlaces ?? 5,
            category: r.instrument?.category ?? "forex",
            direction: r.direction,
            entry: r.entry,
            stopLoss: r.stopLoss,
            takeProfit1: r.takeProfit1,
            takeProfit2: r.takeProfit2,
            takeProfit3: r.takeProfit3,
            riskReward: r.riskReward,
            confidenceScore: r.confidenceScore,
            qualityGrade: r.qualityGrade,
            explanation: r.explanation,
            invalidation: r.invalidation,
            timeframe: r.timeframe,
            validUntil: r.validUntil?.toISOString() ?? null,
            createdAt: r.createdAt.toISOString(),
            metadata,
          };
        }),
        timestamp: Date.now(),
        count: rows.length,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    return NextResponse.json(
      { setups: [], error: err instanceof Error ? err.message : "flow_setups_failed", timestamp: Date.now() },
      { status: 500 },
    );
  }
}
