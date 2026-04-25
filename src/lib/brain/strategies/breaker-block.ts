// Breaker Block strategy engine — Quant Engine Blueprint § 7.
//
// A breaker block is a failed order block — an order block that gets
// violated by price moving past it. After the violation, that level
// often gets retested as flipped support/resistance and provides a
// continuation entry in the new direction.
//
// SELL pipeline (BUY mirrors):
//   1. Find a recent BEARISH order block (last down candle before a
//      bullish move), which then FAILED — price closed back above
//      the OB high (the "breaker" event).
//   2. Wait for price to retest the broken level from above.
//   3. Latest candle wicks into the breaker zone but rejects — we
//      sell the failed-support-now-resistance.
//   4. Stop above the breaker zone high + ATR buffer.
//   5. TPs at sell-side liquidity ≥ 1R away.

import type { DetectedSetup } from "@/lib/brain/strategies-types";

interface CandleRow {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface BBContext {
  symbol: string;
  timeframe: string;
  candles: CandleRow[];
  structure: { bias?: string | null; lastSwingHigh?: number | null; lastSwingLow?: number | null } | null;
  indicators: { trendBias?: string | null; rsi14?: number | null } | null;
  activeLevels: Array<{ levelType: string; price: number; side?: string | null }>;
  atr: number | null;
}

interface BreakerZone {
  // Direction = the direction of the BREAKER setup (i.e. "bearish" =
  // sell setup, formed by a failed bearish OB that now caps price).
  direction: "bullish" | "bearish";
  high: number;
  low: number;
  formedAtIndex: number;
  failedAtIndex: number;
}

const MIN_CANDLES = 35;
const MAX_BREAKER_AGE_BARS = 60;
const DISPLACEMENT_BODY_RATIO = 0.6;

export function detectBreakerBlock(ctx: BBContext): DetectedSetup | null {
  if (ctx.candles.length < MIN_CANDLES || !ctx.atr) return null;
  const breakers = findBreakers(ctx.candles, ctx.atr);
  if (breakers.length === 0) return null;

  let best: DetectedSetup | null = null;
  for (const bz of breakers) {
    const ageBars = ctx.candles.length - 1 - bz.failedAtIndex;
    if (ageBars > MAX_BREAKER_AGE_BARS || ageBars < 2) continue;
    const candidate = bz.direction === "bullish"
      ? evaluateBreakerBuy(ctx, bz)
      : evaluateBreakerSell(ctx, bz);
    if (candidate && (best === null || candidate.confidenceScore > best.confidenceScore)) {
      best = candidate;
    }
  }
  return best;
}

function findBreakers(candles: CandleRow[], atr: number): BreakerZone[] {
  const out: BreakerZone[] = [];

  for (let i = 1; i < candles.length - 5; i++) {
    const ob = candles[i];
    const next = candles[i + 1];
    const obIsBullish = ob.close > ob.open;
    const obIsBearish = ob.close < ob.open;

    // Bearish OB → bullish break (formed an order block).
    // BREAKER event: a later candle closes ABOVE the OB high — the
    // bearish order block has failed; the level becomes flipped support.
    if (obIsBearish && isDisplacement(next, "bullish", atr) && next.close > ob.high) {
      // Look ahead for a later candle that closes BACK below ob.low —
      // that would be a bearish-flip continuation. But we're after the
      // BUY breaker: we need a subsequent close that holds the failed
      // OB as support.
      for (let j = i + 2; j < candles.length - 1; j++) {
        if (candles[j].low <= ob.high && candles[j].close > ob.high) {
          out.push({
            direction: "bullish",
            high: ob.high,
            low: ob.low,
            formedAtIndex: i,
            failedAtIndex: j,
          });
          break;
        }
      }
    }

    // Bullish OB → bearish break + later retest from below as resistance.
    if (obIsBullish && isDisplacement(next, "bearish", atr) && next.close < ob.low) {
      for (let j = i + 2; j < candles.length - 1; j++) {
        if (candles[j].high >= ob.low && candles[j].close < ob.low) {
          out.push({
            direction: "bearish",
            high: ob.high,
            low: ob.low,
            formedAtIndex: i,
            failedAtIndex: j,
          });
          break;
        }
      }
    }
  }

  return out;
}

function isDisplacement(c: CandleRow, dir: "bullish" | "bearish", atr: number): boolean {
  const range = c.high - c.low;
  const body = Math.abs(c.close - c.open);
  if (range <= 0 || range < atr * 1.0) return false;
  if (body / range < DISPLACEMENT_BODY_RATIO) return false;
  return dir === "bullish" ? c.close > c.open : c.close < c.open;
}

function evaluateBreakerSell(ctx: BBContext, bz: BreakerZone): DetectedSetup | null {
  const { candles, atr } = ctx;
  if (!atr) return null;
  const latest = candles[candles.length - 1];

  // Latest candle wicks into [bz.low, bz.high] and closes back below bz.low
  const wicked = latest.high >= bz.low;
  const closedBelow = latest.close < bz.low;
  if (!wicked || !closedBelow) return null;

  const rejectionWick = latest.high - Math.max(latest.open, latest.close);
  const rejectionStrength = rejectionWick / Math.max(latest.high - latest.low, 1e-9);
  if (rejectionStrength < 0.3) return null;

  const stopLoss = bz.high + atr * 0.3;
  const entry = latest.close;
  if (stopLoss <= entry) return null;
  const risk = stopLoss - entry;

  const minTp = risk * 1.0;
  const sellSide = ctx.activeLevels
    .filter((l) => l.price < entry - minTp && (l.side === "sell" || l.levelType?.includes("low")))
    .map((l) => l.price)
    .sort((a, b) => b - a);
  const tp1 = sellSide[0] ?? entry - risk * 1.5;
  const tp2 = sellSide[1] ?? entry - risk * 2.5;
  const tp3 = sellSide[2] ?? entry - risk * 4;

  const score = scoreBreaker(ctx, "bearish", rejectionStrength, Math.abs(tp1 - entry) / risk);

  return {
    setupType: "breaker_block",
    direction: "bearish",
    entry, stopLoss, takeProfit1: tp1, takeProfit2: tp2, takeProfit3: tp3,
    riskReward: Math.abs(tp1 - entry) / risk,
    confidenceScore: score,
    qualityGrade: gradeFromScore(score),
    explanation:
      `Bullish OB at [${bz.low.toFixed(5)} → ${bz.high.toFixed(5)}] failed — broken to the downside, then retested as resistance with ${(rejectionStrength * 100).toFixed(0)}% rejection wick. ` +
      `Failed support is now treated as supply.`,
    invalidation: `Close above breaker high ${bz.high.toFixed(5)} reverses the read.`,
    validHours: 6,
    originalThesis: `Sell from broken bullish order block — failed support flipped to resistance.`,
    requiredConditions: [
      `Price remains below breaker low ${bz.low.toFixed(5)}`,
      `${ctx.timeframe} structure remains bearish`,
      `No bullish CHoCH forms`,
    ],
    invalidationConditions: [
      `${ctx.timeframe} candle closes above breaker high ${bz.high.toFixed(5)}`,
      `Bullish CHoCH forms after entry`,
      `Opposite A+ signal appears`,
    ],
  };
}

function evaluateBreakerBuy(ctx: BBContext, bz: BreakerZone): DetectedSetup | null {
  const { candles, atr } = ctx;
  if (!atr) return null;
  const latest = candles[candles.length - 1];

  const wicked = latest.low <= bz.high;
  const closedAbove = latest.close > bz.high;
  if (!wicked || !closedAbove) return null;

  const rejectionWick = Math.min(latest.open, latest.close) - latest.low;
  const rejectionStrength = rejectionWick / Math.max(latest.high - latest.low, 1e-9);
  if (rejectionStrength < 0.3) return null;

  const stopLoss = bz.low - atr * 0.3;
  const entry = latest.close;
  if (stopLoss >= entry) return null;
  const risk = entry - stopLoss;

  const minTp = risk * 1.0;
  const buySide = ctx.activeLevels
    .filter((l) => l.price > entry + minTp && (l.side === "buy" || l.levelType?.includes("high")))
    .map((l) => l.price)
    .sort((a, b) => a - b);
  const tp1 = buySide[0] ?? entry + risk * 1.5;
  const tp2 = buySide[1] ?? entry + risk * 2.5;
  const tp3 = buySide[2] ?? entry + risk * 4;

  const score = scoreBreaker(ctx, "bullish", rejectionStrength, Math.abs(tp1 - entry) / risk);

  return {
    setupType: "breaker_block",
    direction: "bullish",
    entry, stopLoss, takeProfit1: tp1, takeProfit2: tp2, takeProfit3: tp3,
    riskReward: Math.abs(tp1 - entry) / risk,
    confidenceScore: score,
    qualityGrade: gradeFromScore(score),
    explanation:
      `Bearish OB at [${bz.low.toFixed(5)} → ${bz.high.toFixed(5)}] failed — broken to the upside, then retested as support with ${(rejectionStrength * 100).toFixed(0)}% rejection wick. ` +
      `Failed resistance is now treated as demand.`,
    invalidation: `Close below breaker low ${bz.low.toFixed(5)} reverses the read.`,
    validHours: 6,
    originalThesis: `Buy from broken bearish order block — failed resistance flipped to support.`,
    requiredConditions: [
      `Price remains above breaker high ${bz.high.toFixed(5)}`,
      `${ctx.timeframe} structure remains bullish`,
      `No bearish CHoCH forms`,
    ],
    invalidationConditions: [
      `${ctx.timeframe} candle closes below breaker low ${bz.low.toFixed(5)}`,
      `Bearish CHoCH forms after entry`,
      `Opposite A+ signal appears`,
    ],
  };
}

function scoreBreaker(
  ctx: BBContext,
  direction: "bullish" | "bearish",
  rejectionStrength: number,
  riskReward: number,
): number {
  let score = 0;
  if (ctx.indicators?.trendBias === direction) score += 15;
  else if (!ctx.indicators?.trendBias || ctx.indicators.trendBias === "neutral") score += 7;
  if (ctx.structure?.bias === direction) score += 15;
  else if (!ctx.structure?.bias) score += 5;
  score += Math.min(20, rejectionStrength * 25);
  score += Math.min(10, ctx.activeLevels.length * 2.5);
  if (ctx.atr) score += 5;
  const rsi = ctx.indicators?.rsi14;
  if (rsi != null) {
    if (direction === "bearish" && rsi >= 45 && rsi <= 70) score += 5;
    else if (direction === "bullish" && rsi >= 30 && rsi <= 55) score += 5;
  }
  score += Math.min(10, (riskReward / 2) * 10);
  score += 5; score += 5; score += 5; score += 5; // execution / news / edge / account credits
  return Math.round(Math.min(100, Math.max(0, score)));
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}
