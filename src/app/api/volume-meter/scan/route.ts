import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import { computeMeatScore } from "@/lib/volume-meter/score";
import type { PairLiquidityScore } from "@/lib/volume-meter/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Volume Meter scanner endpoint.
//
// For each FX pair we read the most recent ~25 closed candles plus the
// matching ATR snapshot, run the score engine, and return the ranked list.
// Per the brain pipeline conventions in src/lib/brain/candles.ts, FX/metals
// pairs use 15min as the finest available candle timeframe.

const FX_TIMEFRAME = "15min" as const;
const TAKE_CANDLES = 25;

const FX_SYMBOLS = ALL_INSTRUMENTS
  .filter((i) => i.category === "forex")
  .map((i) => i.symbol);

export async function GET() {
  try {
    // Pull candles for all FX symbols in one query, then group in JS.
    // 27 symbols × 25 candles = 675 rows max — well within a single trip.
    const candles = await prisma.candle.findMany({
      where: {
        symbol: { in: FX_SYMBOLS },
        timeframe: FX_TIMEFRAME,
        isClosed: true,
      },
      orderBy: [{ symbol: "asc" }, { openTime: "desc" }],
      select: { symbol: true, open: true, high: true, low: true, close: true, volume: true, openTime: true, fetchedAt: true },
    });

    const indicators = await prisma.indicatorSnapshot.findMany({
      where: { symbol: { in: FX_SYMBOLS }, timeframe: FX_TIMEFRAME },
      select: { symbol: true, atr14: true, candleTime: true },
    });

    // Group candles by symbol, keeping at most TAKE_CANDLES newest per symbol.
    const candlesBySymbol = new Map<string, typeof candles>();
    for (const c of candles) {
      const arr = candlesBySymbol.get(c.symbol) ?? [];
      if (arr.length < TAKE_CANDLES) arr.push(c);
      candlesBySymbol.set(c.symbol, arr);
    }

    const atrBySymbol = new Map<string, number | null>();
    for (const i of indicators) atrBySymbol.set(i.symbol, i.atr14 ?? null);

    // Newest candle's fetchedAt is the scanner's "as of" stamp for that pair.
    // If a pair has no candles at all (just-added cross we haven't rotated to
    // yet), we still emit a warming-state row so the user sees it on the list.
    const scores: PairLiquidityScore[] = [];
    let newestFetchedAt = 0;
    for (const symbol of FX_SYMBOLS) {
      const rows = candlesBySymbol.get(symbol) ?? [];
      const postedAt = rows[0]?.fetchedAt?.getTime() ?? Date.now();
      if (postedAt > newestFetchedAt) newestFetchedAt = postedAt;
      const score = computeMeatScore({
        symbol,
        candles: rows.map((r) => ({
          open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
        })),
        atr14: atrBySymbol.get(symbol) ?? null,
        timeframe: FX_TIMEFRAME,
        postedAt,
      });
      scores.push(score);
    }

    // Sort: real scores first by meatScore desc, warming pairs at the bottom.
    scores.sort((a, b) => {
      if (a.warming !== b.warming) return a.warming ? 1 : -1;
      return b.meatScore - a.meatScore;
    });

    return NextResponse.json({
      scores,
      timestamp: Date.now(),
      capturedAt: newestFetchedAt > 0 ? new Date(newestFetchedAt).toISOString() : null,
      count: scores.length,
      warmingCount: scores.filter((s) => s.warming).length,
      timeframe: FX_TIMEFRAME,
      source: "volume_meter_v1",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Volume Meter scan error:", error);
    return NextResponse.json({
      scores: [],
      timestamp: Date.now(),
      source: "error",
      error: msg,
    }, { status: 500 });
  }
}
