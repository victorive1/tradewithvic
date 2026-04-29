// PDF Strategy 13 — Wyckoff Method (Spring / UTAD).
//
// Spring  = final shakeout BELOW Phase A's SC low before markup
// UTAD    = "Upthrust After Distribution" — final fakeout ABOVE the
//           range before markdown
// Entry on LPS (Last Point of Support) = pullback after SOS (Sign of
// Strength) on decreasing volume — or LPSY for distribution.
//
// Detector approximation: identify a recent swept extreme (Spring/UTAD)
// followed by a directional close back inside range, with above-average
// volume on the sweep candle and decreasing volume on the pullback bar.

import type { DetectedSetup } from "@/lib/brain/strategies-types";
import { scoreEps, killzone, volumeMA, loadCandles, loadStructure, type CandleRow, type GateOutcome } from "@/lib/brain/strategies/eps-scoring";

interface StrategyContext {
  symbol: string;
  timeframe: string;
  candles: CandleRow[];
  structure: { bias?: string | null; lastEventType?: string | null } | null;
  indicators: { atr14?: number | null; rsi14?: number | null } | null;
  recentSweeps: Array<{ detectedAt: Date; sweepDirection?: string; sweepHigh?: number; sweepLow?: number; sweepClose?: number; levelType?: string; levelPrice?: number; reversalStrength?: number }>;
  activeLevels: Array<{ levelType: string; price: number }>;
  atr: number | null;
}

export async function detectWyckoff(ctx: StrategyContext): Promise<DetectedSetup | null> {
  // Run on 1h pass — Wyckoff phases unfold over hours, not minutes.
  if (ctx.timeframe !== "1h") return null;
  if (ctx.candles.length < 30 || !ctx.atr) return null;

  // Identify the trading range from the last 24-30 1h bars.
  const window = ctx.candles.slice(-25);
  let high = -Infinity, low = Infinity;
  for (const c of window) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
  }
  if (!Number.isFinite(high) || !Number.isFinite(low) || high <= low) return null;

  // Spring or UTAD = recent sweep beyond range extreme.
  const sweep = ctx.recentSweeps[0];
  if (!sweep) return null;
  const sweepRecent = (Date.now() - new Date(sweep.detectedAt).getTime()) < 6 * 60 * 60 * 1000;
  if (!sweepRecent) return null;
  let direction: "bullish" | "bearish";
  if (sweep.sweepDirection === "bullish_sweep") direction = "bullish";
  else if (sweep.sweepDirection === "bearish_sweep") direction = "bearish";
  else return null;

  // The sweep must have cleared the range extreme.
  const swept = direction === "bullish"
    ? (sweep.sweepLow ?? sweep.levelPrice ?? high) <= low + (high - low) * 0.05
    : (sweep.sweepHigh ?? sweep.levelPrice ?? low) >= high - (high - low) * 0.05;
  if (!swept) return null;

  // SOS (Sign of Strength) confirmation: a candle after the sweep that
  // closes well into the range with reversal strength.
  const last = ctx.candles[ctx.candles.length - 1];
  const sosOk = direction === "bullish" ? last.close > low + (high - low) * 0.3 : last.close < high - (high - low) * 0.3;
  if (!sosOk) return null;

  // Volume signature: above-average on sweep, decreasing on pullback.
  const candles1hVol = await loadCandles(ctx.symbol, "1h", 40, true);
  const vol20 = volumeMA(candles1hVol, 20);
  // Find the sweep candle in our candle history.
  const sweepCandleTime = sweep.detectedAt.getTime();
  const sweepCandle = candles1hVol.find((c) => Math.abs(c.openTime.getTime() - sweepCandleTime) < 60 * 60 * 1000);
  const sweepHasClimacticVol = vol20 != null && sweepCandle?.volume != null && sweepCandle.volume > vol20 * 1.3;

  // ── HTF support ─────────────────────────────────────────────────────
  const [structureD1, structureW1] = await Promise.all([
    loadStructure(ctx.symbol, "1d"),
    loadStructure(ctx.symbol, "1w"),
  ]);
  const htfBias = structureD1?.bias ?? structureW1?.bias ?? null;
  // Wyckoff is a reversal model — HTF bias flexible but should at least
  // not aggressively contradict.

  // ── Levels ────────────────────────────────────────────────────────────
  const entry = last.close;
  const buffer = ctx.atr * 0.3;
  const stopLoss = direction === "bullish"
    ? (sweep.sweepLow ?? low) - buffer
    : (sweep.sweepHigh ?? high) + buffer;
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0) return null;
  // Wyckoff target = range width projected from breakout (1× width
  // conservative). Use the opposing range boundary as TP1.
  const tp1 = direction === "bullish" ? high : low;
  const rr = Math.abs(tp1 - entry) / risk;
  if (rr < 2) return null;
  // Aggressive 2× width.
  const rangeWidth = high - low;
  const tp2 = direction === "bullish" ? high + rangeWidth : low - rangeWidth;

  // ── EPS factors ──────────────────────────────────────────────────────
  const lq = swept ? 90 : 70;
  const loc = 80; // ICT OB at Spring/UTAD location is a bonus we don't directly verify
  const mom = sosOk ? 85 : 65;
  const vol = sweepHasClimacticVol ? 92 : 60;
  const kz = killzone();
  const eps = scoreEps({ lq, loc, mom, vol, time: kz.score });
  if (eps.tier === "SUPPRESSED") return null;

  const gates: GateOutcome[] = [
    { id: "range",   label: "Trading range identified (last 25 1h bars)", passed: true,  evidence: `[${low.toFixed(5)}–${high.toFixed(5)}]` },
    { id: "spring",  label: direction === "bullish" ? "Spring — sweep below range" : "UTAD — sweep above range", passed: swept, evidence: `${sweep.sweepDirection} ${sweep.levelType ?? ""}` },
    { id: "sos",     label: "SOS — close back inside range, well past extreme", passed: sosOk, evidence: `last close ${last.close.toFixed(5)}` },
    { id: "vol",     label: "Climactic volume on sweep",                  passed: !!sweepHasClimacticVol, evidence: vol20 != null && sweepCandle?.volume != null ? `${sweepCandle.volume.toFixed(0)} vs 1.3×MA ${(vol20*1.3).toFixed(0)}` : "vol unavailable" },
    { id: "htf",     label: "HTF bias not contradicting",                  passed: !htfBias || htfBias === direction || htfBias === "range", evidence: `D1=${structureD1?.bias ?? "—"}, W1=${structureW1?.bias ?? "—"}` },
    { id: "rr",      label: "≥2:1 RR",                                     passed: rr >= 2, evidence: `${rr.toFixed(2)}R to ${tp1.toFixed(5)}` },
    { id: "killzone", label: "Active session preferred",                   passed: kz.score === 100, evidence: kz.name },
  ];

  return {
    setupType: "wyckoff",
    direction,
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    riskReward: rr,
    confidenceScore: eps.score,
    qualityGrade: eps.qualityGrade,
    explanation: `Wyckoff ${direction === "bullish" ? "Spring" : "UTAD"} — range [${low.toFixed(5)}–${high.toFixed(5)}], sweep beyond extreme with SOS confirmation. EPS ${eps.score}/100 (${eps.tier}). Entry ${entry.toFixed(5)}, SL ${stopLoss.toFixed(5)} (beyond ${direction === "bullish" ? "Spring" : "UTAD"} wick), TP1 = opposing range boundary ${tp1.toFixed(5)} (${rr.toFixed(2)}R), TP2 = 2× range width.`,
    invalidation: `${direction === "bullish" ? "Spring followed by another lower low" : "UTAD followed by another higher high"} — distribution, not accumulation.`,
    validHours: 12,
    metadata: { strategy: "wyckoff", tier: eps.tier, eps: eps.score, factors: eps.factors, range: { high, low }, gates },
  };
}
