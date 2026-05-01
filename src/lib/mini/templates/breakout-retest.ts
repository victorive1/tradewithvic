// Mini Template — Breakout & Retest (blueprint § 5).
//
// Price compresses, breaks a clean level with range/volume expansion,
// retests the level, and targets nearby liquidity. Intraday-tuned:
//   • Compression window = last 8 15m bars with range < 0.7× ATR15m
//   • Break candle = body close beyond compression high/low + ≥0.5 ATR
//   • Retest = price returns within 0.3 ATR of broken level + holds
//   • Target = nearest opposing liquidity level, min 1.5R
//
// Pairs well with London/NY open windows where compressed Asian ranges
// frequently break with displacement.

import type { DetectedMiniSetup, MiniContext } from "@/lib/mini/types";
import { computeMiniScore, scoreRR, scoreVolatility, type MiniGate, isDirectionallyConsistent } from "@/lib/mini/scoring";

const COMPRESSION_LOOKBACK = 8;
const COMPRESSION_RANGE_MAX_ATR = 0.7;

export async function detectBreakoutRetest(ctx: MiniContext): Promise<DetectedMiniSetup | null> {
  if (ctx.bias.session.noTradeZone) return null;
  if (ctx.candles15m.length < COMPRESSION_LOOKBACK + 5 || !ctx.atr15m || !ctx.atr5m) return null;

  // Compression window — bars BEFORE the most recent few that are still
  // forming the break. We look at bars [latest-12 .. latest-4] for the
  // coil and bars [latest-4 .. latest] for the break + retest.
  const window = ctx.candles15m.slice(-(COMPRESSION_LOOKBACK + 5), -4);
  if (window.length < 4) return null;

  let cHigh = -Infinity, cLow = Infinity;
  for (const c of window) {
    if (c.high > cHigh) cHigh = c.high;
    if (c.low < cLow) cLow = c.low;
  }
  if (!Number.isFinite(cHigh) || !Number.isFinite(cLow)) return null;
  const compressionRange = cHigh - cLow;
  if (compressionRange > ctx.atr15m * COMPRESSION_RANGE_MAX_ATR) return null;

  // Break candle in the last 4 bars — first bar whose body closes outside
  // compression by ≥ 0.5 ATR.
  const breakWindow = ctx.candles15m.slice(-4);
  let direction: "bullish" | "bearish" | null = null;
  let breakIdx = -1;
  let brokenLevel = 0;
  for (let i = 0; i < breakWindow.length; i++) {
    const c = breakWindow[i];
    if (c.close > cHigh + ctx.atr15m * 0.5) { direction = "bullish"; breakIdx = i; brokenLevel = cHigh; break; }
    if (c.close < cLow  - ctx.atr15m * 0.5) { direction = "bearish"; breakIdx = i; brokenLevel = cLow; break; }
  }
  if (!direction || breakIdx === -1) return null;

  // Retest: a subsequent bar must touch within 0.3 ATR of the broken level.
  const postBreak = breakWindow.slice(breakIdx + 1);
  if (postBreak.length === 0) return null;
  const touched = postBreak.some((c) =>
    direction === "bullish" ? c.low <= brokenLevel + ctx.atr15m! * 0.3 && c.low >= brokenLevel - ctx.atr15m! * 0.3
                            : c.high >= brokenLevel - ctx.atr15m! * 0.3 && c.high <= brokenLevel + ctx.atr15m! * 0.3,
  );
  if (!touched) return null;

  // 5m hold confirmation: latest 5m bar in trade direction with body ≥40% range.
  const last5m = ctx.candles5m[ctx.candles5m.length - 1];
  const r5 = last5m.high - last5m.low;
  const b5 = Math.abs(last5m.close - last5m.open);
  if (r5 <= 0 || b5 / r5 < 0.4) return null;
  const dirMatch = direction === "bullish" ? last5m.close > last5m.open : last5m.close < last5m.open;
  if (!dirMatch) return null;

  // Bias must NOT strongly oppose.
  if (ctx.bias.state === "high_risk") return null;
  if ((ctx.bias.state === "bearish" && direction === "bullish") ||
      (ctx.bias.state === "bullish" && direction === "bearish")) {
    if (ctx.bias.conviction >= 60) return null;
  }

  // ── Levels ────────────────────────────────────────────────────────────
  const entryMid = last5m.close;
  const buffer = ctx.atr5m * 0.3;
  // SL = back inside compression range (PDF spec).
  const stopLoss = direction === "bullish" ? brokenLevel - buffer : brokenLevel + buffer;
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
  const biasAlignment = ctx.bias.state === direction ? 13 : ctx.bias.state === "ranging" ? 10 : 6;
  // Liquidity event: a sweep into compression is a bonus signal.
  const sweep = ctx.recentSweeps[0];
  const sweepBefore = sweep && (Date.now() - new Date(sweep.detectedAt).getTime()) < 4 * 60 * 60 * 1000;
  const liquidityEvent = sweepBefore ? 12 : 7;
  // Structure: clean break + retest = 13 (BOS-equivalent on 15m).
  const microStructure = 13;
  // Entry zone quality: tighter compression = better.
  const compressionRatio = compressionRange / ctx.atr15m;
  const entryZoneQuality = compressionRatio < 0.4 ? 14 : compressionRatio < 0.6 ? 11 : 8;
  // Momentum: break candle strength.
  const breakBar = breakWindow[breakIdx];
  const breakBody = Math.abs(breakBar.close - breakBar.open);
  const breakRange = breakBar.high - breakBar.low;
  const breakBodyRatio = breakRange > 0 ? breakBody / breakRange : 0;
  const momentum = Math.round(breakBodyRatio * 14);
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
    { id: "compression", label: `Compression coil (${COMPRESSION_LOOKBACK} bars, ≤${COMPRESSION_RANGE_MAX_ATR}× ATR)`, passed: true, evidence: `range ${compressionRange.toFixed(5)} = ${compressionRatio.toFixed(2)}× ATR15m`, hard: true },
    { id: "break",       label: "Body close ≥0.5 ATR beyond level", passed: true, evidence: `${direction} break of ${brokenLevel.toFixed(5)} on ${breakBar.openTime.toISOString().slice(11,16)} UTC`, hard: true },
    { id: "retest",      label: "Retest within 0.3 ATR of level",   passed: touched, evidence: `touched ${brokenLevel.toFixed(5)}±${(ctx.atr15m! * 0.3).toFixed(5)}`, hard: true },
    { id: "5m_hold",     label: "5m body candle in direction",      passed: true, evidence: `body ${(b5 / r5 * 100).toFixed(0)}% of range`, hard: true },
    { id: "bias",        label: "Bias does not strongly oppose",     passed: !(ctx.bias.state === "bearish" && direction === "bullish") && !(ctx.bias.state === "bullish" && direction === "bearish") || ctx.bias.conviction < 60, evidence: `bias=${ctx.bias.state}, conv=${ctx.bias.conviction}`, hard: true },
    { id: "rr",          label: "≥1.5R achievable",                  passed: rr >= 1.5, evidence: `${rr.toFixed(2)}R to ${tp1.toFixed(5)}` },
  ];

  const explanation =
    `${direction === "bullish" ? "Bullish" : "Bearish"} breakout-retest — ` +
    `${COMPRESSION_LOOKBACK}-bar compression at ${cLow.toFixed(5)}-${cHigh.toFixed(5)} broken with ${(breakBodyRatio * 100).toFixed(0)}% body candle, ` +
    `retested ${brokenLevel.toFixed(5)} and held with 5m body confirmation. ` +
    `Score ${score.total}/100 (${score.grade}). RR ${rr.toFixed(2)}R.`;

  return {
    template: "breakout_retest",
    direction,
    entryTimeframe: "15m",
    speedClass: "intraday_15m",
    entryZoneLow:  Math.min(brokenLevel, entryMid),
    entryZoneHigh: Math.max(brokenLevel, entryMid),
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    takeProfit3: tp3,
    riskReward: rr,
    entryType: "retest",
    expectedHoldMinutes: 60,
    validityMinutes: 45,
    components: score.components,
    gates,
    explanation,
    invalidation: `15m close back inside compression range (below ${cHigh.toFixed(5)} for longs / above ${cLow.toFixed(5)} for shorts) invalidates the breakout.`,
  };
}
