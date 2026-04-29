// PDF Strategy 08 — MMBM / MMSM (Market Maker Buy/Sell Model).
//
//   Phase 1 — Accumulation: tight range with BSL above, SSL below
//   Phase 2 — Sweep through one side (engineered fakeout)
//   Phase 3 — Reversal back inside the range, FVG forms in reversal direction
//   Phase 4 — Distribution to opposing liquidity
//
// Detector consumes the brain's existing recentSweeps + 1h/4h candles
// to detect an accumulation range that just got swept and reversed.

import type { DetectedSetup } from "@/lib/brain/strategies-types";
import { scoreEps, killzone, volumeMA, loadCandles, loadStructure, type CandleRow, type GateOutcome } from "@/lib/brain/strategies/eps-scoring";

interface StrategyContext {
  symbol: string;
  timeframe: string;
  candles: CandleRow[];
  structure: { bias?: string | null; lastEventType?: string | null } | null;
  indicators: { atr14?: number | null } | null;
  recentSweeps: Array<{ detectedAt: Date; sweepCandleTime?: Date; sweepDirection?: string; sweepHigh?: number; sweepLow?: number; sweepClose?: number; levelType?: string; levelPrice?: number }>;
  activeLevels: Array<{ levelType: string; price: number; side?: string | null }>;
  atr: number | null;
}

interface FVG { direction: "bullish" | "bearish"; high: number; low: number; formedAtIndex: number; }
const DISPLACEMENT_BODY_RATIO = 0.6;

export async function detectMmbm(ctx: StrategyContext): Promise<DetectedSetup | null> {
  // Per PDF: bot monitors H1/H4 for range formation. Run on 1h pass.
  if (ctx.timeframe !== "1h") return null;
  if (ctx.candles.length < 20 || !ctx.atr) return null;

  // ── Phase 1: identify the accumulation range ─────────────────────────
  // Take last 10-20 1h candles, compute high/low, ensure compression
  // (range < 1.5× daily ATR per PDF invalidation).
  const compressionWindow = ctx.candles.slice(-15);
  let high = -Infinity, low = Infinity;
  for (const c of compressionWindow) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
  }
  if (!Number.isFinite(high) || !Number.isFinite(low) || high <= low) return null;
  const rangeSize = high - low;
  if (rangeSize > ctx.atr * 1.5 * 24) return null; // PDF: range too wide → not a coil

  // ── Phase 2: sweep engineered through one side ───────────────────────
  const sweep = ctx.recentSweeps[0];
  if (!sweep) return null;
  const sweepRecent = (Date.now() - new Date(sweep.detectedAt).getTime()) < 6 * 60 * 60 * 1000;
  if (!sweepRecent) return null;

  // MMBM = sweep through SSL below → bullish reversal expected.
  // MMSM = sweep through BSL above → bearish reversal expected.
  let direction: "bullish" | "bearish";
  if (sweep.sweepDirection === "bullish_sweep") direction = "bullish";
  else if (sweep.sweepDirection === "bearish_sweep") direction = "bearish";
  else return null;

  // Sweep must have cleared the accumulation range boundary.
  const sweepLevel = sweep.levelPrice ?? 0;
  const clearedRange = direction === "bullish"
    ? sweepLevel <= low + rangeSize * 0.05  // sweep at/below range low
    : sweepLevel >= high - rangeSize * 0.05; // sweep at/above range high
  if (!clearedRange) return null;

  // ── Phase 3: reversal back inside range ──────────────────────────────
  const last = ctx.candles[ctx.candles.length - 1];
  const backInsideRange = last.close > low && last.close < high;
  if (!backInsideRange) return null;

  // FVG must have formed in reversal direction. Look at last 8 1h candles.
  const reversalFvgs = findFVGs(ctx.candles.slice(-12)).filter((f) => f.direction === direction);
  if (reversalFvgs.length === 0) return null;
  const reversalFvg = reversalFvgs[reversalFvgs.length - 1];

  // HTF D1 bias must confirm direction.
  const [structureD1, candles1hVol] = await Promise.all([
    loadStructure(ctx.symbol, "1d"),
    loadCandles(ctx.symbol, "1h", 30, true),
  ]);
  if (structureD1?.bias && structureD1.bias !== direction) return null;

  // ── Levels ────────────────────────────────────────────────────────────
  const entry = last.close;
  const buffer = ctx.atr * 0.3;
  const stopLoss = direction === "bullish"
    ? Math.min(sweep.sweepLow ?? low, low) - buffer
    : Math.max(sweep.sweepHigh ?? high, high) + buffer;
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0) return null;
  // PDF: minimum 3:1 RR for MMBM. Target = opposing liquidity pool.
  const minTp = risk * 3;
  const oppositeBoundary = direction === "bullish" ? high : low;
  const candidates = ctx.activeLevels
    .filter((l) => direction === "bullish" ? l.price > entry + minTp : l.price < entry - minTp)
    .map((l) => l.price)
    .sort((a, b) => direction === "bullish" ? a - b : b - a);
  const tp1 = candidates[0] ?? oppositeBoundary;
  const rr = Math.abs(tp1 - entry) / risk;
  if (rr < 3) return null;
  const tp2 = direction === "bullish" ? entry + risk * 5 : entry - risk * 5;

  // ── EPS factors ──────────────────────────────────────────────────────
  const lq = clearedRange ? 92 : 70;
  const loc = 85; // reversal FVG aligns with HTF bias
  const mom = 85; // sweep + back-inside + reversal FVG
  const vol20 = volumeMA(candles1hVol, 20);
  const vol = vol20 != null && last.volume != null && last.volume > vol20 * 1.2 ? 90 : 60;
  const kz = killzone();
  const eps = scoreEps({ lq, loc, mom, vol, time: kz.score });
  if (eps.tier === "SUPPRESSED") return null;

  const gates: GateOutcome[] = [
    { id: "range",   label: "Accumulation range identified",          passed: true, evidence: `[${low.toFixed(5)}–${high.toFixed(5)}], ${rangeSize.toFixed(5)} wide` },
    { id: "sweep",   label: "Sweep cleared range boundary",           passed: clearedRange, evidence: `${sweep.sweepDirection} ${sweep.levelType} @ ${sweepLevel.toFixed(5)}` },
    { id: "reverse", label: "Close back inside range",                passed: backInsideRange, evidence: `last close ${last.close.toFixed(5)} inside [${low.toFixed(5)},${high.toFixed(5)}]` },
    { id: "fvg",     label: "Reversal FVG formed",                    passed: true, evidence: `${direction} FVG ${reversalFvg.low.toFixed(5)}-${reversalFvg.high.toFixed(5)}` },
    { id: "d1",      label: "D1 bias confirms direction",             passed: !structureD1?.bias || structureD1.bias === direction, evidence: `D1=${structureD1?.bias ?? "—"}` },
    { id: "vol",     label: "Volume climax on sweep",                 passed: vol >= 80, evidence: vol20 != null ? `${last.volume?.toFixed(0)} vs 1.2×MA ${(vol20*1.2).toFixed(0)}` : "vol unavailable" },
    { id: "rr",     label: "≥3:1 RR (PDF requirement)",                passed: rr >= 3, evidence: `${rr.toFixed(2)}R to ${tp1.toFixed(5)}` },
    { id: "killzone", label: "Killzone active",                       passed: kz.score === 100, evidence: kz.name },
  ];

  return {
    setupType: "mmbm",
    direction,
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    riskReward: rr,
    confidenceScore: eps.score,
    qualityGrade: eps.qualityGrade,
    explanation: `${direction === "bullish" ? "MMBM" : "MMSM"} — ${sweep.sweepDirection} swept ${sweep.levelType} @ ${sweepLevel.toFixed(5)}, price returned inside [${low.toFixed(5)}-${high.toFixed(5)}], ${direction} FVG ${reversalFvg.low.toFixed(5)}-${reversalFvg.high.toFixed(5)}. EPS ${eps.score}/100 (${eps.tier}). Entry ${entry.toFixed(5)}, SL beyond sweep ${stopLoss.toFixed(5)}, TP1 ${tp1.toFixed(5)} (${rr.toFixed(2)}R).`,
    invalidation: `Price continues in sweep direction without reversing — genuine breakout, range failed.`,
    validHours: 8,
    metadata: { strategy: "mmbm", tier: eps.tier, eps: eps.score, factors: eps.factors, gates },
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
