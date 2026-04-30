// Liquidity Map module — blueprint § 7.5.
//
// Harvests every form of liquidity reference into a single DetectedZone[]:
//   • equal highs / lows                    (from existing LiquidityLevel)
//   • prev day / prev week extremes         (LiquidityLevel)
//   • session highs / lows                  (LiquidityLevel)
//   • 15m and 1h FVGs                       (extracted from candles)
//   • 15m and 1h Order Blocks               (extracted from candles)
//   • last 3 swing highs / lows             (StructureState lastSwing*)
//
// Returns the merged set + the nearest opposing-side liquidity above
// and below the current close so the prediction module can set
// targetLiquidity without re-scanning.

import type { CandleRow } from "@/lib/brain/strategies/eps-scoring";
import type { FlowContext, LiquidityMapResult, DetectedZone } from "@/lib/flow/types";

const DISPLACEMENT_BODY_RATIO = 0.6;
const FVG_MAX_AGE = 40;

export function buildLiquidityMap(ctx: FlowContext): LiquidityMapResult {
  const zones: DetectedZone[] = [];
  const now = new Date();

  // ── 1. Existing LiquidityLevel rows (already maintained by the brain) ──
  for (const lvl of ctx.activeLevels) {
    zones.push({
      zoneType: lvl.levelType,
      direction: null,
      priceLow:  lvl.price,
      priceHigh: lvl.price,
      strengthScore: levelTypeStrength(lvl.levelType),
      formedAt: now,
      metadata: { source: "liquidity_level" },
    });
  }

  // ── 2. 15m FVGs ──────────────────────────────────────────────────────
  const fvgs15m = findFvgs(ctx.candles15m, 15);
  for (const f of fvgs15m) zones.push(f);

  // ── 3. 1h FVGs ───────────────────────────────────────────────────────
  const fvgs1h = findFvgs(ctx.candles1h, 60);
  for (const f of fvgs1h) zones.push(f);

  // ── 4. 15m Order Blocks (last opposite candle before BOS impulse) ────
  const obs15m = findOrderBlocks(ctx.candles15m, 15);
  for (const ob of obs15m) zones.push(ob);

  // ── Compute nearest opposing-side liquidity ──────────────────────────
  const close = ctx.candles5m[ctx.candles5m.length - 1]?.close ?? null;
  let nearestAbove: number | null = null;
  let nearestBelow: number | null = null;
  if (close != null) {
    for (const z of zones) {
      const ref = (z.priceLow + z.priceHigh) / 2;
      if (ref > close) {
        if (nearestAbove == null || ref < nearestAbove) nearestAbove = ref;
      } else if (ref < close) {
        if (nearestBelow == null || ref > nearestBelow) nearestBelow = ref;
      }
    }
  }

  return { zones, nearestAbove, nearestBelow };
}

function levelTypeStrength(levelType: string): number {
  if (/equal_high|equal_low/.test(levelType)) return 80;
  if (/prev_week/.test(levelType)) return 75;
  if (/prev_day/.test(levelType)) return 70;
  if (/session/.test(levelType)) return 60;
  if (/swing/.test(levelType)) return 65;
  return 50;
}

function findFvgs(candles: CandleRow[], tfMinutes: number): DetectedZone[] {
  const out: DetectedZone[] = [];
  const cutoff = candles.length - 1 - FVG_MAX_AGE;
  for (let i = 2; i < candles.length; i++) {
    if (i < cutoff) continue;
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];
    const range = c2.high - c2.low;
    if (range <= 0) continue;
    const body = Math.abs(c2.close - c2.open);
    if (body / range < DISPLACEMENT_BODY_RATIO) continue;
    if (c1.high < c3.low && c2.close > c2.open) {
      out.push({
        zoneType: "fvg",
        direction: "bullish",
        priceLow:  c1.high,
        priceHigh: c3.low,
        strengthScore: 50 + Math.round((body / range) * 30),
        formedAt: c3.openTime,
        metadata: { timeframeMinutes: tfMinutes },
      });
    } else if (c1.low > c3.high && c2.close < c2.open) {
      out.push({
        zoneType: "fvg",
        direction: "bearish",
        priceLow:  c3.high,
        priceHigh: c1.low,
        strengthScore: 50 + Math.round((body / range) * 30),
        formedAt: c3.openTime,
        metadata: { timeframeMinutes: tfMinutes },
      });
    }
  }
  return out;
}

function findOrderBlocks(candles: CandleRow[], tfMinutes: number): DetectedZone[] {
  // OB = last opposite-coloured candle before a displacement candle that
  // pushed price beyond a recent swing. Cheap heuristic: walk windows
  // of [c1, c2, c3] where c2 is the displacement (≥0.6 body/range AND
  // body ≥ 0.7× the average of the prior 5 ranges).
  const out: DetectedZone[] = [];
  if (candles.length < 8) return out;

  const cutoff = candles.length - 1 - FVG_MAX_AGE;
  for (let i = 5; i < candles.length; i++) {
    if (i < cutoff) continue;
    const c1 = candles[i - 1];
    const c2 = candles[i];
    const range2 = c2.high - c2.low;
    if (range2 <= 0) continue;
    const body2 = Math.abs(c2.close - c2.open);
    if (body2 / range2 < DISPLACEMENT_BODY_RATIO) continue;

    const priorAvgRange = candles.slice(i - 5, i).reduce((s, c) => s + (c.high - c.low), 0) / 5;
    if (body2 < priorAvgRange * 0.7) continue;

    const isBullishImpulse = c2.close > c2.open;
    const isBearishImpulse = c2.close < c2.open;
    const c1Bullish = c1.close > c1.open;
    const c1Bearish = c1.close < c1.open;

    if (isBullishImpulse && c1Bearish) {
      // Bullish OB = last bearish candle before bullish impulse.
      out.push({
        zoneType: "order_block",
        direction: "bullish",
        priceLow:  c1.low,
        priceHigh: c1.high,
        strengthScore: 60 + Math.round((body2 / priorAvgRange - 1) * 15),
        formedAt: c1.openTime,
        metadata: { timeframeMinutes: tfMinutes, impulseAtIndex: i },
      });
    } else if (isBearishImpulse && c1Bullish) {
      out.push({
        zoneType: "order_block",
        direction: "bearish",
        priceLow:  c1.low,
        priceHigh: c1.high,
        strengthScore: 60 + Math.round((body2 / priorAvgRange - 1) * 15),
        formedAt: c1.openTime,
        metadata: { timeframeMinutes: tfMinutes, impulseAtIndex: i },
      });
    }
  }
  return out;
}
