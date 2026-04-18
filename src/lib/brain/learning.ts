import { prisma } from "@/lib/prisma";

interface PerGroupMetrics {
  count: number;
  wins: number;
  losses: number;
  neutral: number;
  winRate: number;
  avgScore: number;
}

function emptyMetrics(): PerGroupMetrics {
  return { count: 0, wins: 0, losses: 0, neutral: 0, winRate: 0, avgScore: 0 };
}

/**
 * Classifies outcomeClass into a simple win/loss/neutral bucket.
 */
function classify(outcomeClass: string): "win" | "loss" | "neutral" {
  if (outcomeClass === "excellent" || outcomeClass === "good") return "win";
  if (outcomeClass === "poor" || outcomeClass === "invalid") return "loss";
  return "neutral";
}

interface JoinedRow {
  direction: string;
  setupType: string;
  symbol: string;
  timeframe: string;
  session: string;
  rulesScore: number;
  structureScore: number | null;
  momentumScore: number | null;
  entryLocationScore: number | null;
  rrScore: number | null;
  volatilityScore: number | null;
  eventRiskScore: number | null;
  alignmentScore: number | null;
  outcomeClass: string;
}

export interface LearningReport {
  reportDate: Date;
  window: { from: Date; to: Date };
  totalLogged: number;
  totalLabeled: number;
  overallWinRate: number;
  byStrategy: Record<string, PerGroupMetrics>;
  bySymbol: Record<string, PerGroupMetrics>;
  bySession: Record<string, PerGroupMetrics>;
  byGrade: Record<string, PerGroupMetrics>;
  featureImportance: Array<{ feature: string; winMean: number; lossMean: number; delta: number }>;
  recommendations: Array<{ type: string; feature?: string; message: string; suggestedDelta?: number }>;
}

export async function runDailyLearningCycle(): Promise<LearningReport> {
  const to = new Date();
  const from = new Date(to.getTime() - 14 * 24 * 3600_000); // 14-day trailing window

  const logs = await prisma.setupDecisionLog.findMany({
    where: { createdAt: { gte: from } },
    include: { outcomes: true },
  });

  const totalLogged = logs.length;
  const labeled = logs.filter((l: any) => l.outcomes.length > 0);
  const totalLabeled = labeled.length;

  const rows: JoinedRow[] = labeled.map((l: any) => ({
    direction: l.direction,
    setupType: l.setupType,
    symbol: l.symbol,
    timeframe: l.timeframe,
    session: l.session,
    rulesScore: l.rulesScore,
    structureScore: l.structureScore,
    momentumScore: l.momentumScore,
    entryLocationScore: l.entryLocationScore,
    rrScore: l.rrScore,
    volatilityScore: l.volatilityScore,
    eventRiskScore: l.eventRiskScore,
    alignmentScore: l.alignmentScore,
    outcomeClass: l.outcomes[0].outcomeClass,
  }));

  const bucket = (rows: JoinedRow[], key: keyof JoinedRow): Record<string, PerGroupMetrics> => {
    const out: Record<string, PerGroupMetrics> = {};
    for (const r of rows) {
      const k = String(r[key]);
      if (!out[k]) out[k] = emptyMetrics();
      out[k].count++;
      out[k].avgScore += r.rulesScore;
      const cls = classify(r.outcomeClass);
      if (cls === "win") out[k].wins++;
      else if (cls === "loss") out[k].losses++;
      else out[k].neutral++;
    }
    for (const k of Object.keys(out)) {
      const m = out[k];
      m.winRate = m.count > 0 ? m.wins / m.count : 0;
      m.avgScore = m.count > 0 ? m.avgScore / m.count : 0;
    }
    return out;
  };

  const byStrategy = bucket(rows, "setupType");
  const bySymbol = bucket(rows, "symbol");
  const bySession = bucket(rows, "session");

  const byGrade: Record<string, PerGroupMetrics> = {};
  for (const r of rows) {
    const g = r.rulesScore >= 90 ? "A+" : r.rulesScore >= 80 ? "A" : r.rulesScore >= 65 ? "candidate" : r.rulesScore >= 50 ? "watch" : "ignore";
    if (!byGrade[g]) byGrade[g] = emptyMetrics();
    byGrade[g].count++;
    byGrade[g].avgScore += r.rulesScore;
    const cls = classify(r.outcomeClass);
    if (cls === "win") byGrade[g].wins++;
    else if (cls === "loss") byGrade[g].losses++;
    else byGrade[g].neutral++;
  }
  for (const g of Object.keys(byGrade)) {
    byGrade[g].winRate = byGrade[g].count > 0 ? byGrade[g].wins / byGrade[g].count : 0;
    byGrade[g].avgScore = byGrade[g].count > 0 ? byGrade[g].avgScore / byGrade[g].count : 0;
  }

  const wins = rows.filter((r) => classify(r.outcomeClass) === "win");
  const losses = rows.filter((r) => classify(r.outcomeClass) === "loss");

  const featureKeys: Array<keyof JoinedRow> = [
    "structureScore", "momentumScore", "entryLocationScore",
    "rrScore", "volatilityScore", "eventRiskScore", "alignmentScore",
  ];
  const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const featureImportance = featureKeys.map((k) => {
    const winVals = wins.map((r) => (r[k] as number | null) ?? 0);
    const lossVals = losses.map((r) => (r[k] as number | null) ?? 0);
    const winMean = mean(winVals);
    const lossMean = mean(lossVals);
    return { feature: String(k), winMean, lossMean, delta: winMean - lossMean };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const recommendations: LearningReport["recommendations"] = [];
  if (totalLabeled < 20) {
    recommendations.push({ type: "notice", message: `Only ${totalLabeled} labeled outcomes in window — insufficient for confident recalibration. Retain current weights.` });
  } else {
    for (const f of featureImportance.slice(0, 3)) {
      if (Math.abs(f.delta) > 2) {
        const direction = f.delta > 0 ? "increase" : "decrease";
        recommendations.push({
          type: "weight_adjustment",
          feature: f.feature,
          suggestedDelta: Math.sign(f.delta) * Math.min(3, Math.abs(f.delta) / 2),
          message: `${f.feature} win/loss delta ${f.delta.toFixed(2)} — consider ${direction}ing its weight.`,
        });
      }
    }
    const aPlusBucket = byGrade["A+"];
    if (aPlusBucket && aPlusBucket.count >= 5 && aPlusBucket.winRate < 0.6) {
      recommendations.push({
        type: "threshold_adjustment",
        message: `A+ bucket win rate ${(aPlusBucket.winRate * 100).toFixed(0)}% across ${aPlusBucket.count} trades — tighten A+ threshold above 90.`,
      });
    }
  }

  const overallWinRate = rows.length > 0 ? wins.length / rows.length : 0;
  const reportDate = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

  const baselineMetrics = {
    totalLogged, totalLabeled, overallWinRate,
    byStrategy, bySymbol, bySession, byGrade,
  };

  await prisma.dailyLearningReport.upsert({
    where: { reportDate },
    create: {
      reportDate,
      setupsLogged: totalLogged,
      setupsLabeled: totalLabeled,
      baselineMetricsJson: JSON.stringify(baselineMetrics),
      candidateMetricsJson: JSON.stringify({ featureImportance }),
      recommendationsJson: JSON.stringify(recommendations),
    },
    update: {
      setupsLogged: totalLogged,
      setupsLabeled: totalLabeled,
      baselineMetricsJson: JSON.stringify(baselineMetrics),
      candidateMetricsJson: JSON.stringify({ featureImportance }),
      recommendationsJson: JSON.stringify(recommendations),
    },
  });

  // If there are material recommendations, draft a candidate AdaptiveConfigVersion.
  const materialRecs = recommendations.filter((r) => r.type === "weight_adjustment");
  if (materialRecs.length > 0) {
    const activeConfig = await prisma.adaptiveConfigVersion.findFirst({
      where: { status: "active" },
      orderBy: { activatedAt: "desc" },
    });

    const parentVersion = activeConfig?.version ?? "v0.initial";
    const candidateVersion = `v${Date.now()}.auto`;

    const weightsBase = activeConfig ? JSON.parse(activeConfig.weightsJson) : {};
    const proposedWeights = { ...weightsBase };
    for (const r of materialRecs) {
      if (r.feature && typeof r.suggestedDelta === "number") {
        proposedWeights[r.feature] = (proposedWeights[r.feature] ?? 0) + r.suggestedDelta;
      }
    }

    await prisma.adaptiveConfigVersion.create({
      data: {
        version: candidateVersion,
        status: "candidate",
        parentVersion,
        changeReason: `Daily learning cycle ${reportDate.toISOString().slice(0, 10)} — ${materialRecs.length} weight adjustments proposed.`,
        weightsJson: JSON.stringify(proposedWeights),
        thresholdsJson: activeConfig?.thresholdsJson ?? "{}",
        symbolModifiersJson: activeConfig?.symbolModifiersJson ?? "{}",
        timeframeModifiersJson: activeConfig?.timeframeModifiersJson ?? "{}",
        sessionModifiersJson: activeConfig?.sessionModifiersJson ?? "{}",
        freshnessRulesJson: activeConfig?.freshnessRulesJson ?? "{}",
        stalenessRulesJson: activeConfig?.stalenessRulesJson ?? "{}",
        eventRiskRulesJson: activeConfig?.eventRiskRulesJson ?? "{}",
        notes: `Generated by learning engine. Recommendations: ${JSON.stringify(materialRecs)}`,
      },
    });
  }

  return {
    reportDate,
    window: { from, to },
    totalLogged,
    totalLabeled,
    overallWinRate,
    byStrategy,
    bySymbol,
    bySession,
    byGrade,
    featureImportance,
    recommendations,
  };
}
