// Adaptive Intelligence - Config Versioning
// Version scoring weights and thresholds separately from model artifacts

import { prisma } from "@/lib/prisma";

export interface AdaptiveConfig {
  version: string;
  weights: {
    strengthSpread: number;
    alignment: number;
    structure: number;
    momentum: number;
    entryLocation: number;
    riskReward: number;
    volatility: number;
    eventRisk: number;
  };
  thresholds: {
    minDisplayScore: number;
    featuredScore: number;
    eliteScore: number;
    staleDistanceATR: number;
  };
  symbolModifiers: Record<string, number>;
  timeframeModifiers: Record<string, number>;
  sessionModifiers: Record<string, number>;
}

const DEFAULT_CONFIG: AdaptiveConfig = {
  version: "v1_default",
  weights: {
    strengthSpread: 25,
    alignment: 20,
    structure: 15,
    momentum: 10,
    entryLocation: 10,
    riskReward: 10,
    volatility: 5,
    eventRisk: 5,
  },
  thresholds: {
    minDisplayScore: 60,
    featuredScore: 85,
    eliteScore: 90,
    staleDistanceATR: 0.8,
  },
  symbolModifiers: {},
  timeframeModifiers: {},
  sessionModifiers: {},
};

export async function getActiveConfig(): Promise<AdaptiveConfig> {
  const active = await prisma.adaptiveConfigVersion.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
  });

  if (!active) return DEFAULT_CONFIG;

  return {
    version: active.version,
    weights: JSON.parse(active.weightsJson),
    thresholds: JSON.parse(active.thresholdsJson),
    symbolModifiers: JSON.parse(active.symbolModifiersJson),
    timeframeModifiers: JSON.parse(active.timeframeModifiersJson),
    sessionModifiers: JSON.parse(active.sessionModifiersJson),
  };
}

export async function createConfigCandidate(config: AdaptiveConfig, reason: string) {
  return prisma.adaptiveConfigVersion.create({
    data: {
      version: config.version,
      status: "candidate",
      changeReason: reason,
      weightsJson: JSON.stringify(config.weights),
      thresholdsJson: JSON.stringify(config.thresholds),
      symbolModifiersJson: JSON.stringify(config.symbolModifiers),
      timeframeModifiersJson: JSON.stringify(config.timeframeModifiers),
      sessionModifiersJson: JSON.stringify(config.sessionModifiers),
    },
  });
}

export async function promoteConfig(version: string) {
  // Archive current active
  const active = await prisma.adaptiveConfigVersion.findFirst({ where: { status: "active" } });
  if (active) {
    await prisma.adaptiveConfigVersion.update({
      where: { id: active.id },
      data: { status: "archived", deactivatedAt: new Date() },
    });
  }

  return prisma.adaptiveConfigVersion.update({
    where: { version },
    data: { status: "active", activatedAt: new Date() },
  });
}

export async function rollbackConfig(version: string) {
  return prisma.adaptiveConfigVersion.update({
    where: { version },
    data: { status: "rolled_back", deactivatedAt: new Date() },
  });
}

export async function listConfigs() {
  return prisma.adaptiveConfigVersion.findMany({ orderBy: { createdAt: "desc" } });
}
