import { prisma } from "@/lib/prisma";
import { detectInverseFVG } from "@/lib/brain/strategies/inverse-fvg";
import { detectOrderBlock } from "@/lib/brain/strategies/order-block";
import { detectBreakerBlock } from "@/lib/brain/strategies/breaker-block";
import { detectFVGContinuation } from "@/lib/brain/strategies/fvg-continuation";
import { detectBullishFVGInversion } from "@/lib/brain/strategies/bullish-fvg-inversion";
import { detectTripleLock } from "@/lib/brain/strategies/triple-lock";
import { detectBosChoch } from "@/lib/brain/strategies/bos-choch";
import { detectEngulfingSmc } from "@/lib/brain/strategies/engulfing-smc";
import { detectDealingRangeOte } from "@/lib/brain/strategies/dealing-range-ote";
import { detectSilverBullet } from "@/lib/brain/strategies/silver-bullet";
import { detectMmbm } from "@/lib/brain/strategies/mmbm";
import { detectLondonBreakout } from "@/lib/brain/strategies/london-breakout";
import { detectCrt } from "@/lib/brain/strategies/crt";
import { detectCisd } from "@/lib/brain/strategies/cisd";
import { detectWyckoff } from "@/lib/brain/strategies/wyckoff";
import type { DetectedSetup } from "@/lib/brain/strategies-types";

export type { DetectedSetup };

interface CandleRow {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface StrategyContext {
  symbol: string;
  timeframe: string;
  instrumentId: string | null;
  candles: CandleRow[];
  structure: any | null;
  indicators: any | null;
  recentSweeps: any[];
  activeLevels: any[];
  atr: number | null;
}

// Sensible default thesis conditions for detectors that don't supply
// their own — covers the legacy breakout/pullback/sweep_reversal trio
// without forcing each to be edited. Per Blueprint § 13, every trade
// needs a living thesis with required + invalidation conditions; these
// defaults give the smart-exit + thesis monitor something concrete to
// check each cycle even when the detector hasn't been ported yet.
function defaultRequired(s: DetectedSetup): string[] {
  if (s.direction === "bullish") {
    return [
      `Price remains above stop loss ${s.stopLoss.toFixed(5)}`,
      `Bullish structure on ${s.setupType} timeframe`,
      `Spread remains normal`,
    ];
  }
  return [
    `Price remains below stop loss ${s.stopLoss.toFixed(5)}`,
    `Bearish structure on ${s.setupType} timeframe`,
    `Spread remains normal`,
  ];
}

function defaultInvalidation(s: DetectedSetup): string[] {
  const opposite = s.direction === "bullish" ? "bearish" : "bullish";
  return [
    `${opposite.charAt(0).toUpperCase() + opposite.slice(1)} CHoCH after entry`,
    `Opposite A+ signal appears`,
    `Volatility spike invalidates SL distance`,
    s.invalidation,
  ];
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

function rr(entry: number, sl: number, tp: number, dir: "bullish" | "bearish"): number {
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (risk < 1e-9) return 0;
  return reward / risk;
}

function detectBreakout(ctx: StrategyContext): DetectedSetup | null {
  if (ctx.candles.length < 5 || !ctx.indicators) return null;
  const latest = ctx.candles[ctx.candles.length - 1];
  const atr = ctx.atr ?? Math.abs(latest.high - latest.low);

  const pdHigh = ctx.activeLevels.find((l) => l.levelType === "prev_day_high");
  const pdLow = ctx.activeLevels.find((l) => l.levelType === "prev_day_low");

  if (pdHigh && latest.close > pdHigh.price && latest.open < pdHigh.price) {
    const closeVsRange = (latest.close - latest.low) / Math.max(latest.high - latest.low, 1e-9);
    if (closeVsRange < 0.6) return null;
    const entry = latest.close;
    const stopLoss = pdHigh.price - atr * 0.8;
    const tp1 = entry + atr * 1.5;
    const tp2 = entry + atr * 3;
    const tp3 = entry + atr * 5;
    let score = 55;
    if (ctx.indicators.trendBias === "bullish") score += 20;
    if (ctx.indicators.momentum === "up") score += 10;
    if (ctx.indicators.rsi14 && ctx.indicators.rsi14 > 50 && ctx.indicators.rsi14 < 72) score += 10;
    return {
      setupType: "breakout",
      direction: "bullish",
      entry, stopLoss, takeProfit1: tp1, takeProfit2: tp2, takeProfit3: tp3,
      riskReward: rr(entry, stopLoss, tp1, "bullish"),
      confidenceScore: Math.min(100, score),
      qualityGrade: gradeFromScore(Math.min(100, score)),
      explanation: `Close ${latest.close.toFixed(5)} breaks prior day high ${pdHigh.price.toFixed(5)} with body filling ${(closeVsRange * 100).toFixed(0)}% of candle range.`,
      invalidation: `Close back below ${pdHigh.price.toFixed(5)} invalidates the breakout.`,
      validHours: 4,
    };
  }

  if (pdLow && latest.close < pdLow.price && latest.open > pdLow.price) {
    const closeVsRange = (latest.high - latest.close) / Math.max(latest.high - latest.low, 1e-9);
    if (closeVsRange < 0.6) return null;
    const entry = latest.close;
    const stopLoss = pdLow.price + atr * 0.8;
    const tp1 = entry - atr * 1.5;
    const tp2 = entry - atr * 3;
    const tp3 = entry - atr * 5;
    let score = 55;
    if (ctx.indicators.trendBias === "bearish") score += 20;
    if (ctx.indicators.momentum === "down") score += 10;
    if (ctx.indicators.rsi14 && ctx.indicators.rsi14 < 50 && ctx.indicators.rsi14 > 28) score += 10;
    return {
      setupType: "breakout",
      direction: "bearish",
      entry, stopLoss, takeProfit1: tp1, takeProfit2: tp2, takeProfit3: tp3,
      riskReward: rr(entry, stopLoss, tp1, "bearish"),
      confidenceScore: Math.min(100, score),
      qualityGrade: gradeFromScore(Math.min(100, score)),
      explanation: `Close ${latest.close.toFixed(5)} breaks prior day low ${pdLow.price.toFixed(5)} with body filling ${(closeVsRange * 100).toFixed(0)}% of candle range.`,
      invalidation: `Close back above ${pdLow.price.toFixed(5)} invalidates the breakout.`,
      validHours: 4,
    };
  }

  return null;
}

function detectPullback(ctx: StrategyContext): DetectedSetup | null {
  if (!ctx.indicators || !ctx.indicators.ema20 || !ctx.atr || !ctx.structure) return null;
  const latest = ctx.candles[ctx.candles.length - 1];
  const distanceFromEma20 = Math.abs(latest.close - ctx.indicators.ema20);
  const withinPullbackZone = distanceFromEma20 <= ctx.atr * 0.5;
  if (!withinPullbackZone) return null;

  if (ctx.indicators.trendBias === "bullish" && ctx.structure.bias === "bullish") {
    if (latest.close < ctx.indicators.ema20) return null;
    if (ctx.indicators.rsi14 && ctx.indicators.rsi14 > 70) return null;
    const entry = latest.close;
    const stopLoss = ctx.structure.lastSwingLow ?? entry - ctx.atr * 1.5;
    if (stopLoss >= entry) return null;
    const tp1 = entry + (entry - stopLoss) * 1.5;
    const tp2 = entry + (entry - stopLoss) * 2.5;
    const swingHigh = ctx.structure.lastSwingHigh ?? entry + ctx.atr * 3;
    const tp3 = Math.max(swingHigh, tp2);
    let score = 60;
    if (ctx.indicators.momentum === "up") score += 15;
    if (ctx.indicators.rsi14 && ctx.indicators.rsi14 >= 40 && ctx.indicators.rsi14 <= 55) score += 15;
    if (ctx.indicators.ema50 && ctx.indicators.ema20 > ctx.indicators.ema50) score += 10;
    return {
      setupType: "trend_pullback",
      direction: "bullish",
      entry, stopLoss, takeProfit1: tp1, takeProfit2: tp2, takeProfit3: tp3,
      riskReward: rr(entry, stopLoss, tp1, "bullish"),
      confidenceScore: Math.min(100, score),
      qualityGrade: gradeFromScore(Math.min(100, score)),
      explanation: `Bullish trend pullback — close ${latest.close.toFixed(5)} within ${(distanceFromEma20 / ctx.atr).toFixed(2)}×ATR of EMA20, structure bullish, RSI ${ctx.indicators.rsi14?.toFixed(0) ?? "-"}.`,
      invalidation: `Close below last swing low ${stopLoss.toFixed(5)} invalidates.`,
      validHours: 8,
    };
  }

  if (ctx.indicators.trendBias === "bearish" && ctx.structure.bias === "bearish") {
    if (latest.close > ctx.indicators.ema20) return null;
    if (ctx.indicators.rsi14 && ctx.indicators.rsi14 < 30) return null;
    const entry = latest.close;
    const stopLoss = ctx.structure.lastSwingHigh ?? entry + ctx.atr * 1.5;
    if (stopLoss <= entry) return null;
    const tp1 = entry - (stopLoss - entry) * 1.5;
    const tp2 = entry - (stopLoss - entry) * 2.5;
    const swingLow = ctx.structure.lastSwingLow ?? entry - ctx.atr * 3;
    const tp3 = Math.min(swingLow, tp2);
    let score = 60;
    if (ctx.indicators.momentum === "down") score += 15;
    if (ctx.indicators.rsi14 && ctx.indicators.rsi14 >= 45 && ctx.indicators.rsi14 <= 60) score += 15;
    if (ctx.indicators.ema50 && ctx.indicators.ema20 < ctx.indicators.ema50) score += 10;
    return {
      setupType: "trend_pullback",
      direction: "bearish",
      entry, stopLoss, takeProfit1: tp1, takeProfit2: tp2, takeProfit3: tp3,
      riskReward: rr(entry, stopLoss, tp1, "bearish"),
      confidenceScore: Math.min(100, score),
      qualityGrade: gradeFromScore(Math.min(100, score)),
      explanation: `Bearish trend pullback — close ${latest.close.toFixed(5)} within ${(distanceFromEma20 / ctx.atr).toFixed(2)}×ATR of EMA20, structure bearish.`,
      invalidation: `Close above last swing high ${stopLoss.toFixed(5)} invalidates.`,
      validHours: 8,
    };
  }

  return null;
}

function detectSweepReversal(ctx: StrategyContext): DetectedSetup | null {
  if (!ctx.atr || !ctx.structure) return null;
  const now = Date.now();
  const recentWindow = 1000 * 60 * 60 * 6;
  const sweep = ctx.recentSweeps.find((s) => now - s.detectedAt.getTime() < recentWindow);
  if (!sweep) return null;
  const latest = ctx.candles[ctx.candles.length - 1];
  const atr = ctx.atr;

  if (sweep.sweepDirection === "bullish_sweep") {
    const entry = latest.close;
    const stopLoss = sweep.sweepLow - atr * 0.3;
    if (stopLoss >= entry) return null;
    const risk = entry - stopLoss;
    const tp1 = entry + risk * 1.5;
    const tp2 = entry + risk * 2.5;
    const tp3 = entry + risk * 4;
    let score = 65;
    if (ctx.indicators?.trendBias === "bullish") score += 15;
    if (ctx.indicators?.momentum === "up") score += 10;
    if (sweep.reversalStrength > 0.6) score += 10;
    return {
      setupType: "sweep_reversal",
      direction: "bullish",
      entry, stopLoss, takeProfit1: tp1, takeProfit2: tp2, takeProfit3: tp3,
      riskReward: rr(entry, stopLoss, tp1, "bullish"),
      confidenceScore: Math.min(100, score),
      qualityGrade: gradeFromScore(Math.min(100, score)),
      explanation: `Bullish sweep of ${sweep.levelType} at ${sweep.levelPrice.toFixed(5)} with reversal strength ${(sweep.reversalStrength * 100).toFixed(0)}%.`,
      invalidation: `Close below sweep low ${sweep.sweepLow.toFixed(5)} invalidates.`,
      validHours: 6,
    };
  }

  if (sweep.sweepDirection === "bearish_sweep") {
    const entry = latest.close;
    const stopLoss = sweep.sweepHigh + atr * 0.3;
    if (stopLoss <= entry) return null;
    const risk = stopLoss - entry;
    const tp1 = entry - risk * 1.5;
    const tp2 = entry - risk * 2.5;
    const tp3 = entry - risk * 4;
    let score = 65;
    if (ctx.indicators?.trendBias === "bearish") score += 15;
    if (ctx.indicators?.momentum === "down") score += 10;
    if (sweep.reversalStrength > 0.6) score += 10;
    return {
      setupType: "sweep_reversal",
      direction: "bearish",
      entry, stopLoss, takeProfit1: tp1, takeProfit2: tp2, takeProfit3: tp3,
      riskReward: rr(entry, stopLoss, tp1, "bearish"),
      confidenceScore: Math.min(100, score),
      qualityGrade: gradeFromScore(Math.min(100, score)),
      explanation: `Bearish sweep of ${sweep.levelType} at ${sweep.levelPrice.toFixed(5)} with reversal strength ${(sweep.reversalStrength * 100).toFixed(0)}%.`,
      invalidation: `Close above sweep high ${sweep.sweepHigh.toFixed(5)} invalidates.`,
      validHours: 6,
    };
  }

  return null;
}

export interface StrategyResult {
  symbol: string;
  timeframe: string;
  detected: DetectedSetup[];
  persisted: number;
}

export async function detectStrategies(
  symbol: string,
  timeframe: string,
  instrumentId: string | null,
  scanCycleId: string | null
): Promise<StrategyResult> {
  const [candles, structure, indicators, recentSweeps, activeLevels] = await Promise.all([
    prisma.candle.findMany({
      where: { symbol, timeframe, isClosed: true },
      orderBy: { openTime: "asc" },
      take: 100,
      select: { openTime: true, open: true, high: true, low: true, close: true },
    }),
    prisma.structureState.findUnique({ where: { symbol_timeframe: { symbol, timeframe } } }),
    prisma.indicatorSnapshot.findUnique({ where: { symbol_timeframe: { symbol, timeframe } } }),
    prisma.liquidityEvent.findMany({
      where: { symbol, timeframe },
      orderBy: { detectedAt: "desc" },
      take: 5,
    }),
    prisma.liquidityLevel.findMany({
      where: { symbol, timeframe, status: "active" },
    }),
  ]);

  if (candles.length < 20) {
    return { symbol, timeframe, detected: [], persisted: 0 };
  }

  const ctx: StrategyContext = {
    symbol, timeframe, instrumentId,
    candles: candles as CandleRow[],
    structure,
    indicators,
    recentSweeps,
    activeLevels,
    atr: indicators?.atr14 ?? null,
  };

  const detectors: Array<(c: StrategyContext) => DetectedSetup | null | Promise<DetectedSetup | null>> = [
    detectBreakout,
    detectPullback,
    detectSweepReversal,
    detectInverseFVG,
    detectOrderBlock,
    detectBreakerBlock,
    detectFVGContinuation,
    detectBullishFVGInversion,
    detectTripleLock,
    detectBosChoch,
    detectEngulfingSmc,
    detectDealingRangeOte,
    detectSilverBullet,
    detectMmbm,
    detectLondonBreakout,
    detectCrt,
    detectCisd,
    detectWyckoff,
  ];
  const detected: DetectedSetup[] = [];
  for (const d of detectors) {
    const result = await d(ctx);
    if (result) detected.push(result);
  }

  if (detected.length === 0) {
    return { symbol, timeframe, detected: [], persisted: 0 };
  }

  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const existing = await prisma.tradeSetup.findMany({
    where: {
      symbol, timeframe,
      status: "active",
      createdAt: { gte: thirtyMinAgo },
    },
    select: { setupType: true, direction: true, entry: true },
  });

  const toPersist: DetectedSetup[] = [];
  for (const s of detected) {
    const isDupe = existing.some(
      (e: any) =>
        e.setupType === s.setupType &&
        e.direction === s.direction &&
        Math.abs(e.entry - s.entry) / s.entry < 0.002
    );
    if (!isDupe) toPersist.push(s);
  }

  if (toPersist.length === 0 || !instrumentId) {
    return { symbol, timeframe, detected, persisted: 0 };
  }

  const validUntilBase = Date.now();
  const result = await prisma.tradeSetup.createMany({
    data: toPersist.map((s) => ({
      instrumentId,
      symbol,
      direction: s.direction,
      setupType: s.setupType,
      timeframe,
      entry: s.entry,
      stopLoss: s.stopLoss,
      takeProfit1: s.takeProfit1,
      takeProfit2: s.takeProfit2,
      takeProfit3: s.takeProfit3,
      riskReward: s.riskReward,
      confidenceScore: s.confidenceScore,
      qualityGrade: s.qualityGrade,
      explanation: s.explanation,
      invalidation: s.invalidation,
      originalThesis: s.originalThesis ?? s.explanation,
      requiredConditionsJson: JSON.stringify(s.requiredConditions ?? defaultRequired(s)),
      invalidationConditionsJson: JSON.stringify(s.invalidationConditions ?? defaultInvalidation(s)),
      metadataJson: s.metadata !== undefined ? JSON.stringify(s.metadata) : null,
      status: "active",
      validUntil: new Date(validUntilBase + s.validHours * 60 * 60 * 1000),
    })),
  });

  return { symbol, timeframe, detected, persisted: result.count };
}

export async function detectAllStrategies(
  symbols: readonly string[],
  timeframes: readonly string[],
  symbolToInstrumentId: Map<string, string>,
  scanCycleId: string | null
): Promise<{ results: StrategyResult[]; totalDetected: number; totalPersisted: number }> {
  const pairs: Array<[string, string]> = [];
  for (const s of symbols) for (const tf of timeframes) pairs.push([s, tf]);
  const results = await Promise.all(pairs.map(([s, tf]) =>
    detectStrategies(s, tf, symbolToInstrumentId.get(s) ?? null, scanCycleId),
  ));
  let totalDetected = 0;
  let totalPersisted = 0;
  for (const r of results) {
    totalDetected += r.detected.length;
    totalPersisted += r.persisted;
  }

  await prisma.tradeSetup.updateMany({
    where: { status: "active", validUntil: { lt: new Date() } },
    data: { status: "expired" },
  });

  return { results, totalDetected, totalPersisted };
}
