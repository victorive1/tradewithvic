// Fair Value Gap Continuation strategy — Quant Engine Blueprint § 7.
//
// Unlike the Inverse FVG (which trades a gap that's been violated),
// the Continuation FVG trades the gap RESPECTED — price returns to
// the FVG, finds support/resistance inside it, and continues the
// original direction. This is the textbook ICT "FVG retest" entry.
//
// BUY pipeline (SELL mirrors):
//   1. Find a recent bullish FVG (3-candle imbalance with bullish c2).
//   2. Verify the FVG was respected — no full close BELOW fvg.low
//      since formation (it's still virgin or tagged-but-held).
//   3. Latest candle's low enters [fvg.low, fvg.high] but close is
//      back ABOVE fvg.high — bullish defence of the gap.
//   4. SL below fvg.low - ATR buffer.
//   5. TPs at buy-side liquidity ≥ 1R away.

import type { DetectedSetup } from "@/lib/brain/strategies-types";

interface CandleRow {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ContextShape {
  symbol: string;
  timeframe: string;
  candles: CandleRow[];
  structure: { bias?: string | null } | null;
  indicators: { trendBias?: string | null; rsi14?: number | null } | null;
  activeLevels: Array<{ levelType: string; price: number; side?: string | null }>;
  atr: number | null;
}

interface FVG {
  direction: "bullish" | "bearish";
  high: number;
  low: number;
  formedAtIndex: number;
}

const MIN_CANDLES = 30;
const MAX_FVG_AGE_BARS = 60;
const DISPLACEMENT_BODY_RATIO = 0.6;

export function detectFVGContinuation(ctx: ContextShape): DetectedSetup | null {
  if (ctx.candles.length < MIN_CANDLES || !ctx.atr) return null;
  const fvgs = findFVGs(ctx.candles);
  if (fvgs.length === 0) return null;

  let best: DetectedSetup | null = null;
  for (const fvg of fvgs) {
    const ageBars = ctx.candles.length - 1 - fvg.formedAtIndex;
    if (ageBars > MAX_FVG_AGE_BARS || ageBars < 2) continue;
    const candidate = fvg.direction === "bullish"
      ? evaluateContinuationBuy(ctx, fvg)
      : evaluateContinuationSell(ctx, fvg);
    if (candidate && (best === null || candidate.confidenceScore > best.confidenceScore)) {
      best = candidate;
    }
  }
  return best;
}

function findFVGs(candles: CandleRow[]): FVG[] {
  const out: FVG[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];
    if (c1.high < c3.low && isBullishDisplacement(c2)) {
      out.push({ direction: "bullish", high: c3.low, low: c1.high, formedAtIndex: i });
    }
    if (c1.low > c3.high && isBearishDisplacement(c2)) {
      out.push({ direction: "bearish", high: c1.low, low: c3.high, formedAtIndex: i });
    }
  }
  return out;
}

function isBullishDisplacement(c: CandleRow): boolean {
  const r = c.high - c.low; const b = Math.abs(c.close - c.open);
  return c.close > c.open && r > 0 && b / r >= DISPLACEMENT_BODY_RATIO;
}
function isBearishDisplacement(c: CandleRow): boolean {
  const r = c.high - c.low; const b = Math.abs(c.close - c.open);
  return c.close < c.open && r > 0 && b / r >= DISPLACEMENT_BODY_RATIO;
}

function evaluateContinuationBuy(ctx: ContextShape, fvg: FVG): DetectedSetup | null {
  const { candles, atr } = ctx;
  if (!atr) return null;

  // Veto if the FVG has been fully violated — that would be an Inverse
  // FVG setup, not a continuation. Continuation requires no candle
  // closing below fvg.low between formation and now.
  for (let i = fvg.formedAtIndex + 1; i < candles.length - 1; i++) {
    if (candles[i].close < fvg.low) return null;
  }

  const latest = candles[candles.length - 1];
  const wickedIntoZone = latest.low <= fvg.high;
  const closedAboveZone = latest.close > fvg.high;
  if (!wickedIntoZone || !closedAboveZone) return null;

  const rejectionWick = Math.min(latest.open, latest.close) - latest.low;
  const rejectionStrength = rejectionWick / Math.max(latest.high - latest.low, 1e-9);
  if (rejectionStrength < 0.3) return null;

  const stopLoss = fvg.low - atr * 0.3;
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

  const score = scoreContinuation(ctx, "bullish", rejectionStrength, Math.abs(tp1 - entry) / risk);

  return {
    setupType: "fvg_continuation",
    direction: "bullish",
    entry, stopLoss, takeProfit1: tp1, takeProfit2: tp2, takeProfit3: tp3,
    riskReward: Math.abs(tp1 - entry) / risk,
    confidenceScore: score,
    qualityGrade: gradeFromScore(score),
    explanation:
      `Bullish FVG [${fvg.low.toFixed(5)} → ${fvg.high.toFixed(5)}] respected — price tagged the gap and bounced with ${(rejectionStrength * 100).toFixed(0)}% rejection wick. ` +
      `Continuation entry on the defended imbalance.`,
    invalidation: `Close below FVG low ${fvg.low.toFixed(5)} converts this into a failed FVG (likely Inverse FVG sell setup).`,
    validHours: 6,
    originalThesis: `Buy from defended bullish FVG — original imbalance still demanding.`,
    requiredConditions: [
      `Price remains above FVG low ${fvg.low.toFixed(5)}`,
      `${ctx.timeframe} structure remains bullish`,
      `No bearish CHoCH forms`,
    ],
    invalidationConditions: [
      `${ctx.timeframe} candle closes below FVG low ${fvg.low.toFixed(5)}`,
      `Bearish CHoCH forms after entry`,
      `Opposite A+ signal appears`,
    ],
  };
}

function evaluateContinuationSell(ctx: ContextShape, fvg: FVG): DetectedSetup | null {
  const { candles, atr } = ctx;
  if (!atr) return null;

  for (let i = fvg.formedAtIndex + 1; i < candles.length - 1; i++) {
    if (candles[i].close > fvg.high) return null;
  }

  const latest = candles[candles.length - 1];
  const wickedIntoZone = latest.high >= fvg.low;
  const closedBelowZone = latest.close < fvg.low;
  if (!wickedIntoZone || !closedBelowZone) return null;

  const rejectionWick = latest.high - Math.max(latest.open, latest.close);
  const rejectionStrength = rejectionWick / Math.max(latest.high - latest.low, 1e-9);
  if (rejectionStrength < 0.3) return null;

  const stopLoss = fvg.high + atr * 0.3;
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

  const score = scoreContinuation(ctx, "bearish", rejectionStrength, Math.abs(tp1 - entry) / risk);

  return {
    setupType: "fvg_continuation",
    direction: "bearish",
    entry, stopLoss, takeProfit1: tp1, takeProfit2: tp2, takeProfit3: tp3,
    riskReward: Math.abs(tp1 - entry) / risk,
    confidenceScore: score,
    qualityGrade: gradeFromScore(score),
    explanation:
      `Bearish FVG [${fvg.low.toFixed(5)} → ${fvg.high.toFixed(5)}] respected — price tagged the gap and rejected with ${(rejectionStrength * 100).toFixed(0)}% rejection wick. ` +
      `Continuation entry on the defended imbalance.`,
    invalidation: `Close above FVG high ${fvg.high.toFixed(5)} converts this into a failed FVG (likely Inverse FVG buy setup).`,
    validHours: 6,
    originalThesis: `Sell from defended bearish FVG — original imbalance still supplying.`,
    requiredConditions: [
      `Price remains below FVG high ${fvg.high.toFixed(5)}`,
      `${ctx.timeframe} structure remains bearish`,
      `No bullish CHoCH forms`,
    ],
    invalidationConditions: [
      `${ctx.timeframe} candle closes above FVG high ${fvg.high.toFixed(5)}`,
      `Bullish CHoCH forms after entry`,
      `Opposite A+ signal appears`,
    ],
  };
}

function scoreContinuation(
  ctx: ContextShape,
  direction: "bullish" | "bearish",
  rejectionStrength: number,
  riskReward: number,
): number {
  let score = 0;
  if (ctx.indicators?.trendBias === direction) score += 15;
  else if (!ctx.indicators?.trendBias) score += 7;
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
  score += 20; // execution + news + edge + account flat credits
  return Math.round(Math.min(100, Math.max(0, score)));
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}
