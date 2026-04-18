import { prisma } from "@/lib/prisma";

const DEFAULT_WEIGHTS: Record<string, number> = {
  trendAlignment: 1,
  structureQuality: 1,
  liquidityBehavior: 1,
  strategyPattern: 1,
  indicatorConfluence: 1,
  volatilityQuality: 1,
  spreadQuality: 1,
  sessionQuality: 1,
  sentimentAlignment: 1,
  fundamentalSafety: 1,
};

function gradeFromScore(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 65) return "candidate";
  if (score >= 50) return "watch";
  return "ignore";
}

interface Metrics {
  count: number;
  aPlus: number;
  a: number;
  candidate: number;
  watch: number;
  ignore: number;
  avgScore: number;
  labeled: number;
  wins: number;
  losses: number;
  winRate: number;
}

function emptyMetrics(): Metrics {
  return { count: 0, aPlus: 0, a: 0, candidate: 0, watch: 0, ignore: 0, avgScore: 0, labeled: 0, wins: 0, losses: 0, winRate: 0 };
}

export async function runReplay(opts: {
  label: string;
  windowStart: Date;
  windowEnd: Date;
  weightsOverride?: Record<string, number>;
  notes?: string;
}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(opts.weightsOverride ?? {}) };

  const logs = await prisma.setupDecisionLog.findMany({
    where: { createdAt: { gte: opts.windowStart, lte: opts.windowEnd } },
    include: { outcomes: true },
  });

  const baseline: Metrics = emptyMetrics();
  const simulated: Metrics = emptyMetrics();
  let baselineTotalScore = 0;
  let simulatedTotalScore = 0;

  for (const log of logs) {
    let fv: Record<string, number> = {};
    try { fv = JSON.parse(log.featureVectorJson); } catch {}

    // Baseline = what was actually scored at the time
    const baseScore = log.rulesScore;
    const baseGrade = gradeFromScore(baseScore);
    baseline.count++;
    baselineTotalScore += baseScore;
    (baseline as any)[baseGrade === "A+" ? "aPlus" : baseGrade]++;

    // Simulated = re-weighted sum of the same feature vector
    const simScore = Object.keys(DEFAULT_WEIGHTS).reduce((acc, k) => {
      const v = fv[k] ?? 0;
      const w = weights[k] ?? 1;
      return acc + v * w;
    }, 0);
    const simGrade = gradeFromScore(Math.min(100, simScore));
    simulated.count++;
    simulatedTotalScore += Math.min(100, simScore);
    (simulated as any)[simGrade === "A+" ? "aPlus" : simGrade]++;

    const outcome = log.outcomes[0];
    if (outcome) {
      const isWin = outcome.outcomeClass === "excellent" || outcome.outcomeClass === "good";
      const isLoss = outcome.outcomeClass === "poor" || outcome.outcomeClass === "invalid";
      baseline.labeled++;
      simulated.labeled++;
      if (isWin) {
        baseline.wins++;
        if (simGrade === "A+" || simGrade === "A" || simGrade === "candidate") simulated.wins++;
      }
      if (isLoss) {
        baseline.losses++;
        if (simGrade === "A+" || simGrade === "A" || simGrade === "candidate") simulated.losses++;
      }
    }
  }

  baseline.avgScore = baseline.count > 0 ? baselineTotalScore / baseline.count : 0;
  simulated.avgScore = simulated.count > 0 ? simulatedTotalScore / simulated.count : 0;
  baseline.winRate = baseline.labeled > 0 ? baseline.wins / (baseline.wins + baseline.losses || 1) : 0;
  simulated.winRate = simulated.labeled > 0 ? simulated.wins / (simulated.wins + simulated.losses || 1) : 0;

  const delta = {
    aPlusDelta: simulated.aPlus - baseline.aPlus,
    aDelta: simulated.a - baseline.a,
    avgScoreDelta: simulated.avgScore - baseline.avgScore,
    winRateDelta: simulated.winRate - baseline.winRate,
  };

  const session = await prisma.replaySession.create({
    data: {
      label: opts.label,
      windowStart: opts.windowStart,
      windowEnd: opts.windowEnd,
      weightsOverrideJson: JSON.stringify(opts.weightsOverride ?? {}),
      decisionCount: logs.length,
      baselineMetricsJson: JSON.stringify(baseline),
      simulatedMetricsJson: JSON.stringify(simulated),
      deltaJson: JSON.stringify(delta),
      notes: opts.notes,
    },
  });

  return { sessionId: session.id, baseline, simulated, delta, decisionCount: logs.length };
}
