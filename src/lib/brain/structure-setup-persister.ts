// src/lib/brain/structure-setup-persister.ts
//
// Idempotent insert of a StructureSetupSpec into the TradeSetup table.
// Idempotency: skip if an active TradeSetup with the same eventId in
// its metadataJson already exists. The eventId comes from a single,
// write-once StructureEvent row, so this is sufficient.

import { prisma } from "@/lib/prisma";
import type { StructureSetupSpec } from "@/lib/brain/structure-setup-generator";

export async function persistStructureSetup(
  spec: StructureSetupSpec,
  instrumentId: string,
): Promise<{ created: boolean; id: string | null }> {
  // Cheap pre-check using a recent-window filter and a JSON substring
  // contains. This is a small table per-symbol so the scan is fine.
  // The substring is anchored to the JSON key/value pair to avoid
  // accidental matches.
  const eventIdMarker = `"eventId":"${spec.metadata.eventId}"`;
  const existing = await prisma.tradeSetup.findFirst({
    where: {
      symbol: spec.symbol,
      timeframe: spec.timeframe,
      setupType: spec.setupType,
      createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      metadataJson: { contains: eventIdMarker },
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
