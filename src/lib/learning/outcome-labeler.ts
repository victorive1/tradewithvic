// Adaptive Intelligence - Candle Replay Outcome Labeling Engine
// Deterministically replays market candles after setup creation to label what actually happened

import { prisma } from "@/lib/prisma";

export interface ReplayCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ReplayResult {
  triggered: boolean;
  entryTriggeredAt?: string;
  tp1Hit: boolean;
  tp1HitAt?: string;
  tp2Hit: boolean;
  tp2HitAt?: string;
  tp3Hit: boolean;
  tp3HitAt?: string;
  slHit: boolean;
  slHitAt?: string;
  expired: boolean;
  invalidated: boolean;
  neverTriggered: boolean;
  maxFavorableExcursion: number;
  maxAdverseExcursion: number;
  barsToTrigger?: number;
  barsToTp1?: number;
  barsToSl?: number;
  outcomeClass: "excellent" | "good" | "neutral" | "poor" | "invalid";
  outcomeScore: number;
  labelQuality: "high" | "medium" | "low";
  labelingWindowMinutes: number;
}

// Replay window limits by timeframe
const REPLAY_WINDOWS: Record<string, { maxCandles: number; maxMinutes: number }> = {
  "5m": { maxCandles: 8, maxMinutes: 40 },
  "15m": { maxCandles: 10, maxMinutes: 150 },
  "1h": { maxCandles: 8, maxMinutes: 720 },
  "4h": { maxCandles: 6, maxMinutes: 2160 },
};

function validateCandles(candles: ReplayCandle[]): boolean {
  if (candles.length === 0) return false;
  for (const c of candles) {
    if (c.low > c.high) return false;
    if (c.close > c.high || c.close < c.low) return false;
    if (c.open > c.high || c.open < c.low) return false;
  }
  return true;
}

export function replaySetup(
  direction: "buy" | "sell",
  entry: number,
  stopLoss: number,
  takeProfit1: number,
  takeProfit2: number | null,
  takeProfit3: number | null,
  timeframe: string,
  candles: ReplayCandle[]
): ReplayResult {
  const window = REPLAY_WINDOWS[timeframe] || REPLAY_WINDOWS["1h"];

  if (!validateCandles(candles)) {
    return {
      triggered: false, tp1Hit: false, tp2Hit: false, tp3Hit: false,
      slHit: false, expired: false, invalidated: false, neverTriggered: true,
      maxFavorableExcursion: 0, maxAdverseExcursion: 0,
      outcomeClass: "invalid", outcomeScore: 0, labelQuality: "low",
      labelingWindowMinutes: window.maxMinutes,
    };
  }

  const replayCandles = candles.slice(0, window.maxCandles);
  const risk = Math.abs(entry - stopLoss);

  let triggered = false;
  let entryTriggeredAt: string | undefined;
  let tp1Hit = false, tp1HitAt: string | undefined;
  let tp2Hit = false, tp2HitAt: string | undefined;
  let tp3Hit = false, tp3HitAt: string | undefined;
  let slHit = false, slHitAt: string | undefined;
  let expired = false;
  let mfe = 0, mae = 0;
  let barsToTrigger: number | undefined;
  let barsToTp1: number | undefined;
  let barsToSl: number | undefined;

  for (let i = 0; i < replayCandles.length; i++) {
    const candle = replayCandles[i];

    if (!triggered) {
      // Check trigger: price touches entry zone
      const didTrigger = direction === "buy"
        ? candle.low <= entry && candle.high >= entry
        : candle.low <= entry && candle.high >= entry;

      if (didTrigger) {
        triggered = true;
        entryTriggeredAt = candle.time;
        barsToTrigger = i + 1;

        // Same-candle collision: check SL first (conservative)
        if (direction === "buy") {
          if (candle.low <= stopLoss) { slHit = true; slHitAt = candle.time; barsToSl = i + 1; break; }
          if (candle.high >= takeProfit1) { tp1Hit = true; tp1HitAt = candle.time; barsToTp1 = i + 1; }
        } else {
          if (candle.high >= stopLoss) { slHit = true; slHitAt = candle.time; barsToSl = i + 1; break; }
          if (candle.low <= takeProfit1) { tp1Hit = true; tp1HitAt = candle.time; barsToTp1 = i + 1; }
        }
        continue;
      }
    } else {
      // Update MFE/MAE
      if (direction === "buy") {
        mfe = Math.max(mfe, candle.high - entry);
        mae = Math.max(mae, entry - candle.low);
      } else {
        mfe = Math.max(mfe, entry - candle.low);
        mae = Math.max(mae, candle.high - entry);
      }

      // Conservative collision check: SL first
      if (direction === "buy") {
        if (candle.low <= stopLoss && candle.high >= takeProfit1 && !tp1Hit) {
          slHit = true; slHitAt = candle.time; barsToSl = i + 1; break;
        }
        if (candle.low <= stopLoss) { slHit = true; slHitAt = candle.time; barsToSl = i + 1; break; }
        if (!tp1Hit && candle.high >= takeProfit1) { tp1Hit = true; tp1HitAt = candle.time; barsToTp1 = i + 1; }
        if (!tp2Hit && takeProfit2 && candle.high >= takeProfit2) { tp2Hit = true; tp2HitAt = candle.time; }
        if (!tp3Hit && takeProfit3 && candle.high >= takeProfit3) { tp3Hit = true; tp3HitAt = candle.time; break; }
      } else {
        if (candle.high >= stopLoss && candle.low <= takeProfit1 && !tp1Hit) {
          slHit = true; slHitAt = candle.time; barsToSl = i + 1; break;
        }
        if (candle.high >= stopLoss) { slHit = true; slHitAt = candle.time; barsToSl = i + 1; break; }
        if (!tp1Hit && candle.low <= takeProfit1) { tp1Hit = true; tp1HitAt = candle.time; barsToTp1 = i + 1; }
        if (!tp2Hit && takeProfit2 && candle.low <= takeProfit2) { tp2Hit = true; tp2HitAt = candle.time; }
        if (!tp3Hit && takeProfit3 && candle.low <= takeProfit3) { tp3Hit = true; tp3HitAt = candle.time; break; }
      }
    }
  }

  if (!triggered) expired = true;
  else if (!slHit && !tp1Hit && !tp3Hit) expired = true;

  // Classify outcome
  let outcomeClass: ReplayResult["outcomeClass"] = "neutral";
  let outcomeScore = 50;

  if (!triggered) {
    outcomeClass = "neutral";
    outcomeScore = 50;
  } else if (tp1Hit && tp2Hit && !slHit) {
    outcomeClass = "excellent";
    outcomeScore = 95;
  } else if (tp1Hit && !slHit) {
    outcomeClass = "good";
    outcomeScore = 75;
  } else if (slHit && !tp1Hit) {
    outcomeClass = "poor";
    outcomeScore = 15;
  } else if (tp1Hit && slHit) {
    // TP1 hit first, then SL later
    outcomeClass = "good";
    outcomeScore = 65;
  } else {
    outcomeClass = "neutral";
    outcomeScore = 45;
  }

  return {
    triggered,
    entryTriggeredAt,
    tp1Hit, tp1HitAt,
    tp2Hit, tp2HitAt,
    tp3Hit, tp3HitAt,
    slHit, slHitAt,
    expired,
    invalidated: false,
    neverTriggered: !triggered,
    maxFavorableExcursion: mfe,
    maxAdverseExcursion: mae,
    barsToTrigger,
    barsToTp1,
    barsToSl,
    outcomeClass,
    outcomeScore,
    labelQuality: candles.length >= window.maxCandles * 0.9 ? "high" : candles.length >= window.maxCandles * 0.5 ? "medium" : "low",
    labelingWindowMinutes: window.maxMinutes,
  };
}

export async function storeOutcome(setupDecisionLogId: string, result: ReplayResult) {
  return prisma.setupOutcome.create({
    data: {
      setupDecisionLogId,
      triggered: result.triggered,
      entryTriggeredAt: result.entryTriggeredAt ? new Date(result.entryTriggeredAt) : null,
      tp1Hit: result.tp1Hit,
      tp1HitAt: result.tp1HitAt ? new Date(result.tp1HitAt) : null,
      tp2Hit: result.tp2Hit,
      tp2HitAt: result.tp2HitAt ? new Date(result.tp2HitAt) : null,
      tp3Hit: result.tp3Hit,
      tp3HitAt: result.tp3HitAt ? new Date(result.tp3HitAt) : null,
      slHit: result.slHit,
      slHitAt: result.slHitAt ? new Date(result.slHitAt) : null,
      expired: result.expired,
      invalidated: result.invalidated,
      neverTriggered: result.neverTriggered,
      maxFavorableExcursion: result.maxFavorableExcursion,
      maxAdverseExcursion: result.maxAdverseExcursion,
      barsToTrigger: result.barsToTrigger,
      barsToTp1: result.barsToTp1,
      barsToSl: result.barsToSl,
      outcomeClass: result.outcomeClass,
      outcomeScore: result.outcomeScore,
      labelingWindowMinutes: result.labelingWindowMinutes,
      labelQuality: result.labelQuality,
    },
  });
}
