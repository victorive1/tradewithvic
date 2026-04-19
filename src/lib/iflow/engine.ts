/**
 * Institutional Flow engine — orchestrates the detectors, runs the scoring
 * model, and persists InstitutionalSignal rows. Called from the scan cycle
 * and the admin refresh route.
 */

import { prisma } from "@/lib/prisma";
import { computeIntentScore, classifySignal } from "./scoring";
import {
  deriveFlowEvidence,
  deriveCrossAssetAgreement,
  findActiveCatalyst,
  readRegimeContext,
} from "./detectors";

const WATCHED_SYMBOLS = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
  "XAUUSD", "XAGUSD",
  "NAS100", "US30", "SPX500",
  "BTCUSD", "ETHUSD",
];

export interface RunResult {
  scanned: number;
  signalsCreated: number;
  invalidated: number;
  elapsedMs: number;
  errors: string[];
}

export async function runIFlowCycle(symbols: string[] = WATCHED_SYMBOLS): Promise<RunResult> {
  const startedAt = Date.now();
  const errors: string[] = [];
  let signalsCreated = 0;

  // Invalidate signals that have been sitting active for > 2 hours without
  // fresh confirmation — keeps the live board focused on current flow.
  const staleCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const stale = await prisma.institutionalSignal.updateMany({
    where: { active: true, capturedAt: { lt: staleCutoff } },
    data: { active: false, invalidatedAt: new Date(), invalidationReason: "stale_over_2h" },
  });

  for (const symbol of symbols) {
    try {
      const flow = await deriveFlowEvidence(symbol);
      if (!flow) continue;

      const direction: "long" | "short" | "neutral" =
        flow.side === "buy" ? "long" : flow.side === "sell" ? "short" : "neutral";

      // Skip neutral/noisy symbols — no signal worth publishing
      if (direction === "neutral" && Math.abs(flow.aggressorRatio) < 0.1) continue;

      // Persist the raw FlowEvent regardless so analytics has the trail
      await prisma.flowEvent.create({
        data: {
          assetSymbol: symbol,
          timeframe: "5min",
          session: flow.session,
          side: flow.side,
          aggressorRatio: flow.aggressorRatio,
          sweepCount: flow.sweepCount,
          spreadBps: flow.spreadBps,
          orderBookImbalance: flow.orderBookImbalance,
          vwapDistance: flow.vwapDistance,
          absorptionScore: flow.absorptionScore,
          refillScore: flow.refillScore,
          rawNotional: flow.rawNotional,
          sourceKind: "derived",
        },
      });

      const crossAsset = await deriveCrossAssetAgreement(symbol, direction);
      const catalyst = await findActiveCatalyst(symbol);
      const regime = await readRegimeContext(symbol);

      const breakdown = computeIntentScore({
        aggressorRatio: flow.aggressorRatio,
        sweepCount: flow.sweepCount,
        absorption: flow.absorptionScore,
        refill: flow.refillScore,
        vwapDistance: flow.vwapDistance,
        rawNotional: flow.rawNotional,
        optionsFlow: null,        // derivatives source not wired yet (needs paid feed)
        crossAssetAgreement: crossAsset,
        venueScore: null,         // venue/routing data not wired yet
        positioningAlignment: null, // COT/13F data not wired yet
        catalyst,
        regime,
        direction,
      });

      // Only publish signals that clear the watchlist floor
      if (breakdown.total < 55) continue;

      const classification = classifySignal({
        intentScore: breakdown.total,
        flowQuality: breakdown.flowQuality,
        persistenceProb: breakdown.persistenceProb,
        vwapDistance: flow.vwapDistance,
        direction,
      });

      // Derived defended + invalidation levels from nearby liquidity
      const levels = await prisma.liquidityLevel.findMany({
        where: { symbol, timeframe: { in: ["5min", "15min", "1h"] }, status: "active" },
        orderBy: { updatedAt: "desc" },
        take: 6,
      });
      const lastCandle = await prisma.candle.findFirst({
        where: { symbol, timeframe: "5min", isClosed: true },
        orderBy: { openTime: "desc" },
      });
      const markPrice = lastCandle?.close ?? null;
      const defendedLevel = markPrice != null
        ? nearestLevel(levels.map((l) => l.price), markPrice, direction === "long" ? "below" : "above")
        : null;
      const invalidationLevel = markPrice != null
        ? nearestLevel(levels.map((l) => l.price), markPrice, direction === "long" ? "far_below" : "far_above")
        : null;

      await prisma.institutionalSignal.create({
        data: {
          assetSymbol: symbol,
          direction,
          classification,
          intentScore: breakdown.total,
          confidenceGrade: breakdown.grade,
          flowQuality: breakdown.flowQuality,
          derivativesScore: breakdown.derivatives,
          crossAssetScore: breakdown.crossAsset,
          venueScore: breakdown.venue,
          catalystScore: breakdown.catalyst,
          persistenceScore: breakdown.persistence,
          positioningScore: breakdown.positioning,
          regimeScore: breakdown.regime,
          defendedLevel,
          invalidationLevel,
          persistenceProb: breakdown.persistenceProb,
          explanationJson: JSON.stringify(breakdown.drivers),
          evidenceJson: JSON.stringify({
            flow,
            crossAsset,
            catalyst,
            regime,
            markPrice,
          }),
          horizon: breakdown.persistenceProb >= 0.7 ? "multi_day" : "intraday",
        },
      });
      signalsCreated++;
    } catch (err: any) {
      errors.push(`${symbol}: ${err?.message ?? String(err)}`);
    }
  }

  return {
    scanned: symbols.length,
    signalsCreated,
    invalidated: stale.count,
    elapsedMs: Date.now() - startedAt,
    errors,
  };
}

function nearestLevel(
  levels: number[],
  mark: number,
  side: "above" | "below" | "far_above" | "far_below",
): number | null {
  if (levels.length === 0) return null;
  let candidates = levels;
  if (side === "below") candidates = levels.filter((l) => l < mark);
  if (side === "above") candidates = levels.filter((l) => l > mark);
  if (side === "far_below") candidates = levels.filter((l) => l < mark);
  if (side === "far_above") candidates = levels.filter((l) => l > mark);
  if (candidates.length === 0) return null;
  if (side === "below" || side === "above") {
    return candidates.reduce((best, l) =>
      Math.abs(l - mark) < Math.abs(best - mark) ? l : best, candidates[0]);
  }
  // "far" = the furthest level below/above mark — used for invalidation
  return side === "far_below"
    ? Math.min(...candidates)
    : Math.max(...candidates);
}
