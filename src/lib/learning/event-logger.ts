// Adaptive Intelligence - Decision Logging Service
// Logs every setup decision for future learning

import { prisma } from "@/lib/prisma";

export interface SetupDecisionInput {
  setupId?: string;
  symbol: string;
  timeframe: string;
  session: string;
  marketRegime?: string;
  direction: "buy" | "sell";
  setupType: string;
  rulesScore: number;
  hybridScore?: number;
  qualityLabel: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  pairStrengthSpread?: number;
  alignmentScore?: number;
  structureScore?: number;
  momentumScore?: number;
  entryLocationScore?: number;
  rrScore?: number;
  volatilityScore?: number;
  eventRiskScore?: number;
  featureVector: Record<string, any>;
  reasoning: string[];
  invalidationRules: string[];
  marketContext: Record<string, any>;
}

export async function logSetupDecision(input: SetupDecisionInput) {
  return prisma.setupDecisionLog.create({
    data: {
      setupId: input.setupId,
      symbol: input.symbol,
      timeframe: input.timeframe,
      session: input.session,
      marketRegime: input.marketRegime,
      direction: input.direction,
      setupType: input.setupType,
      rulesScore: input.rulesScore,
      hybridScore: input.hybridScore,
      qualityLabel: input.qualityLabel,
      entry: input.entry,
      stopLoss: input.stopLoss,
      takeProfit1: input.takeProfit1,
      takeProfit2: input.takeProfit2,
      takeProfit3: input.takeProfit3,
      pairStrengthSpread: input.pairStrengthSpread,
      alignmentScore: input.alignmentScore,
      structureScore: input.structureScore,
      momentumScore: input.momentumScore,
      entryLocationScore: input.entryLocationScore,
      rrScore: input.rrScore,
      volatilityScore: input.volatilityScore,
      eventRiskScore: input.eventRiskScore,
      featureVectorJson: JSON.stringify(input.featureVector),
      reasoningJson: JSON.stringify(input.reasoning),
      invalidationRulesJson: JSON.stringify(input.invalidationRules),
      marketContextJson: JSON.stringify(input.marketContext),
    },
  });
}

export async function logUserInteraction(input: {
  setupDecisionLogId: string;
  userId?: string;
  eventType: string;
  eventValue?: string;
  metadata?: Record<string, any>;
}) {
  return prisma.setupUserInteraction.create({
    data: {
      setupDecisionLogId: input.setupDecisionLogId,
      userId: input.userId,
      eventType: input.eventType,
      eventValue: input.eventValue,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

export async function getUnlabeledDecisions(limit = 200) {
  return prisma.setupDecisionLog.findMany({
    where: { outcomes: { none: {} } },
    take: limit,
    orderBy: { createdAt: "asc" },
  });
}

export async function getDecisionsByDateRange(start: Date, end: Date) {
  return prisma.setupDecisionLog.findMany({
    where: { createdAt: { gte: start, lt: end } },
    include: { outcomes: true },
    orderBy: { createdAt: "asc" },
  });
}
