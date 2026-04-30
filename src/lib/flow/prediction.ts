// Flow Prediction Engine — blueprint § 7.7.
//
// Synthesises the final headline output from every other module:
//   • Final bias       (bullish | bearish | neutral)
//   • Confidence       (0-100)
//   • Invalidation     (price level)
//   • Target liquidity (next opposing zone)
//   • Narrative        (plain-English explanation)
//   • Reasons          (structured contributors for the analysis modal)
//
// Bias logic — voting from the four panels:
//   1. Institutional flow direction (institutionalBuyScore vs sellScore)
//   2. Retail counter-trade (if retail is heavily long, lean bearish)
//   3. Trap signal (if bull_trap detected with high score, lean bearish)
//   4. Liquidity proximity (which side of liquidity is closer = direction
//      of the next sweep)
//
// Confidence is the alignment of those votes — stronger alignment =
// higher confidence. Hard cap from the strongest single contributor:
// no signal can push confidence over 95.

import type {
  FlowContext, FlowPrediction,
  RetailFlowResult, InstitutionalFlowResult,
  LiquidityMapResult, TrapResult,
} from "@/lib/flow/types";

interface PredictionInputs {
  ctx: FlowContext;
  retail: RetailFlowResult;
  inst: InstitutionalFlowResult;
  liquidity: LiquidityMapResult;
  trap: TrapResult;
}

export function predictFlow({ ctx, retail, inst, liquidity, trap }: PredictionInputs): FlowPrediction {
  const reasons: FlowPrediction["reasons"] = [];

  // ── Vote 1: institutional pressure direction ────────────────────────
  let bullVote = 0, bearVote = 0;
  const instDelta = inst.buyScore - inst.sellScore;
  if (instDelta > 15) {
    const w = Math.min(35, instDelta * 0.5);
    bullVote += w;
    reasons.push({ component: "institutional", weight: w, evidence: `inst buy pressure ${inst.buyScore} vs sell ${inst.sellScore}` });
  } else if (instDelta < -15) {
    const w = Math.min(35, -instDelta * 0.5);
    bearVote += w;
    reasons.push({ component: "institutional", weight: w, evidence: `inst sell pressure ${inst.sellScore} vs buy ${inst.buyScore}` });
  } else {
    reasons.push({ component: "institutional", weight: 0, evidence: `inst pressure balanced (${inst.buyScore} buy / ${inst.sellScore} sell)` });
  }

  // ── Vote 2: retail counter (when available) ─────────────────────────
  if (retail.crowding === "long_heavy") {
    bearVote += 15;
    reasons.push({ component: "retail_counter", weight: 15, evidence: `retail ${retail.longPct?.toFixed(0)}% long — counter-trade` });
  } else if (retail.crowding === "short_heavy") {
    bullVote += 15;
    reasons.push({ component: "retail_counter", weight: 15, evidence: `retail ${retail.shortPct?.toFixed(0)}% short — counter-trade` });
  } else if (retail.crowding === "unavailable") {
    reasons.push({ component: "retail_counter", weight: 0, evidence: "retail data unavailable (Phase 2 wires Myfxbook)" });
  }

  // ── Vote 3: trap signal ─────────────────────────────────────────────
  if (trap.trapScore >= 60) {
    if (trap.trapType === "bull_trap") {
      const w = Math.min(25, (trap.trapScore - 60) * 0.6 + 15);
      bearVote += w;
      reasons.push({ component: "trap", weight: w, evidence: `bull-trap risk ${trap.trapScore}/100 → bearish` });
    } else if (trap.trapType === "bear_trap") {
      const w = Math.min(25, (trap.trapScore - 60) * 0.6 + 15);
      bullVote += w;
      reasons.push({ component: "trap", weight: w, evidence: `bear-trap risk ${trap.trapScore}/100 → bullish` });
    }
  }

  // ── Vote 4: liquidity proximity ─────────────────────────────────────
  // Markets gravitate toward unfilled liquidity. If the nearest opposing
  // liquidity is meaningfully closer on one side, that's a directional bias.
  const close = ctx.candles5m[ctx.candles5m.length - 1]?.close ?? null;
  let liquidityTarget: number | null = null;
  if (close != null && (liquidity.nearestAbove != null || liquidity.nearestBelow != null)) {
    const distAbove = liquidity.nearestAbove != null ? Math.abs(liquidity.nearestAbove - close) : Infinity;
    const distBelow = liquidity.nearestBelow != null ? Math.abs(liquidity.nearestBelow - close) : Infinity;
    if (distAbove < distBelow * 0.6) {
      bullVote += 10;
      liquidityTarget = liquidity.nearestAbove;
      reasons.push({ component: "liquidity", weight: 10, evidence: `nearest liquidity ${liquidity.nearestAbove?.toFixed(5)} above is closer than ${liquidity.nearestBelow?.toFixed(5)} below` });
    } else if (distBelow < distAbove * 0.6) {
      bearVote += 10;
      liquidityTarget = liquidity.nearestBelow;
      reasons.push({ component: "liquidity", weight: 10, evidence: `nearest liquidity ${liquidity.nearestBelow?.toFixed(5)} below is closer than ${liquidity.nearestAbove?.toFixed(5)} above` });
    }
  }

  // ── Resolve bias + confidence ──────────────────────────────────────
  const totalVote = bullVote + bearVote;
  let finalBias: FlowPrediction["finalBias"];
  let confidence: number;
  if (totalVote < 15) {
    finalBias = "neutral";
    confidence = Math.round(totalVote * 1.5);
  } else if (bullVote > bearVote) {
    finalBias = "bullish";
    // Confidence = dominance of winning side, scaled.
    const dominance = bullVote / totalVote;     // 0.5 .. 1.0
    confidence = Math.round(40 + (dominance - 0.5) * 110); // 40..95
  } else {
    finalBias = "bearish";
    const dominance = bearVote / totalVote;
    confidence = Math.round(40 + (dominance - 0.5) * 110);
  }
  confidence = Math.max(0, Math.min(95, confidence));  // cap at 95 — never call it "certain"

  // ── Invalidation level ─────────────────────────────────────────────
  // Closest opposing-side liquidity is the narrative invalidation: if
  // price reaches it, the thesis loses its rationale.
  let invalidation: number | null = null;
  if (close != null) {
    if (finalBias === "bullish") invalidation = liquidity.nearestBelow;
    else if (finalBias === "bearish") invalidation = liquidity.nearestAbove;
  }
  // If the closest opposing-side level is also our liquidityTarget,
  // pull invalidation from the SECOND-closest. Simpler v1: leave as-is;
  // the UI can show both target and invalidation side by side.
  if (liquidityTarget != null && invalidation === liquidityTarget) {
    invalidation = null;
  }

  // ── Narrative (rule-built; LLM polish in Phase 4) ──────────────────
  const narrative = buildNarrative({ retail, inst, trap, finalBias, confidence, target: liquidityTarget, invalidation });

  // Hold time depends on confidence + bias strength — high confidence =
  // longer expected hold (intraday view holds longer when conviction
  // higher). Range 60-360 minutes.
  const expectedHoldMinutes = finalBias === "neutral" ? 60 : Math.round(60 + (confidence / 100) * 240);

  return {
    finalBias,
    confidence,
    invalidation,
    targetLiquidity: liquidityTarget,
    expectedHoldMinutes,
    narrative,
    reasons,
  };
}

function buildNarrative(args: {
  retail: RetailFlowResult;
  inst: InstitutionalFlowResult;
  trap: TrapResult;
  finalBias: "bullish" | "bearish" | "neutral";
  confidence: number;
  target: number | null;
  invalidation: number | null;
}): string {
  const { retail, inst, trap, finalBias, confidence, target, invalidation } = args;
  const parts: string[] = [];

  // Retail framing
  if (retail.crowding === "long_heavy") parts.push(`Retail is heavily long (${retail.longPct?.toFixed(0)}%).`);
  else if (retail.crowding === "short_heavy") parts.push(`Retail is heavily short (${retail.shortPct?.toFixed(0)}%).`);
  else if (retail.crowding === "balanced") parts.push("Retail positioning is balanced.");

  // Institutional framing — explicit "estimated" / "likely" wording
  if (inst.buyScore >= 60 && inst.sellScore < 40) {
    parts.push(`Institutional buy pressure is likely rising (~${inst.buyScore}/100).`);
  } else if (inst.sellScore >= 60 && inst.buyScore < 40) {
    parts.push(`Institutional sell pressure is likely rising (~${inst.sellScore}/100).`);
  } else if (Math.abs(inst.buyScore - inst.sellScore) < 15) {
    parts.push(`Institutional flow is approximately balanced (~${inst.buyScore}/${inst.sellScore}).`);
  }

  // Trap framing
  if (trap.trapScore >= 65 && trap.trapType !== "neutral") {
    parts.push(`${trap.trapType === "bull_trap" ? "Bull-trap" : "Bear-trap"} risk is high (${trap.trapScore}/100).`);
  }

  // Direction
  if (finalBias !== "neutral") {
    parts.push(`Expected move: ${finalBias === "bullish" ? "upside" : "downside"} liquidity sweep.`);
  } else {
    parts.push("No clear directional read — wait for confirmation.");
  }

  parts.push(`Confidence: ${confidence}/100.`);

  if (target != null) parts.push(`Target liquidity: ~${target.toFixed(5)}.`);
  if (invalidation != null) parts.push(`Invalidation: above/below ~${invalidation.toFixed(5)}.`);

  return parts.join(" ");
}
