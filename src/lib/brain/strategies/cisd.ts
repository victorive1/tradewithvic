// PDF Strategy 07 — CISD (Change in State of Delivery).
//
// Bearish delivery = candles closing in the lower half of their range.
// Bullish delivery = upper half. CISD = the first candle that flips
// halves after a sustained delivery sequence (3-5 same-direction
// candles). The CISD candle leaves an FVG in the new direction and
// becomes the new OB. Entry on price returning to fill that FVG.

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

interface FVG { direction: "bullish" | "bearish"; high: number; low: number; formedAtIndex: number; }

const DISPLACEMENT_BODY_RATIO = 0.5;
const SUSTAINED_RUN_MIN = 3;
const SUSTAINED_RUN_MAX = 7;

// "Half" delivery: which half of the candle's range did the close fall in?
function deliveryHalf(c: CandleRow): "upper" | "lower" | "mid" {
  const range = c.high - c.low;
  if (range <= 0) return "mid";
  const mid = (c.high + c.low) / 2;
  if (c.close > mid + range * 0.05) return "upper";
  if (c.close < mid - range * 0.05) return "lower";
  return "mid";
}

export async function detectCisd(ctx: StrategyContext): Promise<DetectedSetup | null> {
  // Run on 15m. Per PDF: "Monitors M15/H1 candle delivery."
  if (ctx.timeframe !== "15m") return null;
  if (ctx.candles.length < 12 || !ctx.atr) return null;

  // Walk backward to find a CISD: latest closed candle has half opposite
  // to a sustained run of 3-7 prior candles.
  const latest = ctx.candles[ctx.candles.length - 1];
  const latestHalf = deliveryHalf(latest);
  if (latestHalf === "mid") return null;

  // The PRIOR run must be the OPPOSITE half, sustained 3-7 bars.
  const priorHalf = latestHalf === "upper" ? "lower" : "upper";
  let runLength = 0;
  for (let i = ctx.candles.length - 2; i >= 0 && runLength < SUSTAINED_RUN_MAX + 1; i--) {
    if (deliveryHalf(ctx.candles[i]) === priorHalf) runLength++;
    else break;
  }
  if (runLength < SUSTAINED_RUN_MIN || runLength > SUSTAINED_RUN_MAX) return null;

  // CISD candle body must be ≥50% of range.
  const range = latest.high - latest.low;
  const body = Math.abs(latest.close - latest.open);
  if (range <= 0 || body / range < DISPLACEMENT_BODY_RATIO) return null;

  // CISD candle must leave an FVG in the new direction immediately.
  const newDirection: "bullish" | "bearish" = latestHalf === "upper" ? "bullish" : "bearish";
  // FVG check: candle N-2.high vs N.low (bullish) or N-2.low vs N.high (bearish)
  const c1 = ctx.candles[ctx.candles.length - 3];
  const c3 = latest;
  let fvg: FVG | null = null;
  if (newDirection === "bullish" && c1.high < c3.low) {
    fvg = { direction: "bullish", high: c3.low, low: c1.high, formedAtIndex: ctx.candles.length - 1 };
  } else if (newDirection === "bearish" && c1.low > c3.high) {
    fvg = { direction: "bearish", high: c1.low, low: c3.high, formedAtIndex: ctx.candles.length - 1 };
  }
  if (!fvg) return null; // PDF: no FVG → ambiguous structure, do not trade

  // Liquidity sweep before the CISD = elite quality (PDF bonus).
  const sweep = ctx.recentSweeps[0];
  const sweepBeforeCisd = sweep && (Date.now() - new Date(sweep.detectedAt).getTime()) < 4 * 60 * 60 * 1000;
  const sweepDirOk = sweep && (
    (newDirection === "bullish" && sweep.sweepDirection === "bullish_sweep") ||
    (newDirection === "bearish" && sweep.sweepDirection === "bearish_sweep")
  );

  // HTF context — D1/4h bias should at least not contradict.
  const [structure4h, structureD1, candles15mVol] = await Promise.all([
    loadStructure(ctx.symbol, "4h"),
    loadStructure(ctx.symbol, "1d"),
    loadCandles(ctx.symbol, "15m", 80, true),
  ]);
  const htfBias = structureD1?.bias ?? structure4h?.bias ?? null;
  if (htfBias && htfBias !== newDirection) return null;

  // ── Levels ────────────────────────────────────────────────────────────
  // Entry = midpoint of the CISD-left FVG (price returns to fill).
  const entry = (fvg.high + fvg.low) / 2;
  const buffer = ctx.atr * 0.3;
  const stopLoss = newDirection === "bullish" ? latest.low - buffer : latest.high + buffer;
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0) return null;
  const minTp = risk * 2;
  const candidates = ctx.activeLevels
    .filter((l) => newDirection === "bullish" ? l.price > entry + minTp : l.price < entry - minTp)
    .map((l) => l.price)
    .sort((a, b) => newDirection === "bullish" ? a - b : b - a);
  const tp1 = candidates[0] ?? (newDirection === "bullish" ? entry + risk * 2.5 : entry - risk * 2.5);
  const tp2 = candidates[1] ?? (newDirection === "bullish" ? entry + risk * 4 : entry - risk * 4);
  const rr = Math.abs(tp1 - entry) / risk;
  if (rr < 2) return null;

  // ── EPS factors ──────────────────────────────────────────────────────
  const lq = sweepBeforeCisd && sweepDirOk ? 92 : sweepBeforeCisd ? 70 : 50;
  const loc = 80; // CISD also acts as new OB
  const mom = body / range >= 0.6 ? 90 : 75;
  const vol20 = volumeMA(candles15mVol, 20);
  const vol = vol20 != null && latest.volume != null && latest.volume > vol20 ? 88 : 55;
  const kz = killzone();
  const eps = scoreEps({ lq, loc, mom, vol, time: kz.score });
  if (eps.tier === "SUPPRESSED") return null;

  const gates: GateOutcome[] = [
    { id: "run",      label: `${SUSTAINED_RUN_MIN}+ candle ${priorHalf}-half delivery sequence`, passed: true, evidence: `${runLength} ${priorHalf}-half bars before CISD` },
    { id: "flip",     label: "CISD candle flips delivery half",                                  passed: true, evidence: `${latestHalf}-half close, body ${(body/range*100).toFixed(0)}%` },
    { id: "fvg",      label: "FVG left in new direction",                                        passed: true, evidence: `${newDirection} FVG ${fvg.low.toFixed(5)}-${fvg.high.toFixed(5)}` },
    { id: "sweep",    label: "Sweep → CISD (elite if both)",                                     passed: !!(sweepBeforeCisd && sweepDirOk), evidence: sweepBeforeCisd ? `${sweep!.sweepDirection} ${sweep!.levelType}` : "no recent sweep" },
    { id: "htf",      label: "HTF bias aligns",                                                  passed: !htfBias || htfBias === newDirection, evidence: `D1=${structureD1?.bias ?? "—"}, 4h=${structure4h?.bias ?? "—"}` },
    { id: "vol",      label: "Volume above 20-MA on CISD",                                       passed: vol >= 80, evidence: vol20 != null ? `${latest.volume?.toFixed(0)} vs ${vol20.toFixed(0)}` : "vol unavailable" },
    { id: "rr",       label: "≥2:1 RR",                                                          passed: rr >= 2, evidence: `${rr.toFixed(2)}R` },
    { id: "killzone", label: "Killzone active",                                                  passed: kz.score === 100, evidence: kz.name },
  ];

  return {
    setupType: "cisd",
    direction: newDirection,
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    riskReward: rr,
    confidenceScore: eps.score,
    qualityGrade: eps.qualityGrade,
    explanation: `CISD — ${runLength}-bar ${priorHalf}-half delivery flipped to ${latestHalf}-half on the latest 15m bar. CISD candle left ${newDirection} FVG ${fvg.low.toFixed(5)}-${fvg.high.toFixed(5)} (also new OB). EPS ${eps.score}/100 (${eps.tier}). Entry ${entry.toFixed(5)}, SL ${stopLoss.toFixed(5)}, TP1 ${tp1.toFixed(5)} (${rr.toFixed(2)}R).`,
    invalidation: `Next candle reverses back through CISD body — false state change.`,
    validHours: 6,
    metadata: { strategy: "cisd", tier: eps.tier, eps: eps.score, factors: eps.factors, gates },
  };
}
