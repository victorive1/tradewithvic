import { prisma } from "@/lib/prisma";

export type Bias = "bullish" | "bearish" | "range";
export type SwingType = "HH" | "HL" | "LH" | "LL";
export type StructureEventType =
  | "bos_bullish"
  | "bos_bearish"
  | "choch_bullish"
  | "choch_bearish";

interface CandleRow {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Swing {
  time: Date;
  price: number;
  kind: "high" | "low";
  type?: SwingType;
}

export interface StructureAnalysis {
  symbol: string;
  timeframe: string;
  bias: Bias;
  priorBias: Bias;
  swings: Swing[];
  eventDetected?: StructureEventType;
  eventLevel?: number;
  brokerCandleTime?: Date;
  brokerClose?: number;
  candlesAnalyzed: number;
}

/**
 * Fractal pivot detection with 2 bars left + 2 bars right.
 * A pivot high exists at index i when high[i] >= high[i-1..i-2] and high[i] >= high[i+1..i+2].
 * Same idea for pivot lows with `<=`.
 */
function detectFractalSwings(candles: CandleRow[]): Swing[] {
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
    if (isHigh) swings.push({ time: c.openTime, price: c.high, kind: "high" });
    if (isLow) swings.push({ time: c.openTime, price: c.low, kind: "low" });
  }
  return swings;
}

/**
 * Labels each swing HH/HL/LH/LL by comparing to the prior same-kind swing.
 */
function classifySwings(swings: Swing[]): Swing[] {
  let priorHigh: number | null = null;
  let priorLow: number | null = null;
  return swings.map((s) => {
    if (s.kind === "high") {
      s.type = priorHigh === null ? "HH" : s.price > priorHigh ? "HH" : "LH";
      priorHigh = s.price;
    } else {
      s.type = priorLow === null ? "HL" : s.price > priorLow ? "HL" : "LL";
      priorLow = s.price;
    }
    return s;
  });
}

/**
 * Determine bias from the last pair of confirmed swing highs and swing lows.
 * Bullish = HH + HL (both rising). Bearish = LH + LL (both falling). Otherwise range.
 */
function biasFromSwings(swings: Swing[]): Bias {
  const highs = swings.filter((s) => s.kind === "high").slice(-2);
  const lows = swings.filter((s) => s.kind === "low").slice(-2);
  if (highs.length < 2 || lows.length < 2) return "range";
  const highsRising = highs[1].price > highs[0].price;
  const lowsRising = lows[1].price > lows[0].price;
  if (highsRising && lowsRising) return "bullish";
  if (!highsRising && !lowsRising) return "bearish";
  return "range";
}

/**
 * Detect BOS/CHoCH by checking whether any candle after the most recent confirmed swing
 * broke through that swing's level by closing beyond it.
 */
function detectStructureEvent(
  swings: Swing[],
  candles: CandleRow[],
  priorBias: Bias
): Pick<StructureAnalysis, "eventDetected" | "eventLevel" | "brokerCandleTime" | "brokerClose"> {
  if (swings.length === 0) return {};

  const lastHigh = [...swings].reverse().find((s) => s.kind === "high");
  const lastLow = [...swings].reverse().find((s) => s.kind === "low");

  const breakerAfter = (pivot: Swing, kind: "above" | "below"): CandleRow | undefined => {
    return candles.find(
      (c) =>
        c.openTime.getTime() > pivot.time.getTime() &&
        (kind === "above" ? c.close > pivot.price : c.close < pivot.price)
    );
  };

  if (lastHigh) {
    const breaker = breakerAfter(lastHigh, "above");
    if (breaker) {
      return {
        eventDetected: priorBias === "bearish" ? "choch_bullish" : "bos_bullish",
        eventLevel: lastHigh.price,
        brokerCandleTime: breaker.openTime,
        brokerClose: breaker.close,
      };
    }
  }

  if (lastLow) {
    const breaker = breakerAfter(lastLow, "below");
    if (breaker) {
      return {
        eventDetected: priorBias === "bullish" ? "choch_bearish" : "bos_bearish",
        eventLevel: lastLow.price,
        brokerCandleTime: breaker.openTime,
        brokerClose: breaker.close,
      };
    }
  }

  return {};
}

export async function analyzeStructure(
  symbol: string,
  timeframe: string,
  scanCycleId: string | null
): Promise<StructureAnalysis | null> {
  const candleRows = await prisma.candle.findMany({
    where: { symbol, timeframe, isClosed: true },
    orderBy: { openTime: "asc" },
    take: 200,
    select: { openTime: true, open: true, high: true, low: true, close: true },
  });

  if (candleRows.length < 5) return null;

  const swings = classifySwings(detectFractalSwings(candleRows));
  const prior = await prisma.structureState.findUnique({
    where: { symbol_timeframe: { symbol, timeframe } },
  });
  const priorBias: Bias = (prior?.bias as Bias) || "range";

  const newBias = biasFromSwings(swings);
  const event = detectStructureEvent(swings, candleRows, priorBias);

  const highs = swings.filter((s) => s.kind === "high");
  const lows = swings.filter((s) => s.kind === "low");
  const lastHigh = highs.at(-1);
  const priorHigh = highs.at(-2);
  const lastLow = lows.at(-1);
  const priorLow = lows.at(-2);

  await prisma.structureState.upsert({
    where: { symbol_timeframe: { symbol, timeframe } },
    create: {
      symbol,
      timeframe,
      bias: newBias,
      lastSwingHigh: lastHigh?.price,
      lastSwingHighTime: lastHigh?.time,
      priorSwingHigh: priorHigh?.price,
      priorSwingHighTime: priorHigh?.time,
      lastSwingLow: lastLow?.price,
      lastSwingLowTime: lastLow?.time,
      priorSwingLow: priorLow?.price,
      priorSwingLowTime: priorLow?.time,
      lastSwingsJson: JSON.stringify(swings.slice(-8)),
      candlesAnalyzed: candleRows.length,
      lastEventType: event.eventDetected,
      lastEventAt: event.eventDetected ? new Date() : undefined,
    },
    update: {
      bias: newBias,
      lastSwingHigh: lastHigh?.price,
      lastSwingHighTime: lastHigh?.time,
      priorSwingHigh: priorHigh?.price,
      priorSwingHighTime: priorHigh?.time,
      lastSwingLow: lastLow?.price,
      lastSwingLowTime: lastLow?.time,
      priorSwingLow: priorLow?.price,
      priorSwingLowTime: priorLow?.time,
      lastSwingsJson: JSON.stringify(swings.slice(-8)),
      candlesAnalyzed: candleRows.length,
      ...(event.eventDetected && {
        lastEventType: event.eventDetected,
        lastEventAt: new Date(),
      }),
    },
  });

  if (event.eventDetected && priorBias !== newBias) {
    await prisma.structureEvent.create({
      data: {
        symbol,
        timeframe,
        eventType: event.eventDetected,
        priceLevel: event.eventLevel!,
        brokerCandleTime: event.brokerCandleTime!,
        brokerClose: event.brokerClose!,
        priorBias,
        newBias,
        scanCycleId: scanCycleId ?? undefined,
      },
    });
  }

  return {
    symbol,
    timeframe,
    bias: newBias,
    priorBias,
    swings: swings.slice(-8),
    candlesAnalyzed: candleRows.length,
    ...event,
  };
}

export async function analyzeAllStructure(
  symbols: readonly string[],
  timeframes: readonly string[],
  scanCycleId: string | null
): Promise<{ analyses: StructureAnalysis[]; eventsDetected: number }> {
  const analyses: StructureAnalysis[] = [];
  let eventsDetected = 0;
  for (const symbol of symbols) {
    for (const timeframe of timeframes) {
      const result = await analyzeStructure(symbol, timeframe, scanCycleId);
      if (result) {
        analyses.push(result);
        if (result.eventDetected && result.priorBias !== result.bias) eventsDetected++;
      }
    }
  }
  return { analyses, eventsDetected };
}
