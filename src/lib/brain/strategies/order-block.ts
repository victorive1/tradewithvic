// Order Block strategy engine — Quant Engine Blueprint § 7.
//
// An order block is the LAST candle of one direction before a strong
// move in the opposite direction. The trade is the retest of that
// candle's body — institutions are presumed to defend their original
// entry zone.
//
// SELL pipeline (BUY mirrors):
//   1. Find a recent bullish candle followed by a strong bearish
//      displacement (the "break").
//   2. Mark the bullish candle's body (open → close) as the OB zone.
//   3. Wait for price to retest UP into the OB body.
//   4. Latest candle wicks into the zone but closes below the OB low,
//      OR stalls (small body) inside the zone.
//   5. SL above the OB high + ATR buffer.
//   6. TPs at sell-side liquidity ≥ 1R away, fall back to R-multiples.
//
// Heuristic order-block detection — institutional-grade definitions
// vary; this implementation favours simplicity and false-positive
// resistance over capturing every textbook variant.

import type { DetectedSetup } from "@/lib/brain/strategies-types";

interface CandleRow {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface OBContext {
  symbol: string;
  timeframe: string;
  candles: CandleRow[];
  structure: { bias?: string | null; lastSwingHigh?: number | null; lastSwingLow?: number | null } | null;
  indicators: { trendBias?: string | null; momentum?: string | null; rsi14?: number | null } | null;
  activeLevels: Array<{ levelType: string; price: number; side?: string | null }>;
  atr: number | null;
}

interface OrderBlock {
  direction: "bullish" | "bearish";
  high: number;
  low: number;
  body: { high: number; low: number };
  formedAtIndex: number;
}

const MIN_CANDLES = 30;
const MAX_OB_AGE_BARS = 50;
const DISPLACEMENT_BODY_RATIO = 0.65;
const DISPLACEMENT_RANGE_ATR = 1.2;

export function detectOrderBlock(ctx: OBContext): DetectedSetup | null {
  if (ctx.candles.length < MIN_CANDLES || !ctx.atr) return null;

  const obs = findOrderBlocks(ctx.candles, ctx.atr);
  if (obs.length === 0) return null;

  let best: DetectedSetup | null = null;
  for (const ob of obs) {
    const ageBars = ctx.candles.length - 1 - ob.formedAtIndex;
    if (ageBars > MAX_OB_AGE_BARS || ageBars < 2) continue;
    const candidate = ob.direction === "bullish"
      ? evaluateOBSell(ctx, ob)
      : evaluateOBBuy(ctx, ob);
    if (candidate && (best === null || candidate.confidenceScore > best.confidenceScore)) {
      best = candidate;
    }
  }
  return best;
}

function findOrderBlocks(candles: CandleRow[], atr: number): OrderBlock[] {
  const out: OrderBlock[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const ob = candles[i];
    const next = candles[i + 1];
    const obIsBullish = ob.close > ob.open;
    const obIsBearish = ob.close < ob.open;
    const nextIsBearishDisp = isDisplacement(next, "bearish", atr);
    const nextIsBullishDisp = isDisplacement(next, "bullish", atr);

    // Bullish OB → bearish break: last up candle before sell-off
    if (obIsBullish && nextIsBearishDisp && next.close < ob.low) {
      out.push({
        direction: "bullish",
        high: ob.high,
        low: ob.low,
        body: { high: Math.max(ob.open, ob.close), low: Math.min(ob.open, ob.close) },
        formedAtIndex: i,
      });
    }

    // Bearish OB → bullish break: last down candle before rally
    if (obIsBearish && nextIsBullishDisp && next.close > ob.high) {
      out.push({
        direction: "bearish",
        high: ob.high,
        low: ob.low,
        body: { high: Math.max(ob.open, ob.close), low: Math.min(ob.open, ob.close) },
        formedAtIndex: i,
      });
    }
  }
  return out;
}

function isDisplacement(c: CandleRow, dir: "bullish" | "bearish", atr: number): boolean {
  const range = c.high - c.low;
  const body = Math.abs(c.close - c.open);
  if (range <= 0) return false;
  const bodyRatio = body / range;
  if (bodyRatio < DISPLACEMENT_BODY_RATIO) return false;
  if (range < atr * DISPLACEMENT_RANGE_ATR) return false;
  return dir === "bullish" ? c.close > c.open : c.close < c.open;
}

function evaluateOBSell(ctx: OBContext, ob: OrderBlock): DetectedSetup | null {
  const { candles, atr } = ctx;
  if (!atr) return null;
  const latest = candles[candles.length - 1];

  // Step 3-4: latest candle's high must enter the OB body, close back below.
  const wickedIntoBody = latest.high >= ob.body.low;
  const closedBelowBody = latest.close < ob.body.low;
  if (!wickedIntoBody || !closedBelowBody) return null;

  const rejectionWick = latest.high - Math.max(latest.open, latest.close);
  const rejectionStrength = rejectionWick / Math.max(latest.high - latest.low, 1e-9);
  if (rejectionStrength < 0.3) return null;

  const stopLoss = ob.high + atr * 0.3;
  const entry = latest.close;
  if (stopLoss <= entry) return null;
  const risk = stopLoss - entry;

  const minTpDistance = risk * 1.0;
  const sellSideLevels = ctx.activeLevels
    .filter((l) => l.price < entry - minTpDistance && (l.side === "sell" || l.levelType?.includes("low")))
    .map((l) => l.price)
    .sort((a, b) => b - a);
  const tp1 = sellSideLevels[0] ?? entry - risk * 1.5;
  const tp2 = sellSideLevels[1] ?? entry - risk * 2.5;
  const tp3 = sellSideLevels[2] ?? entry - risk * 4;

  const score = scoreOB({ ctx, direction: "bearish", rejectionStrength, riskReward: Math.abs(tp1 - entry) / risk });

  return {
    setupType: "order_block",
    direction: "bearish",
    entry, stopLoss, takeProfit1: tp1, takeProfit2: tp2, takeProfit3: tp3,
    riskReward: Math.abs(tp1 - entry) / risk,
    confidenceScore: score,
    qualityGrade: gradeFromScore(score),
    explanation:
      `Bullish order block [${ob.body.low.toFixed(5)} → ${ob.body.high.toFixed(5)}] retested with ${(rejectionStrength * 100).toFixed(0)}% rejection wick. ` +
      `Original demand candle now treated as supply after the bearish displacement break.`,
    invalidation: `Close above OB high ${ob.high.toFixed(5)} invalidates the supply read.`,
    validHours: 6,
    originalThesis: `Sell from bullish order block retest after bearish displacement break.`,
    requiredConditions: [
      `Price remains below OB body low ${ob.body.low.toFixed(5)}`,
      `${ctx.timeframe} structure remains bearish`,
      `No bullish CHoCH forms`,
      `Spread remains normal`,
    ],
    invalidationConditions: [
      `${ctx.timeframe} candle closes above OB high ${ob.high.toFixed(5)}`,
      `Bullish CHoCH forms after entry`,
      `Opposite A+ signal appears`,
      `Volatility spike invalidates SL logic`,
    ],
  };
}

function evaluateOBBuy(ctx: OBContext, ob: OrderBlock): DetectedSetup | null {
  const { candles, atr } = ctx;
  if (!atr) return null;
  const latest = candles[candles.length - 1];

  const wickedIntoBody = latest.low <= ob.body.high;
  const closedAboveBody = latest.close > ob.body.high;
  if (!wickedIntoBody || !closedAboveBody) return null;

  const rejectionWick = Math.min(latest.open, latest.close) - latest.low;
  const rejectionStrength = rejectionWick / Math.max(latest.high - latest.low, 1e-9);
  if (rejectionStrength < 0.3) return null;

  const stopLoss = ob.low - atr * 0.3;
  const entry = latest.close;
  if (stopLoss >= entry) return null;
  const risk = entry - stopLoss;

  const minTpDistance = risk * 1.0;
  const buySideLevels = ctx.activeLevels
    .filter((l) => l.price > entry + minTpDistance && (l.side === "buy" || l.levelType?.includes("high")))
    .map((l) => l.price)
    .sort((a, b) => a - b);
  const tp1 = buySideLevels[0] ?? entry + risk * 1.5;
  const tp2 = buySideLevels[1] ?? entry + risk * 2.5;
  const tp3 = buySideLevels[2] ?? entry + risk * 4;

  const score = scoreOB({ ctx, direction: "bullish", rejectionStrength, riskReward: Math.abs(tp1 - entry) / risk });

  return {
    setupType: "order_block",
    direction: "bullish",
    entry, stopLoss, takeProfit1: tp1, takeProfit2: tp2, takeProfit3: tp3,
    riskReward: Math.abs(tp1 - entry) / risk,
    confidenceScore: score,
    qualityGrade: gradeFromScore(score),
    explanation:
      `Bearish order block [${ob.body.low.toFixed(5)} → ${ob.body.high.toFixed(5)}] retested with ${(rejectionStrength * 100).toFixed(0)}% rejection wick. ` +
      `Original supply candle now treated as demand after the bullish displacement break.`,
    invalidation: `Close below OB low ${ob.low.toFixed(5)} invalidates the demand read.`,
    validHours: 6,
    originalThesis: `Buy from bearish order block retest after bullish displacement break.`,
    requiredConditions: [
      `Price remains above OB body high ${ob.body.high.toFixed(5)}`,
      `${ctx.timeframe} structure remains bullish`,
      `No bearish CHoCH forms`,
      `Spread remains normal`,
    ],
    invalidationConditions: [
      `${ctx.timeframe} candle closes below OB low ${ob.low.toFixed(5)}`,
      `Bearish CHoCH forms after entry`,
      `Opposite A+ signal appears`,
      `Volatility spike invalidates SL logic`,
    ],
  };
}

function scoreOB(inputs: { ctx: OBContext; direction: "bullish" | "bearish"; rejectionStrength: number; riskReward: number }): number {
  const { ctx, direction, rejectionStrength, riskReward } = inputs;
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
  score += 5; // execution credit
  score += 5; // news credit (event-risk gate handles real veto downstream)
  score += 5; // historical edge credit
  score += 5; // account risk credit
  return Math.round(Math.min(100, Math.max(0, score)));
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}
