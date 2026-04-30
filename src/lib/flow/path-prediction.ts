// Path Prediction Engine — blueprint § 8 (key upgrade).
//
// Instead of a single direction, generates a SEQUENCE of moves:
// trap-then-real-move when conditions warrant, or a direct-to-liquidity
// shot when there's no trap signal.
//
// Inputs:
//   • current price (from latest 5m/15m close)
//   • all detected LiquidityZone rows for the symbol (above + below)
//   • retail crowding state
//   • institutional buy/sell scores
//   • trap result + score
//
// Outputs:
//   • An ordered list of 1-3 phases, each with from/to prices, classification,
//     direction, expected duration, confidence
//   • Path-level metadata: trap-or-not, total expected pips, pathConfidence
//
// Phase classifications:
//   "trap"          — first leg sweeps weaker-side liquidity, then reverses
//   "real_move"     — the actual directional move after a trap
//   "continuation"  — straight shot to liquidity (no trap)
//   "reversal"      — reaction at a liquidity level (Phase 3 if reaching for an extension)

import { pricePips } from "@/lib/brain/strategies/eps-scoring";

export interface LiquidityZone {
  zoneType: string;
  direction: "bullish" | "bearish" | null;
  priceLow: number;
  priceHigh: number;
  strengthScore: number;
}

export interface PathPredictionInputs {
  symbol: string;
  currentPrice: number;
  zones: LiquidityZone[];
  retailCrowding: "long_heavy" | "short_heavy" | "balanced" | "unavailable";
  institutionalBuyScore: number;
  institutionalSellScore: number;
  trapScore: number;
  trapType: "bull_trap" | "bear_trap" | "neutral";
}

export interface PathPhase {
  phase: 1 | 2 | 3;
  classification: "trap" | "real_move" | "continuation" | "reversal";
  direction: "up" | "down";
  fromPrice: number;
  toPrice: number;
  pips: number;
  liquidityLabel: string;
  reasoning: string;
}

export interface PathPrediction {
  currentPrice: number;
  phases: PathPhase[];
  // Highest-priority single target (for short-form display) — the LAST
  // phase's destination is the ultimate target.
  finalTarget: number;
  finalDirection: "bullish" | "bearish";
  isTrapScenario: boolean;
  trapType: "bull_trap" | "bear_trap" | "neutral";
  pathConfidence: number;  // 0-100
  // Distance engine output — used by the overlay UI.
  distanceAbovePips: number | null;
  distanceBelowPips: number | null;
  nearestAbove: number | null;
  nearestBelow: number | null;
  zonesAbove: number;
  zonesBelow: number;
}

export function predictPath(inputs: PathPredictionInputs): PathPrediction {
  const { symbol, currentPrice, zones, retailCrowding, institutionalBuyScore, institutionalSellScore, trapScore, trapType } = inputs;

  // ── Distance Engine ──────────────────────────────────────────────────
  // Group zones by side. For each zone use the midpoint as the reference.
  const zoneRefs = zones.map((z) => ({ ...z, ref: (z.priceLow + z.priceHigh) / 2 }));
  const above = zoneRefs.filter((z) => z.ref > currentPrice).sort((a, b) => a.ref - b.ref);
  const below = zoneRefs.filter((z) => z.ref < currentPrice).sort((a, b) => b.ref - a.ref);

  const nearestAbove = above[0]?.ref ?? null;
  const nearestBelow = below[0]?.ref ?? null;
  const distanceAbovePips = nearestAbove != null ? pricePips(nearestAbove - currentPrice, symbol) : null;
  const distanceBelowPips = nearestBelow != null ? pricePips(currentPrice - nearestBelow, symbol) : null;

  // ── Phase construction ───────────────────────────────────────────────
  const phases: PathPhase[] = [];
  let isTrap = false;
  let finalDir: "bullish" | "bearish" = "bullish";
  let confidence = 50;

  // Trap-scenario gate — blueprint § 9. Bull trap = price moves UP into
  // liquidity above (the trap), then reverses DOWN to liquidity below
  // (the real move). Bear trap = mirror.
  const trapMaterial = trapScore >= 60 && trapType !== "neutral";
  if (trapMaterial) {
    isTrap = true;
    if (trapType === "bull_trap" && nearestAbove != null && nearestBelow != null) {
      // Phase 1: up to liquidity above (the trap)
      phases.push({
        phase: 1,
        classification: "trap",
        direction: "up",
        fromPrice: currentPrice,
        toPrice: nearestAbove,
        pips: distanceAbovePips ?? 0,
        liquidityLabel: above[0]?.zoneType ?? "liquidity",
        reasoning: `Bull-trap setup: retail crowded long, institutional sell pressure ${institutionalSellScore}/100. Price likely to sweep upper liquidity first to trigger long stops, then reverse.`,
      });
      // Phase 2: real move down to liquidity below
      phases.push({
        phase: 2,
        classification: "real_move",
        direction: "down",
        fromPrice: nearestAbove,
        toPrice: nearestBelow,
        pips: pricePips(nearestAbove - nearestBelow, symbol),
        liquidityLabel: below[0]?.zoneType ?? "liquidity",
        reasoning: `Real move: after the trap fires, institutional sell pressure drives price down to fill lower liquidity at ${below[0]?.zoneType ?? "level"}.`,
      });
      // Phase 3 (optional extension) — second liquidity below.
      if (below[1]) {
        phases.push({
          phase: 3,
          classification: "continuation",
          direction: "down",
          fromPrice: nearestBelow,
          toPrice: below[1].ref,
          pips: pricePips(nearestBelow - below[1].ref, symbol),
          liquidityLabel: below[1].zoneType,
          reasoning: `Extension target if Phase 2 momentum carries through.`,
        });
      }
      finalDir = "bearish";
      confidence = Math.min(95, 50 + Math.round((trapScore - 60) * 0.8));
    } else if (trapType === "bear_trap" && nearestAbove != null && nearestBelow != null) {
      phases.push({
        phase: 1,
        classification: "trap",
        direction: "down",
        fromPrice: currentPrice,
        toPrice: nearestBelow,
        pips: distanceBelowPips ?? 0,
        liquidityLabel: below[0]?.zoneType ?? "liquidity",
        reasoning: `Bear-trap setup: retail crowded short, institutional buy pressure ${institutionalBuyScore}/100. Price likely to sweep lower liquidity first to trigger short stops, then reverse.`,
      });
      phases.push({
        phase: 2,
        classification: "real_move",
        direction: "up",
        fromPrice: nearestBelow,
        toPrice: nearestAbove,
        pips: pricePips(nearestAbove - nearestBelow, symbol),
        liquidityLabel: above[0]?.zoneType ?? "liquidity",
        reasoning: `Real move: after the trap fires, institutional buy pressure drives price up to fill upper liquidity at ${above[0]?.zoneType ?? "level"}.`,
      });
      if (above[1]) {
        phases.push({
          phase: 3,
          classification: "continuation",
          direction: "up",
          fromPrice: nearestAbove,
          toPrice: above[1].ref,
          pips: pricePips(above[1].ref - nearestAbove, symbol),
          liquidityLabel: above[1].zoneType,
          reasoning: `Extension target if Phase 2 momentum carries through.`,
        });
      }
      finalDir = "bullish";
      confidence = Math.min(95, 50 + Math.round((trapScore - 60) * 0.8));
    }
  }

  // No trap — direct path to whichever liquidity aligns with directional
  // bias (institutional consensus + retail counter).
  if (phases.length === 0) {
    const buyEdge = institutionalBuyScore - institutionalSellScore;
    const retailCounter =
      retailCrowding === "long_heavy" ? -10
      : retailCrowding === "short_heavy" ? +10
      : 0;
    const netDir = buyEdge + retailCounter;

    if (netDir > 10 && nearestAbove != null) {
      phases.push({
        phase: 1,
        classification: "continuation",
        direction: "up",
        fromPrice: currentPrice,
        toPrice: nearestAbove,
        pips: distanceAbovePips ?? 0,
        liquidityLabel: above[0]?.zoneType ?? "liquidity",
        reasoning: `Direct shot: institutional buy pressure ${institutionalBuyScore}/100 + ${retailCrowding === "short_heavy" ? "retail short crowding" : "balanced retail"}. No trap signal detected.`,
      });
      if (above[1]) {
        phases.push({
          phase: 2,
          classification: "continuation",
          direction: "up",
          fromPrice: nearestAbove,
          toPrice: above[1].ref,
          pips: pricePips(above[1].ref - nearestAbove, symbol),
          liquidityLabel: above[1].zoneType,
          reasoning: `Extension target after Phase 1 fills.`,
        });
      }
      finalDir = "bullish";
      confidence = Math.min(85, 40 + Math.round(Math.abs(netDir) * 0.8));
    } else if (netDir < -10 && nearestBelow != null) {
      phases.push({
        phase: 1,
        classification: "continuation",
        direction: "down",
        fromPrice: currentPrice,
        toPrice: nearestBelow,
        pips: distanceBelowPips ?? 0,
        liquidityLabel: below[0]?.zoneType ?? "liquidity",
        reasoning: `Direct shot: institutional sell pressure ${institutionalSellScore}/100 + ${retailCrowding === "long_heavy" ? "retail long crowding" : "balanced retail"}. No trap signal detected.`,
      });
      if (below[1]) {
        phases.push({
          phase: 2,
          classification: "continuation",
          direction: "down",
          fromPrice: nearestBelow,
          toPrice: below[1].ref,
          pips: pricePips(nearestBelow - below[1].ref, symbol),
          liquidityLabel: below[1].zoneType,
          reasoning: `Extension target after Phase 1 fills.`,
        });
      }
      finalDir = "bearish";
      confidence = Math.min(85, 40 + Math.round(Math.abs(netDir) * 0.8));
    }
  }

  // Final fallback: no clear direction → empty path with low confidence.
  const finalTarget = phases.length > 0 ? phases[phases.length - 1].toPrice : currentPrice;

  return {
    currentPrice,
    phases,
    finalTarget,
    finalDirection: finalDir,
    isTrapScenario: isTrap,
    trapType,
    pathConfidence: phases.length === 0 ? 0 : confidence,
    distanceAbovePips,
    distanceBelowPips,
    nearestAbove,
    nearestBelow,
    zonesAbove: above.length,
    zonesBelow: below.length,
  };
}
