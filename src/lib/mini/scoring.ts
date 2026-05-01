// Mini Scoring Engine — Mini blueprint § 6.
//
// 8-component, 100-point formula. Different from the Strategy Bible's
// 5-factor EPS — Mini scores for SPEED, TIMING, PRECISION, TRADABILITY
// (intraday execution quality), where the Bible scores for institutional
// confluence (mostly multi-tf alignment).
//
//   Bias Alignment       15
//   Liquidity Event      15
//   Micro Structure      15
//   Entry Zone Quality   15
//   Momentum             15
//   Volatility / Spread  10
//   Risk-to-Reward       10
//   Session Timing        5
//   ─────────────────── 100
//
// Tier thresholds:  A+ ≥ 88, A 78-87, watchlist <78. No-trade if any
// guardrail tripped.

export interface MiniScoreInputs {
  biasAlignment: number;       // 0-15
  liquidityEvent: number;       // 0-15
  microStructure: number;       // 0-15
  entryZoneQuality: number;     // 0-15
  momentumDisplacement: number; // 0-15
  volatilitySpread: number;     // 0-10
  riskReward: number;           // 0-10
  sessionTiming: number;        // 0-5
}

export interface MiniScoreResult {
  total: number;
  grade: "A+" | "A" | "watchlist" | "no_trade";
  components: MiniScoreInputs;
}

export const MINI_TIER_A_PLUS = 88;
export const MINI_TIER_A      = 78;

export function computeMiniScore(inputs: MiniScoreInputs, hasGuardrailFail = false): MiniScoreResult {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));
  const components: MiniScoreInputs = {
    biasAlignment:        clamp(inputs.biasAlignment, 15),
    liquidityEvent:       clamp(inputs.liquidityEvent, 15),
    microStructure:       clamp(inputs.microStructure, 15),
    entryZoneQuality:     clamp(inputs.entryZoneQuality, 15),
    momentumDisplacement: clamp(inputs.momentumDisplacement, 15),
    volatilitySpread:     clamp(inputs.volatilitySpread, 10),
    riskReward:           clamp(inputs.riskReward, 10),
    sessionTiming:        clamp(inputs.sessionTiming, 5),
  };
  const total =
    components.biasAlignment + components.liquidityEvent +
    components.microStructure + components.entryZoneQuality +
    components.momentumDisplacement + components.volatilitySpread +
    components.riskReward + components.sessionTiming;

  let grade: MiniScoreResult["grade"];
  if (hasGuardrailFail)            grade = "no_trade";
  else if (total >= MINI_TIER_A_PLUS) grade = "A+";
  else if (total >= MINI_TIER_A)   grade = "A";
  else                              grade = "watchlist";

  return { total, grade, components };
}

// Helper used by templates: convert RR (TP1 distance / risk) to the
// 0-10 RR score. Linear: <1.2 = 0, 2.0 = 7, 3.0+ = 10.
export function scoreRR(rr: number): number {
  if (rr < 1.2) return 0;
  if (rr >= 3) return 10;
  // linear from (1.2, 0) to (3.0, 10)
  return Math.round((rr - 1.2) * (10 / (3.0 - 1.2)));
}

// Helper: bar-range as a spread proxy. Smaller range vs ATR = tighter
// spread approximation. Returns 0-10.
export function scoreVolatility(barRange: number, atr: number, rrTp1: number, riskDistance: number): number {
  if (atr <= 0 || riskDistance <= 0) return 0;
  // Acceptable range: 0.5 × ATR to 2 × ATR. Outside this, signal is
  // either a non-event (range too small) or a chaotic spike (too large).
  const ratio = barRange / atr;
  let rangeScore = 0;
  if (ratio >= 0.5 && ratio <= 1.5) rangeScore = 6;
  else if (ratio >= 0.3 && ratio <= 2.0) rangeScore = 3;
  // RR tightness — tighter risk = more spread tolerance.
  const tpDistance = riskDistance * rrTp1;
  const tightnessScore = tpDistance > barRange * 2 ? 4 : tpDistance > barRange ? 2 : 0;
  return Math.min(10, rangeScore + tightnessScore);
}

// Per-template gate result for the metadata payload — same shape across
// every template so the analysis modal renders consistently.
export interface MiniGate {
  id: string;
  label: string;
  passed: boolean;
  evidence: string;
  // Some gates are HARD (failing aborts the signal); others are SOFT
  // (failing just lowers the relevant component score).
  hard?: boolean;
}

// Guards against inverted setups — a signal where direction says
// "long" but SL is above entry / TP1 below, or the mirror case for
// short. These are always bugs in the template logic; this helper
// catches them BEFORE the signal goes to the persistence layer so we
// never write an inverted row.
//
// Returns true if the directional geometry is correct.
export function isDirectionallyConsistent(
  direction: "bullish" | "bearish",
  entry: number,
  stopLoss: number,
  takeProfit1: number,
): boolean {
  if (direction === "bullish") {
    return stopLoss < entry && takeProfit1 > entry;
  }
  return stopLoss > entry && takeProfit1 < entry;
}
