// src/lib/brain/sr-setup-persister.ts
//
// Idempotent insert of an SrSetupSpec into the TradeSetup table.
// Idempotency: skip if an active TradeSetup with the same zoneId in
// its metadataJson already exists, created in the last 6 hours.

import { prisma } from "@/lib/prisma";
import type { SrSetupSpec } from "@/lib/brain/sr-setup-generator";

export async function persistSrSetup(
  spec: SrSetupSpec,
  instrumentId: string,
): Promise<{ created: boolean; id: string | null }> {
  const zoneIdMarker = `"zoneId":"${spec.metadata.zoneId}"`;
  const existing = await prisma.tradeSetup.findFirst({
    where: {
      symbol: spec.symbol,
      timeframe: spec.timeframe,
      setupType: spec.setupType,
      createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      metadataJson: { contains: zoneIdMarker },
    },
    select: { id: true },
  });
  if (existing) return { created: false, id: existing.id };

  const validUntil = new Date(Date.now() + spec.validHours * 60 * 60 * 1000);

  const created = await prisma.tradeSetup.create({
    data: {
      instrumentId,
      symbol: spec.symbol,
      direction: spec.direction,
      setupType: spec.setupType,
      timeframe: spec.timeframe,
      entry: spec.entry,
      stopLoss: spec.stopLoss,
      takeProfit1: spec.takeProfit1,
      takeProfit2: spec.takeProfit2,
      takeProfit3: spec.takeProfit3,
      riskReward: spec.riskReward,
      confidenceScore: spec.confidenceScore,
      qualityGrade: spec.qualityGrade,
      explanation: spec.explanation,
      invalidation: spec.invalidation,
      metadataJson: JSON.stringify(spec.metadata),
      status: "active",
      validUntil,
    },
    select: { id: true },
  });

  return { created: true, id: created.id };
}
