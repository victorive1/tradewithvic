/**
 * Institutional Intent Scoring (blueprint §4).
 * Pure function. Takes per-layer evidence, returns the 0-100 composite,
 * component sub-scores (capped at their weight), a confidence grade, and
 * a human-readable list of drivers that explain why the score came out
 * this way. Scoring stays explainable so every alert can say WHY it fired.
 */

export interface ScoringInput {
  // L1 Flow Capture — microstructure evidence
  aggressorRatio: number | null;      // -1..1, sign = side, magnitude = pressure
  sweepCount: number | null;          // count of stop sweeps / liquidity grabs
  absorption: number | null;          // 0-100, passive defense strength
  refill: number | null;              // 0-100, recurring bids/offers at a level
  vwapDistance: number | null;        // % from session VWAP (absolute)
  rawNotional: number | null;         // optional — relative size vs recent median

  // L2 Derivatives
  optionsFlow: {
    relativeSize: number | null;
    ivShift: number | null;
    openInterestDelta: number | null;
    gamma: string | null;             // long_gamma | short_gamma | neutral
  } | null;

  // L3 Cross-Asset Confirmation
  crossAssetAgreement: number | null; // -1..1, share of correlated assets agreeing

  // L4 Venue Intelligence — set to null until broker/exchange feeds connected
  venueScore: number | null;

  // L5 Positioning (COT / 13F / ETF flow)
  positioningAlignment: number | null; // -1..1

  // L6 Catalyst
  catalyst: {
    surpriseScore: number | null;
    severity: "low" | "medium" | "high" | null;
    sentiment: "bullish" | "bearish" | "neutral" | null;
    inWindow: boolean;
  } | null;

  // L7 Regime & Persistence
  regime: {
    trendStrength: number | null;      // 0-100
    volatilityZscore: number | null;
    liquidityOk: boolean;
  } | null;

  // Direction the engine believes flow is pointing
  direction: "long" | "short" | "neutral";
}

export interface ScoreBreakdown {
  flowQuality: number;
  derivatives: number;
  crossAsset: number;
  venue: number;
  catalyst: number;
  persistence: number;
  positioning: number;
  regime: number;
  total: number;
  grade: "A+" | "A" | "B" | "watch";
  drivers: string[];
  persistenceProb: number;
}

const WEIGHTS = {
  flow: 20, derivatives: 15, crossAsset: 15, venue: 10,
  catalyst: 10, persistence: 15, positioning: 10, regime: 5,
} as const;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function scoreFlowQuality(i: ScoringInput, drivers: string[]): number {
  let s = 0;
  if (i.aggressorRatio != null) {
    const mag = Math.abs(i.aggressorRatio);
    s += mag * 8;
    if (mag > 0.6) drivers.push(`Sustained aggression ${(mag * 100).toFixed(0)}% on ${i.aggressorRatio > 0 ? "bid" : "offer"} side`);
  }
  if (i.sweepCount != null && i.sweepCount > 0) {
    s += Math.min(4, i.sweepCount * 1.2);
    if (i.sweepCount >= 2) drivers.push(`${i.sweepCount} liquidity sweeps in window`);
  }
  if (i.absorption != null && i.absorption >= 60) {
    s += 4;
    drivers.push(`Absorption signature ${Math.round(i.absorption)} — passive defense`);
  }
  if (i.refill != null && i.refill >= 60) {
    s += 3;
    drivers.push(`Repeated refills detected (${Math.round(i.refill)})`);
  }
  if (i.rawNotional != null && i.rawNotional > 1.5) {
    s += Math.min(3, (i.rawNotional - 1) * 2);
    drivers.push(`Notional ${i.rawNotional.toFixed(1)}× recent median`);
  }
  return clamp(s, 0, WEIGHTS.flow);
}

function scoreDerivatives(i: ScoringInput, drivers: string[]): number {
  if (!i.optionsFlow) return 0;
  let s = 0;
  const { relativeSize, ivShift, openInterestDelta, gamma } = i.optionsFlow;
  if (relativeSize != null && relativeSize > 2) {
    s += Math.min(6, (relativeSize - 1) * 2);
    drivers.push(`Options flow ${relativeSize.toFixed(1)}× normal size`);
  }
  if (ivShift != null && Math.abs(ivShift) > 3) {
    s += Math.min(4, Math.abs(ivShift) * 0.4);
    drivers.push(`IV ${ivShift > 0 ? "expanded" : "compressed"} ${Math.abs(ivShift).toFixed(1)}%`);
  }
  if (openInterestDelta != null && openInterestDelta > 0.15) {
    s += 3;
    drivers.push(`Open interest expanding +${(openInterestDelta * 100).toFixed(0)}%`);
  }
  if (gamma === "long_gamma") { s += 2; drivers.push("Long-gamma regime (dampens moves)"); }
  if (gamma === "short_gamma") { s += 2; drivers.push("Short-gamma regime (amplifies moves)"); }
  return clamp(s, 0, WEIGHTS.derivatives);
}

function scoreCrossAsset(i: ScoringInput, drivers: string[]): number {
  if (i.crossAssetAgreement == null) return 0;
  const sameSide = i.direction === "long" ? i.crossAssetAgreement : -i.crossAssetAgreement;
  const s = Math.max(0, sameSide) * WEIGHTS.crossAsset;
  if (sameSide >= 0.6) drivers.push(`Cross-asset agreement ${(sameSide * 100).toFixed(0)}% — correlated markets confirm`);
  else if (sameSide <= -0.4) drivers.push(`Cross-asset divergence ${(Math.abs(sameSide) * 100).toFixed(0)}% — correlated markets reject thesis`);
  return s;
}

function scoreVenue(i: ScoringInput, drivers: string[]): number {
  if (i.venueScore == null) return 0;
  if (i.venueScore >= 7) drivers.push("Venue mix consistent with institutional execution");
  return clamp(i.venueScore, 0, WEIGHTS.venue);
}

function scoreCatalyst(i: ScoringInput, drivers: string[]): number {
  if (!i.catalyst || !i.catalyst.inWindow) return 0;
  let s = 0;
  const severityWeight = i.catalyst.severity === "high" ? 6 : i.catalyst.severity === "medium" ? 3 : 1;
  s += severityWeight;
  if (i.catalyst.surpriseScore != null && Math.abs(i.catalyst.surpriseScore) > 1) {
    s += Math.min(3, Math.abs(i.catalyst.surpriseScore));
    drivers.push(`Catalyst surprise ${i.catalyst.surpriseScore > 0 ? "+" : ""}${i.catalyst.surpriseScore.toFixed(1)}σ`);
  }
  const directional =
    (i.direction === "long" && i.catalyst.sentiment === "bullish") ||
    (i.direction === "short" && i.catalyst.sentiment === "bearish");
  if (directional) { s += 2; drivers.push("Catalyst sentiment aligned with flow direction"); }
  else if (i.catalyst.sentiment && i.catalyst.sentiment !== "neutral") drivers.push("Catalyst sentiment conflicts with flow direction");
  return clamp(s, 0, WEIGHTS.catalyst);
}

function scorePersistence(i: ScoringInput, drivers: string[]): number {
  // Proxy: combine regime trend strength with vol regime.
  const trend = i.regime?.trendStrength ?? 0;
  const volZ = Math.abs(i.regime?.volatilityZscore ?? 0);
  let s = (trend / 100) * 10; // strong trend → higher persistence
  if (volZ > 2) s -= 3;       // regime stress reduces persistence
  s = clamp(s, 0, WEIGHTS.persistence);
  if (trend >= 70) drivers.push(`Trend strength ${Math.round(trend)} — persistence supported`);
  if (volZ > 2) drivers.push(`Vol z-score ${volZ.toFixed(1)} — regime stress lowers durability`);
  return s;
}

function scorePositioning(i: ScoringInput, drivers: string[]): number {
  if (i.positioningAlignment == null) return 0;
  const aligned = i.direction === "long" ? i.positioningAlignment : -i.positioningAlignment;
  if (aligned >= 0.5) drivers.push("Structural positioning (COT / 13F / ETF) agrees");
  return clamp(aligned * WEIGHTS.positioning, 0, WEIGHTS.positioning);
}

function scoreRegime(i: ScoringInput, drivers: string[]): number {
  if (!i.regime) return 0;
  let s = 0;
  if (i.regime.liquidityOk) s += 3;
  if ((i.regime.trendStrength ?? 0) >= 50) s += 2;
  if (!i.regime.liquidityOk) drivers.push("Thin liquidity window — regime fit weak");
  return clamp(s, 0, WEIGHTS.regime);
}

export function computeIntentScore(input: ScoringInput): ScoreBreakdown {
  const drivers: string[] = [];
  const flowQuality = scoreFlowQuality(input, drivers);
  const derivatives = scoreDerivatives(input, drivers);
  const crossAsset = scoreCrossAsset(input, drivers);
  const venue = scoreVenue(input, drivers);
  const catalyst = scoreCatalyst(input, drivers);
  const persistence = scorePersistence(input, drivers);
  const positioning = scorePositioning(input, drivers);
  const regime = scoreRegime(input, drivers);

  const total = flowQuality + derivatives + crossAsset + venue + catalyst + persistence + positioning + regime;

  const grade: ScoreBreakdown["grade"] =
    total >= 90 ? "A+" :
    total >= 80 ? "A"  :
    total >= 70 ? "B"  : "watch";

  // Persistence probability — derived from the persistence sub-score and
  // trend+liquidity. Calibration target in Phase 5; rough linear mapping now.
  const persistenceProb = clamp(
    persistence / WEIGHTS.persistence * 0.7 +
    (input.regime?.liquidityOk ? 0.15 : 0) +
    (crossAsset / WEIGHTS.crossAsset) * 0.15,
    0, 1,
  );

  return {
    flowQuality,
    derivatives,
    crossAsset,
    venue,
    catalyst,
    persistence,
    positioning,
    regime,
    total: Math.round(total * 10) / 10,
    grade,
    drivers,
    persistenceProb: Math.round(persistenceProb * 100) / 100,
  };
}

export function classifySignal(params: {
  intentScore: number;
  flowQuality: number;
  persistenceProb: number;
  vwapDistance: number | null;
  direction: "long" | "short" | "neutral";
}): "entering" | "defending" | "rotating" | "distributing" | "scaling" {
  const { intentScore, flowQuality, persistenceProb, vwapDistance } = params;
  // High flow but price near VWAP = likely defense/accumulation
  if (flowQuality >= 14 && vwapDistance != null && Math.abs(vwapDistance) < 0.15) return "defending";
  // Strong score + high persistence + moving away from VWAP = scaling
  if (intentScore >= 80 && persistenceProb >= 0.65) return "scaling";
  // Moderate score but flipping direction signals = rotating
  if (intentScore >= 65 && intentScore < 80 && flowQuality < 14) return "rotating";
  // High flow, high persistence, long direction = entering
  if (intentScore >= 70 && persistenceProb >= 0.5) return "entering";
  return "distributing";
}
