import { prisma } from "@/lib/prisma";

export interface ThesisAssessment {
  positionId: string;
  previousScore: number;
  newScore: number;
  previousState: string;
  newState: string;
  signals: string[];
  changed: boolean;
}

function stateFromScore(score: number): "strong" | "weakening" | "damaged" | "invalidated" {
  if (score >= 85) return "strong";
  if (score >= 70) return "weakening";
  if (score >= 55) return "damaged";
  return "invalidated";
}

export async function reassessThesis(position: any): Promise<ThesisAssessment> {
  const [indicator, structure, recentStructureEvents, recentSweeps, sentiment, eventRisk] = await Promise.all([
    prisma.indicatorSnapshot.findUnique({ where: { symbol_timeframe: { symbol: position.symbol, timeframe: position.timeframe } } }),
    prisma.structureState.findUnique({ where: { symbol_timeframe: { symbol: position.symbol, timeframe: position.timeframe } } }),
    prisma.structureEvent.findMany({
      where: { symbol: position.symbol, timeframe: position.timeframe, detectedAt: { gte: position.openedAt } },
      orderBy: { detectedAt: "desc" },
      take: 5,
    }),
    prisma.liquidityEvent.findMany({
      where: { symbol: position.symbol, timeframe: position.timeframe, detectedAt: { gte: position.openedAt } },
      orderBy: { detectedAt: "desc" },
      take: 5,
    }),
    prisma.sentimentSnapshot.findFirst({ orderBy: { computedAt: "desc" } }),
    prisma.eventRiskSnapshot.findUnique({ where: { symbol: position.symbol } }),
  ]);

  const isBull = position.direction === "bullish";
  const signals: string[] = [];
  let score = 100;

  // Opposing structure event after entry
  const opposingStructEvent = recentStructureEvents.find((e: any) => {
    return (isBull && (e.eventType === "choch_bearish" || e.eventType === "bos_bearish")) ||
           (!isBull && (e.eventType === "choch_bullish" || e.eventType === "bos_bullish"));
  });
  if (opposingStructEvent) {
    const penalty = opposingStructEvent.eventType.startsWith("choch") ? 30 : 20;
    score -= penalty;
    signals.push(`${opposingStructEvent.eventType} after entry (-${penalty})`);
  }

  // Structure bias flipped opposing
  if (structure) {
    if ((isBull && structure.bias === "bearish") || (!isBull && structure.bias === "bullish")) {
      score -= 20;
      signals.push(`Structure bias flipped to ${structure.bias} (-20)`);
    } else if (structure.bias === "range" && (indicator?.trendBias === (isBull ? "bearish" : "bullish"))) {
      score -= 10;
      signals.push(`Structure ranging with indicator opposing (-10)`);
    }
  }

  // Indicator trend bias opposing
  if (indicator) {
    if ((isBull && indicator.trendBias === "bearish") || (!isBull && indicator.trendBias === "bullish")) {
      score -= 15;
      signals.push(`Indicator trend flipped to ${indicator.trendBias} (-15)`);
    }
    // Momentum fade
    if ((isBull && indicator.momentum === "down") || (!isBull && indicator.momentum === "up")) {
      score -= 10;
      signals.push(`Momentum ${indicator.momentum} opposing trade direction (-10)`);
    }
    // RSI extreme in wrong direction
    const rsi = indicator.rsi14;
    if (rsi !== null && rsi !== undefined) {
      if (isBull && rsi < 30) { score -= 10; signals.push(`RSI ${rsi.toFixed(0)} deeply oversold on long (-10)`); }
      if (!isBull && rsi > 70) { score -= 10; signals.push(`RSI ${rsi.toFixed(0)} deeply overbought on short (-10)`); }
    }
  }

  // Opposing liquidity sweep after entry (a sweep in the opposite side suggests move against)
  const opposingSweep = recentSweeps.find((sw: any) => {
    return (isBull && sw.sweepDirection === "bearish_sweep") || (!isBull && sw.sweepDirection === "bullish_sweep");
  });
  if (opposingSweep) {
    score -= 12;
    signals.push(`${opposingSweep.sweepDirection} of ${opposingSweep.levelType} post-entry (-12)`);
  }

  // Sentiment opposing
  if (sentiment) {
    if ((isBull && sentiment.riskTone === "risk_off") || (!isBull && sentiment.riskTone === "risk_on")) {
      score -= 10;
      signals.push(`Sentiment ${sentiment.riskTone} opposing (-10)`);
    }
  }

  // High event risk is a material threat
  if (eventRisk?.riskLevel === "high") {
    score -= 15;
    signals.push(`High event risk imminent (-15)`);
  }

  score = Math.max(0, Math.min(100, score));
  const newState = stateFromScore(score);
  const changed = position.thesisScore !== score || position.thesisState !== newState;

  if (changed) {
    await prisma.executionPosition.update({
      where: { id: position.id },
      data: {
        thesisScore: score,
        thesisState: newState,
        lastThesisCheckAt: new Date(),
      },
    });
    if (position.thesisState !== newState) {
      await prisma.executionEvent.create({
        data: {
          positionId: position.id,
          eventType: "thesis_change",
          fromValue: position.thesisState,
          toValue: newState,
          reason: signals.join(" · ") || "No adverse signals — thesis intact",
          metadataJson: JSON.stringify({ signals, previousScore: position.thesisScore, newScore: score }),
        },
      });
    }
  }

  return {
    positionId: position.id,
    previousScore: position.thesisScore,
    newScore: score,
    previousState: position.thesisState,
    newState,
    signals,
    changed,
  };
}

export async function reassessAllOpenPositions(): Promise<{ assessed: number; invalidated: number; damaged: number; weakening: number }> {
  const positions = await prisma.executionPosition.findMany({ where: { status: "open" } });
  let invalidated = 0, damaged = 0, weakening = 0;
  for (const p of positions) {
    const r = await reassessThesis(p);
    if (r.newState === "invalidated") invalidated++;
    else if (r.newState === "damaged") damaged++;
    else if (r.newState === "weakening") weakening++;
  }
  return { assessed: positions.length, invalidated, damaged, weakening };
}
