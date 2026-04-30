// Intraday Bias Engine — Mini blueprint § 4 + § 3 (1H Bias Layer).
//
// Synthesises a single intraday-bias label from four inputs:
//   • 1H structure (existing brain StructureState)
//   • Current price vs day open / VWAP / EMA20
//   • VWAP slope + price position vs VWAP (normalised by ATR)
//   • 1H candle behaviour (expanding / rejecting / exhausted)
//
// Output is one of: bullish | bearish | ranging | choppy | high_risk.
// "high_risk" trumps the directional labels when volatility / news /
// session conditions make any directional thesis unreliable.

import { prisma } from "@/lib/prisma";
import { computeAnchoredVwap, type VwapAnalysis } from "@/lib/mini/vwap";
import { classifySession, type SessionState } from "@/lib/mini/session";

export type BiasState = "bullish" | "bearish" | "ranging" | "choppy" | "high_risk";

export interface IntradayBias {
  state: BiasState;
  // 0-100 conviction. The Mini scoring formula's "Bias Alignment"
  // factor pulls from this — high conviction bias contributes more
  // to the signal score.
  conviction: number;
  vwap: VwapAnalysis;
  session: SessionState;
  reasons: string[];
  // Whether the 1H candle is currently expanding (real body, momentum
  // continuing) or exhausting (long wick, body shrinking).
  oneHourCandleBehaviour: "expanding" | "rejecting" | "exhausted" | "neutral";
  // The latest 1h close compared with day-open and key 1h structure swings.
  priceVsDayOpen: number | null;
  priceVsEma20: number | null;
  dayOpen: number | null;
}

interface IntradayBiasContext {
  symbol: string;
  candles5m: Array<{ openTime: Date; open: number; high: number; low: number; close: number; volume?: number | null }>;
  candles1h: Array<{ openTime: Date; open: number; high: number; low: number; close: number }>;
  atr1h: number | null;
}

export async function computeIntradayBias(ctx: IntradayBiasContext): Promise<IntradayBias> {
  const session = classifySession();
  const vwap = computeAnchoredVwap(ctx.candles5m, ctx.atr1h);

  // 1H structure from the brain.
  const structure1h = await prisma.structureState.findUnique({
    where: { symbol_timeframe: { symbol: ctx.symbol, timeframe: "1h" } },
    select: { bias: true, lastSwingHigh: true, lastSwingLow: true, lastEventType: true },
  });
  const indicators1h = await prisma.indicatorSnapshot.findUnique({
    where: { symbol_timeframe: { symbol: ctx.symbol, timeframe: "1h" } },
    select: { trendBias: true, momentum: true, ema20: true, atr14: true, rsi14: true },
  });

  const reasons: string[] = [];

  // Day open from the first 1h candle of today (or fallback: latest 1h candle's open).
  const today = new Date();
  const dayOpen1h = ctx.candles1h.find((c) =>
    c.openTime.getUTCDate() === today.getUTCDate()
    && c.openTime.getUTCHours() === 0,
  );
  const dayOpen = dayOpen1h?.open ?? ctx.candles1h[0]?.open ?? null;

  const latest1h = ctx.candles1h[ctx.candles1h.length - 1] ?? null;
  const priceVsDayOpen = dayOpen != null && latest1h ? latest1h.close - dayOpen : null;
  const priceVsEma20 = latest1h && indicators1h?.ema20 != null ? latest1h.close - indicators1h.ema20 : null;

  // Score directional bias from each input source. Each contributes -2..+2.
  let directionScore = 0;
  if (structure1h?.bias === "bullish") { directionScore += 2; reasons.push("1H structure bullish"); }
  else if (structure1h?.bias === "bearish") { directionScore -= 2; reasons.push("1H structure bearish"); }
  else if (structure1h?.bias === "range") { reasons.push("1H structure ranging"); }

  if (indicators1h?.trendBias === "bullish") { directionScore += 1; reasons.push("1H trend indicator bullish"); }
  else if (indicators1h?.trendBias === "bearish") { directionScore -= 1; reasons.push("1H trend indicator bearish"); }

  if (priceVsDayOpen != null) {
    if (priceVsDayOpen > 0) { directionScore += 1; reasons.push(`price ${priceVsDayOpen > 0 ? "above" : "below"} day open`); }
    else if (priceVsDayOpen < 0) directionScore -= 1;
  }
  if (priceVsEma20 != null) {
    if (priceVsEma20 > 0) directionScore += 1;
    else if (priceVsEma20 < 0) directionScore -= 1;
  }
  if (vwap.position != null) {
    if (vwap.position > 0.3) { directionScore += 1; reasons.push("price meaningfully above VWAP"); }
    else if (vwap.position < -0.3) { directionScore -= 1; reasons.push("price meaningfully below VWAP"); }
  }
  if (vwap.slope != null) {
    if (vwap.slope > 0) directionScore += 1;
    else if (vwap.slope < 0) directionScore -= 1;
  }

  // 1h candle behaviour
  const candleBehaviour = classify1hBehaviour(latest1h, ctx.candles1h, ctx.atr1h);

  // High-risk gate: news lockout, dead session, or 1h ATR collapse.
  let state: BiasState;
  let conviction = Math.min(100, Math.abs(directionScore) * 18);

  if (session.newsLockout) {
    state = "high_risk";
    conviction = 0;
    reasons.unshift("news lockout active — high risk");
  } else if (session.noTradeZone) {
    state = "high_risk";
    conviction = Math.min(conviction, 30);
    reasons.unshift(session.noTradeReason ?? "no-trade session");
  } else if (Math.abs(directionScore) >= 5) {
    state = directionScore > 0 ? "bullish" : "bearish";
  } else if (Math.abs(directionScore) >= 2) {
    // Weak directional bias — call it ranging unless candle behaviour
    // confirms.
    if (candleBehaviour === "expanding") {
      state = directionScore > 0 ? "bullish" : "bearish";
      conviction = Math.min(conviction, 65);
    } else {
      state = "ranging";
      conviction = Math.max(conviction, 35);
    }
  } else {
    state = "ranging";
  }

  // Choppy override: short-term whipsaw on 5m signals — many recent
  // direction flips with no follow-through.
  if (state !== "high_risk" && isChoppyOnFiveMin(ctx.candles5m)) {
    state = "choppy";
    reasons.unshift("5m choppy whipsaw");
    conviction = Math.min(conviction, 25);
  }

  return {
    state,
    conviction,
    vwap,
    session,
    reasons,
    oneHourCandleBehaviour: candleBehaviour,
    priceVsDayOpen,
    priceVsEma20,
    dayOpen,
  };
}

function classify1hBehaviour(
  latest: { open: number; high: number; low: number; close: number } | null,
  all: Array<{ open: number; high: number; low: number; close: number }>,
  atr: number | null,
): IntradayBias["oneHourCandleBehaviour"] {
  if (!latest || !atr || atr <= 0) return "neutral";
  const range = latest.high - latest.low;
  const body = Math.abs(latest.close - latest.open);
  const bodyRatio = range > 0 ? body / range : 0;
  const upperWick = latest.high - Math.max(latest.open, latest.close);
  const lowerWick = Math.min(latest.open, latest.close) - latest.low;

  // Expanding: range > 1.2× ATR + body ≥ 60% of range
  if (range > atr * 1.2 && bodyRatio >= 0.6) return "expanding";
  // Rejecting: long wick on one side, small body
  if ((upperWick > body * 2 || lowerWick > body * 2) && bodyRatio < 0.4) return "rejecting";
  // Exhausted: range shrinking vs prior 3 bars
  if (all.length >= 4) {
    const priorAvgRange = (all.slice(-4, -1)
      .reduce((s, c) => s + (c.high - c.low), 0)) / 3;
    if (range < priorAvgRange * 0.6) return "exhausted";
  }
  return "neutral";
}

function isChoppyOnFiveMin(candles5m: Array<{ open: number; close: number }>): boolean {
  if (candles5m.length < 8) return false;
  // Count direction flips in the last 8 bars. ≥ 5 flips = chop.
  const last = candles5m.slice(-8);
  let flips = 0;
  for (let i = 1; i < last.length; i++) {
    const prevDir = last[i - 1].close > last[i - 1].open ? "up" : "down";
    const dir = last[i].close > last[i].open ? "up" : "down";
    if (prevDir !== dir) flips++;
  }
  return flips >= 5;
}
