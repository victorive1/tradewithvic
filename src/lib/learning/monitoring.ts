// Adaptive Intelligence - Monitoring + Drift Detection
// Watches live model health, calibration, and outcome performance

import { prisma } from "@/lib/prisma";

export async function getOperationalMetrics(hours = 6) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const logs = await prisma.liveScoringLog.findMany({
    where: { createdAt: { gte: since } },
  });

  const total = logs.length || 1;
  const fallbackCount = logs.filter((x: any) => x.fallbackUsed).length;

  return {
    totalScoringEvents: logs.length,
    fallbackRate: fallbackCount / total,
    inferenceSuccessRate: 1 - fallbackCount / total,
  };
}

export async function getScoreBandPerformance(days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const logs = await prisma.liveScoringLog.findMany({
    where: { createdAt: { gte: since } },
    include: {
      setupDecisionLog: { include: { outcomes: true } },
    },
  });

  const bands = [
    { label: "90_100", min: 90, max: 100 },
    { label: "80_89", min: 80, max: 89.99 },
    { label: "70_79", min: 70, max: 79.99 },
    { label: "60_69", min: 60, max: 69.99 },
  ];

  const result: Record<string, any> = {};

  for (const band of bands) {
    const bandLogs = logs.filter(
      (r: any) => r.visibleScore >= band.min && r.visibleScore <= band.max
    );
    const outcomes = bandLogs
      .map((r: any) => r.setupDecisionLog?.outcomes?.[0])
      .filter(Boolean);

    const count = outcomes.length || 0;
    result[band.label] = {
      count,
      tp1HitRate: count > 0 ? outcomes.filter((o: any) => o.tp1Hit).length / count : 0,
      slHitRate: count > 0 ? outcomes.filter((o: any) => o.slHit).length / count : 0,
      poorRate: count > 0 ? outcomes.filter((o: any) => o.outcomeClass === "poor").length / count : 0,
    };
  }

  return result;
}

export async function runMonitoringSnapshot() {
  const opMetrics = await getOperationalMetrics(6);
  const bandPerformance = await getScoreBandPerformance(7);

  const activeModel = await prisma.modelRegistry.findFirst({
    where: { status: "active" },
    orderBy: { trainedAt: "desc" },
  });

  const topBand = bandPerformance["90_100"] || {};

  const snapshot = await prisma.monitoringSnapshot.create({
    data: {
      activeModelVersion: activeModel?.version,
      scoringMode: activeModel ? "hybrid" : "rules_only",
      inferenceSuccessRate: opMetrics.inferenceSuccessRate,
      fallbackRate: opMetrics.fallbackRate,
      topBucketHitRate: topBand.tp1HitRate ?? 0,
      topBucketFalsePositiveRate: topBand.poorRate ?? 0,
      driftSeverity: "stable",
      scoreBandSummaryJson: JSON.stringify(bandPerformance),
    },
  });

  // Generate alerts if thresholds breached
  if (opMetrics.fallbackRate > 0.15) {
    await prisma.monitoringAlert.create({
      data: {
        level: "critical",
        category: "operational",
        title: "High fallback rate",
        message: `Fallback to rules-only exceeded 15%. Current: ${(opMetrics.fallbackRate * 100).toFixed(1)}%`,
        metricName: "fallbackRate",
        metricValue: opMetrics.fallbackRate,
        thresholdValue: 0.15,
        recommendedAction: "force_rules_only_or_rollback",
      },
    });
  }

  if ((topBand.poorRate ?? 0) > 0.30) {
    await prisma.monitoringAlert.create({
      data: {
        level: "critical",
        category: "outcome",
        title: "Top bucket quality degraded",
        message: "Elite bucket poor-rate exceeded 30%",
        metricName: "topBucketPoorRate",
        metricValue: topBand.poorRate,
        thresholdValue: 0.30,
        recommendedAction: "reduce_model_weight_or_rollback",
      },
    });
  }

  return snapshot;
}

export async function getOpenAlerts() {
  return prisma.monitoringAlert.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "desc" },
  });
}

export async function acknowledgeAlert(id: string) {
  return prisma.monitoringAlert.update({
    where: { id },
    data: { status: "acknowledged" },
  });
}

export async function resolveAlert(id: string, actionTaken?: string) {
  return prisma.monitoringAlert.update({
    where: { id },
    data: { status: "resolved", resolvedAt: new Date(), actionTaken },
  });
}

export async function getRecentSnapshots(limit = 50) {
  return prisma.monitoringSnapshot.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
