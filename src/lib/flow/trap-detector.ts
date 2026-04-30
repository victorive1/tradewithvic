// Trap Detection Engine — blueprint § 7.6.
//
// A "trap" is a move that LOOKS like a breakout but is actually price
// engineering retail entries on the wrong side — institutions then
// fade those entries to drive price the other way.
//
// Bull trap signature:
//   • price wicks above a key level / equal highs
//   • candle closes back inside or below the level
//   • institutional flow shows SELL pressure simultaneously
//   • (Phase 2) retail crowding shows long-heavy
//
// Bear trap = mirror.
//
// Phase 1 uses brain-only signals. Phase 2 layers on retail sentiment
// once the Myfxbook scrape is wired.

import type { FlowContext, TrapResult, InstitutionalFlowResult, RetailFlowResult } from "@/lib/flow/types";

interface TrapDetectorInputs {
  ctx: FlowContext;
  inst: InstitutionalFlowResult;
  retail: RetailFlowResult;
}

export function detectTrap({ ctx, inst, retail }: TrapDetectorInputs): TrapResult {
  const reasons: string[] = [];

  // ── Find a recent sweep candidate (last 90 min) ──────────────────────
  const sweep = ctx.recentSweeps[0];
  const sweepRecent = sweep && (Date.now() - new Date(sweep.detectedAt).getTime()) < 90 * 60 * 1000;
  if (!sweepRecent || !sweep) {
    return { trapScore: 0, trapType: "neutral", reasons: ["no recent sweep within 90 minutes"] };
  }

  // Bullish sweep = price wicked BELOW SSL then closed back inside ⇒
  // potential BEAR trap (retail shorted the breakdown, will be squeezed).
  // Bearish sweep = price wicked ABOVE BSL then closed back inside ⇒
  // potential BULL trap (retail bought the breakout, will get faded).
  const sweptDir = sweep.sweepDirection;
  let trapType: "bull_trap" | "bear_trap" | "neutral" = "neutral";
  if (sweptDir === "bearish_sweep") trapType = "bull_trap";
  else if (sweptDir === "bullish_sweep") trapType = "bear_trap";
  if (trapType === "neutral") {
    return { trapScore: 0, trapType: "neutral", reasons: ["sweep direction unknown"] };
  }

  // Base score from sweep reversal strength.
  const reversalStrength = sweep.reversalStrength ?? 0;
  let score = Math.round(reversalStrength * 50);
  reasons.push(`${sweptDir} of ${sweep.levelType} with ${(reversalStrength * 100).toFixed(0)}% reversal strength`);

  // ── Institutional counter-flow ───────────────────────────────────────
  // Bull trap is reinforced by INSTITUTIONAL SELL pressure being high.
  // Bear trap is reinforced by INSTITUTIONAL BUY pressure being high.
  const counterFlowScore = trapType === "bull_trap" ? inst.sellScore : inst.buyScore;
  if (counterFlowScore >= 60) {
    score += Math.min(30, Math.round((counterFlowScore - 60) * 0.7) + 15);
    reasons.push(`institutional ${trapType === "bull_trap" ? "sell" : "buy"} pressure ${counterFlowScore}/100 confirms counter-flow`);
  } else if (counterFlowScore >= 40) {
    score += 10;
    reasons.push(`institutional counter-flow developing (${counterFlowScore}/100)`);
  }

  // ── Retail overcrowding (Phase 2 — when retail data available) ──────
  // Bull trap is reinforced by RETAIL LONG-CROWDING (they bought the breakout).
  // Bear trap is reinforced by RETAIL SHORT-CROWDING.
  if (retail.crowding !== "unavailable") {
    if (trapType === "bull_trap" && retail.crowding === "long_heavy") {
      score += 20;
      reasons.push(`retail crowded long (${retail.longPct?.toFixed(0)}%) — fuel for the trap`);
    } else if (trapType === "bear_trap" && retail.crowding === "short_heavy") {
      score += 20;
      reasons.push(`retail crowded short (${retail.shortPct?.toFixed(0)}%) — fuel for the trap`);
    }
  }

  // ── Volume confirmation ─────────────────────────────────────────────
  if (inst.volumeZScore != null && inst.volumeZScore > 1.2) {
    score += 8;
    reasons.push(`elevated 1h volume (z=${inst.volumeZScore.toFixed(2)}) on the sweep — institutional engagement`);
  }

  // ── Cascade-tier gate: full A+ trap requires retail-crowded
  // counter-direction AND institutional counter-flow ≥ 70 AND volume
  // confirmation. When all three align, trap score floors at 80
  // ("high-confidence trap") per blueprint scoring legend.
  const fullCascade =
    counterFlowScore >= 70 &&
    inst.volumeZScore != null && inst.volumeZScore > 1.2 &&
    ((trapType === "bull_trap"  && retail.crowding === "long_heavy") ||
     (trapType === "bear_trap" && retail.crowding === "short_heavy"));
  if (fullCascade) {
    score = Math.max(score, 80);
    reasons.push("FULL CASCADE — retail crowded + institutional counter-flow ≥70 + volume confirmation");
  }

  // ── Funding rate amplifier (crypto) ─────────────────────────────────
  // Heavy positive funding (longs paying) on a bullish sweep = crowded
  // longs about to be flushed = strong bear-trap evidence. (Note: the
  // institutional module already adjusted its scores; this reasons line
  // makes the connection explicit in the trap UI.)
  if (inst.oiChange != null && Math.abs(inst.oiChange) > 0.5) {
    reasons.push(`crypto OI change ${inst.oiChange.toFixed(2)}%/h reinforces ${trapType.replace(/_/g, " ")} narrative`);
  }

  score = Math.max(0, Math.min(100, score));
  return { trapScore: score, trapType, reasons };
}
