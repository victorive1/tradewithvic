import { prisma } from "@/lib/prisma";

export interface ConfluenceBreakdown {
  trendAlignment: number;      // 0-15
  structureQuality: number;    // 0-20
  liquidityBehavior: number;   // 0-15
  strategyPattern: number;     // 0-15
  indicatorConfluence: number; // 0-10
  volatilityQuality: number;   // 0-5
  spreadQuality: number;       // 0-5
  sessionQuality: number;      // 0-5
  sentimentAlignment: number;  // 0-5
  fundamentalSafety: number;   // 0-5
}

export interface ConfluenceResult {
  setupId: string;
  rulesScore: number;
  visibleGrade: string; // A+ | A | B | candidate | watch | ignore
  breakdown: ConfluenceBreakdown;
  confluences: string[];
  conflicts: string[];
  disqualifiers: string[];
  status: "active" | "ignored";
  decisionLogId: string | null;
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 65) return "candidate";
  if (score >= 50) return "watch";
  return "ignore";
}

function sessionForTimeUtc(d: Date, symbol: string): string {
  const h = d.getUTCHours();
  const day = d.getUTCDay(); // 0=Sun, 6=Sat
  if (symbol.startsWith("BTC") || symbol.startsWith("ETH")) return "crypto_24_7";
  if (day === 6 || day === 0) return "closed";
  if (h >= 0 && h < 7) return "asia";
  if (h >= 7 && h < 12) return "london";
  if (h >= 12 && h < 16) return "overlap";
  if (h >= 16 && h < 21) return "ny";
  return "after_hours";
}

/**
 * Scores one setup against the 10-dimensional confluence framework + the
 * existing Layer 1 detections already in the DB.
 */
export async function scoreSetupConfluence(
  setup: any,
  ctx: {
    structure: any | null;
    indicators: any | null;
    recentSweeps: any[];
    recentStructureEvents: any[];
    sentiment: any | null;
    eventRisk: any | null;
  }
): Promise<ConfluenceResult> {
  const confluences: string[] = [];
  const conflicts: string[] = [];
  const disqualifiers: string[] = [];
  const breakdown: ConfluenceBreakdown = {
    trendAlignment: 0,
    structureQuality: 0,
    liquidityBehavior: 0,
    strategyPattern: 0,
    indicatorConfluence: 0,
    volatilityQuality: 0,
    spreadQuality: 3, // default — no per-quote spread data yet
    sessionQuality: 0,
    sentimentAlignment: 0,
    fundamentalSafety: 5,
  };

  const isBull = setup.direction === "bullish";

  // 1. Trend alignment (0-15)
  const indTrend = ctx.indicators?.trendBias;
  const structBias = ctx.structure?.bias;
  if (indTrend === setup.direction && structBias === setup.direction) {
    breakdown.trendAlignment = 15;
    confluences.push(`Indicator trend + structure bias both ${setup.direction}`);
  } else if (indTrend === setup.direction || structBias === setup.direction) {
    breakdown.trendAlignment = 9;
    confluences.push(`Partial trend alignment (${indTrend === setup.direction ? "indicator" : "structure"} with setup)`);
  } else if (indTrend && structBias && (indTrend === "neutral" || structBias === "range")) {
    breakdown.trendAlignment = 5;
  } else {
    breakdown.trendAlignment = 2;
    if (indTrend && indTrend !== setup.direction && indTrend !== "neutral") {
      conflicts.push(`Indicator trend (${indTrend}) opposes setup direction`);
    }
  }

  // 2. Structure quality (0-20)
  if (ctx.structure) {
    const s = ctx.structure;
    const swingsDefined = s.lastSwingHigh && s.lastSwingLow && s.priorSwingHigh && s.priorSwingLow;
    if (s.bias === setup.direction && swingsDefined) {
      breakdown.structureQuality = 16;
      confluences.push(`Clean ${s.bias} structure with HH/HL (or LH/LL) confirmation`);
    } else if (s.bias === setup.direction) {
      breakdown.structureQuality = 12;
    } else if (s.bias === "range" && swingsDefined) {
      breakdown.structureQuality = 8;
    } else {
      breakdown.structureQuality = 4;
    }

    // Recent structure event in setup direction = bonus
    const matchingEvent = ctx.recentStructureEvents.find((e) =>
      e.symbol === setup.symbol && e.timeframe === setup.timeframe &&
      e.eventType.endsWith(setup.direction) &&
      (Date.now() - e.detectedAt.getTime()) < 6 * 3600_000
    );
    if (matchingEvent) {
      breakdown.structureQuality = Math.min(20, breakdown.structureQuality + 4);
      confluences.push(`Recent ${matchingEvent.eventType} confirms structure`);
    }
  }

  // 3. Liquidity behavior (0-15)
  const relevantSweep = ctx.recentSweeps.find((sw) =>
    sw.symbol === setup.symbol && sw.timeframe === setup.timeframe &&
    ((isBull && sw.sweepDirection === "bullish_sweep") ||
      (!isBull && sw.sweepDirection === "bearish_sweep")) &&
    (Date.now() - sw.detectedAt.getTime()) < 6 * 3600_000
  );
  if (relevantSweep) {
    breakdown.liquidityBehavior = 12 + Math.round(Math.min(3, relevantSweep.reversalStrength * 3));
    confluences.push(`Recent ${relevantSweep.sweepDirection} of ${relevantSweep.levelType} at ${relevantSweep.levelPrice.toFixed(4)}`);
  } else if (setup.setupType === "breakout" || setup.setupType === "trend_pullback") {
    breakdown.liquidityBehavior = 5;
  } else {
    breakdown.liquidityBehavior = 3;
  }

  // 4. Strategy pattern match (0-15)
  const intrinsicByType: Record<string, number> = {
    sweep_reversal: 13,
    breakout: 10,
    trend_pullback: 11,
  };
  breakdown.strategyPattern = intrinsicByType[setup.setupType] ?? 7;

  // 5. Indicator confluence (0-10)
  let indPoints = 0;
  if (ctx.indicators) {
    if (ctx.indicators.momentum === (isBull ? "up" : "down")) {
      indPoints += 4;
      confluences.push(`MACD momentum ${ctx.indicators.momentum}`);
    }
    const rsi = ctx.indicators.rsi14;
    if (rsi !== null && rsi !== undefined) {
      if (isBull && rsi >= 45 && rsi <= 65) indPoints += 3;
      else if (!isBull && rsi >= 35 && rsi <= 55) indPoints += 3;
      else if (isBull && rsi > 72) { indPoints -= 2; conflicts.push(`RSI overbought (${rsi.toFixed(0)}) for long setup`); }
      else if (!isBull && rsi < 28) { indPoints -= 2; conflicts.push(`RSI oversold (${rsi.toFixed(0)}) for short setup`); }
    }
    const bb = ctx.indicators.bbPercentB;
    if (bb !== null && bb !== undefined) {
      if (isBull && bb > 0.2 && bb < 0.8) indPoints += 3;
      else if (!isBull && bb > 0.2 && bb < 0.8) indPoints += 3;
    }
  }
  breakdown.indicatorConfluence = Math.max(0, Math.min(10, indPoints));

  // 6. Volatility quality (0-5)
  const atrPct = ctx.indicators?.atrPercent;
  if (atrPct !== null && atrPct !== undefined) {
    if (atrPct < 0.05) { breakdown.volatilityQuality = 1; conflicts.push(`ATR % too low (${atrPct.toFixed(3)}) — dead market`); }
    else if (atrPct > 3) { breakdown.volatilityQuality = 2; conflicts.push(`ATR % too high (${atrPct.toFixed(2)}) — whippy`); }
    else breakdown.volatilityQuality = 5;
  } else {
    breakdown.volatilityQuality = 3;
  }

  // 8. Session quality (0-5)
  const session = sessionForTimeUtc(new Date(), setup.symbol);
  if (session === "overlap" || session === "ny" || session === "crypto_24_7") breakdown.sessionQuality = 5;
  else if (session === "london" || session === "asia") breakdown.sessionQuality = 4;
  else if (session === "after_hours") breakdown.sessionQuality = 2;
  else if (session === "closed") { breakdown.sessionQuality = 0; conflicts.push("Instrument market closed"); }

  // 9. Sentiment alignment (0-5)
  if (ctx.sentiment) {
    const tone = ctx.sentiment.riskTone;
    if ((isBull && tone === "risk_on") || (!isBull && tone === "risk_off")) {
      breakdown.sentimentAlignment = 5;
      confluences.push(`Sentiment ${tone} aligns with setup`);
    } else if (tone === "neutral") {
      breakdown.sentimentAlignment = 3;
    } else {
      breakdown.sentimentAlignment = 1;
      conflicts.push(`Sentiment ${tone} opposes setup`);
    }
  } else {
    breakdown.sentimentAlignment = 2;
  }

  // 10. Fundamental safety (0-5)
  if (ctx.eventRisk) {
    const level = ctx.eventRisk.riskLevel;
    if (level === "high") {
      breakdown.fundamentalSafety = 0;
      disqualifiers.push(`High-impact event in ${ctx.eventRisk.minutesToEvent}m (${ctx.eventRisk.nearestEventName})`);
    } else if (level === "medium") {
      breakdown.fundamentalSafety = 2;
      conflicts.push(`Medium event risk — ${ctx.eventRisk.nearestEventName}`);
    } else if (level === "low") {
      breakdown.fundamentalSafety = 4;
    } else {
      breakdown.fundamentalSafety = 5;
    }
  }

  // Hard disqualifiers
  if (setup.riskReward < 1.0) {
    disqualifiers.push(`RR ${setup.riskReward.toFixed(2)} below 1.0`);
  }

  const rulesScore =
    breakdown.trendAlignment +
    breakdown.structureQuality +
    breakdown.liquidityBehavior +
    breakdown.strategyPattern +
    breakdown.indicatorConfluence +
    breakdown.volatilityQuality +
    breakdown.spreadQuality +
    breakdown.sessionQuality +
    breakdown.sentimentAlignment +
    breakdown.fundamentalSafety;

  const effectiveScore = disqualifiers.length > 0 ? Math.min(rulesScore, 40) : rulesScore;
  const visibleGrade = gradeFromScore(effectiveScore);
  const status: "active" | "ignored" = disqualifiers.length > 0 || effectiveScore < 50 ? "ignored" : "active";

  const decisionLog = await prisma.setupDecisionLog.create({
    data: {
      setupId: setup.id,
      symbol: setup.symbol,
      timeframe: setup.timeframe,
      session,
      marketRegime: ctx.structure?.bias ?? "unknown",
      rulesEngineVersion: "brain-v1",
      direction: setup.direction,
      setupType: setup.setupType,
      rulesScore: effectiveScore,
      qualityLabel: visibleGrade,
      entry: setup.entry,
      stopLoss: setup.stopLoss,
      takeProfit1: setup.takeProfit1,
      takeProfit2: setup.takeProfit2 ?? undefined,
      takeProfit3: setup.takeProfit3 ?? undefined,
      structureScore: breakdown.structureQuality,
      momentumScore: breakdown.indicatorConfluence,
      entryLocationScore: breakdown.liquidityBehavior,
      rrScore: Math.min(10, setup.riskReward * 2),
      volatilityScore: breakdown.volatilityQuality,
      eventRiskScore: breakdown.fundamentalSafety,
      alignmentScore: breakdown.trendAlignment,
      featureVectorJson: JSON.stringify(breakdown),
      reasoningJson: JSON.stringify({
        confluences, conflicts, disqualifiers,
      }),
      invalidationRulesJson: JSON.stringify(setup.invalidation ? [setup.invalidation] : []),
      marketContextJson: JSON.stringify({
        trendBias: indTrend,
        structureBias: structBias,
        sentimentTone: ctx.sentiment?.riskTone,
        eventRiskLevel: ctx.eventRisk?.riskLevel,
        session,
      }),
    },
  });

  await prisma.tradeSetup.update({
    where: { id: setup.id },
    data: {
      confidenceScore: Math.round(effectiveScore),
      qualityGrade: visibleGrade,
      status: status === "ignored" ? "expired" : setup.status,
      explanation: setup.explanation + ` Confluences: ${confluences.slice(0, 3).join("; ")}.` +
        (conflicts.length ? ` Conflicts: ${conflicts.slice(0, 2).join("; ")}.` : "") +
        (disqualifiers.length ? ` DISQUALIFIED: ${disqualifiers.join("; ")}.` : ""),
    },
  });

  return {
    setupId: setup.id,
    rulesScore: effectiveScore,
    visibleGrade,
    breakdown,
    confluences, conflicts, disqualifiers,
    status,
    decisionLogId: decisionLog.id,
  };
}

export async function qualifyAllActiveSetups(): Promise<{
  scored: number;
  dropped: number;
  aPlus: number;
  a: number;
  candidate: number;
}> {
  const setups = await prisma.tradeSetup.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  if (setups.length === 0) {
    return { scored: 0, dropped: 0, aPlus: 0, a: 0, candidate: 0 };
  }

  const symbolTfs = new Set(setups.map((s: any) => `${s.symbol}:${s.timeframe}`));
  const structures = await prisma.structureState.findMany({
    where: {
      OR: Array.from(symbolTfs).map((k) => {
        const [symbol, timeframe] = k.split(":");
        return { symbol, timeframe };
      }),
    },
  });
  const indicators = await prisma.indicatorSnapshot.findMany({
    where: {
      OR: Array.from(symbolTfs).map((k) => {
        const [symbol, timeframe] = k.split(":");
        return { symbol, timeframe };
      }),
    },
  });
  const sentiment = await prisma.sentimentSnapshot.findFirst({ orderBy: { computedAt: "desc" } });
  const symbols = [...new Set(setups.map((s: any) => s.symbol))];
  const eventRisks = await prisma.eventRiskSnapshot.findMany({ where: { symbol: { in: symbols as string[] } } });
  const recentSweeps = await prisma.liquidityEvent.findMany({
    where: { detectedAt: { gte: new Date(Date.now() - 8 * 3600_000) } },
    orderBy: { detectedAt: "desc" },
  });
  const recentStructureEvents = await prisma.structureEvent.findMany({
    where: { detectedAt: { gte: new Date(Date.now() - 8 * 3600_000) } },
    orderBy: { detectedAt: "desc" },
  });

  const structureMap = new Map(structures.map((s: any) => [`${s.symbol}:${s.timeframe}`, s]));
  const indicatorMap = new Map(indicators.map((i: any) => [`${i.symbol}:${i.timeframe}`, i]));
  const eventRiskMap = new Map(eventRisks.map((e: any) => [e.symbol, e]));

  let aPlus = 0, a = 0, candidate = 0, dropped = 0;
  for (const setup of setups) {
    const key = `${setup.symbol}:${setup.timeframe}`;
    const result = await scoreSetupConfluence(setup, {
      structure: structureMap.get(key) ?? null,
      indicators: indicatorMap.get(key) ?? null,
      recentSweeps,
      recentStructureEvents,
      sentiment,
      eventRisk: eventRiskMap.get(setup.symbol) ?? null,
    });
    if (result.visibleGrade === "A+") aPlus++;
    else if (result.visibleGrade === "A") a++;
    else if (result.visibleGrade === "candidate") candidate++;
    if (result.status === "ignored") dropped++;
  }

  return { scored: setups.length, dropped, aPlus, a, candidate };
}
