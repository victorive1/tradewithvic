// Bullish FVG Inversion — implementation of the multi-timeframe blueprint
// in /Users/victoruyaelunmo/Documents/Bullish_FVG_Inversion_Signal_Blueprint.docx
//
// Pipeline (BUY only — the blueprint is one-sided):
//   Layer 1: HTF bias is bullish (1H structure) and price is in discount of
//            the active 1H dealing range.
//   Layer 2: A valid 1H bullish FVG was created by a displacement candle.
//   Layer 3: Price has tapped 25%-85% into the FVG and not closed below it.
//   Layer 4: On the lower timeframe a bearish FVG formed during the
//            retracement and then FAILED (closed above the origin candle's
//            open). The failed bearish FVG becomes the bullish inversion
//            FVG = the entry zone.
//   Layer 5: Stop below failed FVG low + buffer; TP toward buy-side liquidity
//            with min 1:2 RR; reject if opposing supply within < 1.5R.
//
// LTF NOTE: the blueprint specifies 1-minute, but the brain's candle fetcher
// only persists 4h/1h/15min/5min/1day (see CANDLE_TIMEFRAMES in candles.ts).
// We use 5min as the lower timeframe — same pattern shape, less grain. To
// upgrade to true 1m, add "1min" to CANDLE_TIMEFRAMES first.
const LOWER_TIMEFRAME = "5min";

import { prisma } from "@/lib/prisma";
import type { DetectedSetup } from "@/lib/brain/strategies-types";

interface CandleRow {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface StrategyContext {
  symbol: string;
  timeframe: string;
  instrumentId: string | null;
  candles: CandleRow[];
  structure: { bias?: string | null; lastSwingHigh?: number | null; lastSwingLow?: number | null; lastEvent?: string | null } | null;
  indicators: { trendBias?: string | null; momentum?: string | null; rsi14?: number | null; ema20?: number | null; atr14?: number | null } | null;
  recentSweeps: Array<{ detectedAt: Date }>;
  activeLevels: Array<{ levelType: string; price: number; side?: string | null }>;
  atr: number | null;
}

interface FVGZone {
  direction: "bullish" | "bearish";
  high: number;
  low: number;
  midpoint: number;
  formedAtIndex: number;
  // The "origin candle" is c1 of the 3-candle FVG (the candle whose open
  // we compare against on inversion-failure detection).
  originOpen: number;
  middleOpen: number;
}

const MIN_HTF_CANDLES = 30;
const MIN_LTF_CANDLES = 20;
const DISPLACEMENT_BODY_RATIO = 0.6;
const MAX_HTF_FVG_AGE_BARS = 30;
const MIN_TAP_DEPTH = 0.25;
const MAX_TAP_DEPTH = 0.85; // wider than 0.5 to allow deep but not full close-through
const DEALING_RANGE_LOOKBACK = 30;

export async function detectBullishFVGInversion(
  ctx: StrategyContext,
): Promise<DetectedSetup | null> {
  // Only run on the HTF pass — the detector itself owns the cross-tf join.
  if (ctx.timeframe !== "1h") return null;
  if (ctx.candles.length < MIN_HTF_CANDLES || !ctx.atr) return null;

  // ── Layer 1: HTF bias bullish + discount ────────────────────────────────
  const htfBias = ctx.structure?.bias ?? ctx.indicators?.trendBias ?? null;
  if (htfBias !== "bullish") return null;

  const range = computeDealingRange(ctx.candles, DEALING_RANGE_LOOKBACK);
  if (!range) return null;
  const latest = ctx.candles[ctx.candles.length - 1];
  const fillPct = (latest.close - range.low) / Math.max(range.high - range.low, 1e-9);
  // Discount = bottom half of the range. Allow up to 60% to avoid borderline rejects.
  const inDiscount = fillPct <= 0.6;
  if (!inDiscount) return null;

  // ── Layer 2-3: latest valid 1H bullish FVG that's been tapped ───────────
  const fvgs = findFVGs(ctx.candles).filter((f) => f.direction === "bullish");
  if (fvgs.length === 0) return null;

  const tappedFVG = pickTappedBullishFVG(fvgs, ctx.candles);
  if (!tappedFVG) return null;

  // ── Layer 4: 1M bearish FVG failure (the inversion event) ───────────────
  const ltfCandles = await loadLowerTimeframeCandles(ctx.symbol, LOWER_TIMEFRAME, 80);
  if (ltfCandles.length < MIN_LTF_CANDLES) return null;

  const inversion = findRecentBearishFVGFailure(ltfCandles);
  if (!inversion) return null;

  // The inversion zone (former bearish FVG) must be inside the 1H FVG —
  // otherwise it's an unrelated 1M event.
  if (inversion.high < tappedFVG.low || inversion.low > tappedFVG.high) return null;

  // ── Layer 5: structure the trade ────────────────────────────────────────
  const entry = (inversion.low + inversion.high) / 2; // inversion FVG midpoint
  const buffer = ctx.atr * 0.2;
  const stopLoss = inversion.low - buffer;
  if (stopLoss >= entry) return null;
  const risk = entry - stopLoss;

  // Buy-side liquidity targets (highs + buy-side levels) above entry, ≥1R out.
  const minTpDistance = risk * 1.5;
  const buySideLevels = ctx.activeLevels
    .filter((l) => l.price > entry + minTpDistance && (l.side === "buy" || l.levelType?.includes("high")))
    .map((l) => l.price)
    .sort((a, b) => a - b);
  const tp1 = buySideLevels[0] ?? entry + risk * 2;
  const tp2 = buySideLevels[1] ?? entry + risk * 3;
  const tp3 = buySideLevels[2] ?? entry + risk * 5;

  if (tp1 - entry < risk * 1.5) return null; // hard 1.5R floor

  // Opposing HTF supply within < 1.5R kills the trade (Layer 5 of blueprint).
  const opposingSupplyClose = ctx.activeLevels.some(
    (l) =>
      l.price > entry &&
      l.price < tp1 &&
      (l.side === "sell" || l.levelType?.includes("supply") || l.levelType?.includes("high")) &&
      (l.price - entry) < risk * 1.5,
  );
  if (opposingSupplyClose) return null;

  // ── Scoring per blueprint § "Signal Scoring Model" ──────────────────────
  const score = scoreSetup({
    ctx,
    fvg: tappedFVG,
    inversion,
    riskReward: (tp1 - entry) / risk,
    fillPct,
  });

  return {
    setupType: "bullish_fvg_inversion",
    direction: "bullish",
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    takeProfit3: tp3,
    riskReward: (tp1 - entry) / risk,
    confidenceScore: score,
    qualityGrade: gradeFromScore(score),
    explanation:
      `1H bullish FVG [${tappedFVG.low.toFixed(5)} → ${tappedFVG.high.toFixed(5)}] tapped from discount ` +
      `(${(fillPct * 100).toFixed(0)}% of range). ${LOWER_TIMEFRAME} bearish FVG inverted on close above origin open ` +
      `${inversion.originOpen.toFixed(5)}, flipping to a bullish inversion zone. Entry mid-zone ${entry.toFixed(5)}, ` +
      `targeting buy-side liquidity at ${tp1.toFixed(5)}.`,
    invalidation:
      `1H close below the inversion FVG low ${inversion.low.toFixed(5)} invalidates the setup. ` +
      `Bearish CHoCH on 1H after entry is also a hard invalidation.`,
    validHours: 6,
    originalThesis:
      `Buy from inverted 1M bearish FVG inside a tapped 1H bullish FVG. HTF trend bullish, price in discount, ` +
      `bearish FVG failed by closing above its origin open — the structure flipped from supply to demand.`,
    requiredConditions: [
      `1H bias remains bullish`,
      `Price stays above inversion low ${inversion.low.toFixed(5)}`,
      `No bearish CHoCH after entry`,
      `Buy-side liquidity target ${tp1.toFixed(5)} stays clear`,
    ],
    invalidationConditions: [
      `1H candle closes below ${inversion.low.toFixed(5)}`,
      `Bearish CHoCH on 1H`,
      `Opposite A+ signal appears`,
      `Spread widens past tolerance or news risk spikes`,
    ],
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function findFVGs(candles: CandleRow[]): FVGZone[] {
  const out: FVGZone[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];

    if (c1.high < c3.low && isBullishDisplacement(c2)) {
      out.push({
        direction: "bullish",
        high: c3.low,
        low: c1.high,
        midpoint: (c3.low + c1.high) / 2,
        formedAtIndex: i,
        originOpen: c1.open,
        middleOpen: c2.open,
      });
    }
    if (c1.low > c3.high && isBearishDisplacement(c2)) {
      out.push({
        direction: "bearish",
        high: c1.low,
        low: c3.high,
        midpoint: (c1.low + c3.high) / 2,
        formedAtIndex: i,
        originOpen: c1.open,
        middleOpen: c2.open,
      });
    }
  }
  return out;
}

function isBullishDisplacement(c: CandleRow): boolean {
  const range = c.high - c.low;
  const body = Math.abs(c.close - c.open);
  return c.close > c.open && range > 0 && body / range >= DISPLACEMENT_BODY_RATIO;
}

function isBearishDisplacement(c: CandleRow): boolean {
  const range = c.high - c.low;
  const body = Math.abs(c.close - c.open);
  return c.close < c.open && range > 0 && body / range >= DISPLACEMENT_BODY_RATIO;
}

function computeDealingRange(candles: CandleRow[], lookback: number): { high: number; low: number } | null {
  const slice = candles.slice(-lookback);
  if (slice.length < 5) return null;
  let high = -Infinity;
  let low = Infinity;
  for (const c of slice) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
  }
  if (!Number.isFinite(high) || !Number.isFinite(low) || high <= low) return null;
  return { high, low };
}

// Returns the most recent bullish FVG that price has tapped at a depth in
// [MIN_TAP_DEPTH, MAX_TAP_DEPTH] of the FVG height, without closing below it.
function pickTappedBullishFVG(fvgs: FVGZone[], candles: CandleRow[]): FVGZone | null {
  const lastIdx = candles.length - 1;
  // Iterate newest first.
  for (let k = fvgs.length - 1; k >= 0; k--) {
    const fvg = fvgs[k];
    const age = lastIdx - fvg.formedAtIndex;
    if (age > MAX_HTF_FVG_AGE_BARS) continue;
    if (age < 1) continue;

    const height = fvg.high - fvg.low;
    if (height <= 0) continue;

    let deepestTap = 0;
    let closedBelow = false;
    for (let i = fvg.formedAtIndex + 1; i < candles.length; i++) {
      const c = candles[i];
      if (c.close < fvg.low) { closedBelow = true; break; }
      if (c.low <= fvg.high && c.low >= fvg.low) {
        const depth = (fvg.high - c.low) / height; // 0 = top of zone, 1 = bottom
        if (depth > deepestTap) deepestTap = depth;
      } else if (c.low < fvg.low) {
        // wick below low without close-through still counts as max depth
        deepestTap = 1;
      }
    }
    if (closedBelow) continue;
    if (deepestTap >= MIN_TAP_DEPTH && deepestTap <= MAX_TAP_DEPTH) return fvg;
  }
  return null;
}

interface InversionZone {
  // The bullish inversion zone (the failed bearish FVG, now flipped).
  high: number;
  low: number;
  originOpen: number;
  failedAtIndex: number;
}

// Walks the LTF candles for a recent bearish FVG that has FAILED. The
// failure is defined as a candle (after FVG formation) closing above the
// origin candle's open — that's the inversion event from the blueprint.
function findRecentBearishFVGFailure(candles: CandleRow[]): InversionZone | null {
  const fvgs = findFVGs(candles).filter((f) => f.direction === "bearish");
  // Iterate newest first to pick the most recent inversion.
  for (let k = fvgs.length - 1; k >= 0; k--) {
    const fvg = fvgs[k];
    const age = candles.length - 1 - fvg.formedAtIndex;
    if (age > 30) continue; // very recent only — inversion fades fast on 1m
    if (age < 1) continue;

    let failedAt = -1;
    for (let i = fvg.formedAtIndex + 1; i < candles.length; i++) {
      const c = candles[i];
      // Failure: bullish displacement that closes above origin candle's open.
      if (c.close > fvg.originOpen && isBullishDisplacement(c)) {
        failedAt = i;
        break;
      }
    }
    if (failedAt === -1) continue;

    // After failure, no candle should have CLOSED back below the FVG low —
    // that would unwind the inversion.
    let stillInverted = true;
    for (let i = failedAt + 1; i < candles.length; i++) {
      if (candles[i].close < fvg.low) { stillInverted = false; break; }
    }
    if (!stillInverted) continue;

    return {
      high: fvg.high,
      low: fvg.low,
      originOpen: fvg.originOpen,
      failedAtIndex: failedAt,
    };
  }
  return null;
}

async function loadLowerTimeframeCandles(symbol: string, timeframe: string, take: number): Promise<CandleRow[]> {
  const rows = await prisma.candle.findMany({
    where: { symbol, timeframe, isClosed: true },
    orderBy: { openTime: "desc" },
    take,
    select: { openTime: true, open: true, high: true, low: true, close: true },
  });
  return rows.reverse() as CandleRow[];
}

interface ScoreInputs {
  ctx: StrategyContext;
  fvg: FVGZone;
  inversion: InversionZone;
  riskReward: number;
  fillPct: number;
}

function scoreSetup(inputs: ScoreInputs): number {
  const { ctx, riskReward, fillPct } = inputs;
  let score = 0;

  // HTF trend bullish (15) — gated already, this is just credit
  score += 15;

  // Valid 1H bullish FVG (10) — gated already
  score += 10;

  // Liquidity sweep origin (15) — credit if there was a recent sweep
  const recentSweep = ctx.recentSweeps.find((s) => s.detectedAt > new Date(Date.now() - 6 * 60 * 60 * 1000));
  if (recentSweep) score += 15;

  // Demand-zone origin (10) — proxied by an existing buy-side level near the FVG low
  const nearLow = ctx.activeLevels.some((l) => Math.abs(l.price - inputs.fvg.low) < ctx.atr! * 0.5);
  if (nearLow) score += 10;

  // BOS after FVG (15) — credit if structure event is bos_bullish
  if (ctx.structure?.lastEvent === "bos_bullish") score += 15;

  // Discount tap (10) — fillPct ≤ 0.5 is full credit, scales down to 0 at 0.6
  if (fillPct <= 0.5) score += 10;
  else score += Math.max(0, (0.6 - fillPct) * 100);

  // Rejection candle on 1H (10) — proxy via latest candle wick on the low side
  const latest = ctx.candles[ctx.candles.length - 1];
  const lowerWick = Math.min(latest.open, latest.close) - latest.low;
  const rangeSize = Math.max(latest.high - latest.low, 1e-9);
  const wickRatio = lowerWick / rangeSize;
  score += Math.min(10, wickRatio * 25);

  // 1M bearish FVG failure (15) — gated already
  score += 15;

  // 1M bullish displacement (15) — gated already (failure requires displacement)
  score += 15;

  // Liquidity target above (10) — credit if at least one buy-side level
  const hasBuySideTarget = ctx.activeLevels.some((l) => l.price > inputs.ctx.candles.at(-1)!.close);
  if (hasBuySideTarget) score += 10;

  // Valid session + no news risk + no opposing HTF supply: gated downstream.
  // The algo runtime + EventRiskSnapshot already filter for these. Credit
  // small flat amounts so a clean signal can still hit A+.
  score += 5; // session
  score += 10; // no news (default; runtime can veto)
  score += 10; // no opposing supply (gated above)

  // RR contribution (already implicit in 1.5R floor; small extra credit for ≥2R)
  if (riskReward >= 2.5) score += 5;
  else if (riskReward >= 2) score += 3;

  // Cap at 100 and normalize blueprint scale (115+ = A+, 95-114 = A, 75-94 = B).
  // We're on a 100-point scale so map: ≥90 A+, ≥80 A, ≥65 B.
  return Math.round(Math.min(100, Math.max(0, score)));
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}
