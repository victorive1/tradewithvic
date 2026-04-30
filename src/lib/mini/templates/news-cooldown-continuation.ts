// Mini Template — News Cooldown Continuation (blueprint § 5).
//
// Avoid the chaotic first-spike. After spread/volatility normalise,
// trade the confirmed post-news structure direction. Approximation
// without real news data: detect "news-like" volatility — a 5m bar
// in the last hour ≥3× ATR_5m followed by a stabilising structure.

import type { DetectedMiniSetup, MiniContext } from "@/lib/mini/types";
import { computeMiniScore, scoreRR, scoreVolatility, type MiniGate } from "@/lib/mini/scoring";

const SPIKE_LOOKBACK = 12; // last hour on 5m
const SPIKE_ATR_MULT = 3;
const MIN_BARS_AFTER_SPIKE = 4; // wait at least 20m for cooldown
const MAX_BARS_AFTER_SPIKE = 18; // beyond 90m the spike is yesterday's news

export async function detectNewsCooldownContinuation(ctx: MiniContext): Promise<DetectedMiniSetup | null> {
  if (ctx.bias.session.noTradeZone) return null;
  if (ctx.candles5m.length < SPIKE_LOOKBACK + MAX_BARS_AFTER_SPIKE || !ctx.atr5m) return null;

  // Find the spike — largest range bar in the last SPIKE_LOOKBACK bars
  // that's at least SPIKE_ATR_MULT× ATR.
  const recent = ctx.candles5m.slice(-(SPIKE_LOOKBACK + MAX_BARS_AFTER_SPIKE));
  let spikeIdx = -1;
  let spikeRange = 0;
  for (let i = 0; i < recent.length - MIN_BARS_AFTER_SPIKE; i++) {
    const range = recent[i].high - recent[i].low;
    if (range > ctx.atr5m * SPIKE_ATR_MULT && range > spikeRange) {
      spikeRange = range;
      spikeIdx = i;
    }
  }
  if (spikeIdx === -1) return null;
  const barsSinceSpike = recent.length - 1 - spikeIdx;
  if (barsSinceSpike < MIN_BARS_AFTER_SPIKE || barsSinceSpike > MAX_BARS_AFTER_SPIKE) return null;

  const spike = recent[spikeIdx];
  // Direction of spike (bias for continuation).
  const spikeDir: "bullish" | "bearish" = spike.close > spike.open ? "bullish" : "bearish";

  // Cooldown criteria: post-spike bars' average range must be ≤1.2× ATR
  // (volatility normalised).
  const cooldown = recent.slice(spikeIdx + 1);
  if (cooldown.length === 0) return null;
  const cooldownAvgRange = cooldown.reduce((s, c) => s + (c.high - c.low), 0) / cooldown.length;
  if (cooldownAvgRange > ctx.atr5m * 1.2) return null;

  // Latest 5m must be a continuation candle in spike direction.
  const last5m = recent[recent.length - 1];
  const r5 = last5m.high - last5m.low;
  const b5 = Math.abs(last5m.close - last5m.open);
  if (r5 <= 0 || b5 / r5 < 0.5) return null;
  const dirOk = spikeDir === "bullish" ? last5m.close > last5m.open : last5m.close < last5m.open;
  if (!dirOk) return null;
  // And it must be making progress past the cooldown's local extreme.
  const cooldownExtreme = spikeDir === "bullish"
    ? Math.max(...cooldown.slice(0, -1).map((c) => c.high))
    : Math.min(...cooldown.slice(0, -1).map((c) => c.low));
  const progressing = spikeDir === "bullish" ? last5m.close > cooldownExtreme : last5m.close < cooldownExtreme;
  if (!progressing) return null;

  // Bias must agree.
  if (ctx.bias.state !== spikeDir && ctx.bias.state !== "ranging") return null;

  // ── Levels ────────────────────────────────────────────────────────────
  const entryMid = last5m.close;
  const buffer = ctx.atr5m * 0.3;
  // SL beyond the cooldown's pullback extreme.
  const cooldownPullback = spikeDir === "bullish"
    ? Math.min(...cooldown.map((c) => c.low))
    : Math.max(...cooldown.map((c) => c.high));
  const stopLoss = spikeDir === "bullish" ? cooldownPullback - buffer : cooldownPullback + buffer;
  const risk = Math.abs(entryMid - stopLoss);
  if (risk <= 0) return null;
  const minTp = risk * 1.5;
  // Target: the spike's far edge or beyond.
  const spikeTarget = spikeDir === "bullish" ? spike.high : spike.low;
  const tp1Candidate = ctx.activeLevels
    .map((l) => l.price)
    .filter((p) => spikeDir === "bullish" ? p > entryMid + minTp : p < entryMid - minTp)
    .sort((a, b) => spikeDir === "bullish" ? a - b : b - a)[0]
    ?? (spikeDir === "bullish" ? Math.max(spikeTarget, entryMid + risk * 1.8) : Math.min(spikeTarget, entryMid - risk * 1.8));
  const tp1 = tp1Candidate;
  const tp2 = spikeDir === "bullish" ? entryMid + risk * 2.5 : entryMid - risk * 2.5;
  const tp3 = spikeDir === "bullish" ? entryMid + risk * 3.5 : entryMid - risk * 3.5;
  const rr = Math.abs(tp1 - entryMid) / risk;
  if (rr < 1.5) return null;

  // ── 8-component score ─────────────────────────────────────────────────
  const biasAlignment = ctx.bias.state === spikeDir ? 12 : 9;
  const liquidityEvent = 9; // spike itself is the liquidity event
  const microStructure = 11;
  const entryZoneQuality = 10;
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
    { id: "spike",       label: `News-like spike ≥${SPIKE_ATR_MULT}× ATR detected`, passed: true, evidence: `${spikeDir} spike, range ${(spikeRange / ctx.atr5m).toFixed(2)}× ATR, ${barsSinceSpike} bars ago`, hard: true },
    { id: "cooldown",    label: "Volatility normalised (avg range ≤1.2× ATR)",        passed: true, evidence: `cooldown avg ${(cooldownAvgRange / ctx.atr5m).toFixed(2)}× ATR over ${cooldown.length} bars`, hard: true },
    { id: "progress",    label: "Latest bar progresses past cooldown extreme",        passed: progressing, evidence: `close ${last5m.close.toFixed(5)} vs cooldown extreme ${cooldownExtreme.toFixed(5)}`, hard: true },
    { id: "bias",        label: "Bias agrees with spike direction",                    passed: ctx.bias.state === spikeDir || ctx.bias.state === "ranging", evidence: `bias=${ctx.bias.state}, spike=${spikeDir}`, hard: true },
    { id: "rr",          label: "≥1.5R achievable",                                    passed: rr >= 1.5, evidence: `${rr.toFixed(2)}R` },
  ];

  const explanation =
    `${spikeDir === "bullish" ? "Bullish" : "Bearish"} news cooldown continuation — ` +
    `${(spikeRange / ctx.atr5m).toFixed(2)}× ATR spike ${barsSinceSpike} bars ago, ` +
    `${cooldown.length}-bar cooldown averaged ${(cooldownAvgRange / ctx.atr5m).toFixed(2)}× ATR, ` +
    `latest 5m bar progresses past cooldown extreme. Score ${score.total}/100 (${score.grade}). RR ${rr.toFixed(2)}R.`;

  return {
    template: "news_cooldown_continuation",
    direction: spikeDir,
    entryTimeframe: "5m",
    speedClass: "intraday_15m",
    entryZoneLow: Math.min(cooldownExtreme, entryMid),
    entryZoneHigh: Math.max(cooldownExtreme, entryMid),
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    takeProfit3: tp3,
    riskReward: rr,
    entryType: "market",
    expectedHoldMinutes: 45,
    validityMinutes: 30,
    components: score.components,
    gates,
    explanation,
    invalidation: `Close back through cooldown extreme ${cooldownExtreme.toFixed(5)} or break of SL ${stopLoss.toFixed(5)} invalidates the continuation.`,
  };
}
