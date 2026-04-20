import { NextResponse } from "next/server";
import { scanAllOrderBlocks } from "@/lib/brain/order-blocks";
import { CANDLE_SYMBOLS } from "@/lib/brain/candles";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

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
    return NextResponse.json({
      blocks,
      count: blocks.length,
      scannedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { blocks: [], error: err?.message ?? "order_blocks_failed" },
      { status: 500 },
    );
  }
}
