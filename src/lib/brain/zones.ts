/**
 * Supply & Demand zone detection — Phase 1 of the blueprint
 * (docs/supply-demand-blueprint.md). Works off the candles the Brain
 * already fetches; no tick or order-book data required.
 *
 * Component scoring we actually compute (the ones that need book /
 * tick data are weighted to 0 and flagged in code so we don't pretend):
 *   - formation_score      ✓ compression + overlap + symmetry + base duration
 *   - displacement_score   ✓ ATR multiple + impulse velocity + close efficiency
 *   - imbalance_score      ✓ FVG presence + skipped price + volume z-score
 *                            (book_imbalance + liquidity_vacuum not available)
 *   - structure_score      ✓ BOS + sweep + prior swings (CHoCH treated as BOS
 *                            when bias flip detected)
 *   - freshness_score      ✓ untouched / retest count / penetration depth
 *   - retest_quality_score ✗ 0 until Phase 2 retest manager
 *   - context_score        ✗ 0 until Phase 2 context (session/news) wiring
 */

import { prisma } from "@/lib/prisma";

export interface ZoneCandle {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type ZoneType = "supply" | "demand";
export type FreshnessState =
  | "NEW"
  | "FRESH"
  | "ARMED"
  | "TOUCHED"
  | "PARTIALLY_MITIGATED"
  | "CONSUMED"
  | "INVALIDATED";
export type ZoneGrade = "A+" | "A" | "B" | "WATCH" | "IGNORE";

export interface ZoneComponents {
  formation: number;
  displacement: number;
  imbalance: number;
  structure: number;
  freshness: number;
  retest: number;
  context: number;
}

export interface DetectedZone {
  symbol: string;
  timeframe: string;
  zoneType: ZoneType;
  proximal: number;
  distal: number;
  midpoint: number;
  originTime: Date;
  baseCandles: number;
  departureAtrMultiple: number;
  fvgPresent: boolean;
  fvgSize: number | null;
  bosFlag: boolean;
  sweepFlag: boolean;

  components: ZoneComponents;
  institutionalScore: number;
  grade: ZoneGrade;
  freshnessState: FreshnessState;
  retestCount: number;
  currentPrice: number;
  penetrationPct: number;
}

/* ─────────────────────── helpers ─────────────────────── */

function avgTrueRange(candles: ZoneCandle[], period = 14): number {
  if (candles.length < 2) return 0;
  let sum = 0;
  const take = Math.min(period, candles.length - 1);
  for (let i = candles.length - take; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1] ?? c;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    sum += tr;
  }
  return sum / take;
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
function clip(x: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, x)); }

/* ─────────────────────── scoring components ─────────────────────── */

function scoreFormation(baseCandles: ZoneCandle[], atr: number): number {
  if (baseCandles.length === 0 || atr <= 0) return 0;
  const sizes = baseCandles.map((c) => c.high - c.low);
  const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  // Compression: base bars should be small relative to ATR.
  const compressionRatio = 1 - clamp01(avgSize / (atr * 0.8));
  // Overlap: bodies overlapping tightly is the mark of a good base.
  const closes = baseCandles.map((c) => c.close);
  const opens = baseCandles.map((c) => c.open);
  const highest = Math.max(...closes, ...opens);
  const lowest = Math.min(...closes, ...opens);
  const overlap = highest > lowest ? 1 - (highest - lowest) / (atr * 1.2) : 1;
  const overlapRatio = clamp01(overlap);
  // Symmetry: wicks top and bottom shouldn't be wildly lopsided.
  const avgBody = baseCandles.reduce((acc, c) => acc + Math.abs(c.close - c.open), 0) / baseCandles.length;
  const avgUpper = baseCandles.reduce((acc, c) => acc + (c.high - Math.max(c.open, c.close)), 0) / baseCandles.length;
  const avgLower = baseCandles.reduce((acc, c) => acc + (Math.min(c.open, c.close) - c.low), 0) / baseCandles.length;
  const wickBalance = avgUpper + avgLower > 0 ? 1 - Math.abs(avgUpper - avgLower) / (avgUpper + avgLower) : 0.5;
  const symmetry = clamp01(wickBalance);
  // Base duration: 2–4 bars is ideal; too short = not a base, too long = drifting.
  const duration = baseCandles.length;
  const durationScore = duration >= 2 && duration <= 4 ? 1 : duration === 1 ? 0.35 : clamp01(1 - (duration - 4) * 0.15);
  const raw = 40 * compressionRatio + 25 * overlapRatio + 20 * symmetry + 15 * durationScore;
  return clip(raw, 0, 100);
  void avgBody;
}

function scoreDisplacement(
  base: ZoneCandle[],
  departure: ZoneCandle[],
  atr: number,
  departureAtrMultiple: number,
): number {
  if (atr <= 0 || departure.length === 0) return 0;
  const atrScore = clip((departureAtrMultiple - 0.8) / (3 - 0.8), 0, 1);
  // Impulse velocity: largest body among departure bars.
  const bodies = departure.map((c) => Math.abs(c.close - c.open));
  const biggest = Math.max(...bodies);
  const velocity = clip(biggest / (atr * 1.5), 0, 1);
  // Close efficiency: how close did the departure close to its extreme?
  const effs = departure.map((c) => {
    const range = c.high - c.low;
    if (range <= 0) return 0.5;
    return c.close > c.open ? (c.close - c.low) / range : (c.high - c.close) / range;
  });
  const efficiency = effs.reduce((a, b) => a + b, 0) / effs.length;
  // Low overlap after departure: departure bars shouldn't re-enter the base.
  const baseHigh = Math.max(...base.map((c) => c.high));
  const baseLow = Math.min(...base.map((c) => c.low));
  const nonOverlap = departure.every((c) => c.close > baseHigh || c.close < baseLow) ? 1 : 0.4;
  const raw = 35 * atrScore + 25 * velocity + 20 * efficiency + 20 * nonOverlap;
  return clip(raw, 0, 100);
}

function scoreImbalance(params: {
  fvgSize: number;
  atr: number;
  skippedPrice: number;
  volumeZ: number;
}): number {
  const { fvgSize, atr, skippedPrice, volumeZ } = params;
  // FVG score scaled by ATR
  const fvgScore = clip(fvgSize / (atr * 0.8), 0, 1);
  // Skipped price: how much of the zone had no trading before departure
  const skipped = clip(skippedPrice, 0, 1);
  // Volume z-score capped so one outlier doesn't dominate
  const volumeScore = clip((volumeZ + 1) / 4, 0, 1);
  // book_imbalance_score + liquidity_vacuum_score unavailable — we
  // redistribute their blueprint weight (30) across fvg + volume.
  const raw = 45 * fvgScore + 25 * skipped + 30 * volumeScore;
  return clip(raw, 0, 100);
}

function scoreStructure(params: {
  bos: boolean;
  sweep: boolean;
  priorBiasFlip: boolean;
}): number {
  const { bos, sweep, priorBiasFlip } = params;
  let raw = 0;
  if (bos) raw += 40;
  if (priorBiasFlip) raw += 25;
  if (sweep) raw += 25;
  // HTF alignment defaults to partial credit; real HTF alignment
  // comes in Phase 2 when we can cross-reference multi-TF zones.
  raw += 10;
  return clip(raw, 0, 100);
}

function scoreFreshness(retestCount: number, penetrationPct: number): number {
  const untouched = retestCount === 0 ? 1 : 0;
  const firstTouch = retestCount <= 1 ? 0.6 : 0;
  const depthPenalty = 1 - clamp01(penetrationPct);
  const retestPenalty = 1 - clamp01(retestCount / 5);
  const raw = 50 * untouched + 20 * firstTouch + 15 * depthPenalty + 15 * retestPenalty;
  return clip(raw, 0, 100);
}

function gradeFromScore(score: number, components: ZoneComponents): ZoneGrade {
  if (score >= 90 && components.imbalance >= 75 && components.freshness >= 70) return "A+";
  if (score >= 80 && components.imbalance >= 65) return "A";
  if (score >= 65) return "B";
  if (score >= 55) return "WATCH";
  return "IGNORE";
}

function freshnessFromPrice(
  zoneType: ZoneType,
  proximal: number,
  distal: number,
  currentPrice: number,
  retestCount: number,
): { state: FreshnessState; penetrationPct: number } {
  const zoneWidth = Math.abs(proximal - distal);
  if (zoneWidth <= 0) return { state: "NEW", penetrationPct: 0 };

  if (zoneType === "demand") {
    // Distal below proximal for demand
    if (currentPrice < distal) {
      return { state: "INVALIDATED", penetrationPct: 1 };
    }
    if (currentPrice <= proximal) {
      const penetration = (proximal - currentPrice) / zoneWidth;
      if (penetration >= 0.75) return { state: "CONSUMED", penetrationPct: 1 };
      if (penetration >= 0.33) return { state: "PARTIALLY_MITIGATED", penetrationPct: penetration };
      return { state: "TOUCHED", penetrationPct: penetration };
    }
    // Above zone — fresh or armed depending on distance
    if (retestCount > 0) return { state: "TOUCHED", penetrationPct: 0 };
    return { state: "FRESH", penetrationPct: 0 };
  } else {
    // supply: distal above proximal
    if (currentPrice > distal) {
      return { state: "INVALIDATED", penetrationPct: 1 };
    }
    if (currentPrice >= proximal) {
      const penetration = (currentPrice - proximal) / zoneWidth;
      if (penetration >= 0.75) return { state: "CONSUMED", penetrationPct: 1 };
      if (penetration >= 0.33) return { state: "PARTIALLY_MITIGATED", penetrationPct: penetration };
      return { state: "TOUCHED", penetrationPct: penetration };
    }
    if (retestCount > 0) return { state: "TOUCHED", penetrationPct: 0 };
    return { state: "FRESH", penetrationPct: 0 };
  }
}

/* ─────────────────────── detection ─────────────────────── */

function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/**
 * Detect supply/demand zones from a candle series. Scans the last
 * ~40 bars and returns every qualifying zone — the scoring pass then
 * filters what's actually worth showing.
 */
export function detectZones(symbol: string, timeframe: string, candles: ZoneCandle[]): DetectedZone[] {
  if (candles.length < 20) return [];
  const atr = avgTrueRange(candles, 14);
  if (atr <= 0) return [];
  const volumes = candles.map((c) => c.volume ?? 0);
  const volMean = mean(volumes);
  const volStd = stdev(volumes);

  const zones: DetectedZone[] = [];
  const current = candles[candles.length - 1].close;
  const searchStart = Math.max(6, candles.length - 40);

  for (let i = searchStart; i < candles.length - 3; i++) {
    // Base cluster: 2–4 candles ending at i
    for (const baseLen of [2, 3, 4]) {
      if (i - baseLen + 1 < 0) continue;
      const base = candles.slice(i - baseLen + 1, i + 1);
      const sizes = base.map((c) => c.high - c.low);
      const avgBaseSize = mean(sizes);
      if (avgBaseSize > atr * 0.9) continue; // not compressed

      // Departure: next 3 candles
      const departure = candles.slice(i + 1, i + 4);
      if (departure.length < 2) continue;

      const baseHigh = Math.max(...base.map((c) => c.high));
      const baseLow = Math.min(...base.map((c) => c.low));
      const depClose = departure[departure.length - 1].close;

      const impulseUp = depClose - baseHigh;
      const impulseDown = baseLow - depClose;
      const isDemand = impulseUp > atr * 1.0;
      const isSupply = impulseDown > atr * 1.0;
      if (!isDemand && !isSupply) continue;

      const direction: ZoneType = isDemand ? "demand" : "supply";
      const departureAtrMultiple = (isDemand ? impulseUp : impulseDown) / atr;

      // Zone bounds from base extremes
      const proximal = isDemand ? baseHigh : baseLow;
      const distal = isDemand ? baseLow : baseHigh;
      const midpoint = (proximal + distal) / 2;

      // FVG detection: gap between base candle extreme and next-next candle
      let fvgSize = 0;
      let fvgPresent = false;
      if (isDemand) {
        const candleAfterBase = candles[i + 1];
        const twoAfter = candles[i + 2];
        if (twoAfter && candleAfterBase.high < twoAfter.low) {
          fvgSize = twoAfter.low - candleAfterBase.high;
          fvgPresent = fvgSize > 0;
        }
      } else {
        const candleAfterBase = candles[i + 1];
        const twoAfter = candles[i + 2];
        if (twoAfter && candleAfterBase.low > twoAfter.high) {
          fvgSize = candleAfterBase.low - twoAfter.high;
          fvgPresent = fvgSize > 0;
        }
      }

      // BOS / sweep flags — simple heuristics based on surrounding swings
      const lookback = candles.slice(Math.max(0, i - 20), i);
      const priorSwingHigh = lookback.length ? Math.max(...lookback.map((c) => c.high)) : baseHigh;
      const priorSwingLow = lookback.length ? Math.min(...lookback.map((c) => c.low)) : baseLow;
      const bosFlag = isDemand ? depClose > priorSwingHigh : depClose < priorSwingLow;
      // Sweep: any base candle wicked beyond a prior swing and reversed.
      const sweepFlag = base.some((b) =>
        isDemand
          ? b.low < priorSwingLow && b.close > priorSwingLow
          : b.high > priorSwingHigh && b.close < priorSwingHigh,
      );

      // Skipped-price ratio: how much of the zone had no prior bar occupying it
      const priorBarsInZone = lookback.filter((c) => c.low <= proximal && c.high >= distal).length;
      const skippedPrice = lookback.length > 0 ? 1 - priorBarsInZone / lookback.length : 0.5;

      // Volume z-score for the biggest departure candle
      const depVols = departure.map((c) => c.volume ?? 0);
      const depVolMax = Math.max(...depVols);
      const volumeZ = volStd > 0 ? (depVolMax - volMean) / volStd : 0;

      const formation = scoreFormation(base, atr);
      const displacement = scoreDisplacement(base, departure, atr, departureAtrMultiple);
      const imbalance = scoreImbalance({ fvgSize, atr, skippedPrice, volumeZ });
      const structure = scoreStructure({ bos: bosFlag, sweep: sweepFlag, priorBiasFlip: bosFlag });

      const retestCount = 0; // freshly detected
      const { state: freshnessState, penetrationPct } = freshnessFromPrice(direction, proximal, distal, current, retestCount);
      const freshness = scoreFreshness(retestCount, penetrationPct);

      const components: ZoneComponents = {
        formation, displacement, imbalance, structure, freshness,
        retest: 0, context: 0,
      };
      // Blueprint weights (retest + context 0 until Phase 2, so we normalize
      // the remaining 5 to preserve 0-100 range).
      const weighted =
        0.18 * formation + 0.19 * displacement + 0.21 * imbalance +
        0.15 * structure + 0.10 * freshness;
      const scaled = weighted / (0.18 + 0.19 + 0.21 + 0.15 + 0.10); // = /0.83
      const institutionalScore = Math.round(clip(scaled, 0, 100) * 10) / 10;
      const grade = gradeFromScore(institutionalScore, components);

      zones.push({
        symbol, timeframe, zoneType: direction,
        proximal, distal, midpoint,
        originTime: candles[i].openTime,
        baseCandles: baseLen,
        departureAtrMultiple,
        fvgPresent, fvgSize: fvgPresent ? fvgSize : null,
        bosFlag, sweepFlag,
        components,
        institutionalScore, grade,
        freshnessState, retestCount, currentPrice: current, penetrationPct,
      });
    }
  }

  // De-duplicate: if two base-length candidates produced identical proximal/distal, keep the higher score.
  const byKey = new Map<string, DetectedZone>();
  for (const z of zones) {
    const k = `${z.originTime.getTime()}:${z.zoneType}`;
    const existing = byKey.get(k);
    if (!existing || z.institutionalScore > existing.institutionalScore) byKey.set(k, z);
  }
  return Array.from(byKey.values());
}

/* ─────────────────────── persistence ─────────────────────── */

export async function persistZonesForCycle(symbols: readonly string[], timeframes: readonly string[]): Promise<{
  detected: number;
  persisted: number;
  lifecycleTransitions: number;
}> {
  const pairs: Array<[string, string]> = [];
  for (const s of symbols) for (const tf of timeframes) pairs.push([s, tf]);

  const results = await Promise.all(pairs.map(async ([symbol, timeframe]) => {
    const rows = await prisma.candle.findMany({
      where: { symbol, timeframe },
      orderBy: { openTime: "desc" },
      take: 80,
      select: { openTime: true, open: true, high: true, low: true, close: true, volume: true },
    });
    if (rows.length < 20) return { detected: 0, persisted: 0, transitions: 0 };
    const candles = rows.reverse();
    const zones = detectZones(symbol, timeframe, candles);
    const currentPrice = candles[candles.length - 1].close;

    let persisted = 0;
    let transitions = 0;

    // Upsert detected zones (origin_time + zone_type is the identity).
    for (const z of zones) {
      // Only persist zones with a reasonable score — cuts noise.
      if (z.institutionalScore < 40) continue;
      const existing = await prisma.supplyDemandZone.findUnique({
        where: {
          symbol_timeframe_originTime_zoneType: {
            symbol: z.symbol, timeframe: z.timeframe,
            originTime: z.originTime, zoneType: z.zoneType,
          },
        },
        select: { id: true, freshnessState: true, retestCount: true },
      });

      const data = {
        proximal: z.proximal, distal: z.distal, midpoint: z.midpoint,
        baseCandles: z.baseCandles, departureAtrMultiple: z.departureAtrMultiple,
        fvgPresent: z.fvgPresent, fvgSize: z.fvgSize,
        bosFlag: z.bosFlag, sweepFlag: z.sweepFlag,
        formationScore: z.components.formation,
        displacementScore: z.components.displacement,
        imbalanceScore: z.components.imbalance,
        structureScore: z.components.structure,
        freshnessScore: z.components.freshness,
        retestQualityScore: z.components.retest,
        contextScore: z.components.context,
        institutionalScore: z.institutionalScore,
        grade: z.grade,
        freshnessState: z.freshnessState,
        retestCount: z.retestCount,
        currentPrice, penetrationPct: z.penetrationPct,
      };

      if (!existing) {
        await prisma.supplyDemandZone.create({
          data: {
            symbol: z.symbol, timeframe: z.timeframe,
            zoneType: z.zoneType, originTime: z.originTime,
            ...data,
          },
        });
        persisted++;
      } else {
        // Lifecycle: recompute freshness against CURRENT price + existing retest count.
        const { state: newState, penetrationPct } = freshnessFromPrice(
          z.zoneType, z.proximal, z.distal, currentPrice, existing.retestCount,
        );
        const stateChanged = newState !== existing.freshnessState;
        await prisma.supplyDemandZone.update({
          where: { id: existing.id },
          data: { ...data, freshnessState: newState, penetrationPct, retestCount: existing.retestCount },
        });
        if (stateChanged) {
          await prisma.supplyDemandZoneEvent.create({
            data: {
              zoneId: existing.id,
              eventType: "state_transition",
              oldState: existing.freshnessState,
              newState,
              reason: `price=${currentPrice.toFixed(5)}`,
              price: currentPrice,
            },
          });
          transitions++;
        }
      }
    }

    return { detected: zones.length, persisted, transitions };
  }));

  return {
    detected: results.reduce((a, b) => a + b.detected, 0),
    persisted: results.reduce((a, b) => a + b.persisted, 0),
    lifecycleTransitions: results.reduce((a, b) => a + b.transitions, 0),
  };
}
