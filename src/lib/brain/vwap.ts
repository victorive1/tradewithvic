import { prisma } from "@/lib/prisma";

/**
 * VWAP Phase 1 — anchored VWAP engine.
 *
 * Computes daily and weekly anchored VWAP with ±1σ / ±2σ bands, slope, bias,
 * and regime classification. Runs on the same 2-min scan cadence as the rest
 * of the brain layers so snapshots stay fresh for the dashboard and signal
 * engine. Deviation events (reclaim, rejection, stretch, snapback) persist
 * as discrete rows.
 *
 * Volume note: TwelveData returns 0 volume for most FX pairs. When that
 * happens we synthesise weight = 1 per bar, which degrades to a time-weighted
 * average price. Still useful as a fair-value reference but we flag
 * volumeQuality so downstream scoring can discount it.
 */

interface CandleRow {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type VwapAnchor = "daily" | "weekly";

const BASE_TIMEFRAME: Record<VwapAnchor, string> = {
  daily: "15min",
  weekly: "1h",
};

/**
 * Anchor reset times. Daily = 00:00 UTC of the current day. Weekly = Sunday
 * 22:00 UTC (standard FX week open) so it covers the full Sun 22:00 → Fri
 * 22:00 window; for 24/7 crypto this still works as a rolling 7-day mark.
 */
function getAnchorTime(anchor: VwapAnchor, now: Date = new Date()): Date {
  if (anchor === "daily") {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  // weekly — walk back to last Sunday 22:00 UTC
  const d = new Date(now);
  const day = d.getUTCDay(); // 0 = Sun
  const hour = d.getUTCHours();
  // If we're past Sun 22:00 UTC, anchor is today; otherwise previous Sunday.
  const daysBack = day === 0 && hour >= 22 ? 0 : (day === 0 ? 7 : day);
  d.setUTCDate(d.getUTCDate() - daysBack);
  d.setUTCHours(22, 0, 0, 0);
  return d;
}

/**
 * Merge a VolumeReference series into the candle window. For each bar we
 * prefer the real proxy volume when we have one for that openTime — the
 * ETF volume row was persisted by persistVolumeReferences before this
 * function runs. Bars without a match fall through to the spot volume
 * on the candle (crypto, indices, metals futures), and if that's 0 the
 * computeAnchoredVwap fallback further down degrades to weight=1.
 */
function overlayProxyVolume(
  candles: CandleRow[],
  proxyByTime: Map<number, number>,
): CandleRow[] {
  if (proxyByTime.size === 0) return candles;
  return candles.map((c) => {
    const proxyVol = proxyByTime.get(c.openTime.getTime());
    if (proxyVol && proxyVol > 0) return { ...c, volume: proxyVol };
    return c;
  });
}

/**
 * Compute running VWAP + σ bands from an ordered (oldest → newest) candle
 * window. Uses typical price (H+L+C)/3 weighted by volume. Bands are
 * running standard deviation of typical price around VWAP.
 */
function computeAnchoredVwap(candles: CandleRow[]): {
  vwap: number;
  stddev: number;
  upperBand1: number;
  lowerBand1: number;
  upperBand2: number;
  lowerBand2: number;
  slope: number;
  slopeState: "rising" | "falling" | "flat";
  volumeQuality: "reliable" | "degraded" | "synthetic";
  trail: number[]; // VWAP value at each bar — used for slope + events
} {
  const trail: number[] = [];
  let cumPv = 0;
  let cumV = 0;
  let cumPv2 = 0; // for variance
  let totalVol = 0;
  let syntheticVol = 0;

  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    // Guard against zero-volume bars (FX). Use 1 so the division still works
    // — VWAP degrades to time-weighted average of typical price.
    const vol = c.volume > 0 ? c.volume : 1;
    if (c.volume <= 0) syntheticVol++;
    totalVol++;
    cumPv += typical * vol;
    cumV += vol;
    cumPv2 += typical * typical * vol;
    const vwap = cumPv / cumV;
    trail.push(vwap);
  }

  const last = trail.length - 1;
  const vwap = trail[last];
  const mean = vwap;
  const variance = cumV > 0 ? Math.max(0, cumPv2 / cumV - mean * mean) : 0;
  const stddev = Math.sqrt(variance);

  // Slope across last ~10 bars of trail (or whatever we have).
  const slopeWindow = Math.min(10, trail.length - 1);
  const slope = slopeWindow > 0
    ? (trail[last] - trail[last - slopeWindow]) / slopeWindow
    : 0;
  const slopeThresh = Math.max(1e-9, stddev * 0.05); // ~5% of σ per bar
  const slopeState: "rising" | "falling" | "flat" =
    slope > slopeThresh ? "rising" : slope < -slopeThresh ? "falling" : "flat";

  const syntheticPct = totalVol > 0 ? syntheticVol / totalVol : 0;
  const volumeQuality: "reliable" | "degraded" | "synthetic" =
    syntheticPct >= 0.9 ? "synthetic" : syntheticPct >= 0.4 ? "degraded" : "reliable";

  return {
    vwap,
    stddev,
    upperBand1: vwap + stddev,
    lowerBand1: vwap - stddev,
    upperBand2: vwap + 2 * stddev,
    lowerBand2: vwap - 2 * stddev,
    slope,
    slopeState,
    volumeQuality,
    trail,
  };
}

function classifyBias(
  price: number,
  vwap: number,
  slopeState: "rising" | "falling" | "flat",
): "bullish" | "bearish" | "neutral" {
  const above = price > vwap;
  if (above && slopeState === "rising") return "bullish";
  if (!above && slopeState === "falling") return "bearish";
  return "neutral";
}

function classifyRegime(
  zScore: number,
  slopeState: "rising" | "falling" | "flat",
): "trend" | "balanced" | "stretched" | "mean_revert" | "choppy" {
  const absZ = Math.abs(zScore);
  if (absZ >= 2.0) return "stretched";
  if (absZ >= 1.2 && slopeState === "flat") return "mean_revert";
  if (slopeState !== "flat" && absZ < 0.8) return "trend";
  if (slopeState === "flat" && absZ < 0.5) return "balanced";
  return "choppy";
}

export interface VwapAnalysisResult {
  symbol: string;
  timeframe: string;
  anchor: VwapAnchor;
  computed: boolean;
  eventCreated?: string | null;
  setupPersisted?: boolean;
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

/**
 * Translate a VWAP deviation event into a TradeSetup ticket.
 *
 * Signal families supported:
 *   - reclaim   → long: price just crossed back above VWAP
 *   - rejection → short: price just fell back below VWAP
 *   - stretch_upper → short fade: 2σ+ above VWAP, price rejecting
 *   - stretch_lower → long fade: 2σ+ below VWAP, price rejecting
 *
 * Stops sit just beyond the opposite σ band (or VWAP itself for
 * reclaim/rejection, padded by 0.25σ). Targets ladder from VWAP
 * midline out to ±1σ / ±2σ depending on direction.
 */
function buildVwapSetup(args: {
  symbol: string;
  timeframe: string;
  anchor: VwapAnchor;
  eventType: "reclaim" | "rejection" | "stretch_upper" | "stretch_lower";
  price: number;
  vwap: number;
  stddev: number;
  upperBand1: number;
  lowerBand1: number;
  upperBand2: number;
  lowerBand2: number;
  slopeState: "rising" | "falling" | "flat";
  zScore: number;
  volumeQuality: "reliable" | "degraded" | "synthetic";
}): {
  direction: "bullish" | "bearish";
  entry: number;
  stopLoss: number;
  tp1: number; tp2: number; tp3: number;
  setupType: string;
  score: number;
  explanation: string;
  invalidation: string;
} | null {
  const {
    eventType, price, vwap, stddev, upperBand1, lowerBand1, upperBand2, lowerBand2,
    slopeState, zScore, volumeQuality,
  } = args;
  const sigma = Math.max(stddev, Math.abs(vwap) * 0.0001);
  const pad = sigma * 0.25;

  if (eventType === "reclaim") {
    const direction = "bullish" as const;
    const entry = price;
    const stopLoss = vwap - pad;
    const tp1 = upperBand1;
    const tp2 = upperBand2;
    const tp3 = vwap + 3 * sigma;
    let score = 55;
    if (slopeState === "rising") score += 15;
    else if (slopeState === "flat") score += 5;
    if (Math.abs(zScore) < 0.6) score += 10; // clean reclaim close to VWAP
    if (volumeQuality === "reliable") score += 10;
    else if (volumeQuality === "degraded") score += 3;
    return {
      direction, entry, stopLoss, tp1, tp2, tp3,
      setupType: "vwap_reclaim",
      score: Math.min(100, score),
      explanation: `Price reclaimed VWAP ${vwap.toFixed(5)} from below; slope ${slopeState}, z=${zScore.toFixed(2)}.`,
      invalidation: `Close back below ${vwap.toFixed(5)} invalidates the reclaim.`,
    };
  }

  if (eventType === "rejection") {
    const direction = "bearish" as const;
    const entry = price;
    const stopLoss = vwap + pad;
    const tp1 = lowerBand1;
    const tp2 = lowerBand2;
    const tp3 = vwap - 3 * sigma;
    let score = 55;
    if (slopeState === "falling") score += 15;
    else if (slopeState === "flat") score += 5;
    if (Math.abs(zScore) < 0.6) score += 10;
    if (volumeQuality === "reliable") score += 10;
    else if (volumeQuality === "degraded") score += 3;
    return {
      direction, entry, stopLoss, tp1, tp2, tp3,
      setupType: "vwap_rejection",
      score: Math.min(100, score),
      explanation: `Price rejected VWAP ${vwap.toFixed(5)} from above; slope ${slopeState}, z=${zScore.toFixed(2)}.`,
      invalidation: `Close back above ${vwap.toFixed(5)} invalidates the rejection.`,
    };
  }

  if (eventType === "stretch_upper") {
    // Fade long extensions back toward VWAP — only trade against an
    // already-rising slope if the z-score is deep (>2.3), otherwise skip.
    if (slopeState === "rising" && zScore < 2.3) return null;
    const direction = "bearish" as const;
    const entry = price;
    const stopLoss = price + pad + sigma * 0.5;
    const tp1 = upperBand1;
    const tp2 = vwap;
    const tp3 = lowerBand1;
    let score = 52;
    if (zScore >= 2.3) score += 12;
    if (slopeState === "flat") score += 10;
    else if (slopeState === "falling") score += 18;
    if (volumeQuality === "reliable") score += 8;
    return {
      direction, entry, stopLoss, tp1, tp2, tp3,
      setupType: "vwap_stretch",
      score: Math.min(100, score),
      explanation: `Price stretched ${zScore.toFixed(2)}σ above VWAP ${vwap.toFixed(5)}; mean-reversion fade.`,
      invalidation: `Acceptance above ${upperBand2.toFixed(5)} voids the fade thesis.`,
    };
  }

  if (eventType === "stretch_lower") {
    if (slopeState === "falling" && zScore > -2.3) return null;
    const direction = "bullish" as const;
    const entry = price;
    const stopLoss = price - pad - sigma * 0.5;
    const tp1 = lowerBand1;
    const tp2 = vwap;
    const tp3 = upperBand1;
    let score = 52;
    if (zScore <= -2.3) score += 12;
    if (slopeState === "flat") score += 10;
    else if (slopeState === "rising") score += 18;
    if (volumeQuality === "reliable") score += 8;
    return {
      direction, entry, stopLoss, tp1, tp2, tp3,
      setupType: "vwap_stretch",
      score: Math.min(100, score),
      explanation: `Price stretched ${Math.abs(zScore).toFixed(2)}σ below VWAP ${vwap.toFixed(5)}; mean-reversion long.`,
      invalidation: `Acceptance below ${lowerBand2.toFixed(5)} voids the fade thesis.`,
    };
  }

  return null;
}

async function persistVwapSetup(args: {
  symbol: string;
  timeframe: string;
  setup: NonNullable<ReturnType<typeof buildVwapSetup>>;
  validHours: number;
}): Promise<boolean> {
  const { symbol, timeframe, setup, validHours } = args;

  // Idempotency: within 30 min skip any very-similar active setup.
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const similar = await prisma.tradeSetup.findFirst({
    where: {
      symbol, timeframe, status: "active",
      setupType: setup.setupType,
      direction: setup.direction,
      createdAt: { gte: thirtyMinAgo },
    },
    select: { id: true, entry: true },
  });
  if (similar && Math.abs(similar.entry - setup.entry) / Math.max(Math.abs(setup.entry), 1e-9) < 0.002) {
    return false;
  }

  const instrument = await prisma.instrument.findUnique({ where: { symbol }, select: { id: true } });
  if (!instrument) return false;

  const risk = Math.abs(setup.entry - setup.stopLoss);
  const reward = Math.abs(setup.tp1 - setup.entry);
  const riskReward = risk > 0 ? reward / risk : 0;

  await prisma.tradeSetup.create({
    data: {
      instrumentId: instrument.id,
      symbol,
      direction: setup.direction === "bullish" ? "long" : "short",
      setupType: setup.setupType,
      timeframe,
      entry: setup.entry,
      stopLoss: setup.stopLoss,
      takeProfit1: setup.tp1,
      takeProfit2: setup.tp2,
      takeProfit3: setup.tp3,
      riskReward,
      confidenceScore: setup.score,
      qualityGrade: gradeFromScore(setup.score),
      explanation: setup.explanation,
      invalidation: setup.invalidation,
      status: "active",
      validUntil: new Date(Date.now() + validHours * 60 * 60 * 1000),
    },
  });
  return true;
}

/**
 * Analyze one (symbol, anchor) pair. Fetches the candle window from anchor
 * time to now (at the anchor's base timeframe), computes VWAP + bands +
 * slope + bias + regime, upserts the snapshot, and creates a deviation event
 * on state transition.
 */
export async function analyzeVwap(
  symbol: string,
  anchor: VwapAnchor,
): Promise<VwapAnalysisResult> {
  const timeframe = BASE_TIMEFRAME[anchor];
  const anchorTime = getAnchorTime(anchor);

  const [rows, proxyRows] = await Promise.all([
    prisma.candle.findMany({
      where: { symbol, timeframe, openTime: { gte: anchorTime }, isClosed: true },
      orderBy: { openTime: "asc" },
      select: { openTime: true, open: true, high: true, low: true, close: true, volume: true },
    }),
    prisma.volumeReference.findMany({
      where: { symbol, timeframe, openTime: { gte: anchorTime } },
      orderBy: { openTime: "asc" },
      select: { openTime: true, volume: true },
    }),
  ]);

  // Minimum bars for a meaningful VWAP — weekly needs more context, daily
  // can work with a handful of 15m bars.
  const minBars = anchor === "weekly" ? 12 : 4;
  if (rows.length < minBars) {
    return { symbol, timeframe, anchor, computed: false };
  }

  const proxyByTime = new Map<number, number>(
    proxyRows.map((r: { openTime: Date; volume: number }) => [r.openTime.getTime(), r.volume]),
  );
  const candles = overlayProxyVolume(rows as CandleRow[], proxyByTime);
  const calc = computeAnchoredVwap(candles);
  const last = candles[candles.length - 1];
  const price = last.close;

  const deviation = price - calc.vwap;
  const deviationPct = calc.vwap > 0 ? (deviation / calc.vwap) * 100 : 0;
  const zScore = calc.stddev > 0 ? deviation / calc.stddev : 0;

  const position: "above" | "below" | "at" =
    Math.abs(deviation) < calc.stddev * 0.1 ? "at" : deviation > 0 ? "above" : "below";
  const bias = classifyBias(price, calc.vwap, calc.slopeState);
  const regime = classifyRegime(zScore, calc.slopeState);

  const existing = await prisma.vwapSnapshot.findUnique({
    where: { symbol_timeframe_anchor: { symbol, timeframe, anchor } },
    select: { position: true, bias: true, regime: true, vwap: true },
  });

  const data = {
    anchorTime,
    candleCount: candles.length,
    lastClose: price,
    vwap: calc.vwap,
    upperBand1: calc.upperBand1,
    lowerBand1: calc.lowerBand1,
    upperBand2: calc.upperBand2,
    lowerBand2: calc.lowerBand2,
    stddev: calc.stddev,
    slope: calc.slope,
    slopeState: calc.slopeState,
    deviationPct,
    zScore,
    position,
    bias,
    regime,
    volumeQuality: calc.volumeQuality,
  };

  await prisma.vwapSnapshot.upsert({
    where: { symbol_timeframe_anchor: { symbol, timeframe, anchor } },
    create: { symbol, timeframe, anchor, ...data },
    update: data,
  });

  let eventCreated: string | null = null;
  let setupPersisted = false;
  if (existing) {
    // Detect state transitions that correspond to classic VWAP events.
    if (existing.position === "below" && position === "above") {
      eventCreated = "reclaim";
    } else if (existing.position === "above" && position === "below") {
      eventCreated = "rejection";
    } else if (regime === "stretched" && existing.regime !== "stretched") {
      eventCreated = zScore > 0 ? "stretch_upper" : "stretch_lower";
    } else if (existing.regime === "stretched" && regime !== "stretched" && Math.abs(zScore) < 1.0) {
      eventCreated = "snapback";
    }

    if (eventCreated) {
      await prisma.vwapDeviationEvent.create({
        data: {
          symbol,
          timeframe,
          anchor,
          eventType: eventCreated,
          price,
          vwapAtEvent: calc.vwap,
          zScoreAtEvent: zScore,
          reason: `${existing.position}→${position} · z=${zScore.toFixed(2)} · slope=${calc.slopeState}`,
        },
      });

      // Translate tradeable events into TradeSetup rows so the Brain's
      // existing confluence, qualification, tracking, and execution
      // machinery can consume them just like breakout/pullback setups.
      // snapback isn't tradeable — it's a thesis-close signal.
      if (eventCreated === "reclaim" || eventCreated === "rejection"
          || eventCreated === "stretch_upper" || eventCreated === "stretch_lower") {
        const built = buildVwapSetup({
          symbol, timeframe, anchor,
          eventType: eventCreated,
          price,
          vwap: calc.vwap,
          stddev: calc.stddev,
          upperBand1: calc.upperBand1,
          lowerBand1: calc.lowerBand1,
          upperBand2: calc.upperBand2,
          lowerBand2: calc.lowerBand2,
          slopeState: calc.slopeState,
          zScore,
          volumeQuality: calc.volumeQuality,
        });
        if (built) {
          // Daily anchors → 4h lifetime; weekly anchors → 24h.
          const validHours = anchor === "weekly" ? 24 : 4;
          setupPersisted = await persistVwapSetup({ symbol, timeframe, setup: built, validHours });
        }
      }
    }
  }

  return { symbol, timeframe, anchor, computed: true, eventCreated, setupPersisted };
}

/**
 * Run VWAP analysis for every (symbol, anchor) pair. Parallelized the same
 * way indicators + zones are — one Promise per pair, Prisma's pool queues
 * the writes.
 */
export async function analyzeAllVwap(
  symbols: readonly string[],
): Promise<{
  results: VwapAnalysisResult[];
  snapshotsWritten: number;
  eventsCreated: number;
  setupsPersisted: number;
}> {
  const anchors: VwapAnchor[] = ["daily", "weekly"];
  const pairs: Array<[string, VwapAnchor]> = [];
  for (const s of symbols) for (const a of anchors) pairs.push([s, a]);
  const results = await Promise.all(pairs.map(([s, a]) => analyzeVwap(s, a).catch(() => ({
    symbol: s, timeframe: BASE_TIMEFRAME[a], anchor: a, computed: false,
  } as VwapAnalysisResult))));
  const snapshotsWritten = results.filter((r) => r.computed).length;
  const eventsCreated = results.filter((r) => r.eventCreated).length;
  const setupsPersisted = results.filter((r) => r.setupPersisted).length;
  return { results, snapshotsWritten, eventsCreated, setupsPersisted };
}
