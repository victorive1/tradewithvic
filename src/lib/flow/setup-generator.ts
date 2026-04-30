// Flow Setup Generator — turns Path Predictions into actionable
// TradeSetup rows tagged setupType="flow_vision_path". Persisted to
// the existing TradeSetup table so:
//   • the new "Trade Setups" sub-tab on Retail vs Institution can read them
//   • the Strategy Bible automatically picks them up
//   • the existing ExecuteTradeButton wiring works without changes
//
// Trade construction logic per blueprint § 8 + § 9:
//
//   Trap setup (e.g. bull_trap):
//     direction = bearish  (the REAL move, not the trap)
//     entry     = Phase 1 toPrice (where trap completes — we wait for the sweep)
//     stopLoss  = beyond Phase 1 toPrice + buffer (above the trap extreme)
//     TP1       = Phase 2 toPrice (real-move target, lower liquidity)
//     TP2       = Phase 3 toPrice if present (extension)
//
//   Continuation setup (no trap):
//     direction = phase 1 direction
//     entry     = current price (we go now)
//     stopLoss  = swing-based (opposite-side liquidity at one zone strength)
//     TP1       = Phase 1 toPrice
//     TP2       = Phase 2 toPrice if present

import type { PathPrediction } from "@/lib/flow/path-prediction";
import { pipsToPrice } from "@/lib/brain/strategies/eps-scoring";

export interface FlowSetupSpec {
  setupKind: "post_trap_reversal" | "liquidity_continuation";
  direction: "bullish" | "bearish";
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  takeProfit3: number | null;
  riskReward: number;
  // Path narrative for the user — explains entry/SL/TP via the path phases.
  explanation: string;
  invalidation: string;
  validHours: number;
  // 0-100 score for the setup. Inherits path confidence and adjusts for
  // RR + path length viability.
  confidenceScore: number;
  qualityGrade: "A+" | "A" | "B" | "C";
  metadata: Record<string, unknown>;
}

export function generateFlowSetup(
  symbol: string,
  path: PathPrediction,
): FlowSetupSpec | null {
  if (path.phases.length === 0) return null;
  const buffer = pipsToPrice(5, symbol);  // 5-pip buffer past the trap extreme

  if (path.isTrapScenario && path.phases.length >= 2) {
    // POST-TRAP REVERSAL setup.
    const phase1 = path.phases[0]; // the trap leg
    const phase2 = path.phases[1]; // the real move
    const phase3 = path.phases[2] ?? null;
    const direction = path.finalDirection;
    const entry = phase1.toPrice;
    const stopLoss = direction === "bearish"
      ? entry + buffer * 2  // SL above the trap extreme by 10p
      : entry - buffer * 2;
    const tp1 = phase2.toPrice;
    const tp2 = phase3?.toPrice ?? null;
    const tp3 = null;
    const risk = Math.abs(entry - stopLoss);
    if (risk <= 0) return null;
    const rr = Math.abs(tp1 - entry) / risk;
    if (rr < 1.5) return null;

    const explanation =
      `Post-trap reversal. ` +
      `Phase 1: price expected to ${phase1.direction === "up" ? "rally up" : "fall down"} to ${phase1.toPrice.toFixed(5)} ` +
      `(${phase1.liquidityLabel}, ${phase1.pips.toFixed(1)}p) — this is the trap. ` +
      `Phase 2 entry: once price tags ${phase1.toPrice.toFixed(5)}, enter ${direction} expecting a reversal toward ${phase2.toPrice.toFixed(5)} ` +
      `(${phase2.liquidityLabel}, ${phase2.pips.toFixed(1)}p). ` +
      `${phase3 ? `Phase 3 extension target ${phase3.toPrice.toFixed(5)}.` : ""}`;
    const invalidation =
      `Price closes through ${stopLoss.toFixed(5)} (the trap extreme + buffer). ` +
      `If the trap fails to reverse and price keeps going through Phase 1's target, the path is invalidated.`;

    const confidenceScore = path.pathConfidence;
    const qualityGrade: FlowSetupSpec["qualityGrade"] =
      confidenceScore >= 80 ? "A+"
      : confidenceScore >= 70 ? "A"
      : confidenceScore >= 55 ? "B"
      : "C";

    return {
      setupKind: "post_trap_reversal",
      direction,
      entry,
      stopLoss,
      takeProfit1: tp1,
      takeProfit2: tp2,
      takeProfit3: tp3,
      riskReward: rr,
      explanation,
      invalidation,
      validHours: 6,
      confidenceScore,
      qualityGrade,
      metadata: {
        path,
        setupType: "flow_vision_path",
        kind: "post_trap_reversal",
      },
    };
  }

  if (!path.isTrapScenario && path.phases.length >= 1) {
    // CONTINUATION setup — direct shot to liquidity.
    const phase1 = path.phases[0];
    const phase2 = path.phases[1] ?? null;
    const direction = path.finalDirection;
    const entry = phase1.fromPrice;  // current price
    // Stop placed at the FAR side of the OPPOSING-direction nearest liquidity,
    // or at currentPrice ± buffer*4 if there's nothing nearby.
    const stopLoss = direction === "bullish"
      ? (path.nearestBelow != null ? path.nearestBelow - buffer : entry - buffer * 4)
      : (path.nearestAbove != null ? path.nearestAbove + buffer : entry + buffer * 4);
    const tp1 = phase1.toPrice;
    const tp2 = phase2?.toPrice ?? null;
    const tp3 = null;
    const risk = Math.abs(entry - stopLoss);
    if (risk <= 0) return null;
    const rr = Math.abs(tp1 - entry) / risk;
    if (rr < 1.5) return null;

    const explanation =
      `Liquidity continuation. ` +
      `Direct ${direction} shot from ${entry.toFixed(5)} to ${tp1.toFixed(5)} ` +
      `(${phase1.liquidityLabel}, ${phase1.pips.toFixed(1)}p). ` +
      `${phase2 ? `Extension target at ${phase2.toPrice.toFixed(5)} if Phase 1 fills cleanly.` : ""} ` +
      `No trap signal detected; institutional + retail flow aligns with the move.`;
    const invalidation =
      `Price closes through ${stopLoss.toFixed(5)} (nearest opposing liquidity). ` +
      `Counter-trade signal would invalidate the continuation thesis.`;

    const confidenceScore = path.pathConfidence;
    const qualityGrade: FlowSetupSpec["qualityGrade"] =
      confidenceScore >= 75 ? "A+"
      : confidenceScore >= 65 ? "A"
      : confidenceScore >= 50 ? "B"
      : "C";

    return {
      setupKind: "liquidity_continuation",
      direction,
      entry,
      stopLoss,
      takeProfit1: tp1,
      takeProfit2: tp2,
      takeProfit3: tp3,
      riskReward: rr,
      explanation,
      invalidation,
      validHours: 4,
      confidenceScore,
      qualityGrade,
      metadata: {
        path,
        setupType: "flow_vision_path",
        kind: "liquidity_continuation",
      },
    };
  }

  return null;
}
