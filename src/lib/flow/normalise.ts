// Volume normalisation — blueprint § 7.2.
//
// FX tick-volume, futures volume, and crypto exchange volume have
// completely different scales. Comparing absolute numbers across
// instruments is meaningless. Z-score per (symbol, timeframe) makes
// them comparable: "this candle's volume is 2.1 standard deviations
// above the 50-bar mean".
//
// Score outputs from -3..+3 typically. The flow modules clip to ±3
// for stability.

import type { CandleRow } from "@/lib/brain/strategies/eps-scoring";

export function volumeZScore(candles: CandleRow[], lookback = 50): number | null {
  if (candles.length < lookback + 1) return null;
  const slice = candles.slice(-lookback - 1, -1);  // history (excludes current bar)
  const current = candles[candles.length - 1].volume;
  if (current == null || !Number.isFinite(current)) return null;

  let sum = 0; let n = 0;
  for (const c of slice) {
    if (c.volume == null || !Number.isFinite(c.volume) || c.volume <= 0) continue;
    sum += c.volume; n++;
  }
  if (n < lookback / 2) return null;  // too sparse
  const mean = sum / n;

  let sqSum = 0;
  for (const c of slice) {
    if (c.volume == null || !Number.isFinite(c.volume) || c.volume <= 0) continue;
    sqSum += (c.volume - mean) ** 2;
  }
  const stddev = Math.sqrt(sqSum / n);
  if (stddev <= 0) return null;
  const z = (current - mean) / stddev;
  return Math.max(-3, Math.min(3, z));
}

// Synthetic CVD — sum of (signed candle direction × volume) across the
// last `bars` candles. Already used in the Triple Lock VP/OF heuristic
// and the Mini engine; centralised here for the flow modules.
//
// For FX (no real aggressor data), sign = sign of close - open.
// For instruments with bid/ask volume splits, the brain doesn't track
// those today — same approximation.
export function syntheticCvd(candles: CandleRow[], bars = 30): number | null {
  if (candles.length < bars) return null;
  const slice = candles.slice(-bars);
  let cvd = 0;
  for (const c of slice) {
    const dir = c.close > c.open ? 1 : c.close < c.open ? -1 : 0;
    const v = c.volume != null && Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 1;
    cvd += dir * v;
  }
  return cvd;
}

// Simple percentile clipper — used to map raw signal magnitudes onto
// 0-100 scoring scales without runaway outliers. Inputs above the cap
// saturate at 100.
export function clipScore(value: number, min: number, max: number): number {
  if (value <= min) return 0;
  if (value >= max) return 100;
  return Math.round(((value - min) / (max - min)) * 100);
}
