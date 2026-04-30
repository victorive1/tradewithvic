// GET /api/mini/by-symbol?symbol=EURUSD
//
// Returns the latest alive Mini signal per timeframe (5m / 15m / 1h)
// for a single symbol. Powers the search-driven Intraday Prediction
// view. When no signal exists for a given timeframe, the slot returns
// null and the UI renders a "No Trade" panel.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALIVE_STATUSES = ["scanning", "forming", "waiting_for_entry", "entry_active", "in_trade"];
const TIMEFRAMES = ["5m", "15m", "1h"] as const;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const symbol = sp.get("symbol")?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: "missing_symbol" }, { status: 400 });

  try {
    // One query per timeframe — small, indexed lookups.
    const perTf = await Promise.all(
      TIMEFRAMES.map(async (tf) => {
        const sig = await prisma.miniSignal.findFirst({
          where: {
            symbol,
            entryTimeframe: tf,
            status: { in: ALIVE_STATUSES },
            expiresAt: { gt: new Date() },
          },
          orderBy: [{ score: "desc" }, { createdAt: "desc" }],
          include: {
            instrument: { select: { displayName: true, decimalPlaces: true, category: true } },
            scores: true,
          },
        });
        if (!sig) return [tf, null] as const;
        let metadata: unknown = null;
        if (sig.metadataJson) { try { metadata = JSON.parse(sig.metadataJson); } catch { /* malformed */ } }
        return [tf, {
          id: sig.id,
          symbol: sig.symbol,
          displayName: sig.instrument?.displayName ?? sig.symbol,
          decimalPlaces: sig.instrument?.decimalPlaces ?? 5,
          category: sig.instrument?.category ?? "forex",
          template: sig.template,
          direction: sig.direction,
          entryTimeframe: sig.entryTimeframe,
          speedClass: sig.speedClass,
          entryZoneLow: sig.entryZoneLow,
          entryZoneHigh: sig.entryZoneHigh,
          stopLoss: sig.stopLoss,
          takeProfit1: sig.takeProfit1,
          takeProfit2: sig.takeProfit2,
          takeProfit3: sig.takeProfit3,
          entryType: sig.entryType,
          score: sig.score,
          grade: sig.grade,
          biasState: sig.biasState,
          session: sig.session,
          expectedHoldMinutes: sig.expectedHoldMinutes,
          riskReward: sig.riskReward,
          explanation: sig.explanation,
          invalidation: sig.invalidation,
          status: sig.status,
          expiresAt: sig.expiresAt.toISOString(),
          createdAt: sig.createdAt.toISOString(),
          scoreBreakdown: sig.scores ? {
            biasAlignment: sig.scores.biasAlignment,
            liquidityEvent: sig.scores.liquidityEvent,
            microStructure: sig.scores.microStructure,
            entryZoneQuality: sig.scores.entryZoneQuality,
            momentumDisplacement: sig.scores.momentumDisplacement,
            volatilitySpread: sig.scores.volatilitySpread,
            riskReward: sig.scores.riskReward,
            sessionTiming: sig.scores.sessionTiming,
            total: sig.scores.total,
          } : null,
          metadata,
        }] as const;
      }),
    );

    // Pull the symbol's instrument metadata even if no signal exists,
    // so the UI can render the header card with displayName + decimals.
    const instrument = await prisma.instrument.findUnique({
      where: { symbol },
      select: { displayName: true, decimalPlaces: true, category: true },
    });

    return NextResponse.json(
      {
        symbol,
        displayName: instrument?.displayName ?? symbol,
        decimalPlaces: instrument?.decimalPlaces ?? 5,
        category: instrument?.category ?? "forex",
        signalsByTimeframe: Object.fromEntries(perTf),
        timestamp: Date.now(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "mini_by_symbol_failed", timestamp: Date.now() },
      { status: 500 },
    );
  }
}
