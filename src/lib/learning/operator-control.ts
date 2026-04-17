// Adaptive Intelligence - Operator Control Panel
// Safe management of models, configs, scoring mode, rollback

import { prisma } from "@/lib/prisma";
import { getSystemControlState } from "./hybrid-scoring";

export async function getOperatorOverview() {
  const controlState = await getSystemControlState();

  const openAlerts = await prisma.monitoringAlert.count({ where: { status: "open" } });
  const openCritical = await prisma.monitoringAlert.count({ where: { status: "open", level: "critical" } });

  const lastSnapshot = await prisma.monitoringSnapshot.findFirst({ orderBy: { createdAt: "desc" } });
  const lastTraining = await prisma.modelRegistry.findFirst({ orderBy: { trainedAt: "desc" } });

  return {
    scoringMode: controlState.scoringMode,
    rulesWeight: controlState.rulesWeight,
    modelWeight: controlState.modelWeight,
    forceRulesOnly: controlState.forceRulesOnly,
    activeModelVersion: controlState.activeModelVersion,
    shadowModelVersion: controlState.shadowModelVersion,
    activeConfigVersion: controlState.activeConfigVersion,
    openAlerts,
    openCritical,
    fallbackRate: lastSnapshot?.fallbackRate ?? 0,
    topBucketHitRate: lastSnapshot?.topBucketHitRate ?? 0,
    driftSeverity: lastSnapshot?.driftSeverity ?? "stable",
    lastSnapshotAt: lastSnapshot?.createdAt?.toISOString(),
    lastTrainingAt: lastTraining?.trainedAt?.toISOString(),
  };
}

export async function forceRulesOnly(operatorId: string, reason: string) {
  const state = await getSystemControlState();
  await prisma.systemControlState.update({
    where: { id: state.id },
    data: { forceRulesOnly: true, scoringMode: "rules_only", modelWeight: 0, rulesWeight: 1 },
  });

  await logOperatorAction(operatorId, "force_rules_only", "system", state.id, reason);
  return { success: true };
}

export async function setHybridWeights(operatorId: string, rulesWeight: number, modelWeight: number, reason: string) {
  if (rulesWeight + modelWeight > 1.01 || rulesWeight < 0 || modelWeight < 0) {
    throw new Error("Invalid weights: must sum to ~1.0");
  }

  const state = await getSystemControlState();
  await prisma.systemControlState.update({
    where: { id: state.id },
    data: {
      rulesWeight,
      modelWeight,
      scoringMode: modelWeight > 0 ? "hybrid" : "rules_only",
      forceRulesOnly: modelWeight === 0,
    },
  });

  await logOperatorAction(operatorId, "set_hybrid_weights", "system", state.id, reason, { rulesWeight, modelWeight });
  return { success: true };
}

export async function freezeConfigPromotions(operatorId: string, reason: string) {
  const state = await getSystemControlState();
  await prisma.systemControlState.update({
    where: { id: state.id },
    data: { configPromotionsFrozen: true },
  });

  await logOperatorAction(operatorId, "freeze_config_promotions", "system", state.id, reason);
  return { success: true };
}

async function logOperatorAction(
  operatorId: string,
  actionType: string,
  targetType: string,
  targetId?: string,
  reason?: string,
  metadata?: Record<string, any>
) {
  return prisma.operatorActionLog.create({
    data: {
      operatorId,
      actionType,
      targetType,
      targetId,
      reason,
      metadataJson: metadata ? JSON.stringify(metadata) : null,
    },
  });
}

export async function getOperatorActionLog(limit = 100) {
  return prisma.operatorActionLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
