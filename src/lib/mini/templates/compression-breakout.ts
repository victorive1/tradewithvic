// Mini Template — Compression Breakout (blueprint § 5).
//
// ATR compresses + equal highs/lows build → breakout fires during a
// strong session phase with displacement. Distinct from breakout-retest:
// no retest required; we trade the breakout itself when ATR collapse is
// extreme. Triggers only inside London/NY/Overlap.

import type { DetectedMiniSetup, MiniContext } from "@/lib/mini/types";
import { computeMiniScore, scoreRR, scoreVolatility, type MiniGate } from "@/lib/mini/scoring";
import { isInPrimeWindow } from "@/lib/mini/session";

const COMPRESSION_BARS = 10;
const ATR_COMPRESSION_RATIO = 0.55; // recent ATR vs prior ATR

export async function detectCompressionBreakout(ctx: MiniContext): Promise<DetectedMiniSetup | null> {
  if (ctx.bias.session.noTradeZone) return null;
  if (!isInPrimeWindow(ctx.bias.session)) return null; // PDF: requires strong session phase
  if (ctx.candles5m.length < COMPRESSION_BARS * 3 || !ctx.atr5m) return null;

  // Compression detection: average range of last COMPRESSION_BARS bars
  // vs the COMPRESSION_BARS bars before that.
  const recent = ctx.candles5m.slice(-COMPRESSION_BARS);
  const prior  = ctx.candles5m.slice(-COMPRESSION_BARS * 2, -COMPRESSION_BARS);
  if (prior.length < COMPRESSION_BARS) return null;
  const recentAvgRange = recent.reduce((s, c) => s + (c.high - c.low), 0) / COMPRESSION_BARS;
  const priorAvgRange  = prior.reduce((s, c) => s + (c.high - c.low), 0) / COMPRESSION_BARS;
  if (priorAvgRange <= 0) return null;
  if (recentAvgRange / priorAvgRange > ATR_COMPRESSION_RATIO) return null;

  // Coil bounds.
  let cHigh = -Infinity, cLow = Infinity;
  for (const c of recent) {
    if (c.high > cHigh) cHigh = c.high;
    if (c.low < cLow) cLow = c.low;
  }
  if (cHigh <= cLow) return null;

  // Latest 5m must be the breakout candle (close beyond coil + ≥ 0.6 ATR
  // body, ≥ 60% of its range).
  const last5m = ctx.candles5m[ctx.candles5m.length - 1];
  const r5 = last5m.high - last5m.low;
  const b5 = Math.abs(last5m.close - last5m.open);
  if (r5 <= 0 || b5 / r5 < 0.6) return null;

  let direction: "bullish" | "bearish" | null = null;
  if (last5m.close > cHigh && b5 >= ctx.atr5m * 0.6 && last5m.close > last5m.open) direction = "bullish";
  else if (last5m.close < cLow && b5 >= ctx.atr5m * 0.6 && last5m.close < last5m.open) direction = "bearish";
  if (!direction) return null;

  // Bias must not contradict (PDF allows bias-neutral compression breakouts).
  if (ctx.bias.state === "high_risk") return null;
  if ((ctx.bias.state === "bearish" && direction === "bullish") ||
      (ctx.bias.state === "bullish" && direction === "bearish")) {
    if (ctx.bias.conviction >= 60) return null;
  }

  // ── Levels ────────────────────────────────────────────────────────────
  const entryMid = last5m.close;
  const buffer = ctx.atr5m * 0.3;
  const stopLoss = direction === "bullish" ? cLow - buffer : cHigh + buffer;
  const risk = Math.abs(entryMid - stopLoss);
  if (risk <= 0) return null;
  const minTp = risk * 1.5;
  const opposing = ctx.activeLevels
    .map((l) => l.price)
    .filter((p) => direction === "bullish" ? p > entryMid + minTp : p < entryMid - minTp)
    .sort((a, b) => direction === "bullish" ? a - b : b - a);
  const tp1 = opposing[0] ?? (direction === "bullish" ? entryMid + risk * 1.8 : entryMid - risk * 1.8);
  const tp2 = opposing[1] ?? (direction === "bullish" ? entryMid + risk * 2.5 : entryMid - risk * 2.5);
  const tp3 = direction === "bullish" ? entryMid + risk * 4 : entryMid - risk * 4;
  const rr = Math.abs(tp1 - entryMid) / risk;
  if (rr < 1.5) return null;

  // ── 8-component score ─────────────────────────────────────────────────
  const biasAlignment = ctx.bias.state === direction ? 13 : ctx.bias.state === "ranging" ? 10 : 7;
  // Liquidity event: a sweep into compression high/low is a strong cue.
  const sweep = ctx.recentSweeps[0];
  const sweepBefore = sweep && (Date.now() - new Date(sweep.detectedAt).getTime()) < 90 * 60 * 1000;
  const liquidityEvent = sweepBefore ? 11 : 6;
  const microStructure = 12;
  // Tighter compression = better entry.
  const compressionRatio = recentAvgRange / priorAvgRange;
  const entryZoneQuality = compressionRatio < 0.4 ? 14 : compressionRatio < 0.5 ? 11 : 8;
  const momentum = Math.min(15, Math.round((b5 / ctx.atr5m) * 12));
  const volatilitySpread = scoreVolatility(r5, ctx.atr5m, rr, risk);
  const rrScore = scoreRR(rr);
  const sessionTiming = ctx.bias.session.timingScore;

  const score = computeMiniScore({
    biasAlignment, liquidityEvent, microStructure,
    entryZoneQuality, momentumDisplacement: momentum,
    volatilitySpread, riskReward: rrScore, sessionTiming,
  });

  const gates: MiniGate[] = [
    { id: "session",     label: "Prime session window (LDN/NY)",        passed: true, evidence: ctx.bias.session.label, hard: true },
    { id: "compression", label: `ATR compression ratio ≤${ATR_COMPRESSION_RATIO}`, passed: true, evidence: `recent/prior ATR = ${compressionRatio.toFixed(2)}`, hard: true },
    { id: "displacement",label: "Breakout candle: body ≥60% range + ≥0.6× ATR", passed: true, evidence: `body ${(b5 / ctx.atr5m).toFixed(2)}× ATR, ${(b5 / r5 * 100).toFixed(0)}% of range`, hard: true },
    { id: "bias",        label: "Bias does not strongly oppose",         passed: !((ctx.bias.state === "bearish" && direction === "bullish") || (ctx.bias.state === "bullish" && direction === "bearish")) || ctx.bias.conviction < 60, evidence: `bias=${ctx.bias.state}, conv=${ctx.bias.conviction}` },
    { id: "rr",          label: "≥1.5R achievable",                      passed: rr >= 1.5, evidence: `${rr.toFixed(2)}R` },
  ];

  const explanation =
    `${direction === "bullish" ? "Bullish" : "Bearish"} compression breakout — ` +
    `${COMPRESSION_BARS}-bar coil [${cLow.toFixed(5)}-${cHigh.toFixed(5)}] with ATR compression ${(compressionRatio * 100).toFixed(0)}%, ` +
    `${direction} breakout candle on ${ctx.bias.session.label}. ` +
    `Score ${score.total}/100 (${score.grade}). RR ${rr.toFixed(2)}R.`;

  return {
    template: "compression_breakout",
    direction,
    entryTimeframe: "5m",
    speedClass: "scalp_5m",
    entryZoneLow: Math.min(cHigh, cLow, entryMid),
    entryZoneHigh: Math.max(cHigh, cLow, entryMid),
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    takeProfit3: tp3,
    riskReward: rr,
    entryType: "breakout",
    expectedHoldMinutes: 35,
    validityMinutes: 20,
    components: score.components,
    gates,
    explanation,
    invalidation: `5m close back inside compression range invalidates the breakout.`,
  };
}
