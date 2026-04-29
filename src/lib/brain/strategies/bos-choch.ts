// PDF Strategy 03 — BOS / CHoCH.
//
// Two distinct setupTypes from one detector:
//   bos_setup       — first pullback to the FVG left by a confirmed BOS impulse
//   choch_reversal  — first M15 FVG in the new direction after a CHoCH
//
// The brain already detects BOS / CHoCH events and writes them to
// structureState.lastEventType ("bos_bullish" / "bos_bearish" /
// "choch_bullish" / "choch_bearish"). This detector consumes those,
// finds the impulse FVG, scores the setup with EPS factors, and emits
// a TradeSetup row when the score clears Tier 2 (≥80).

import type { DetectedSetup } from "@/lib/brain/strategies-types";
import { scoreEps, killzone, volumeMA, loadCandles, loadStructure, pricePips, pipsToPrice, type CandleRow, type GateOutcome } from "@/lib/brain/strategies/eps-scoring";

interface StrategyContext {
  symbol: string;
  timeframe: string;
  instrumentId: string | null;
  candles: CandleRow[];
  structure: { bias?: string | null; lastSwingHigh?: number | null; lastSwingLow?: number | null; lastEventType?: string | null } | null;
  indicators: { rsi14?: number | null; ema20?: number | null; atr14?: number | null } | null;
  recentSweeps: Array<{ detectedAt: Date; sweepDirection?: string; sweepHigh?: number; sweepLow?: number; levelType?: string; levelPrice?: number; reversalStrength?: number }>;
  activeLevels: Array<{ levelType: string; price: number; side?: string | null }>;
  atr: number | null;
}

interface FVG {
  direction: "bullish" | "bearish";
  high: number;
  low: number;
  formedAtIndex: number;
}

const DISPLACEMENT_BODY_RATIO = 0.6;
const FVG_MAX_AGE = 30;

export async function detectBosChoch(ctx: StrategyContext): Promise<DetectedSetup | null> {
  // Run on the 15m pass — both PDF entry mechanics target M15 entry candles.
  if (ctx.timeframe !== "15m") return null;
  if (ctx.candles.length < 20 || !ctx.atr) return null;
  const lastEvent = ctx.structure?.lastEventType ?? null;
  if (!lastEvent) return null;

  const isBos = lastEvent === "bos_bullish" || lastEvent === "bos_bearish";
  const isChoch = lastEvent === "choch_bullish" || lastEvent === "choch_bearish";
  if (!isBos && !isChoch) return null;

  const direction: "bullish" | "bearish" = lastEvent.endsWith("bullish") ? "bullish" : "bearish";

  // Pull H4 candles for HTF bias confirmation + 1h candles for volume MA context.
  const [candles4h, candles1h, candles15mVol, structure4h, structure1h] = await Promise.all([
    loadCandles(ctx.symbol, "4h", 30),
    loadCandles(ctx.symbol, "1h", 50),
    loadCandles(ctx.symbol, "15m", 80, true),
    loadStructure(ctx.symbol, "4h"),
    loadStructure(ctx.symbol, "1h"),
  ]);
  if (candles4h.length < 5 || candles1h.length < 10) return null;

  // Find FVGs in the impulse leg (after the event candle, in the trade direction).
  const fvgs = findFVGs(ctx.candles).filter((f) => f.direction === direction);
  if (fvgs.length === 0) return null;
  const impulseFvg = fvgs[fvgs.length - 1]; // most recent

  // ── Entry / SL / TP ────────────────────────────────────────────────────
  // Entry = midpoint of the impulse FVG (price returns there to fill).
  // SL    = beyond the FVG far edge plus ATR buffer.
  // TP1   = nearest opposing liquidity level ≥ 2R.
  const entry = (impulseFvg.high + impulseFvg.low) / 2;
  const buffer = ctx.atr * 0.3;
  const stopLoss = direction === "bullish"
    ? impulseFvg.low - buffer
    : impulseFvg.high + buffer;
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0) return null;

  const minTpDistance = risk * 2; // PDF requires min 2:1
  const candidateLevels = ctx.activeLevels
    .filter((l) => direction === "bullish" ? l.price > entry + minTpDistance : l.price < entry - minTpDistance)
    .map((l) => l.price)
    .sort((a, b) => direction === "bullish" ? a - b : b - a);
  const tp1 = candidateLevels[0] ?? (direction === "bullish" ? entry + risk * 2.5 : entry - risk * 2.5);
  const tp2 = candidateLevels[1] ?? (direction === "bullish" ? entry + risk * 4 : entry - risk * 4);
  const rr = Math.abs(tp1 - entry) / risk;
  if (rr < 2) return null;

  // ── EPS scoring per PDF page 09 (BOS) / 10 (CHoCH) tables ─────────────
  // LQ — BOS/CHoCH at or after a liquidity sweep. Uses recentSweeps.
  const recentSweep = ctx.recentSweeps[0];
  const sweepRecent = recentSweep && (Date.now() - new Date(recentSweep.detectedAt).getTime()) < 6 * 60 * 60 * 1000;
  const sweepDirOk = recentSweep && (
    (direction === "bullish" && recentSweep.sweepDirection === "bullish_sweep") ||
    (direction === "bearish" && recentSweep.sweepDirection === "bearish_sweep")
  );
  const lq = sweepRecent && sweepDirOk ? 90 : (sweepRecent ? 50 : 30);

  // LOC — BOS from / CHoCH at an HTF OB or FVG zone. We approximate by
  // checking whether the impulse FVG sits inside the H4 dealing range
  // discount (for bullish) or premium (for bearish) half.
  const dr4h = computeRange(candles4h);
  let loc = 50;
  if (dr4h) {
    const fillPct = (entry - dr4h.low) / Math.max(dr4h.high - dr4h.low, 1e-9);
    if (direction === "bullish" && fillPct <= 0.5) loc = 85;
    else if (direction === "bearish" && fillPct >= 0.5) loc = 85;
    else loc = 60;
  }

  // MOM — volume expansion + displacement candle on the break. Use the
  // event candle (latest 15m) as a proxy.
  const latest = ctx.candles[ctx.candles.length - 1];
  const range = latest.high - latest.low;
  const body = Math.abs(latest.close - latest.open);
  const bodyPct = range > 0 ? body / range : 0;
  const mom = bodyPct >= 0.6 ? 90 : bodyPct >= 0.4 ? 70 : 50;

  // VOL — volume above 20-MA on the break candle.
  const vol20 = volumeMA(candles15mVol, 20);
  const vol = vol20 != null && latest.volume != null && latest.volume > vol20 ? 85 : 50;

  // TIME — killzone binary.
  const kz = killzone();
  const eps = scoreEps({ lq, loc, mom, vol, time: kz.score });

  // Suppress below Tier 2 — Bible rule.
  if (eps.tier === "SUPPRESSED") return null;

  // Confluence gate breakdown for the metadata UI.
  const gates: GateOutcome[] = [
    { id: "trend",       label: "HTF trend confirmed",                passed: (structure4h?.bias ?? null) === direction || (structure1h?.bias ?? null) === direction, evidence: `4h=${structure4h?.bias ?? "—"}, 1h=${structure1h?.bias ?? "—"}` },
    { id: "structure",   label: isBos ? "BOS body close beyond swing" : "CHoCH break of opposing swing", passed: true, evidence: `${lastEvent} on 15m` },
    { id: "displacement",label: "Impulse FVG present",                passed: true, evidence: `FVG ${impulseFvg.low.toFixed(5)}-${impulseFvg.high.toFixed(5)}` },
    { id: "sweep",       label: "Liquidity sweep within 6h",          passed: !!(sweepRecent && sweepDirOk), evidence: sweepRecent ? `${recentSweep.sweepDirection} of ${recentSweep.levelType}` : "no recent sweep" },
    { id: "volume",      label: "Volume above 20-MA",                 passed: vol >= 80, evidence: vol20 != null ? `${latest.volume?.toFixed(0)} vs 20MA ${vol20.toFixed(0)}` : "volume unavailable" },
    { id: "rr",          label: "≥2:1 RR achievable",                 passed: rr >= 2, evidence: `${rr.toFixed(2)}R to ${tp1.toFixed(5)}` },
    { id: "killzone",    label: "Active killzone (London/NY)",        passed: kz.score === 100, evidence: kz.name },
  ];

  const setupType = isBos ? "bos_setup" : "choch_reversal";
  const explanation =
    `${isBos ? "BOS" : "CHoCH"} ${direction} on 15m → impulse FVG ${impulseFvg.low.toFixed(5)}–${impulseFvg.high.toFixed(5)}. ` +
    `EPS ${eps.score}/100 (${eps.tier}). Entry ${entry.toFixed(5)}, SL ${stopLoss.toFixed(5)}, TP1 ${tp1.toFixed(5)} (${rr.toFixed(2)}R).`;

  return {
    setupType,
    direction,
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    riskReward: rr,
    confidenceScore: eps.score,
    qualityGrade: eps.qualityGrade,
    explanation,
    invalidation: isBos
      ? `Price closes back through the broken swing in opposing direction — BOS failed.`
      : `Bearish CHoCH on 15m or 1h immediately after entry — reversal not confirmed.`,
    validHours: isBos ? 8 : 6,
    requiredConditions: [
      `${direction} bias holds on 15m`,
      `Price stays beyond ${stopLoss.toFixed(5)} stop`,
      `No opposing CHoCH on 15m or 1h`,
    ],
    invalidationConditions: [
      `Close beyond ${stopLoss.toFixed(5)}`,
      `Opposing CHoCH event on 15m`,
      `News event reversing direction`,
    ],
    metadata: {
      strategy: setupType,
      tier: eps.tier,
      eps: eps.score,
      factors: eps.factors,
      gates,
    },
  };
}

// ── helpers ──────────────────────────────────────────────────────────────

function findFVGs(candles: CandleRow[]): FVG[] {
  const out: FVG[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];
    if (c1.high < c3.low && isDisplacement(c2, "bull")) {
      out.push({ direction: "bullish", high: c3.low, low: c1.high, formedAtIndex: i });
    }
    if (c1.low > c3.high && isDisplacement(c2, "bear")) {
      out.push({ direction: "bearish", high: c1.low, low: c3.high, formedAtIndex: i });
    }
  }
  // Filter stale FVGs.
  const cutoff = candles.length - 1 - FVG_MAX_AGE;
  return out.filter((f) => f.formedAtIndex >= cutoff);
}

function isDisplacement(c: CandleRow, dir: "bull" | "bear"): boolean {
  const range = c.high - c.low;
  if (range <= 0) return false;
  const body = Math.abs(c.close - c.open);
  if (body / range < DISPLACEMENT_BODY_RATIO) return false;
  return dir === "bull" ? c.close > c.open : c.close < c.open;
}

function computeRange(candles: CandleRow[]): { high: number; low: number } | null {
  if (candles.length < 5) return null;
  let high = -Infinity, low = Infinity;
  for (const c of candles) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
  }
  return Number.isFinite(high) && Number.isFinite(low) && high > low ? { high, low } : null;
}
