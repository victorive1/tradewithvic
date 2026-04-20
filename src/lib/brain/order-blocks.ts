/**
 * Order Block detection from candle history.
 *
 * An order block is the last opposing candle before a displacement move that
 * broke market structure (a "Break of Structure"). The theory: the candle
 * represents where institutional orders entered the market just before the
 * decisive move; price often returns to it before continuing.
 *
 * Bullish OB: the last bearish (down-closing) candle before an impulsive
 * up-move that closed above a prior swing high.
 * Bearish OB: the last bullish (up-closing) candle before an impulsive
 * down-move that closed below a prior swing low.
 */

import { prisma } from "@/lib/prisma";

interface Candle {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface OrderBlock {
  symbol: string;
  timeframe: string;
  direction: "bullish" | "bearish";
  // Zone defined by the OB candle's high/low.
  zoneHigh: number;
  zoneLow: number;
  // Entry zone inside the OB (tighter than the full zone).
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  // The price that confirmed the BOS (close of the breaker candle).
  breakClose: number;
  breakLevel: number;
  // When the OB candle formed, and when the BOS confirmed.
  obFormedAt: Date;
  bosConfirmedAt: Date;
  // Runtime status against the latest candle close.
  status: "fresh" | "tested" | "mitigated";
  currentPrice: number;
  // 0-100 quality score.
  confidence: number;
  // How many bars after the BOS — younger OBs tend to be more reliable.
  barsSinceBos: number;
}

interface Swing {
  idx: number;
  price: number;
  kind: "high" | "low";
}

/**
 * Fractal pivot detection — identical shape to the structure engine so we
 * stay consistent with how the rest of the Brain sees swings.
 */
function detectSwings(candles: Candle[]): Swing[] {
  const swings: Swing[] = [];
  const L = 2;
  const R = 2;
  for (let i = L; i < candles.length - R; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= L; k++) {
      if (candles[i - k].high > c.high) isHigh = false;
      if (candles[i - k].low < c.low) isLow = false;
    }
    for (let k = 1; k <= R; k++) {
      if (candles[i + k].high > c.high) isHigh = false;
      if (candles[i + k].low < c.low) isLow = false;
    }
    if (isHigh) swings.push({ idx: i, price: c.high, kind: "high" });
    if (isLow) swings.push({ idx: i, price: c.low, kind: "low" });
  }
  return swings;
}

/**
 * Scan candles for the most recent Break-of-Structure + order block.
 * Returns null if no qualifying OB exists in the window.
 */
export function detectOrderBlock(symbol: string, timeframe: string, candles: Candle[]): OrderBlock | null {
  if (candles.length < 20) return null;

  const swings = detectSwings(candles);
  if (swings.length < 2) return null;

  const latest = candles[candles.length - 1];
  const currentPrice = latest.close;

  // Search backward for the most recent BOS event. We only look at the last
  // ~30 candles so we surface fresh structure, not ancient history.
  const searchFrom = Math.max(0, candles.length - 30);
  let bestBullishOB: OrderBlock | null = null;
  let bestBearishOB: OrderBlock | null = null;

  for (let i = candles.length - 1; i >= searchFrom; i--) {
    const c = candles[i];

    // Bullish BOS: this candle closed above the most recent swing high
    // that formed strictly before it.
    const priorHighs = swings.filter((s) => s.kind === "high" && s.idx < i - 1);
    if (priorHighs.length > 0) {
      const lastHigh = priorHighs[priorHighs.length - 1];
      if (c.close > lastHigh.price) {
        // Bullish BOS confirmed. Walk back from i-1 to find the last
        // down-closing candle before this impulse — that's the bullish OB.
        let obIdx: number | null = null;
        for (let j = i - 1; j > lastHigh.idx; j--) {
          if (candles[j].close < candles[j].open) {
            obIdx = j;
            break;
          }
        }
        if (obIdx != null && !bestBullishOB) {
          bestBullishOB = buildOB(symbol, timeframe, candles, obIdx, i, lastHigh.price, currentPrice, "bullish");
        }
      }
    }

    // Bearish BOS: close below recent swing low.
    const priorLows = swings.filter((s) => s.kind === "low" && s.idx < i - 1);
    if (priorLows.length > 0) {
      const lastLow = priorLows[priorLows.length - 1];
      if (c.close < lastLow.price) {
        let obIdx: number | null = null;
        for (let j = i - 1; j > lastLow.idx; j--) {
          if (candles[j].close > candles[j].open) {
            obIdx = j;
            break;
          }
        }
        if (obIdx != null && !bestBearishOB) {
          bestBearishOB = buildOB(symbol, timeframe, candles, obIdx, i, lastLow.price, currentPrice, "bearish");
        }
      }
    }

    if (bestBullishOB && bestBearishOB) break;
  }

  // Return the most recent / higher-confidence OB. If price has mitigated
  // both, prefer the one that's still tradeable.
  const candidates = [bestBullishOB, bestBearishOB].filter((x): x is OrderBlock => x !== null);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const statusWeight = (s: OrderBlock["status"]) => s === "mitigated" ? 0 : s === "tested" ? 2 : 1;
    const ws = statusWeight(b.status) - statusWeight(a.status);
    if (ws !== 0) return ws;
    return b.confidence - a.confidence;
  });
  return candidates[0];
}

function buildOB(
  symbol: string,
  timeframe: string,
  candles: Candle[],
  obIdx: number,
  bosIdx: number,
  breakLevel: number,
  currentPrice: number,
  direction: "bullish" | "bearish",
): OrderBlock {
  const ob = candles[obIdx];
  const bos = candles[bosIdx];
  const zoneHigh = ob.high;
  const zoneLow = ob.low;
  const zoneWidth = zoneHigh - zoneLow;
  const zoneMid = (zoneHigh + zoneLow) / 2;

  // Tighter entry zone inside the OB candle (the "optimal trade entry"
  // upper or lower half depending on direction).
  const entryLow = direction === "bullish"
    ? zoneLow
    : zoneMid;
  const entryHigh = direction === "bullish"
    ? zoneMid
    : zoneHigh;

  const stopLoss = direction === "bullish"
    ? zoneLow - zoneWidth * 0.20
    : zoneHigh + zoneWidth * 0.20;
  const entry = (entryLow + entryHigh) / 2;
  const risk = Math.abs(entry - stopLoss);
  const takeProfit1 = direction === "bullish" ? entry + risk * 1.5 : entry - risk * 1.5;
  const takeProfit2 = direction === "bullish" ? entry + risk * 2.5 : entry - risk * 2.5;

  // Status relative to current price.
  let status: OrderBlock["status"];
  if (direction === "bullish") {
    if (currentPrice < zoneLow - zoneWidth * 0.3) status = "mitigated";
    else if (currentPrice >= zoneLow && currentPrice <= zoneHigh * 1.005) status = "tested";
    else status = "fresh";
  } else {
    if (currentPrice > zoneHigh + zoneWidth * 0.3) status = "mitigated";
    else if (currentPrice <= zoneHigh && currentPrice >= zoneLow * 0.995) status = "tested";
    else status = "fresh";
  }

  const barsSinceBos = candles.length - 1 - bosIdx;

  // Confidence blends:
  //   - Size of the impulse move (bigger displacement = more decisive BOS)
  //   - Freshness (younger BOS = higher quality)
  //   - Zone width relative to impulse (tighter zone = better entry geometry)
  //   - Status (mitigated knocks confidence heavily)
  const impulseSize = Math.abs(bos.close - (direction === "bullish" ? ob.low : ob.high));
  const impulseRel = zoneWidth > 0 ? impulseSize / zoneWidth : 1;
  const freshnessScore = Math.max(0, 30 - barsSinceBos);
  const geomScore = Math.min(20, Math.max(0, (impulseRel - 1) * 10));
  let confidence = Math.min(95, Math.round(40 + freshnessScore + geomScore));
  if (status === "mitigated") confidence = Math.max(15, confidence - 35);
  if (status === "tested") confidence = Math.min(95, confidence + 8);

  return {
    symbol, timeframe, direction,
    zoneHigh, zoneLow, entryLow, entryHigh,
    stopLoss, takeProfit1, takeProfit2,
    riskReward: risk > 0 ? Math.abs(takeProfit2 - entry) / risk : 0,
    breakClose: bos.close, breakLevel,
    obFormedAt: ob.openTime, bosConfirmedAt: bos.openTime,
    status, currentPrice, confidence, barsSinceBos,
  };
}

/**
 * Scan every (symbol, timeframe) combination we have candles for and
 * return the active order blocks. Caller decides which timeframes to
 * include — typically 1h + 4h for tradeable signals.
 */
export async function scanAllOrderBlocks(
  symbols: readonly string[],
  timeframes: readonly string[],
  opts: { lookback?: number } = {},
): Promise<OrderBlock[]> {
  const lookback = opts.lookback ?? 100;
  const pairs: Array<[string, string]> = [];
  for (const s of symbols) for (const tf of timeframes) pairs.push([s, tf]);

  const results = await Promise.all(pairs.map(async ([symbol, timeframe]) => {
    const rows = await prisma.candle.findMany({
      where: { symbol, timeframe },
      orderBy: { openTime: "desc" },
      take: lookback,
      select: { openTime: true, open: true, high: true, low: true, close: true },
    });
    if (rows.length < 20) return null;
    // Flip to ascending order for the detector.
    const candles = rows.reverse();
    return detectOrderBlock(symbol, timeframe, candles);
  }));

  return results.filter((x): x is OrderBlock => x !== null);
}
