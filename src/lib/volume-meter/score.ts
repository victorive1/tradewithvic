import { currentSession, sessionScoreFor } from "./session";
import type {
  LiquidityLabel,
  PairLiquidityScore,
  TradeCondition,
  VolumeState,
} from "./types";

// Weights — must sum to 1.0. Chosen so candle-derived signals dominate
// (we have no live tick / spread feed in V1) but session timing still
// matters as a sanity check.
const WEIGHTS = {
  tick: 0.30,
  participation: 0.25,
  atr: 0.20,
  session: 0.15,
  range: 0.10,
} as const;

const MIN_CANDLES = 5;          // below this we report "warming"
const BASELINE_LOOKBACK = 20;   // candles used as the per-pair baseline

interface ScoreInput {
  symbol: string;
  // Candles ordered most-recent first. Each must have OHLCV.
  candles: Array<{ open: number; high: number; low: number; close: number; volume: number }>;
  atr14: number | null;       // from IndicatorSnapshot for the same timeframe
  timeframe: string;          // "5min" | "15min"
  postedAt: number;           // ms epoch
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

function pairLabel(symbol: string): string {
  return `${symbol.slice(0, 3)}/${symbol.slice(3, 6)}`;
}

function labelFor(score: number): LiquidityLabel {
  if (score >= 91) return "Extreme";
  if (score >= 76) return "Heavy";
  if (score >= 61) return "Active";
  if (score >= 41) return "Normal";
  if (score >= 21) return "Thin";
  return "Dead";
}

function tradeConditionFor(score: number, atrRatio: number | null): TradeCondition {
  if (score >= 76 && atrRatio !== null && atrRatio > 1.5) return "Strong but volatile";
  if (score >= 76) return "Strong";
  if (score >= 61) return "Tradable";
  if (score >= 41) return "Caution";
  return "Avoid";
}

function volumeStateFor(ratio: number | null): VolumeState {
  if (ratio === null) return "Normal";
  if (ratio >= 2.0) return "Surge";
  if (ratio >= 1.4) return "Expanding";
  if (ratio >= 1.1) return "Above avg";
  if (ratio >= 0.85) return "Normal";
  if (ratio >= 0.6) return "Below avg";
  return "Drying up";
}

export function computeMeatScore(input: ScoreInput): PairLiquidityScore {
  const { symbol, candles, atr14, timeframe, postedAt } = input;
  const pair = pairLabel(symbol);
  const session = currentSession();
  const sessionStrength = sessionScoreFor(symbol);

  // Not enough data yet — return a placeholder so the UI can render a
  // "warming up" row instead of a zero score that looks broken.
  if (candles.length < MIN_CANDLES) {
    return {
      symbol,
      pair,
      meatScore: 0,
      label: "Dead",
      tradeCondition: "Avoid",
      volumeState: "Normal",
      spreadQuality: "Unknown",
      session,
      components: {
        tickActivity: 0,
        candleParticipation: 0,
        atrExpansion: 0,
        sessionStrength,
        rangeQuality: 0,
      },
      diagnostics: {
        currentVolume: null,
        baselineVolume: null,
        volumeRatio: null,
        bodyStrength: null,
        upperWickRatio: null,
        lowerWickRatio: null,
        candleRange: null,
        atr14,
        atrExpansionRatio: null,
        candleCount: candles.length,
        timeframe,
      },
      reasons: ["Not enough candle data yet — pair is warming up"],
      postedAt,
      warming: true,
    };
  }

  const cur = candles[0];
  const history = candles.slice(1, BASELINE_LOOKBACK + 1);
  const recent5 = candles.slice(0, 5);

  // ── 1. Tick activity (volume vs rolling baseline) ──
  // Spot FX volume from broker feeds is "tick volume" — number of price
  // updates inside the bar. Treat as a proxy and score on log-ratio so a
  // 2x baseline = ~75 and 4x = ~95.
  const baselineVolumes = history.map((c) => c.volume).filter((v) => v > 0);
  const baselineVol = baselineVolumes.length >= 3 ? median(baselineVolumes) : null;
  const volumeRatio = baselineVol && baselineVol > 0 ? cur.volume / baselineVol : null;
  let tickScore = 50;
  if (volumeRatio !== null && volumeRatio > 0) {
    tickScore = clamp(50 + Math.log2(volumeRatio) * 25, 0, 100);
  } else if (cur.volume === 0) {
    // Some FX feeds report zero volume during quiet bars. Don't punish too
    // harshly — fall back to mid-range.
    tickScore = 35;
  }

  // ── 2. Candle participation (body strength + close position) ──
  const range = Math.max(cur.high - cur.low, 1e-9);
  const body = Math.abs(cur.close - cur.open);
  const bodyStrength = clamp(body / range, 0, 1);
  // Close strength: how close to the high (bull) or low (bear) it closes.
  const closeStrength = cur.close >= cur.open
    ? (cur.close - cur.low) / range
    : (cur.high - cur.close) / range;
  const upperWick = cur.high - Math.max(cur.open, cur.close);
  const lowerWick = Math.min(cur.open, cur.close) - cur.low;
  const upperWickRatio = clamp(upperWick / range, 0, 1);
  const lowerWickRatio = clamp(lowerWick / range, 0, 1);
  // Weight body strength more than close strength — body shows decisive
  // participation, close strength shows direction conviction.
  const participationScore = clamp(bodyStrength * 65 + closeStrength * 35, 0, 100);

  // ── 3. ATR expansion ──
  // current candle range vs the 14-period ATR. Ratio of 1.0 = "average bar",
  // 1.5+ = expansion, 2.5+ = breakout territory but penalize beyond 3.0
  // because that often means news/spike, not clean liquidity.
  let atrScore = 50;
  let atrExpansionRatio: number | null = null;
  if (atr14 && atr14 > 0) {
    atrExpansionRatio = range / atr14;
    if (atrExpansionRatio < 0.4) atrScore = 25;             // very compressed
    else if (atrExpansionRatio < 0.7) atrScore = 45;        // below normal
    else if (atrExpansionRatio < 1.2) atrScore = 70;        // healthy
    else if (atrExpansionRatio < 1.8) atrScore = 90;        // expanding
    else if (atrExpansionRatio < 2.8) atrScore = 80;        // strong but volatile
    else atrScore = 60;                                     // likely news spike
  }

  // ── 4. Session strength ── (already 0-100 from session.ts)
  const sessionScore = sessionStrength;

  // ── 5. Range quality (last 5 candles' range stability) ──
  // Choppy/whippy bars (high stddev relative to mean) = poor quality.
  // Steady expanding bars = good quality.
  const recentRanges = recent5.map((c) => Math.max(c.high - c.low, 1e-9));
  const meanRange = recentRanges.reduce((a, b) => a + b, 0) / recentRanges.length;
  const sd = stddev(recentRanges);
  const cv = meanRange > 0 ? sd / meanRange : 1;
  const rangeScore = clamp(100 - cv * 100, 20, 100);

  // ── Combine ──
  const meatScore = Math.round(
    tickScore * WEIGHTS.tick
    + participationScore * WEIGHTS.participation
    + atrScore * WEIGHTS.atr
    + sessionScore * WEIGHTS.session
    + rangeScore * WEIGHTS.range,
  );

  // ── Reasons (top 4 contributors / detractors) ──
  const reasons: string[] = [];
  if (volumeRatio !== null) {
    if (volumeRatio >= 1.5) reasons.push(`Volume ${Math.round((volumeRatio - 1) * 100)}% above pair baseline`);
    else if (volumeRatio <= 0.6) reasons.push(`Volume ${Math.round((1 - volumeRatio) * 100)}% below pair baseline`);
  }
  if (bodyStrength >= 0.7) reasons.push("Decisive candle body — strong participation");
  else if (bodyStrength <= 0.3) reasons.push("Indecisive bar — mostly wick");
  if (atrExpansionRatio !== null) {
    if (atrExpansionRatio >= 1.5) reasons.push(`Range ${atrExpansionRatio.toFixed(1)}x ATR — expanding`);
    else if (atrExpansionRatio <= 0.5) reasons.push(`Range ${atrExpansionRatio.toFixed(1)}x ATR — compressed`);
  }
  if (sessionScore >= 85) reasons.push(`Primary session for this pair (${session})`);
  else if (sessionScore <= 40) reasons.push(`Off-session — natural liquidity is low`);
  if (cv > 0.7) reasons.push("Recent bars are choppy — low range quality");

  return {
    symbol,
    pair,
    meatScore,
    label: labelFor(meatScore),
    tradeCondition: tradeConditionFor(meatScore, atrExpansionRatio),
    volumeState: volumeStateFor(volumeRatio),
    spreadQuality: "Unknown", // V1: no live bid/ask feed
    session,
    components: {
      tickActivity: Math.round(tickScore),
      candleParticipation: Math.round(participationScore),
      atrExpansion: Math.round(atrScore),
      sessionStrength: Math.round(sessionScore),
      rangeQuality: Math.round(rangeScore),
    },
    diagnostics: {
      currentVolume: cur.volume,
      baselineVolume: baselineVol,
      volumeRatio,
      bodyStrength: Math.round(bodyStrength * 100) / 100,
      upperWickRatio: Math.round(upperWickRatio * 100) / 100,
      lowerWickRatio: Math.round(lowerWickRatio * 100) / 100,
      candleRange: range,
      atr14,
      atrExpansionRatio: atrExpansionRatio !== null ? Math.round(atrExpansionRatio * 100) / 100 : null,
      candleCount: candles.length,
      timeframe,
    },
    reasons,
    postedAt,
    warming: false,
  };
}
