// src/lib/brain/sr-setup-generator.ts
//
// Pure function that turns a recently-violated LiquidityZone into a
// TradeSetup spec. No I/O, no DB. All context (ATR, current price,
// opposing zones, higher-TF zones) is passed in. Mirrors
// src/lib/brain/structure-setup-generator.ts.

export type SrZoneType =
  | "fvg" | "order_block"
  | "equal_highs" | "equal_lows"
  | "session_high" | "session_low"
  | "prev_day_high" | "prev_day_low"
  | "swing_high" | "swing_low";

export interface SrZoneInput {
  id: string;
  symbol: string;
  timeframe: string;
  zoneType: SrZoneType;
  direction: "bullish" | "bearish" | null;
  priceLow: number;
  priceHigh: number;
  strengthScore: number;
  updatedAt: Date;
}

export interface SrSetupSpec {
  setupType: "sr_zone_break";
  symbol: string;
  timeframe: string;
  direction: "bullish" | "bearish";
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  takeProfit3: null;
  riskReward: number;
  confidenceScore: number;
  qualityGrade: "A+" | "A" | "B" | "C";
  validHours: number;
  explanation: string;
  invalidation: string;
  metadata: {
    zoneId: string;
    zoneType: SrZoneType;
    zoneDirection: "bullish" | "bearish" | null;
    brokenSide: "above" | "below";
    scoreBreakdown: {
      zoneStrength: number;
      timeframeQuality: number;
      rr: number;
      multiTfAgreement: number;
      recency: number;
    };
    targetSource: "liquidity_zone" | "rr_fallback";
  };
}

export interface SrGeneratorContext {
  zone: SrZoneInput;
  currentPrice: number;
  atr14: number | null;
  // Active (not filled, not violated) zones on the same TF, for TP targets.
  // Should be sorted by priceHigh ascending or unordered — generator handles both.
  sameTfZones: SrZoneInput[];
  // Active zones on the next higher timeframe (1h for 15min, 4h for 1h,
  // daily for 4h). Used for the multi-TF agreement score component.
  higherTfZones: SrZoneInput[];
}

const POSITIONAL_HIGH_TYPES: Set<SrZoneType> = new Set([
  "equal_highs", "session_high", "prev_day_high", "swing_high",
]);
const POSITIONAL_LOW_TYPES: Set<SrZoneType> = new Set([
  "equal_lows", "session_low", "prev_day_low", "swing_low",
]);

function fallbackBuffer(symbol: string): number {
  if (/JPY$/.test(symbol)) return 0.05;
  if (/^XAU/.test(symbol)) return 0.5;
  if (/^(US30|NAS100|SPX500|GER40)$/.test(symbol)) return 0.5;
  return 0.0005;
}

function gradeFromScore(score: number): SrSetupSpec["qualityGrade"] {
  if (score >= 80) return "A+";
  if (score >= 65) return "A";
  if (score >= 50) return "B";
  return "C";
}

function timeframeQualityScore(tf: string): number {
  if (tf === "15min") return 10;
  if (tf === "1h") return 15;
  if (tf === "4h") return 20;
  return 5;
}

function validHoursForTf(tf: string): number {
  if (tf === "15min") return 2;
  if (tf === "1h") return 4;
  return 6;
}

function inferDirectionAndBrokenSide(
  zone: SrZoneInput,
  currentPrice: number,
): { direction: "bullish" | "bearish"; brokenSide: "above" | "below" } | null {
  // Directional zones: direction tells us the trade direction directly.
  if (zone.direction === "bullish") {
    // Bullish FVG/OB sits below price. Violated = price closed below it.
    if (currentPrice >= zone.priceLow) return null; // ambiguous
    return { direction: "bearish", brokenSide: "below" };
  }
  if (zone.direction === "bearish") {
    if (currentPrice <= zone.priceHigh) return null;
    return { direction: "bullish", brokenSide: "above" };
  }
  // Positional zones: infer from zoneType.
  if (POSITIONAL_HIGH_TYPES.has(zone.zoneType)) {
    if (currentPrice <= zone.priceHigh) return null;
    return { direction: "bullish", brokenSide: "above" };
  }
  if (POSITIONAL_LOW_TYPES.has(zone.zoneType)) {
    if (currentPrice >= zone.priceLow) return null;
    return { direction: "bearish", brokenSide: "below" };
  }
  return null;
}

function pickOpposingZone(
  zones: SrZoneInput[],
  from: number,
  direction: "bullish" | "bearish",
  minDistance: number,
): SrZoneInput | null {
  const candidates = zones
    .filter((z) => {
      const ref = direction === "bullish" ? z.priceLow : z.priceHigh;
      return direction === "bullish" ? ref > from + minDistance : ref < from - minDistance;
    })
    .sort((a, b) => {
      const refA = direction === "bullish" ? a.priceLow : a.priceHigh;
      const refB = direction === "bullish" ? b.priceLow : b.priceHigh;
      return direction === "bullish" ? refA - refB : refB - refA;
    });
  return candidates[0] ?? null;
}

export function generateSrSetup(ctx: SrGeneratorContext): SrSetupSpec | null {
  const { zone, currentPrice, atr14, sameTfZones, higherTfZones } = ctx;

  // Stale zones (>2h) → null
  const ageMs = Date.now() - zone.updatedAt.getTime();
  if (ageMs > 2 * 60 * 60 * 1000) return null;

  const inferred = inferDirectionAndBrokenSide(zone, currentPrice);
  if (!inferred) return null;
  const { direction, brokenSide } = inferred;

  const entry = (zone.priceLow + zone.priceHigh) / 2;
  const buffer = atr14 != null ? atr14 * 0.3 : fallbackBuffer(zone.symbol);
  const stopLoss = direction === "bullish" ? zone.priceLow - buffer : zone.priceHigh + buffer;
  const risk = Math.abs(entry - stopLoss);
  if (!(risk > 0)) return null;

  // "Already moved past" filter: entry must still be within retest range
  // of current price (no more than 0.5*ATR away in the trade direction).
  if (atr14 != null) {
    const movedPast = direction === "bullish"
      ? currentPrice > entry + atr14 * 0.5
      : currentPrice < entry - atr14 * 0.5;
    if (movedPast) return null;
  }

  // TP1: nearest opposing-direction zone with min 1.5*risk distance.
  const tp1Zone = pickOpposingZone(sameTfZones, entry, direction, risk * 1.5);
  const tp1FromZone = tp1Zone ? (direction === "bullish" ? tp1Zone.priceLow : tp1Zone.priceHigh) : null;
  const tp1 = tp1FromZone ?? (direction === "bullish" ? entry + risk * 2 : entry - risk * 2);
  const tp1Source: SrSetupSpec["metadata"]["targetSource"] =
    tp1FromZone != null ? "liquidity_zone" : "rr_fallback";

  const rr = Math.abs(tp1 - entry) / risk;
  if (rr < 1.5) return null;

  // TP2: second opposing zone beyond TP1 with min 0.5*risk distance.
  // The fallback "ratchet" extends TP1 by another 0.5*risk so TP2 is
  // always strictly beyond TP1 in the trade direction, even when TP1
  // itself came from a far-away (>3R) liquidity zone.
  const tp2Zone = pickOpposingZone(sameTfZones, tp1, direction, risk * 0.5);
  const tp2FromZone = tp2Zone ? (direction === "bullish" ? tp2Zone.priceLow : tp2Zone.priceHigh) : null;
  const tp2Ratchet = direction === "bullish" ? tp1 + risk * 0.5 : tp1 - risk * 0.5;
  const tp2Raw = tp2FromZone ?? tp2Ratchet;
  const tp2Valid = direction === "bullish" ? tp2Raw > tp1 : tp2Raw < tp1;
  const tp2 = tp2Valid ? tp2Raw : tp2Ratchet;

  // ── Scoring ───────────────────────────────────────────────────────
  const zoneStrength = Math.min(25, Math.round(zone.strengthScore * 0.25));
  const tfQuality = timeframeQualityScore(zone.timeframe);
  const rrScore = Math.min(20, Math.round(rr * 8));

  // Multi-TF agreement: look for a higher-TF zone in the trade direction
  // within 2*ATR of TP1.
  let multiTfAgreement = 10;
  if (atr14 != null && higherTfZones.length > 0) {
    const window = 2 * atr14;
    const aligned = higherTfZones.some((z) => {
      // The higher-TF zone is "in trade direction" if its price band is
      // beyond entry in the trade direction (i.e. it's a confluence
      // opposing-side wall the move can stretch into).
      const ref = direction === "bullish" ? z.priceLow : z.priceHigh;
      const beyondEntry = direction === "bullish" ? ref > entry : ref < entry;
      return beyondEntry && Math.abs(ref - tp1) <= window;
    });
    const opposing = higherTfZones.some((z) => {
      // A higher-TF zone *between* entry and TP1 in the wrong direction
      // would block the move. Detect by checking if a zone sits with its
      // mid between entry and TP1 on the opposite side of the trade.
      const mid = (z.priceLow + z.priceHigh) / 2;
      if (direction === "bullish") return mid > entry && mid < tp1 && z.direction === "bearish";
      return mid < entry && mid > tp1 && z.direction === "bullish";
    });
    if (aligned && !opposing) multiTfAgreement = 20;
    else if (opposing) multiTfAgreement = 0;
    else multiTfAgreement = 10;
  }

  // Recency: 15 within 30min, decays to 0 over next 90min.
  const minutesOld = ageMs / (60 * 1000);
  const recency = minutesOld <= 30
    ? 15
    : Math.max(0, Math.round(15 * (1 - (minutesOld - 30) / 90)));

  const confidenceScore = Math.min(100, Math.max(0,
    zoneStrength + tfQuality + rrScore + multiTfAgreement + recency,
  ));
  const qualityGrade = gradeFromScore(confidenceScore);

  const dirLabel = direction === "bullish" ? "Bullish" : "Bearish";
  const explanation =
    `${dirLabel} S&R zone break on ${zone.timeframe}. ` +
    `${zone.zoneType.replace(/_/g, " ")} zone at ${zone.priceLow.toFixed(5)}–${zone.priceHigh.toFixed(5)} ` +
    `was violated (price closed ${brokenSide}). ` +
    `Enter on retest of zone midpoint ${entry.toFixed(5)}. ` +
    `Stop ${stopLoss.toFixed(5)} (zone far side + ${atr14 != null ? "0.3×ATR" : "fallback buffer"}). ` +
    `TP1 ${tp1.toFixed(5)} ${tp1Source === "liquidity_zone" ? "(opposing zone)" : "(2R fallback)"}, ` +
    `TP2 ${tp2.toFixed(5)}. RR ${rr.toFixed(2)}.`;
  const invalidation =
    `Price closes back through ${stopLoss.toFixed(5)} into the zone. ` +
    `Failed retest → setup invalidated.`;

  return {
    setupType: "sr_zone_break",
    symbol: zone.symbol,
    timeframe: zone.timeframe,
    direction,
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    takeProfit3: null,
    riskReward: rr,
    confidenceScore,
    qualityGrade,
    validHours: validHoursForTf(zone.timeframe),
    explanation,
    invalidation,
    metadata: {
      zoneId: zone.id,
      zoneType: zone.zoneType,
      zoneDirection: zone.direction,
      brokenSide,
      scoreBreakdown: {
        zoneStrength,
        timeframeQuality: tfQuality,
        rr: rrScore,
        multiTfAgreement,
        recency,
      },
      targetSource: tp1Source,
    },
  };
}
