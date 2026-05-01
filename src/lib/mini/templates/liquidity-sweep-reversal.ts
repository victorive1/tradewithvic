// Mini Template — Liquidity Sweep Reversal (blueprint § 5).
//
// Price sweeps a short-term high/low, reclaims the level, confirms 5m
// or 15m CHoCH, creates an FVG, then retests for entry. Intraday-tuned
// thresholds:
//   • sweep must be within last 2h (vs Bible's 6h — intraday is faster)
//   • 5m CHoCH within 2 candles of the sweep close (vs Bible's 3)
//   • SL = sweep wick + 0.2 ATR (tight; we're scalping)
//   • TP1 = previous 5m high/low or 1.5R minimum

import type { DetectedMiniSetup, MiniContext } from "@/lib/mini/types";
import { computeMiniScore, scoreRR, scoreVolatility, type MiniGate, isDirectionallyConsistent } from "@/lib/mini/scoring";
import { isInPrimeWindow } from "@/lib/mini/session";

export async function detectLiquiditySweepReversal(ctx: MiniContext): Promise<DetectedMiniSetup | null> {
  if (ctx.bias.session.noTradeZone) return null;
  if (ctx.candles5m.length < 12 || !ctx.atr5m) return null;

  // Recent sweep within 2h (intraday window).
  const sweep = ctx.recentSweeps[0];
  if (!sweep) return null;
  const sweepAge = Date.now() - new Date(sweep.detectedAt).getTime();
  if (sweepAge > 2 * 60 * 60 * 1000) return null;

  let direction: "bullish" | "bearish";
  if (sweep.sweepDirection === "bullish_sweep") direction = "bullish";
  else if (sweep.sweepDirection === "bearish_sweep") direction = "bearish";
  else return null;

  // Bias must NOT contradict.
  if (ctx.bias.state === "high_risk") return null;
  const biasOpposes =
    (direction === "bullish" && ctx.bias.state === "bearish") ||
    (direction === "bearish" && ctx.bias.state === "bullish");
  if (biasOpposes && ctx.bias.conviction >= 60) return null;

  // 5m CHoCH within last 2 closed candles must match direction.
  const expectedChoch = direction === "bullish" ? "choch_bullish" : "choch_bearish";
  const choch5m = ctx.structureEvents5m?.lastEventType === expectedChoch;
  const chochAge = ctx.structureEvents5m?.lastEventAt
    ? (Date.now() - new Date(ctx.structureEvents5m.lastEventAt).getTime()) / 60_000
    : Infinity;
  const chochRecent = chochAge <= 15;

  // FVG that formed AFTER the sweep, in trade direction, on 5m.
  const sweepTime = sweep.sweepCandleTime ? new Date(sweep.sweepCandleTime).getTime() : new Date(sweep.detectedAt).getTime();
  const fvg = findRecentFvg(ctx.candles5m, direction, sweepTime);
  if (!fvg) return null;

  // ── Levels (intraday-tuned) ────────────────────────────────────────────
  const last5m = ctx.candles5m[ctx.candles5m.length - 1];
  // Entry zone is the FVG itself — retest entry preferred.
  const entryZoneLow = Math.min(fvg.low, fvg.high);
  const entryZoneHigh = Math.max(fvg.low, fvg.high);
  const entryMid = (entryZoneLow + entryZoneHigh) / 2;

  const buffer = ctx.atr5m * 0.2;
  const stopLoss = direction === "bullish"
    ? Math.min(sweep.sweepLow ?? fvg.low, fvg.low) - buffer
    : Math.max(sweep.sweepHigh ?? fvg.high, fvg.high) + buffer;
  const risk = Math.abs(entryMid - stopLoss);
  if (risk <= 0) return null;

  // TP1 = nearest opposing 5m structure level or 1.5R (whichever is closer).
  // TP2 = 15m liquidity / next session level. TP3 = 3R.
  const minTp = risk * 1.5;
  const opposingLevels = ctx.activeLevels
    .map((l) => l.price)
    .filter((p) => direction === "bullish" ? p > entryMid + minTp : p < entryMid - minTp)
    .sort((a, b) => direction === "bullish" ? a - b : b - a);
  const tp1 = opposingLevels[0] ?? (direction === "bullish" ? entryMid + risk * 1.8 : entryMid - risk * 1.8);
  const tp2 = opposingLevels[1] ?? (direction === "bullish" ? entryMid + risk * 2.5 : entryMid - risk * 2.5);
  const tp3 = direction === "bullish" ? entryMid + risk * 3.5 : entryMid - risk * 3.5;
  const rr = Math.abs(tp1 - entryMid) / risk;
  if (rr < 1.2) return null;

  // ── 8-component score ─────────────────────────────────────────────────
  const biasAlignment = ctx.bias.state === direction ? 14
                      : ctx.bias.state === "ranging" ? 8
                      : ctx.bias.state === "choppy" ? 4
                      : 6;

  const liquidityEvent = sweepAge < 30 * 60 * 1000 ? 14 : sweepAge < 60 * 60 * 1000 ? 11 : 8;

  const microStructure = choch5m && chochRecent ? 14 : choch5m ? 9 : 5;

  // Entry zone quality — narrower FVGs score higher (precision).
  const fvgWidth = Math.abs(fvg.high - fvg.low);
  const fvgWidthRatio = fvgWidth / (ctx.atr5m || 1);
  const entryZoneQuality = fvgWidthRatio < 0.5 ? 14 : fvgWidthRatio < 1.0 ? 11 : 7;

  // Momentum — body of last 5m bar + sweep reversal strength.
  const last5mRange = last5m.high - last5m.low;
  const last5mBody = Math.abs(last5m.close - last5m.open);
  const bodyRatio = last5mRange > 0 ? last5mBody / last5mRange : 0;
  const reversalStrength = sweep.reversalStrength ?? 0;
  const momentum = Math.min(15, Math.round(bodyRatio * 10 + reversalStrength * 8));

  const volatilitySpread = scoreVolatility(last5mRange, ctx.atr5m, rr, risk);
  const rrScore = scoreRR(rr);
  const sessionTiming = ctx.bias.session.timingScore;

  const score = computeMiniScore({
    biasAlignment, liquidityEvent, microStructure,
    entryZoneQuality, momentumDisplacement: momentum,
    volatilitySpread, riskReward: rrScore, sessionTiming,
  });

  if (!isDirectionallyConsistent(direction, entryMid, stopLoss, tp1)) return null;

  const gates: MiniGate[] = [
    { id: "session",  label: "Active session, no news lockout",          passed: !ctx.bias.session.noTradeZone, evidence: ctx.bias.session.label, hard: true },
    { id: "sweep",    label: "Liquidity sweep within last 2h",           passed: true, evidence: `${sweep.sweepDirection} of ${sweep.levelType ?? "level"} @ ${sweep.levelPrice?.toFixed(5)} (${Math.round(sweepAge / 60_000)}m ago)`, hard: true },
    { id: "bias",     label: "Bias does not strongly oppose direction",   passed: !biasOpposes || ctx.bias.conviction < 60, evidence: `bias=${ctx.bias.state}, conv=${ctx.bias.conviction}`, hard: true },
    { id: "choch",    label: "5m CHoCH within 15m of sweep",              passed: choch5m && chochRecent, evidence: choch5m ? `${expectedChoch} ~${Math.round(chochAge)}m ago` : "no recent matching CHoCH" },
    { id: "fvg",      label: "5m FVG formed after sweep",                 passed: true, evidence: `${direction} FVG ${fvg.low.toFixed(5)}-${fvg.high.toFixed(5)}` },
    { id: "rr",       label: "≥1.5R achievable on TP1",                   passed: rr >= 1.5, evidence: `${rr.toFixed(2)}R to ${tp1.toFixed(5)}` },
    { id: "prime",    label: "Prime window (LDN/NY)",                     passed: isInPrimeWindow(ctx.bias.session), evidence: ctx.bias.session.label },
  ];

  const explanation =
    `${direction === "bullish" ? "Bullish" : "Bearish"} liquidity sweep reversal — ` +
    `${sweep.sweepDirection} of ${sweep.levelType ?? "level"} @ ${sweep.levelPrice?.toFixed(5)} ${Math.round(sweepAge / 60_000)}m ago, ` +
    `${choch5m ? `5m ${expectedChoch} confirmed,` : "awaiting CHoCH confirmation,"} ` +
    `${direction} FVG ${fvg.low.toFixed(5)}-${fvg.high.toFixed(5)} formed for retest entry. ` +
    `Score ${score.total}/100 (${score.grade}). RR ${rr.toFixed(2)}R.`;

  return {
    template: "liquidity_sweep_reversal",
    direction,
    entryTimeframe: "5m",
    speedClass: "scalp_5m",
    entryZoneLow,
    entryZoneHigh,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    takeProfit3: tp3,
    riskReward: rr,
    entryType: "retest",
    expectedHoldMinutes: 25,
    validityMinutes: 25,
    components: score.components,
    gates,
    explanation,
    invalidation: `5m close beyond SL ${stopLoss.toFixed(5)} or opposing 5m CHoCH invalidates this signal.`,
  };
}

interface FVG { direction: "bullish" | "bearish"; high: number; low: number; formedAt: Date; }
function findRecentFvg(candles: { openTime: Date; open: number; high: number; low: number; close: number }[], dir: "bullish" | "bearish", afterTimeMs: number): FVG | null {
  const out: FVG[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];
    if (c3.openTime.getTime() <= afterTimeMs) continue;
    const range = c2.high - c2.low;
    if (range <= 0) continue;
    const body = Math.abs(c2.close - c2.open);
    if (body / range < 0.6) continue;
    if (dir === "bullish" && c1.high < c3.low && c2.close > c2.open) {
      out.push({ direction: "bullish", high: c3.low, low: c1.high, formedAt: c3.openTime });
    } else if (dir === "bearish" && c1.low > c3.high && c2.close < c2.open) {
      out.push({ direction: "bearish", high: c1.low, low: c3.high, formedAt: c3.openTime });
    }
  }
  return out[out.length - 1] ?? null;
}
