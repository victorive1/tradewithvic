// Anchored VWAP computation — anchored from the start of the current
// trading session. Mini blueprint § 4 (Live Data Engine).
//
// VWAP_n = Σ(price_i × volume_i) / Σ(volume_i) for i = session_start...n
// where price_i is the typical price (H+L+C)/3 of bar i.
//
// For FX, candle.volume is tick volume — directionally correct but not
// real institutional volume. For indices/stocks (Polygon-sourced) it's
// real volume. The blueprint tolerates the tick-volume approximation
// for FX since the bias engine only uses VWAP slope + position, not
// absolute level.

interface Candle {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

export interface VwapPoint {
  time: Date;
  vwap: number;
  cumulativeTpv: number; // running sum of typical-price × volume
  cumulativeVolume: number;
}

export interface VwapAnalysis {
  // Most recent VWAP value.
  current: number | null;
  // Slope = (current − value 5 bars ago) / 5. Positive = uptrending VWAP.
  slope: number | null;
  // -1 .. 1 — how far the latest close is from VWAP, normalised by ATR.
  // > 0.5  → meaningfully above; < -0.5 → meaningfully below.
  position: number | null;
  // True if the latest 1-3 bars crossed the VWAP from below to above.
  reclaimedBullish: boolean;
  // True if the latest 1-3 bars crossed from above to below.
  reclaimedBearish: boolean;
  series: VwapPoint[];
}

const SESSION_START_UTC_HOUR = 0; // anchored at UTC midnight = start of trading day

export function computeAnchoredVwap(candles: Candle[], atr: number | null): VwapAnalysis {
  if (candles.length === 0) {
    return { current: null, slope: null, position: null, reclaimedBullish: false, reclaimedBearish: false, series: [] };
  }
  // Find the cut between yesterday's session and today's. Walk back from
  // the latest bar; cut at the first bar whose UTC date differs.
  const latest = candles[candles.length - 1];
  const todayUtcDate = latest.openTime.getUTCDate();
  let anchorIdx = candles.length - 1;
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].openTime.getUTCDate() === todayUtcDate
        && candles[i].openTime.getUTCHours() >= SESSION_START_UTC_HOUR) {
      anchorIdx = i;
    } else break;
  }
  const session = candles.slice(anchorIdx);
  if (session.length === 0) {
    return { current: null, slope: null, position: null, reclaimedBullish: false, reclaimedBearish: false, series: [] };
  }

  const series: VwapPoint[] = [];
  let cumulativeTpv = 0, cumulativeVolume = 0;
  for (const c of session) {
    const tp = (c.high + c.low + c.close) / 3;
    // Treat missing volume as 1 to avoid NaN — degraded but not broken
    // (FX often has flat tick-volume early in the session).
    const v = c.volume != null && Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 1;
    cumulativeTpv += tp * v;
    cumulativeVolume += v;
    const vwap = cumulativeTpv / cumulativeVolume;
    series.push({ time: c.openTime, vwap, cumulativeTpv, cumulativeVolume });
  }

  const last = series[series.length - 1];
  const current = last.vwap;

  // Slope across the last 5 points (or whatever's available).
  let slope: number | null = null;
  if (series.length >= 5) {
    const back = series[series.length - 5];
    slope = (current - back.vwap) / 5;
  }

  // Position normalised by ATR — gives a comparable scalar across symbols.
  const close = latest.close;
  const position = atr != null && atr > 0 ? (close - current) / atr : null;

  // Reclaim detection — was price on one side of VWAP, then crossed?
  // Look at the last 3 points.
  let reclaimedBullish = false, reclaimedBearish = false;
  if (series.length >= 3) {
    const c0 = session[session.length - 3];
    const c1 = session[session.length - 2];
    const c2 = session[session.length - 1];
    const v0 = series[series.length - 3].vwap;
    const v1 = series[series.length - 2].vwap;
    const v2 = series[series.length - 1].vwap;
    if (c0.close < v0 && c2.close > v2) reclaimedBullish = true;
    if (c0.close > v0 && c2.close < v2) reclaimedBearish = true;
    void c1; void v1; // referenced for completeness; kept structurally
  }

  return { current, slope, position, reclaimedBullish, reclaimedBearish, series };
}
