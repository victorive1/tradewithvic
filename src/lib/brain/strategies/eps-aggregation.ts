// PDF Strategy 16 — EPS Aggregation Engine (Elite).
//
// The master detector. Has no entry logic of its own — it watches what
// every other detector wrote to the TradeSetup table in the same scan
// window and fires only when 2+ strategies agree on the same instrument
// in the same direction at roughly the same price zone.
//
// Multi-strategy bonus per PDF page 36:
//   2 strategies aligned = +10 pts
//   3 strategies aligned = +20 pts
//   4+ strategies        = +30 pts
//
// Final EPS = max base score across detectors + multi-strategy bonus.
// Fires only when the combined score is ≥90 (Tier 1 / A+).

import type { DetectedSetup } from "@/lib/brain/strategies-types";
import { prisma } from "@/lib/prisma";
import { type GateOutcome, pricePips, pipsToPrice } from "@/lib/brain/strategies/eps-scoring";

interface StrategyContext {
  symbol: string;
  timeframe: string;
  instrumentId: string | null;
  candles: { openTime: Date; open: number; high: number; low: number; close: number }[];
  structure: { bias?: string | null } | null;
  atr: number | null;
}

const SCAN_WINDOW_MIN = 15; // detections must be within this minute window
const ZONE_TOLERANCE_PIPS = 25; // detections must be within this many pips
const TIER_1_MIN = 90;

export async function detectEpsAggregation(ctx: StrategyContext): Promise<DetectedSetup | null> {
  // Run on 15m only — keeps the meta-detector single-pass per cycle and
  // gives it visibility into the freshest output of all other detectors
  // (most run on 15m or coarser).
  if (ctx.timeframe !== "15m") return null;
  if (!ctx.atr) return null;

  const since = new Date(Date.now() - SCAN_WINDOW_MIN * 60 * 1000);

  // Pull all active TradeSetups for this symbol within the scan window,
  // EXCLUDING any prior eps_aggregation rows so we don't recursively
  // bonus our own output.
  const setups = await prisma.tradeSetup.findMany({
    where: {
      symbol: ctx.symbol,
      status: "active",
      createdAt: { gte: since },
      setupType: { not: "eps_aggregation" },
    },
    orderBy: { confidenceScore: "desc" },
    take: 30,
  });
  if (setups.length < 2) return null;

  // Group by direction: aggregation only fires when 2+ strategies agree
  // on direction AND price zone.
  const byDirection: Record<string, typeof setups> = { bullish: [], bearish: [] };
  for (const s of setups) {
    const dir = s.direction === "bullish" || s.direction === "buy" || s.direction === "long" ? "bullish" : "bearish";
    byDirection[dir].push(s);
  }

  for (const direction of ["bullish", "bearish"] as const) {
    const same = byDirection[direction];
    if (same.length < 2) continue;

    // Cluster by entry price proximity — only count detections at the
    // SAME price zone, not spread across different levels. Within
    // ZONE_TOLERANCE_PIPS the cluster is one zone.
    const tol = pipsToPrice(ZONE_TOLERANCE_PIPS, ctx.symbol);
    const clusters: typeof same[] = [];
    const sortedByEntry = [...same].sort((a, b) => a.entry - b.entry);
    for (const s of sortedByEntry) {
      const fits = clusters.find((c) => Math.abs(c[0].entry - s.entry) <= tol);
      if (fits) fits.push(s);
      else clusters.push([s]);
    }
    // Deduplicate by setupType inside each cluster — multiple same-strategy
    // rows are still ONE strategy.
    const bestCluster = clusters
      .map((cluster) => {
        const uniq = new Map<string, typeof cluster[0]>();
        for (const s of cluster) {
          if (!uniq.has(s.setupType) || (uniq.get(s.setupType)!.confidenceScore < s.confidenceScore)) {
            uniq.set(s.setupType, s);
          }
        }
        return Array.from(uniq.values());
      })
      .filter((cluster) => cluster.length >= 2)
      .sort((a, b) => b.length - a.length || averageScore(b) - averageScore(a))[0];
    if (!bestCluster) continue;

    const numStrategies = bestCluster.length;
    const bonus = numStrategies >= 4 ? 30 : numStrategies >= 3 ? 20 : 10;
    const baseScore = Math.max(...bestCluster.map((s) => s.confidenceScore));
    const finalScore = Math.min(100, baseScore + bonus);
    if (finalScore < TIER_1_MIN) continue;

    // Most conservative SL across the cluster, most conservative TP.
    const stopLoss = direction === "bullish"
      ? Math.min(...bestCluster.map((s) => s.stopLoss))
      : Math.max(...bestCluster.map((s) => s.stopLoss));
    const tp1Candidates = bestCluster.map((s) => s.takeProfit1);
    const tp1 = direction === "bullish" ? Math.min(...tp1Candidates) : Math.max(...tp1Candidates);
    // Entry — average across the cluster.
    const entry = bestCluster.reduce((sum, s) => sum + s.entry, 0) / bestCluster.length;
    const risk = Math.abs(entry - stopLoss);
    if (risk <= 0) continue;
    const rr = Math.abs(tp1 - entry) / risk;
    if (rr < 2) continue;

    const tp2 = direction === "bullish" ? entry + risk * 5 : entry - risk * 5;

    // Build per-strategy gate breakdown (one entry per detected strategy).
    const gates: GateOutcome[] = bestCluster.map((s) => ({
      id: s.setupType,
      label: `${s.setupType.replace(/_/g, " ")} confirms ${direction}`,
      passed: true,
      evidence: `score ${s.confidenceScore}/100, entry ${s.entry.toFixed(5)}, ${pricePips(Math.abs(s.entry - entry), ctx.symbol).toFixed(1)}p from cluster centre`,
    }));
    gates.push({
      id: "bonus",
      label: `Multi-strategy bonus (+${bonus})`,
      passed: true,
      evidence: `${numStrategies} strategies aligned in same zone`,
    });

    const explanation =
      `Elite Confluence — ${numStrategies} strategies aligned ${direction} at ${entry.toFixed(5)} ± ${ZONE_TOLERANCE_PIPS}p. ` +
      `Strategies: ${bestCluster.map((s) => s.setupType).join(", ")}. ` +
      `Base score ${baseScore} + bonus ${bonus} = ${finalScore}/100 (TIER 1). ` +
      `Entry ${entry.toFixed(5)}, SL ${stopLoss.toFixed(5)} (most conservative), TP1 ${tp1.toFixed(5)} (${rr.toFixed(2)}R).`;

    return {
      setupType: "eps_aggregation",
      direction,
      entry,
      stopLoss,
      takeProfit1: tp1,
      takeProfit2: tp2,
      riskReward: rr,
      confidenceScore: finalScore,
      qualityGrade: "A+",
      explanation,
      invalidation: `Any of the underlying ${numStrategies} strategies invalidates — most conservative individual stop holds.`,
      validHours: 4,
      metadata: {
        strategy: "eps_aggregation",
        tier: "TIER 1",
        eps: finalScore,
        baseScore,
        bonus,
        strategiesAligned: numStrategies,
        strategies: bestCluster.map((s) => ({ setupType: s.setupType, score: s.confidenceScore, entry: s.entry, id: s.id })),
        gates,
      },
    };
  }

  return null;
}

function averageScore(cluster: { confidenceScore: number }[]): number {
  return cluster.reduce((s, x) => s + x.confidenceScore, 0) / cluster.length;
}
