// PDF Strategy 06 — CRT (Candle Range Theory).
//
// PO3 mapped onto a single mother candle (H4 or D1):
//   Opening range = first 20-30% of the candle's lifetime
//   Manipulation = price breaks BEYOND the opening range then closes BACK inside
//   Distribution = reversal back in the true direction
// Entry on the M5/M15 reversal candle that closes back inside the opening range.

import type { DetectedSetup } from "@/lib/brain/strategies-types";
import { scoreEps, killzone, volumeMA, loadCandles, loadStructure, type CandleRow, type GateOutcome } from "@/lib/brain/strategies/eps-scoring";

interface StrategyContext {
  symbol: string;
  timeframe: string;
  candles: CandleRow[];
  structure: { bias?: string | null; lastEventType?: string | null } | null;
  indicators: { atr14?: number | null } | null;
  recentSweeps: Array<{ detectedAt: Date; sweepDirection?: string; levelType?: string; levelPrice?: number }>;
  activeLevels: Array<{ levelType: string; price: number }>;
  atr: number | null;
}

export async function detectCrt(ctx: StrategyContext): Promise<DetectedSetup | null> {
  // Run on the 15m pass — the M15 reversal candle is the entry trigger.
  if (ctx.timeframe !== "15m") return null;
  if (!ctx.atr) return null;

  // Mother candle = current H4 candle. Pull the most recent H4 + 4h structure.
  const [candles4h, structure4h, structureD1, candles15mVol] = await Promise.all([
    loadCandles(ctx.symbol, "4h", 5),
    loadStructure(ctx.symbol, "4h"),
    loadStructure(ctx.symbol, "1d"),
    loadCandles(ctx.symbol, "15m", 80, true),
  ]);
  if (candles4h.length < 2) return null;

  // Opening range = first 1h of the H4 mother candle (25% of 4h lifetime).
  // Use M15 candles whose openTime falls in the first 4 quarter-bars after
  // the H4 candle started.
  const motherStart = candles4h[candles4h.length - 1].openTime.getTime();
  const orEnd = motherStart + 60 * 60 * 1000; // first hour
  const orBars = ctx.candles.filter((c) => c.openTime.getTime() >= motherStart && c.openTime.getTime() < orEnd);
  if (orBars.length < 2) return null;
  let orHigh = -Infinity, orLow = Infinity;
  for (const c of orBars) {
    if (c.high > orHigh) orHigh = c.high;
    if (c.low < orLow) orLow = c.low;
  }
  if (!Number.isFinite(orHigh) || !Number.isFinite(orLow) || orHigh <= orLow) return null;

  // Find a manipulation: any candle after orEnd that wicks beyond OR boundary
  // but closes back inside.
  const postOr = ctx.candles.filter((c) => c.openTime.getTime() >= orEnd);
  if (postOr.length < 2) return null;
  let manipIdx = -1;
  let direction: "bullish" | "bearish" | null = null;
  for (let i = 0; i < postOr.length; i++) {
    const c = postOr[i];
    if (c.low < orLow && c.close > orLow && c.close < orHigh) { manipIdx = i; direction = "bullish"; }
    else if (c.high > orHigh && c.close < orHigh && c.close > orLow) { manipIdx = i; direction = "bearish"; }
  }
  if (manipIdx === -1 || !direction) return null;

  // The latest 15m candle must be a reversal candle in the trade direction
  // (close back inside OR + body reaction in trade direction).
  const last = ctx.candles[ctx.candles.length - 1];
  const range = last.high - last.low;
  const body = Math.abs(last.close - last.open);
  if (range <= 0 || body / range < 0.4) return null;
  const reactionDirOk = direction === "bullish" ? last.close > last.open : last.close < last.open;
  if (!reactionDirOk) return null;
  // Last close must be inside OR.
  if (last.close < orLow || last.close > orHigh) return null;

  // HTF bias must align.
  const htfBias = structure4h?.bias ?? structureD1?.bias ?? null;
  if (htfBias && htfBias !== direction) return null;

  // ── Levels ────────────────────────────────────────────────────────────
  const entry = last.close;
  const buffer = ctx.atr * 0.3;
  const manip = postOr[manipIdx];
  const stopLoss = direction === "bullish" ? manip.low - buffer : manip.high + buffer;
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0) return null;
  const tp1 = direction === "bullish" ? orHigh : orLow;
  const rr = Math.abs(tp1 - entry) / risk;
  if (rr < 2) return null;
  const tp2 = direction === "bullish" ? entry + risk * 4 : entry - risk * 4;

  // ── EPS factors ──────────────────────────────────────────────────────
  const sweep = ctx.recentSweeps[0];
  const sweepRecent = sweep && (Date.now() - new Date(sweep.detectedAt).getTime()) < 4 * 60 * 60 * 1000;
  const lq = sweepRecent ? 88 : 65;
  const loc = 80; // manipulation terminated at OR boundary (treated as POI)
  const mom = body / range >= 0.6 ? 85 : 70;
  const vol20 = volumeMA(candles15mVol, 20);
  const vol = vol20 != null && last.volume != null && last.volume > vol20 ? 85 : 60;
  const kz = killzone();
  const eps = scoreEps({ lq, loc, mom, vol, time: kz.score });
  if (eps.tier === "SUPPRESSED") return null;

  const gates: GateOutcome[] = [
    { id: "or",       label: "Opening range built (first hour of H4)", passed: true, evidence: `[${orLow.toFixed(5)}–${orHigh.toFixed(5)}]` },
    { id: "manip",    label: "Manipulation beyond OR + close back",     passed: true, evidence: `${direction === "bullish" ? "below low" : "above high"} at ${manip.openTime.getUTCHours()}:${manip.openTime.getUTCMinutes().toString().padStart(2,"0")}` },
    { id: "reaction", label: "M15 reversal closes inside OR",            passed: true, evidence: `body ${(body/range*100).toFixed(0)}% of range, close ${last.close.toFixed(5)}` },
    { id: "htf",      label: "HTF bias aligns",                          passed: !htfBias || htfBias === direction, evidence: `4h=${structure4h?.bias ?? "—"}, D1=${structureD1?.bias ?? "—"}` },
    { id: "rr",       label: "≥2:1 RR to opposite OR side",              passed: rr >= 2, evidence: `${rr.toFixed(2)}R` },
    { id: "killzone", label: "Killzone active",                           passed: kz.score === 100, evidence: kz.name },
  ];

  return {
    setupType: "crt",
    direction,
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    riskReward: rr,
    confidenceScore: eps.score,
    qualityGrade: eps.qualityGrade,
    explanation: `CRT — H4 opening range [${orLow.toFixed(5)}–${orHigh.toFixed(5)}], manipulation ${direction === "bullish" ? "below" : "above"} closed back inside, M15 reversal candle. EPS ${eps.score}/100 (${eps.tier}). Entry ${entry.toFixed(5)}, SL ${stopLoss.toFixed(5)}, TP1 = opposite OR side ${tp1.toFixed(5)} (${rr.toFixed(2)}R).`,
    invalidation: `Price sustains a body close OUTSIDE OR in the manipulation direction — real breakout, not CRT.`,
    validHours: 4,
    metadata: { strategy: "crt", tier: eps.tier, eps: eps.score, factors: eps.factors, gates },
  };
}
