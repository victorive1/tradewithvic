// Mini Template — Inverse FVG Flip (blueprint § 5).
//
// A bullish FVG breaks below and becomes resistance, or a bearish FVG
// breaks above and becomes support. Intraday-tight: only 5m FVGs from
// the last 50 bars (~4 hours), only flips that occurred within the
// last 6 bars, and price must be retesting the flipped zone right now.

import type { DetectedMiniSetup, MiniContext } from "@/lib/mini/types";
import { computeMiniScore, scoreRR, scoreVolatility, type MiniGate, isDirectionallyConsistent } from "@/lib/mini/scoring";

const DISPLACEMENT_BODY_RATIO = 0.55;
const FLIP_LOOKBACK = 6;
const FVG_AGE_MAX = 50;

interface RawFvg { direction: "bullish" | "bearish"; high: number; low: number; idx: number; }

export async function detectInverseFvgFlip(ctx: MiniContext): Promise<DetectedMiniSetup | null> {
  if (ctx.bias.session.noTradeZone) return null;
  if (ctx.candles5m.length < FVG_AGE_MAX || !ctx.atr5m) return null;

  const fvgs = findFvgs(ctx.candles5m).slice(-15);
  // Look for an FVG that has been broken through (closed past) within
  // the last FLIP_LOOKBACK bars, in the OPPOSITE direction of its sign.
  const cutoffIdx = ctx.candles5m.length - 1 - FLIP_LOOKBACK;
  let flipped: { fvg: RawFvg; flippedAtIdx: number } | null = null;
  for (const fvg of fvgs) {
    if (fvg.idx > cutoffIdx) continue;
    // For a BULLISH fvg to flip, a candle after fvg.idx must close BELOW fvg.low.
    // For a BEARISH fvg to flip, a candle must close ABOVE fvg.high.
    for (let j = fvg.idx + 1; j < ctx.candles5m.length; j++) {
      const c = ctx.candles5m[j];
      if (fvg.direction === "bullish" && c.close < fvg.low) {
        flipped = { fvg, flippedAtIdx: j };
        break;
      }
      if (fvg.direction === "bearish" && c.close > fvg.high) {
        flipped = { fvg, flippedAtIdx: j };
        break;
      }
    }
    if (flipped) break;
  }
  if (!flipped) return null;
  if (ctx.candles5m.length - 1 - flipped.flippedAtIdx > FLIP_LOOKBACK) return null;

  // After the flip, the fvg is now a resistance zone (was bullish) or
  // support zone (was bearish). Trade direction = OPPOSITE of original FVG.
  const direction: "bullish" | "bearish" = flipped.fvg.direction === "bullish" ? "bearish" : "bullish";

  // Bias must not contradict.
  if (ctx.bias.state === "high_risk") return null;
  if ((ctx.bias.state === "bearish" && direction === "bullish") ||
      (ctx.bias.state === "bullish" && direction === "bearish")) {
    if (ctx.bias.conviction >= 60) return null;
  }

  // Price must currently be inside or near the flipped zone with rejection.
  const last5m = ctx.candles5m[ctx.candles5m.length - 1];
  const zoneLow = flipped.fvg.low;
  const zoneHigh = flipped.fvg.high;
  const inZone = last5m.high >= zoneLow && last5m.low <= zoneHigh;
  if (!inZone) return null;
  // Body in trade direction.
  const r5 = last5m.high - last5m.low;
  const b5 = Math.abs(last5m.close - last5m.open);
  if (r5 <= 0 || b5 / r5 < 0.4) return null;
  const dirOk = direction === "bullish" ? last5m.close > last5m.open : last5m.close < last5m.open;
  if (!dirOk) return null;

  // Close must be on the correct side of the zone for the trade direction.
  // Without this, a candle can wick into the zone but close just past it
  // on the wrong side — producing a setup whose SL ends up on the same
  // side as the entry. Bullish needs close >= zoneLow (rejected up out
  // of the zone or held inside it). Bearish needs close <= zoneHigh.
  if (direction === "bullish" && last5m.close < zoneLow) return null;
  if (direction === "bearish" && last5m.close > zoneHigh) return null;

  // ── Levels ────────────────────────────────────────────────────────────
  const entryMid = last5m.close;
  const buffer = ctx.atr5m * 0.2;
  // SL = beyond the flipped zone + buffer.
  const stopLoss = direction === "bullish" ? zoneLow - buffer : zoneHigh + buffer;
  const risk = Math.abs(entryMid - stopLoss);
  if (risk <= 0) return null;
  const minTp = risk * 1.5;
  const opposing = ctx.activeLevels
    .map((l) => l.price)
    .filter((p) => direction === "bullish" ? p > entryMid + minTp : p < entryMid - minTp)
    .sort((a, b) => direction === "bullish" ? a - b : b - a);
  const tp1 = opposing[0] ?? (direction === "bullish" ? entryMid + risk * 1.8 : entryMid - risk * 1.8);
  const tp2 = opposing[1] ?? (direction === "bullish" ? entryMid + risk * 2.5 : entryMid - risk * 2.5);
  const tp3 = direction === "bullish" ? entryMid + risk * 3.5 : entryMid - risk * 3.5;
  const rr = Math.abs(tp1 - entryMid) / risk;
  if (rr < 1.5) return null;

  // ── 8-component score ─────────────────────────────────────────────────
  const biasAlignment = ctx.bias.state === direction ? 13 : 8;
  // Liquidity event: any sweep before the flip is a bonus.
  const sweep = ctx.recentSweeps[0];
  const sweepBefore = sweep && (Date.now() - new Date(sweep.detectedAt).getTime()) < 3 * 60 * 60 * 1000;
  const liquidityEvent = sweepBefore ? 11 : 6;
  const microStructure = 13; // flip is itself a strong structural event
  // Zone quality: tighter FVG = better.
  const fvgWidth = zoneHigh - zoneLow;
  const fvgRatio = fvgWidth / ctx.atr5m;
  const entryZoneQuality = fvgRatio < 0.4 ? 14 : fvgRatio < 0.8 ? 11 : 7;
  const momentum = Math.round((b5 / r5) * 14);
  const volatilitySpread = scoreVolatility(r5, ctx.atr5m, rr, risk);
  const rrScore = scoreRR(rr);
  const sessionTiming = ctx.bias.session.timingScore;

  const score = computeMiniScore({
    biasAlignment, liquidityEvent, microStructure,
    entryZoneQuality, momentumDisplacement: momentum,
    volatilitySpread, riskReward: rrScore, sessionTiming,
  });

  // Final guard: never emit a setup where SL/TP geometry is inverted.
  if (!isDirectionallyConsistent(direction, entryMid, stopLoss, tp1)) return null;

  const flippedAt = ctx.candles5m[flipped.flippedAtIdx].openTime;
  const gates: MiniGate[] = [
    { id: "fvg_flip", label: `${flipped.fvg.direction} FVG broken through`, passed: true, evidence: `original ${flipped.fvg.low.toFixed(5)}-${flipped.fvg.high.toFixed(5)}, flipped ${flippedAt.toISOString().slice(11,16)} UTC`, hard: true },
    { id: "retest",   label: "Price retesting flipped zone",                passed: inZone, evidence: `last bar ${last5m.low.toFixed(5)}-${last5m.high.toFixed(5)} touched zone`, hard: true },
    { id: "rejection",label: "Body rejection in trade direction",           passed: true, evidence: `body ${(b5 / r5 * 100).toFixed(0)}% of range`, hard: true },
    { id: "bias",     label: "Bias does not strongly oppose",                passed: !((ctx.bias.state === "bearish" && direction === "bullish") || (ctx.bias.state === "bullish" && direction === "bearish")) || ctx.bias.conviction < 60, evidence: `bias=${ctx.bias.state}, conv=${ctx.bias.conviction}`, hard: true },
    { id: "rr",       label: "≥1.5R to nearest opposing level",              passed: rr >= 1.5, evidence: `${rr.toFixed(2)}R` },
  ];

  const explanation =
    `${direction === "bullish" ? "Bullish" : "Bearish"} inverse FVG flip — ` +
    `original ${flipped.fvg.direction} FVG ${flipped.fvg.low.toFixed(5)}-${flipped.fvg.high.toFixed(5)} broken through, ` +
    `now acting as ${direction === "bullish" ? "support" : "resistance"}. ` +
    `Price retesting with 5m body rejection. Score ${score.total}/100 (${score.grade}). RR ${rr.toFixed(2)}R.`;

  return {
    template: "inverse_fvg_flip",
    direction,
    entryTimeframe: "5m",
    speedClass: "scalp_5m",
    entryZoneLow: zoneLow,
    entryZoneHigh: zoneHigh,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    takeProfit3: tp3,
    riskReward: rr,
    entryType: "retest",
    expectedHoldMinutes: 30,
    validityMinutes: 25,
    components: score.components,
    gates,
    explanation,
    invalidation: `5m close beyond SL ${stopLoss.toFixed(5)} (back through the flipped zone) invalidates the flip.`,
  };
}

function findFvgs(candles: { high: number; low: number; open: number; close: number }[]): RawFvg[] {
  const out: RawFvg[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];
    const range = c2.high - c2.low;
    if (range <= 0) continue;
    const body = Math.abs(c2.close - c2.open);
    if (body / range < DISPLACEMENT_BODY_RATIO) continue;
    if (c1.high < c3.low && c2.close > c2.open) out.push({ direction: "bullish", high: c3.low, low: c1.high, idx: i });
    if (c1.low > c3.high && c2.close < c2.open) out.push({ direction: "bearish", high: c1.low, low: c3.high, idx: i });
  }
  return out;
}
