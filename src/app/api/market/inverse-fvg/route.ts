// Inverse FVG signals — read from the TradeSetup table populated by the
// brain's 2-min scan cron. The detector lives at
// `src/lib/brain/strategies/inverse-fvg.ts` and is invoked by
// `src/lib/brain/strategies.ts` on every scan tick. This route just hands
// the client the latest snapshot — no per-request scanning, so it's fast
// and consistent with how /dashboard/setups feeds itself.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await prisma.tradeSetup.findMany({
      where: {
        setupType: "inverse_fvg",
        status: "active",
        createdAt: { gte: since },
      },
      orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: {
        instrument: {
          select: { displayName: true, category: true, decimalPlaces: true },
        },
      },
    });

    return NextResponse.json(
      {
        signals: rows.map((r) => ({
          id: r.id,
          symbol: r.symbol,
          displayName: r.instrument?.displayName ?? r.symbol,
          category: r.instrument?.category ?? "forex",
          decimalPlaces: r.instrument?.decimalPlaces ?? 5,
          timeframe: r.timeframe,
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
          validUntil: r.validUntil?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
        timestamp: Date.now(),
        count: rows.length,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "inverse_fvg_failed";
    return NextResponse.json(
      { signals: [], timestamp: Date.now(), error: msg },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
