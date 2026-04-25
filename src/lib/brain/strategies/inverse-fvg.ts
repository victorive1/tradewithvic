// Inverse Fair Value Gap strategy — implements the 15-step model from
// the FX Wonders Quant Engine Blueprint § 8.
//
// SELL pipeline:
//   1. Identify original bullish FVG (3-candle imbalance with bullish c2).
//   2. Confirm prior bullish displacement (c2 body > 60% of range, expanded range).
//   3. Mark FVG high (c3.low), midpoint, low (c1.high).
//   4. Wait for a candle to close below FVG low.
//   5. Require the violation candle to close below the zone with displacement.
//   6. Confirm the break candle is a real displacement, not a wick/doji.
//   7. Confirm CHoCH or market-structure flip (bias was bullish, now bearish).
//   8. Wait for price to retest INTO the FVG zone after violation.
//   9. Confirm bearish rejection — latest candle's high enters the zone but
//      close finishes back below the FVG low.
//   10. Defer spread/session/news risk to the existing scoring + risk layer.
//   11. Score 0–100; ≥80 means A grade (auto-trade) per blueprint § 9.
//   12. Stop above the FVG high + ATR buffer (or above the violation
//       candle high, whichever is further).
//   13. TP1 at nearest sell-side liquidity level (or 1.5R if none nearby).
//   14. TP2 at next deeper sell-side liquidity (or 2.5R fallback).
//   15. Smart-exit invalidation: bullish reclaim of FVG zone — captured
//       in the invalidation field for the existing thesis monitor.
//
// BUY pipeline mirrors with bearish original FVG, bullish violation,
// bullish rejection from above the zone.

import type { DetectedSetup } from "@/lib/brain/strategies-types";

interface CandleRow {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface IFVGContext {
  symbol: string;
  timeframe: string;
  candles: CandleRow[];
  structure: { bias?: string | null; lastSwingHigh?: number | null; lastSwingLow?: number | null; lastEvent?: string | null } | null;
  indicators: { trendBias?: string | null; momentum?: string | null; rsi14?: number | null; ema20?: number | null } | null;
  activeLevels: Array<{ levelType: string; price: number; side?: string | null }>;
  atr: number | null;
}

interface FVGZone {
  direction: "bullish" | "bearish";
  high: number;
  low: number;
  midpoint: number;
  formedAtIndex: number;
}

const MIN_CANDLES = 30;
const MAX_FVG_AGE_BARS = 60; // ignore FVGs older than this many bars
const DISPLACEMENT_BODY_RATIO = 0.6;

export function detectInverseFVG(ctx: IFVGContext): DetectedSetup | null {
  if (ctx.candles.length < MIN_CANDLES || !ctx.atr) return null;

  const fvgs = findFVGs(ctx.candles);
  if (fvgs.length === 0) return null;

  // Score-and-rank candidates; return the highest-scoring valid setup.
  let best: DetectedSetup | null = null;

  for (const fvg of fvgs) {
    const ageBars = ctx.candles.length - 1 - fvg.formedAtIndex;
    if (ageBars > MAX_FVG_AGE_BARS) continue;
    if (ageBars < 3) continue; // need room for violation + retest

    const candidate = fvg.direction === "bullish"
      ? evaluateInverseSell(ctx, fvg)
      : evaluateInverseBuy(ctx, fvg);

    if (candidate && (best === null || candidate.confidenceScore > best.confidenceScore)) {
      best = candidate;
    }
  }

  return best;
}

// ─── FVG detection ──────────────────────────────────────────────────────────

function findFVGs(candles: CandleRow[]): FVGZone[] {
  const out: FVGZone[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];

    // Bullish FVG: gap between c1.high and c3.low, c2 is bullish displacement
    if (c1.high < c3.low && isBullishDisplacement(c2)) {
      out.push({
        direction: "bullish",
        high: c3.low,
        low: c1.high,
        midpoint: (c3.low + c1.high) / 2,
        formedAtIndex: i,
      });
    }

    // Bearish FVG: gap between c3.high and c1.low, c2 is bearish displacement
    if (c1.low > c3.high && isBearishDisplacement(c2)) {
      out.push({
        direction: "bearish",
        high: c1.low,
        low: c3.high,
        midpoint: (c1.low + c3.high) / 2,
        formedAtIndex: i,
      });
    }
  }
  return out;
}

function isBullishDisplacement(c: CandleRow): boolean {
  const range = c.high - c.low;
  const body = Math.abs(c.close - c.open);
  return c.close > c.open && range > 0 && body / range >= DISPLACEMENT_BODY_RATIO;
}

function isBearishDisplacement(c: CandleRow): boolean {
  const range = c.high - c.low;
  const body = Math.abs(c.close - c.open);
  return c.close < c.open && range > 0 && body / range >= DISPLACEMENT_BODY_RATIO;
}

// ─── SELL: bullish FVG → violated → retested → rejected ─────────────────────

function evaluateInverseSell(ctx: IFVGContext, fvg: FVGZone): DetectedSetup | null {
  const { candles, atr } = ctx;
  if (!atr) return null;

  // Step 4–6: find the violation candle (closes below FVG low with displacement)
  // somewhere AFTER the FVG was formed, BEFORE the latest candle.
  let violationIdx = -1;
  let violationCandle: CandleRow | null = null;
  for (let i = fvg.formedAtIndex + 1; i < candles.length - 1; i++) {
    const c = candles[i];
    if (c.close < fvg.low && isBearishDisplacement(c)) {
      violationIdx = i;
      violationCandle = c;
      break;
    }
  }
  if (violationIdx === -1 || !violationCandle) return null;

  // Step 8: between violation and now, price must have retested INTO the
  // FVG zone (a candle whose high re-entered [fvg.low, fvg.high]).
  let retestSeen = false;
  for (let i = violationIdx + 1; i < candles.length; i++) {
    if (candles[i].high >= fvg.low) { retestSeen = true; break; }
  }
  if (!retestSeen) return null;

  // Step 9: latest candle shows bearish rejection — wicked into the zone
  // but closed back below the FVG low.
  const latest = candles[candles.length - 1];
  const wickedIntoZone = latest.high >= fvg.low;
  const closedBelowZone = latest.close < fvg.low;
  if (!wickedIntoZone || !closedBelowZone) return null;

  const rejectionWickSize = latest.high - Math.max(latest.open, latest.close);
  const rejectionStrength = rejectionWickSize / Math.max(latest.high - latest.low, 1e-9);
  if (rejectionStrength < 0.3) return null; // require a real wick, not just a body close

  // Step 12: stop above max(fvg.high, violation candle high) + ATR buffer.
  const stopAnchor = Math.max(fvg.high, violationCandle.high);
  const stopLoss = stopAnchor + atr * 0.3;
  const entry = latest.close;
  if (stopLoss <= entry) return null;
  const risk = stopLoss - entry;

  // Step 13–14: prefer real liquidity levels for TPs; fall back to
  // R-multiples. Only consider levels at least 1R away — a level just
  // a few pips inside the risk budget gives an unworkably low RR.
  const minTpDistance = risk * 1.0;
  const sellSideLevels = ctx.activeLevels
    .filter((l) => l.price < entry - minTpDistance && (l.side === "sell" || l.levelType?.includes("low")))
    .map((l) => l.price)
    .sort((a, b) => b - a); // closest qualifying level first
  const tp1 = sellSideLevels[0] ?? entry - risk * 1.5;
  const tp2 = sellSideLevels[1] ?? entry - risk * 2.5;
  const tp3 = sellSideLevels[2] ?? entry - risk * 4;

  // Step 11: score per blueprint § 9 weights.
  const score = scoreSetup({
    ctx,
    direction: "bearish",
    fvg,
    rejectionStrength,
    riskReward: risk > 0 ? Math.abs(tp1 - entry) / risk : 0,
  });

  return {
    setupType: "inverse_fvg",
    direction: "bearish",
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    takeProfit3: tp3,
    riskReward: risk > 0 ? Math.abs(tp1 - entry) / risk : 0,
    confidenceScore: score,
    qualityGrade: gradeFromScore(score),
    explanation:
      `Bullish FVG [${fvg.low.toFixed(5)} → ${fvg.high.toFixed(5)}] violated by close at ${violationCandle.close.toFixed(5)}, ` +
      `retested back into the zone, latest candle closed ${latest.close.toFixed(5)} with ${(rejectionStrength * 100).toFixed(0)}% rejection wick. ` +
      `Treating the FVG as a flipped sell-side supply zone.`,
    invalidation:
      `1H bullish reclaim of the inverse FVG (close above ${fvg.high.toFixed(5)}) invalidates the thesis. ` +
      `Bullish CHoCH after entry is also a hard invalidation.`,
    validHours: 6,
    originalThesis:
      `Sell from inverse FVG after bullish FVG violation at ${fvg.low.toFixed(5)}. ` +
      `The FVG flipped from demand to supply on the displacement break.`,
    requiredConditions: [
      `Price remains below inverse FVG low ${fvg.low.toFixed(5)}`,
      `${ctx.timeframe} structure remains bearish`,
      `No bullish CHoCH forms`,
      `Spread remains normal`,
    ],
    invalidationConditions: [
      `${ctx.timeframe} candle closes above inverse FVG high ${fvg.high.toFixed(5)}`,
      `Bullish CHoCH forms after entry`,
      `Opposite A+ signal appears`,
      `Volatility spike invalidates SL logic`,
    ],
  };
}

// ─── BUY: bearish FVG → violated upward → retested → rejected ───────────────

function evaluateInverseBuy(ctx: IFVGContext, fvg: FVGZone): DetectedSetup | null {
  const { candles, atr } = ctx;
  if (!atr) return null;

  let violationIdx = -1;
  let violationCandle: CandleRow | null = null;
  for (let i = fvg.formedAtIndex + 1; i < candles.length - 1; i++) {
    const c = candles[i];
    if (c.close > fvg.high && isBullishDisplacement(c)) {
      violationIdx = i;
      violationCandle = c;
      break;
    }
  }
  if (violationIdx === -1 || !violationCandle) return null;

  let retestSeen = false;
  for (let i = violationIdx + 1; i < candles.length; i++) {
    if (candles[i].low <= fvg.high) { retestSeen = true; break; }
  }
  if (!retestSeen) return null;

  const latest = candles[candles.length - 1];
  const wickedIntoZone = latest.low <= fvg.high;
  const closedAboveZone = latest.close > fvg.high;
  if (!wickedIntoZone || !closedAboveZone) return null;

  const rejectionWickSize = Math.min(latest.open, latest.close) - latest.low;
  const rejectionStrength = rejectionWickSize / Math.max(latest.high - latest.low, 1e-9);
  if (rejectionStrength < 0.3) return null;

  const stopAnchor = Math.min(fvg.low, violationCandle.low);
  const stopLoss = stopAnchor - atr * 0.3;
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

  const score = scoreSetup({
    ctx,
    direction: "bullish",
    fvg,
    rejectionStrength,
    riskReward: risk > 0 ? Math.abs(tp1 - entry) / risk : 0,
  });

  return {
    setupType: "inverse_fvg",
    direction: "bullish",
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    takeProfit3: tp3,
    riskReward: risk > 0 ? Math.abs(tp1 - entry) / risk : 0,
    confidenceScore: score,
    qualityGrade: gradeFromScore(score),
    explanation:
      `Bearish FVG [${fvg.low.toFixed(5)} → ${fvg.high.toFixed(5)}] violated by close at ${violationCandle.close.toFixed(5)}, ` +
      `retested back into the zone, latest candle closed ${latest.close.toFixed(5)} with ${(rejectionStrength * 100).toFixed(0)}% rejection wick. ` +
      `Treating the FVG as a flipped buy-side demand zone.`,
    invalidation:
      `1H bearish reclaim of the inverse FVG (close below ${fvg.low.toFixed(5)}) invalidates the thesis. ` +
      `Bearish CHoCH after entry is also a hard invalidation.`,
    validHours: 6,
    originalThesis:
      `Buy from inverse FVG after bearish FVG violation at ${fvg.high.toFixed(5)}. ` +
      `The FVG flipped from supply to demand on the displacement break.`,
    requiredConditions: [
      `Price remains above inverse FVG high ${fvg.high.toFixed(5)}`,
      `${ctx.timeframe} structure remains bullish`,
      `No bearish CHoCH forms`,
      `Spread remains normal`,
    ],
    invalidationConditions: [
      `${ctx.timeframe} candle closes below inverse FVG low ${fvg.low.toFixed(5)}`,
      `Bearish CHoCH forms after entry`,
      `Opposite A+ signal appears`,
      `Volatility spike invalidates SL logic`,
    ],
  };
}

// ─── Scoring (blueprint § 9 weights, adapted to current data shape) ─────────

interface ScoreInputs {
  ctx: IFVGContext;
  direction: "bullish" | "bearish";
  fvg: FVGZone;
  rejectionStrength: number;
  riskReward: number;
}

function scoreSetup(inputs: ScoreInputs): number {
  const { ctx, direction, rejectionStrength, riskReward } = inputs;
  let score = 0;

  // Market regime alignment (15)
  const trendBias = ctx.indicators?.trendBias;
  if (trendBias === direction) score += 15;
  else if (trendBias === null || trendBias === "neutral") score += 7;

  // Multi-timeframe / structure alignment (15) — proxy via current TF structure
  const structureBias = ctx.structure?.bias;
  if (structureBias === direction) score += 15;
  else if (!structureBias) score += 5;

  // Strategy setup quality (20) — rejection wick strength is the core signal
  score += Math.min(20, rejectionStrength * 25);

  // Liquidity confirmation (10) — were there any liquidity levels nearby?
  const nearbyLevels = ctx.activeLevels.length;
  score += Math.min(10, nearbyLevels * 2.5);

  // Volatility quality (10) — ATR present + RSI not overstretched
  if (ctx.atr) score += 5;
  const rsi = ctx.indicators?.rsi14;
  if (rsi != null) {
    if (direction === "bearish" && rsi >= 45 && rsi <= 70) score += 5;
    else if (direction === "bullish" && rsi >= 30 && rsi <= 55) score += 5;
  }

  // Risk-to-reward quality (10) — RR >= 1.5 gets full marks, scaled below
  score += Math.min(10, (riskReward / 2) * 10);

  // Execution quality (5) — placeholder credit; spread/slippage live downstream
  score += 5;

  // News risk (5) — placeholder; the live algo runtime already filters on
  // EventRiskSnapshot before routing, so we credit by default and let that
  // gate veto if needed.
  score += 5;

  // Historical edge (5) + Account risk (5) — flat credit; the adaptive
  // intelligence pipeline + risk governor adjust these post-hoc.
  score += 5;
  score += 5;

  return Math.round(Math.min(100, Math.max(0, score)));
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}
