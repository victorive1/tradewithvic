import { NextResponse } from "next/server";
import { fetchAllQuotes } from "@/lib/market-data";
import { deriveBreakout, type Breakout } from "@/lib/breakouts/derive";
import { captureSetups } from "@/lib/setups/backlog-capture";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// One backlog row per symbol+direction per UTC day, so a breakout that
// persists across the session's polls keeps a single immutable
// first-dropped time rather than re-stamping every 60s.
function signatureFor(b: Breakout, dayBucket: number): string {
  return `brk_${b.symbol}_${b.direction}_${dayBucket}`;
}

export async function GET() {
  try {
    const quotes = await fetchAllQuotes();
    const breakouts = quotes
      .map(deriveBreakout)
      .filter((b): b is Breakout => b !== null)
      .sort((a, b) => b.score - a.score);

    const dayBucket = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const stamps = await captureSetups(
      breakouts.map((b) => ({
        signature: signatureFor(b, dayBucket),
        symbol: b.symbol,
        direction: b.direction,
        setupType: "breakout",
        timeframe: b.timeframe,
        entry: (b.entryLow + b.entryHigh) / 2,
        stopLoss: b.stopLoss,
        takeProfit1: b.takeProfit1,
        takeProfit2: b.takeProfit2,
        riskReward: Math.abs(b.takeProfit2 - (b.entryLow + b.entryHigh) / 2) /
          Math.max(1e-9, Math.abs((b.entryLow + b.entryHigh) / 2 - b.stopLoss)),
        confidenceScore: b.score,
        qualityGrade: b.confidence,
        explanation: b.reasoning,
      })),
    );
    const withStamps = breakouts.map((b) => ({
      ...b,
      firstDroppedAt: stamps.get(signatureFor(b, dayBucket)) ?? null,
    }));

    return NextResponse.json(
      { breakouts: withStamps, timestamp: Date.now(), count: withStamps.length },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "breakouts_failed";
    return NextResponse.json(
      { breakouts: [], timestamp: Date.now(), error: message },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
