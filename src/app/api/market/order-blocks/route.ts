import { NextResponse } from "next/server";
import { scanAllOrderBlocks } from "@/lib/brain/order-blocks";
import { CANDLE_SYMBOLS } from "@/lib/brain/candles";
import { captureSetups } from "@/lib/setups/backlog-capture";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

function gradeFor(confidence: number): string {
  if (confidence >= 85) return "A+";
  if (confidence >= 75) return "A";
  if (confidence >= 65) return "B";
  return "C";
}

// Order blocks are best read on intermediate timeframes. 5min / 15min
// churn too much; 1day is too slow for active trading. 1h + 4h is the
// sweet spot for where the page surfaces real signals.
const OB_TIMEFRAMES = ["1h", "4h"] as const;

export async function GET() {
  try {
    const blocks = await scanAllOrderBlocks(CANDLE_SYMBOLS, OB_TIMEFRAMES);
    // Sort: tested first (most actionable), then fresh, then by confidence.
    blocks.sort((a, b) => {
      const w = (s: string) => s === "tested" ? 2 : s === "fresh" ? 1 : 0;
      const ws = w(b.status) - w(a.status);
      if (ws !== 0) return ws;
      return b.confidence - a.confidence;
    });
    // Persist each order block's immutable first-dropped time into the
    // backlog (keyed by its BOS confirmation, which is stable per block)
    // and attach the real DB-stamped origin time for the card badge.
    const sig = (b: (typeof blocks)[number]) =>
      `ob_${b.symbol}_${b.timeframe}_${b.direction}_${b.bosConfirmedAt}`;
    const stamps = await captureSetups(
      blocks.map((b) => ({
        signature: sig(b),
        symbol: b.symbol,
        direction: b.direction,
        setupType: "order_block",
        timeframe: b.timeframe,
        entry: (b.entryLow + b.entryHigh) / 2,
        stopLoss: b.stopLoss,
        takeProfit1: b.takeProfit1,
        takeProfit2: b.takeProfit2 ?? null,
        riskReward: b.riskReward,
        confidenceScore: b.confidence,
        qualityGrade: gradeFor(b.confidence),
        explanation: `${b.direction} order block on ${b.timeframe} (${b.status}).`,
      })),
    );
    const withStamps = blocks.map((b) => ({
      ...b,
      firstDroppedAt: stamps.get(sig(b)) ?? null,
    }));

    return NextResponse.json({
      blocks: withStamps,
      count: withStamps.length,
      scannedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { blocks: [], error: err?.message ?? "order_blocks_failed" },
      { status: 500 },
    );
  }
}
