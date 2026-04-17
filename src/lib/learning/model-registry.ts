// Adaptive Intelligence - Model Registry + Promotion + Rollback
// Tracks every model version safely with full audit trail

import { prisma } from "@/lib/prisma";

export async function registerModel(input: {
  modelName: string;
  modelFamily: string;
  version: string;
  targetName: string;
  trainedAt: Date;
  trainingWindowStart: Date;
  trainingWindowEnd: Date;
  datasetId?: string;
  featureList: string[];
  hyperparams: Record<string, any>;
  metrics: Record<string, number>;
  artifactPath: string;
  evaluationReportPath?: string;
  notes?: string;
}) {
  return prisma.modelRegistry.create({
    data: {
      ...input,
      status: "candidate",
      featureListJson: JSON.stringify(input.featureList),
      hyperparamsJson: JSON.stringify(input.hyperparams),
      metricsJson: JSON.stringify(input.metrics),
    },
  });
}

export async function getActiveModel(modelName: string) {
  return prisma.modelRegistry.findFirst({
    where: { modelName, status: "active" },
    orderBy: { trainedAt: "desc" },
  });
}

export async function getShadowModel(modelName: string) {
  return prisma.modelRegistry.findFirst({
    where: { modelName, status: "shadow" },
    orderBy: { trainedAt: "desc" },
  });
}

export async function promoteToShadow(version: string, approvedBy = "system") {
  const model = await prisma.modelRegistry.findUnique({ where: { version } });
  if (!model) throw new Error("Model not found");

  await prisma.modelRegistry.update({ where: { version }, data: { status: "shadow" } });

  await prisma.modelPromotion.create({
    data: {
      toVersion: version,
      actionType: "promote_to_shadow",
      decisionReason: "Candidate passed offline evaluation",
      approvedBy,
      metricsSnapshotJson: model.metricsJson,
    },
  });

  return prisma.modelRegistry.findUnique({ where: { version } });
}

export async function promoteToActive(version: string, approvedBy = "system") {
  const model = await prisma.modelRegistry.findUnique({ where: { version } });
  if (!model) throw new Error("Model not found");

  // Archive current active
  const currentActive = await prisma.modelRegistry.findFirst({
    where: { modelName: model.modelName, status: "active" },
  });

  if (currentActive) {
    await prisma.modelRegistry.update({
      where: { version: currentActive.version },
      data: { status: "archived", demotedAt: new Date(), replacedByVersion: version },
    });
  }

  await prisma.modelRegistry.update({
    where: { version },
    data: { status: "active", promotedAt: new Date() },
  });

  await prisma.modelPromotion.create({
    data: {
      fromVersion: currentActive?.version,
      toVersion: version,
      actionType: "promote_to_active",
      decisionReason: "Shadow evaluation passed",
      approvedBy,
      metricsSnapshotJson: model.metricsJson,
    },
  });

  return prisma.modelRegistry.findUnique({ where: { version } });
}

export async function rollbackModel(version: string, approvedBy = "system") {
  const model = await prisma.modelRegistry.findUnique({ where: { version } });
  if (!model) throw new Error("Model not found");

  await prisma.modelRegistry.update({
    where: { version },
    data: { status: "rolled_back", demotedAt: new Date() },
  });

  await prisma.modelPromotion.create({
    data: {
      fromVersion: version,
      toVersion: version,
      actionType: "rollback",
      decisionReason: "Manual or automatic rollback triggered",
      approvedBy,
      metricsSnapshotJson: model.metricsJson,
    },
  });

  return { success: true };
}

export async function listModels() {
  return prisma.modelRegistry.findMany({ orderBy: { trainedAt: "desc" } });
}
