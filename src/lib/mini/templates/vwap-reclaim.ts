// Mini Template — VWAP Reclaim (blueprint § 5).
//
// Price loses or reclaims VWAP after a sweep, then holds the retest
// and targets session liquidity. The VWAP slope must agree with the
// reclaim direction, otherwise it's just noise around an indecisive
// VWAP.

import type { DetectedMiniSetup, MiniContext } from "@/lib/mini/types";
import { computeMiniScore, scoreRR, scoreVolatility, type MiniGate, isDirectionallyConsistent } from "@/lib/mini/scoring";

export async function detectVwapReclaim(ctx: MiniContext): Promise<DetectedMiniSetup | null> {
  if (ctx.bias.session.noTradeZone) return null;
  if (ctx.candles5m.length < 12 || !ctx.atr5m) return null;
  const v = ctx.bias.vwap;
  if (v.current == null || v.slope == null) return null;
  if (!v.reclaimedBullish && !v.reclaimedBearish) return null;
  const direction: "bullish" | "bearish" = v.reclaimedBullish ? "bullish" : "bearish";

  // VWAP slope must agree with reclaim direction.
  const slopeAgrees = (direction === "bullish" && v.slope > 0) || (direction === "bearish" && v.slope < 0);
  if (!slopeAgrees) return null;

  // Bias must not contradict.
  if (ctx.bias.state === "high_risk") return null;
  if ((ctx.bias.state === "bearish" && direction === "bullish") ||
      (ctx.bias.state === "bullish" && direction === "bearish")) {
    if (ctx.bias.conviction >= 60) return null;
  }

  // Latest 5m must be a body candle in the reclaim direction (the hold).
  const last5m = ctx.candles5m[ctx.candles5m.length - 1];
  const r5 = last5m.high - last5m.low;
  const b5 = Math.abs(last5m.close - last5m.open);
  if (r5 <= 0 || b5 / r5 < 0.45) return null;
  const dirOk = direction === "bullish" ? last5m.close > last5m.open : last5m.close < last5m.open;
  if (!dirOk) return null;

  // Optional: a sweep before the reclaim is bonus liquidity score.
  const sweep = ctx.recentSweeps[0];
  const sweepBefore = sweep && (Date.now() - new Date(sweep.detectedAt).getTime()) < 90 * 60 * 1000;
  const sweepDirOk = sweep && (
    (direction === "bullish" && sweep.sweepDirection === "bullish_sweep") ||
    (direction === "bearish" && sweep.sweepDirection === "bearish_sweep")
  );

  // ── Levels ────────────────────────────────────────────────────────────
  const entryMid = last5m.close;
  const buffer = ctx.atr5m * 0.3;
  // SL beyond the reclaim failure level — recent swing low/high in
  // pullback direction.
  const recent5 = ctx.candles5m.slice(-5);
  const stopLoss = direction === "bullish"
    ? Math.min(...recent5.map((c) => c.low)) - buffer
    : Math.max(...recent5.map((c) => c.high)) + buffer;
  const risk = Math.abs(entryMid - stopLoss);
  if (risk <= 0) return null;
  const minTp = risk * 1.5;
  // Target = session high/low or prev day extremes.
  const sessionTargets = ctx.activeLevels
    .filter((l) => /session|prev_day/.test(l.levelType))
    .map((l) => l.price)
    .filter((p) => direction === "bullish" ? p > entryMid + minTp : p < entryMid - minTp)
    .sort((a, b) => direction === "bullish" ? a - b : b - a);
  const tp1 = sessionTargets[0] ?? (direction === "bullish" ? entryMid + risk * 1.8 : entryMid - risk * 1.8);
  const tp2 = sessionTargets[1] ?? (direction === "bullish" ? entryMid + risk * 2.5 : entryMid - risk * 2.5);
  const tp3 = direction === "bullish" ? entryMid + risk * 3.5 : entryMid - risk * 3.5;
  const rr = Math.abs(tp1 - entryMid) / risk;
  if (rr < 1.5) return null;

  // ── 8-component score ─────────────────────────────────────────────────
  const biasAlignment = ctx.bias.state === direction ? 13 : 9;
  const liquidityEvent = sweepBefore && sweepDirOk ? 13 : sweepBefore ? 8 : 5;
  // Structure: VWAP reclaim is itself the structural event here.
  const microStructure = 12;
  // Entry zone quality: how close last close is to VWAP (precision).
  const distToVwap = Math.abs(last5m.close - v.current);
  const entryZoneQuality = distToVwap < ctx.atr5m * 0.2 ? 14
                         : distToVwap < ctx.atr5m * 0.5 ? 10
                         : 6;
  const momentum = Math.round((b5 / r5) * 14);
  const volatilitySpread = scoreVolatility(r5, ctx.atr5m, rr, risk);
  const rrScore = scoreRR(rr);
  const sessionTiming = ctx.bias.session.timingScore;

  const score = computeMiniScore({
    biasAlignment, liquidityEvent, microStructure,
    entryZoneQuality, momentumDisplacement: momentum,
    volatilitySpread, riskReward: rrScore, sessionTiming,
  });

  if (!isDirectionallyConsistent(direction, entryMid, stopLoss, tp1)) return null;

  const gates: MiniGate[] = [
    { id: "reclaim",  label: `${direction === "bullish" ? "Bullish" : "Bearish"} VWAP reclaim detected`, passed: true, evidence: `VWAP ${v.current.toFixed(5)}, last close ${last5m.close.toFixed(5)}`, hard: true },
    { id: "slope",    label: "VWAP slope agrees with direction",      passed: slopeAgrees, evidence: `slope=${v.slope.toFixed(6)}/bar`, hard: true },
    { id: "body",     label: "5m body candle holds reclaim",          passed: true, evidence: `body ${(b5 / r5 * 100).toFixed(0)}% of range`, hard: true },
    { id: "bias",     label: "Bias does not strongly oppose",         passed: ctx.bias.state === direction || ctx.bias.conviction < 60, evidence: `bias=${ctx.bias.state}, conv=${ctx.bias.conviction}`, hard: true },
    { id: "sweep",    label: "Pre-reclaim sweep (bonus)",             passed: !!(sweepBefore && sweepDirOk), evidence: sweepBefore ? `${sweep!.sweepDirection} of ${sweep!.levelType}` : "no recent sweep" },
    { id: "rr",       label: "≥1.5R to session liquidity",            passed: rr >= 1.5, evidence: `${rr.toFixed(2)}R to ${tp1.toFixed(5)}` },
  ];

  const explanation =
    `${direction === "bullish" ? "Bullish" : "Bearish"} VWAP reclaim — ` +
    `${sweepBefore ? `prior ${sweep!.sweepDirection} swept liquidity, ` : ""}` +
    `5m close ${direction === "bullish" ? "back above" : "back below"} VWAP ${v.current.toFixed(5)} with body confirmation, slope ${v.slope > 0 ? "+" : ""}${v.slope.toFixed(6)}/bar agrees. ` +
    `Score ${score.total}/100 (${score.grade}). RR ${rr.toFixed(2)}R.`;

  return {
    template: "vwap_reclaim",
    direction,
    entryTimeframe: "5m",
    speedClass: "scalp_5m",
    entryZoneLow: Math.min(v.current, entryMid),
    entryZoneHigh: Math.max(v.current, entryMid),
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    takeProfit3: tp3,
    riskReward: rr,
    entryType: "market",
    expectedHoldMinutes: 30,
    validityMinutes: 30,
    components: score.components,
    gates,
    explanation,
    invalidation: `5m close back through VWAP ${v.current.toFixed(5)} or break of SL ${stopLoss.toFixed(5)} invalidates reclaim.`,
  };
}
