// src/lib/brain/structure-setup-generator.ts
//
// Pure function that turns a single StructureEvent into a TradeSetup
// spec. No I/O, no DB. All context (ATR, regime, higher-TF bias,
// liquidity zones, current price) is passed in. Mirrors
// src/lib/flow/setup-generator.ts so the surrounding wiring is
// familiar.

// Minimal inline shapes — decoupled from Prisma so the generator stays
// pure and unit-test friendly. Callers (the runner) pass plain objects
// matching these shapes; Prisma's generated types are assignable to them.

export interface StructureEventInput {
  id: string;
  symbol: string;
  timeframe: string;
  eventType: "bos_bullish" | "bos_bearish" | "choch_bullish" | "choch_bearish";
  priceLevel: number;
  brokerCandleTime: Date;
  priorBias: string;
  newBias: string;
}

export interface StructureStateInput {
  bias: string;
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
  candlesAnalyzed: number;
}

export interface RegimeInput {
  state: string;
}

export interface LiquidityZoneInput {
  priceHigh: number;
  priceLow: number;
}

export interface StructureSetupSpec {
  setupType: "market_structure_bos" | "market_structure_choch";
  symbol: string;
  timeframe: string;
  direction: "bullish" | "bearish";
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  takeProfit3: null;
  riskReward: number;
  confidenceScore: number;          // 0–100
  qualityGrade: "A+" | "A" | "B" | "C";
  validHours: number;
  explanation: string;
  invalidation: string;
  metadata: {
    eventId: string;
    eventType: StructureEventInput["eventType"];
    priorBias: string;
    newBias: string;
    scoreBreakdown: {
      eventQuality: number;
      structureQuality: number;
      rr: number;
      multiTfAgreement: number;
      recency: number;
    };
    targetSource: "liquidity_zone" | "rr_fallback";
  };
}

export interface GeneratorContext {
  event: StructureEventInput;
  state: StructureStateInput;
  higherTfState: StructureStateInput | null;   // 1h for a 15m event, 4h for a 1h event, null for 4h
  regime: RegimeInput | null;
  liquidityZones: LiquidityZoneInput[];        // active zones for this symbol/timeframe
  atr14: number | null;                        // 14-period ATR on the event's timeframe
  currentPrice: number;
}

// 5-pip in price (forex) / 0.5pt (indices, metals). Used as fallback
// when ATR is missing. Mirrors the buffer convention in
// src/lib/flow/setup-generator.ts.
function fallbackBuffer(symbol: string): number {
  if (/JPY$/.test(symbol)) return 0.05;
  if (/^XAU/.test(symbol)) return 0.5;
  if (/^(US30|NAS100|SPX500|GER40)$/.test(symbol)) return 0.5;
  return 0.0005;
}

function gradeFromScore(score: number): StructureSetupSpec["qualityGrade"] {
  if (score >= 80) return "A+";
  if (score >= 65) return "A";
  if (score >= 50) return "B";
  return "C";
}

export function generateStructureSetup(ctx: GeneratorContext): StructureSetupSpec | null {
  const { event, state, higherTfState, regime, liquidityZones, atr14, currentPrice } = ctx;

  // Skip stale events. Prevents back-filling on a fresh deploy or after
  // a scanner outage.
  const eventAgeMs = Date.now() - event.brokerCandleTime.getTime();
  if (eventAgeMs > 2 * 60 * 60 * 1000) return null;

  const isBullishEvent = event.eventType === "bos_bullish" || event.eventType === "choch_bullish";
  const direction: "bullish" | "bearish" = isBullishEvent ? "bullish" : "bearish";
  const setupType: StructureSetupSpec["setupType"] =
    event.eventType.startsWith("bos_") ? "market_structure_bos" : "market_structure_choch";

  // 15m alignment guard: 15m setups must agree with 1h bias.
  if (event.timeframe === "15min" && higherTfState && higherTfState.bias !== direction) {
    return null;
  }

  // Opposite-side swing for SL placement.
  const oppositeSwing = direction === "bullish" ? state.lastSwingLow : state.lastSwingHigh;
  if (oppositeSwing == null) return null;

  const buffer = atr14 != null ? atr14 * 0.3 : fallbackBuffer(event.symbol);
  const entry = event.priceLevel;
  const stopLoss = direction === "bullish" ? oppositeSwing - buffer : oppositeSwing + buffer;
  const risk = Math.abs(entry - stopLoss);
  if (!(risk > 0)) return null;

  // "Already moved past" filter — if price has already left the entry
  // zone by more than 0.2 * ATR, there's no retest edge.
  const distanceToEntry = Math.abs(currentPrice - entry);
  const movedPast = atr14 != null && distanceToEntry > atr14 * 0.2 &&
    (direction === "bullish" ? currentPrice > entry : currentPrice < entry);
  if (movedPast) return null;

  // TP1: nearest liquidity zone in the trade direction beyond entry.
  // Fallback: entry +/- 2R.
  const tp1Target = pickLiquidityTarget(liquidityZones, entry, direction, risk * 1.5);
  const tp1 = tp1Target.price ?? (direction === "bullish" ? entry + risk * 2 : entry - risk * 2);
  const tp1Source: "liquidity_zone" | "rr_fallback" = tp1Target.price != null ? "liquidity_zone" : "rr_fallback";

  const rr = Math.abs(tp1 - entry) / risk;
  if (rr < 1.5) return null;

  // TP2: second liquidity zone beyond TP1, or 3R fallback. Guard against
  // the same zone being picked again (e.g. two zones sharing the same
  // priceHigh) — TP2 must be strictly beyond TP1 in the trade direction.
  const tp2Target = pickLiquidityTarget(liquidityZones, tp1, direction, risk * 0.5);
  const tp2Raw = tp2Target.price ?? (direction === "bullish" ? entry + risk * 3 : entry - risk * 3);
  const tp2Valid = direction === "bullish" ? tp2Raw > tp1 : tp2Raw < tp1;
  const tp2 = tp2Valid ? tp2Raw : (direction === "bullish" ? entry + risk * 3 : entry - risk * 3);

  // ── Scoring ───────────────────────────────────────────────────────
  let eventQuality: number;
  if (setupType === "market_structure_bos") {
    eventQuality = event.priorBias === event.newBias ? 25 : 18;
  } else {
    // CHoCH = trend reversal. Penalize against a confirmed trending
    // regime (counter-trend reversal during strong trend = highest-risk
    // case). The runner maps RegimeSnapshot.structureRegime → state, so
    // valid values here are trending/ranging/compression/expansion/
    // transitioning. A null regime is treated conservatively (10).
    eventQuality = regime && regime.state !== "trending" ? 20 : 10;
  }

  const recentSwings = state.candlesAnalyzed > 0 ? Math.min(5, state.candlesAnalyzed / 40) : 0;
  const structureQuality = Math.min(20, Math.round(recentSwings * 4));

  const rrScore = Math.min(20, Math.round(rr * 8));

  let multiTfAgreement = 10; // neutral default (also used when there is no higher TF in scope, e.g. 4h events)
  if (higherTfState) {
    if (higherTfState.bias === direction) multiTfAgreement = 20;
    else if (higherTfState.bias === "range") multiTfAgreement = 10;
    else multiTfAgreement = 0;
  }

  // Recency: 15 if break within last 30 min, decays linearly to 0 over 2h.
  const minutesOld = eventAgeMs / (60 * 1000);
  const recency = minutesOld <= 30 ? 15 : Math.max(0, Math.round(15 * (1 - (minutesOld - 30) / 90)));

  const confidenceScore = Math.min(100, Math.max(0, eventQuality + structureQuality + rrScore + multiTfAgreement + recency));
  const qualityGrade = gradeFromScore(confidenceScore);

  const explanation =
    `${setupType === "market_structure_bos" ? "BOS continuation" : "CHoCH reversal"} on ${event.timeframe}. ` +
    `Break of ${event.eventType.includes("bullish") ? "swing high" : "swing low"} at ${entry.toFixed(5)} confirms ${direction} direction. ` +
    `Enter on retest of ${entry.toFixed(5)}. ` +
    `Stop beyond opposing swing at ${stopLoss.toFixed(5)} (${atr14 != null ? "0.3×ATR buffer" : "fallback buffer"}). ` +
    `TP1 ${tp1.toFixed(5)} ${tp1Source === "liquidity_zone" ? "(nearest liquidity)" : "(2R fallback)"}, TP2 ${tp2.toFixed(5)}. ` +
    `RR ${rr.toFixed(2)}.`;

  const invalidation =
    `Price closes through ${stopLoss.toFixed(5)}. If structure flips back before retest, setup is invalidated.`;

  return {
    setupType,
    symbol: event.symbol,
    timeframe: event.timeframe,
    direction,
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    takeProfit3: null,
    riskReward: rr,
    confidenceScore,
    qualityGrade,
    validHours: event.timeframe === "15min" ? 2 : 6,
    explanation,
    invalidation,
    metadata: {
      eventId: event.id,
      eventType: event.eventType,
      priorBias: event.priorBias,
      newBias: event.newBias,
      scoreBreakdown: { eventQuality, structureQuality, rr: rrScore, multiTfAgreement, recency },
      targetSource: tp1Source,
    },
  };
}

function pickLiquidityTarget(
  zones: LiquidityZoneInput[],
  from: number,
  direction: "bullish" | "bearish",
  minDistance: number,
): { price: number | null } {
  const candidates = zones
    .map((z) => (direction === "bullish" ? z.priceHigh : z.priceLow))
    .filter((p) => (direction === "bullish" ? p > from + minDistance : p < from - minDistance))
    .sort((a, b) => (direction === "bullish" ? a - b : b - a));
  return { price: candidates[0] ?? null };
}
