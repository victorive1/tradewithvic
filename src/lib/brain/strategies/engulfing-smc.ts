// PDF Strategy 15 — Engulfing + SMC.
//
// An engulfing candle in isolation is unreliable. The PDF's filter:
// the engulfing must form INSIDE a valid HTF Order Block or FVG, after
// a recent liquidity sweep, aligned with HTF bias. That's the A+ setup.

import type { DetectedSetup } from "@/lib/brain/strategies-types";
import { scoreEps, killzone, volumeMA, loadCandles, loadStructure, type CandleRow, type GateOutcome } from "@/lib/brain/strategies/eps-scoring";

interface StrategyContext {
  symbol: string;
  timeframe: string;
  candles: CandleRow[];
  structure: { bias?: string | null; lastSwingHigh?: number | null; lastSwingLow?: number | null; lastEventType?: string | null } | null;
  indicators: { rsi14?: number | null; ema20?: number | null; atr14?: number | null } | null;
  recentSweeps: Array<{ detectedAt: Date; sweepDirection?: string; sweepHigh?: number; sweepLow?: number; levelType?: string; levelPrice?: number }>;
  activeLevels: Array<{ levelType: string; price: number; side?: string | null }>;
  atr: number | null;
}

interface FVG { direction: "bullish" | "bearish"; high: number; low: number; formedAtIndex: number; }

const BODY_RATIO_MIN = 0.6;
const SIZE_MULTIPLE_MIN = 1.5;
const DISPLACEMENT_BODY_RATIO = 0.6;

export async function detectEngulfingSmc(ctx: StrategyContext): Promise<DetectedSetup | null> {
  if (ctx.timeframe !== "15m") return null;
  if (ctx.candles.length < 10 || !ctx.atr) return null;

  // Engulfing detected on the just-closed 15m candle.
  const last = ctx.candles[ctx.candles.length - 1];
  const prev = ctx.candles[ctx.candles.length - 2];
  const range = last.high - last.low;
  if (range <= 0) return null;
  const body = Math.abs(last.close - last.open);
  const prevBody = Math.abs(prev.close - prev.open);
  if (body / range < BODY_RATIO_MIN) return null;
  if (body < prevBody * SIZE_MULTIPLE_MIN) return null;

  let direction: "bullish" | "bearish" | null = null;
  // Bullish engulfing: prev red, current green, current body fully engulfs prev body.
  if (last.close > last.open && prev.close < prev.open) {
    if (last.close > prev.open && last.open < prev.close) direction = "bullish";
  }
  // Bearish engulfing: prev green, current red.
  if (last.close < last.open && prev.close > prev.open) {
    if (last.close < prev.open && last.open > prev.close) direction = "bearish";
  }
  if (!direction) return null;

  // ── Primary gate: engulfing must form INSIDE a valid HTF OB or FVG ──
  const [candles4h, candles1h, candles15mVol, structure4h, structure1h] = await Promise.all([
    loadCandles(ctx.symbol, "4h", 60),
    loadCandles(ctx.symbol, "1h", 80),
    loadCandles(ctx.symbol, "15m", 80, true),
    loadStructure(ctx.symbol, "4h"),
    loadStructure(ctx.symbol, "1h"),
  ]);
  if (candles4h.length < 5 || candles1h.length < 10) return null;

  const fvgs4h = findFVGs(candles4h);
  const fvgs1h = findFVGs(candles1h);
  const insideHtfFvg = [...fvgs4h, ...fvgs1h].find((f) =>
    f.direction === direction && last.close >= f.low && last.close <= f.high,
  );
  if (!insideHtfFvg) return null; // primary gate — non-negotiable per PDF

  // HTF bias must align with the engulfing direction.
  const htfBiasOk = (structure4h?.bias ?? null) === direction || (structure1h?.bias ?? null) === direction;
  if (!htfBiasOk) return null;

  // ── Entry / SL / TP ──────────────────────────────────────────────────
  const entry = last.close; // close of engulfing
  const buffer = ctx.atr * 0.2;
  const stopLoss = direction === "bullish" ? last.low - buffer : last.high + buffer;
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0) return null;
  const minTp = risk * 2;
  const candidates = ctx.activeLevels
    .filter((l) => direction === "bullish" ? l.price > entry + minTp : l.price < entry - minTp)
    .map((l) => l.price)
    .sort((a, b) => direction === "bullish" ? a - b : b - a);
  const tp1 = candidates[0] ?? (direction === "bullish" ? entry + risk * 2.5 : entry - risk * 2.5);
  const tp2 = candidates[1] ?? (direction === "bullish" ? entry + risk * 4 : entry - risk * 4);
  const rr = Math.abs(tp1 - entry) / risk;
  if (rr < 2) return null;

  // ── EPS factors ──────────────────────────────────────────────────────
  const sweep = ctx.recentSweeps[0];
  const sweepRecent = sweep && (Date.now() - new Date(sweep.detectedAt).getTime()) < 3 * 60 * 60 * 1000;
  const sweepDirOk = sweep && (
    (direction === "bullish" && sweep.sweepDirection === "bullish_sweep") ||
    (direction === "bearish" && sweep.sweepDirection === "bearish_sweep")
  );
  const lq = sweepRecent && sweepDirOk ? 92 : sweepRecent ? 60 : 40;
  const loc = 95; // gated above — engulfing inside HTF FVG = A+ location
  const mom = body / range >= 0.7 ? 92 : 75;
  const vol20 = volumeMA(candles15mVol, 20);
  const vol = vol20 != null && last.volume != null && last.volume > vol20 ? 88 : 55;
  const kz = killzone();
  const eps = scoreEps({ lq, loc, mom, vol, time: kz.score });
  if (eps.tier === "SUPPRESSED") return null;

  const gates: GateOutcome[] = [
    { id: "primary", label: "Engulfing inside HTF OB/FVG (PRIMARY GATE)", passed: true, evidence: `inside ${insideHtfFvg.direction} HTF FVG ${insideHtfFvg.low.toFixed(5)}-${insideHtfFvg.high.toFixed(5)}` },
    { id: "bias",    label: "HTF bias aligns",                            passed: htfBiasOk, evidence: `4h=${structure4h?.bias ?? "—"}, 1h=${structure1h?.bias ?? "—"}` },
    { id: "size",    label: "Engulf body ≥1.5× prior + ≥60% range",       passed: true, evidence: `body ${body.toFixed(5)} vs prev ${prevBody.toFixed(5)}` },
    { id: "sweep",   label: "Liquidity sweep within 3h",                  passed: !!(sweepRecent && sweepDirOk), evidence: sweepRecent ? `${sweep!.sweepDirection} of ${sweep!.levelType}` : "no recent sweep" },
    { id: "rsi",     label: "RSI not at extreme",                          passed: !ctx.indicators?.rsi14 || (ctx.indicators.rsi14 > 25 && ctx.indicators.rsi14 < 75), evidence: `RSI ${ctx.indicators?.rsi14?.toFixed(0) ?? "—"}` },
    { id: "vol",     label: "Volume above 20-MA",                          passed: vol >= 80, evidence: vol20 != null ? `${last.volume?.toFixed(0)} vs ${vol20.toFixed(0)}` : "vol unavailable" },
    { id: "rr",      label: "≥2:1 RR achievable",                          passed: rr >= 2, evidence: `${rr.toFixed(2)}R` },
    { id: "killzone",label: "Killzone active",                             passed: kz.score === 100, evidence: kz.name },
  ];

  return {
    setupType: "engulfing_smc",
    direction,
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    riskReward: rr,
    confidenceScore: eps.score,
    qualityGrade: eps.qualityGrade,
    explanation: `${direction === "bullish" ? "Bullish" : "Bearish"} engulfing inside HTF FVG ${insideHtfFvg.low.toFixed(5)}-${insideHtfFvg.high.toFixed(5)}. EPS ${eps.score}/100 (${eps.tier}). Body ${(body/range*100).toFixed(0)}% of range, ${(body/prevBody).toFixed(2)}× prior. Entry ${entry.toFixed(5)}, SL ${stopLoss.toFixed(5)}, TP1 ${tp1.toFixed(5)} (${rr.toFixed(2)}R).`,
    invalidation: `Next candle reverses back through engulfing body — failed pattern.`,
    validHours: 4,
    metadata: { strategy: "engulfing_smc", tier: eps.tier, eps: eps.score, factors: eps.factors, gates },
  };
}

function findFVGs(candles: CandleRow[]): FVG[] {
  const out: FVG[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];
    if (c1.high < c3.low && isDisplacement(c2, "bull")) out.push({ direction: "bullish", high: c3.low, low: c1.high, formedAtIndex: i });
    if (c1.low > c3.high && isDisplacement(c2, "bear")) out.push({ direction: "bearish", high: c1.low, low: c3.high, formedAtIndex: i });
  }
  return out;
}

function isDisplacement(c: CandleRow, dir: "bull" | "bear"): boolean {
  const range = c.high - c.low;
  if (range <= 0) return false;
  const body = Math.abs(c.close - c.open);
  if (body / range < DISPLACEMENT_BODY_RATIO) return false;
  return dir === "bull" ? c.close > c.open : c.close < c.open;
}
