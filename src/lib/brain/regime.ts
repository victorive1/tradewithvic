import { prisma } from "@/lib/prisma";

export interface RegimeResult {
  symbol: string;
  timeframe: string;
  structureRegime: string;
  volatilityRegime: string;
  trendStrength: string;
  directionalBias: string;
  unstable: boolean;
}

/**
 * Classifies regime for one symbol/timeframe using the IndicatorSnapshot +
 * StructureState already persisted by Layers 1.1 and prior structure engine.
 * Pure read then upsert — no external API calls.
 */
export async function classifyRegime(symbol: string, timeframe: string): Promise<RegimeResult | null> {
  const [indicator, structure, recentEvent, eventRisk] = await Promise.all([
    prisma.indicatorSnapshot.findUnique({ where: { symbol_timeframe: { symbol, timeframe } } }),
    prisma.structureState.findUnique({ where: { symbol_timeframe: { symbol, timeframe } } }),
    prisma.structureEvent.findFirst({
      where: { symbol, timeframe, detectedAt: { gte: new Date(Date.now() - 4 * 3600_000) } },
      orderBy: { detectedAt: "desc" },
    }),
    prisma.eventRiskSnapshot.findUnique({ where: { symbol } }),
  ]);

  if (!indicator) return null;

  const atrPct = indicator.atrPercent ?? 0;
  const bbWidth = indicator.bbWidth ?? 0;

  let volatilityRegime: string;
  if (atrPct >= 2.5) volatilityRegime = "spike";
  else if (atrPct >= 1.0) volatilityRegime = "high";
  else if (atrPct >= 0.1) volatilityRegime = "normal";
  else volatilityRegime = "low";

  let structureRegime: string;
  const hasTrend = indicator.trendBias !== "neutral";
  const hasEvent = !!recentEvent;
  if (bbWidth < 0.003) structureRegime = "compression";
  else if (bbWidth > 0.02) structureRegime = "expansion";
  else if (hasTrend && hasEvent) structureRegime = "transitioning";
  else if (hasTrend) structureRegime = "trending";
  else structureRegime = "ranging";

  let trendStrength: string = "none";
  if (indicator.trendBias !== "neutral") {
    const momentumAligned = indicator.momentum === (indicator.trendBias === "bullish" ? "up" : "down");
    const rsi = indicator.rsi14 ?? 50;
    const rsiAligned = indicator.trendBias === "bullish" ? rsi > 52 : rsi < 48;
    const emaStack = indicator.ema20 !== null && indicator.ema50 !== null &&
      (indicator.trendBias === "bullish" ? indicator.ema20 > indicator.ema50 : indicator.ema20 < indicator.ema50);
    const score = [momentumAligned, rsiAligned, emaStack].filter(Boolean).length;
    trendStrength = score >= 3 ? "strong" : score === 2 ? "moderate" : "weak";
  }

  const unstableReasons: string[] = [];
  if (eventRisk?.riskLevel === "high") unstableReasons.push("high_event_risk");
  if (volatilityRegime === "spike") unstableReasons.push("volatility_spike");
  if (structureRegime === "transitioning") unstableReasons.push("structure_transition");
  const unstable = unstableReasons.length > 0;

  const directionalBias = indicator.trendBias;

  await prisma.regimeSnapshot.upsert({
    where: { symbol_timeframe: { symbol, timeframe } },
    create: {
      symbol, timeframe,
      structureRegime, volatilityRegime, trendStrength, directionalBias,
      bbWidth, atrPercent: atrPct, unstable,
      unstableReasons: JSON.stringify(unstableReasons),
    },
    update: {
      structureRegime, volatilityRegime, trendStrength, directionalBias,
      bbWidth, atrPercent: atrPct, unstable,
      unstableReasons: JSON.stringify(unstableReasons),
      computedAt: new Date(),
    },
  });

  return { symbol, timeframe, structureRegime, volatilityRegime, trendStrength, directionalBias, unstable };
}

export async function classifyAllRegimes(
  symbols: readonly string[],
  timeframes: readonly string[]
): Promise<{ results: RegimeResult[]; unstableCount: number }> {
  const pairs: Array<[string, string]> = [];
  for (const s of symbols) for (const tf of timeframes) pairs.push([s, tf]);
  const settled = await Promise.all(pairs.map(([s, tf]) => classifyRegime(s, tf)));
  const results: RegimeResult[] = [];
  let unstable = 0;
  for (const r of settled) {
    if (!r) continue;
    results.push(r);
    if (r.unstable) unstable++;
  }
  return { results, unstableCount: unstable };
}

/**
 * Macro regime: takes latest sentiment + regime snapshots to compose a top-level
 * environment tag. Called once per cycle after per-symbol classification.
 */
export async function captureMacroRegime(): Promise<{ tone: string; stability: string }> {
  const [sentiment, regimes] = await Promise.all([
    prisma.sentimentSnapshot.findFirst({ orderBy: { computedAt: "desc" } }),
    prisma.regimeSnapshot.findMany(),
  ]);

  const reasons: string[] = [];
  const macroTone = sentiment?.riskTone ?? "neutral";
  if (sentiment) reasons.push(`sentiment=${sentiment.riskTone} (${sentiment.riskScore})`);

  const unstableShare = regimes.length > 0 ? regimes.filter((r: any) => r.unstable).length / regimes.length : 0;
  const macroStability = unstableShare > 0.5 ? "unstable" : "stable";
  if (unstableShare > 0) reasons.push(`${Math.round(unstableShare * 100)}% of instruments flagged unstable`);

  const usdRegime = sentiment?.usdBias ?? "neutral";
  const dominantTheme = (() => {
    const spikes = regimes.filter((r: any) => r.volatilityRegime === "spike").length;
    if (spikes > 0) return "volatility_spike";
    const trending = regimes.filter((r: any) => r.structureRegime === "trending").length;
    if (trending > regimes.length / 2) return "trending_environment";
    const ranging = regimes.filter((r: any) => r.structureRegime === "ranging").length;
    if (ranging > regimes.length / 2) return "ranging_environment";
    return null;
  })();

  await prisma.macroRegimeSnapshot.create({
    data: {
      macroTone,
      macroStability,
      usdRegime,
      yieldPressure: "unknown", // would come from bonds/yields feed
      dominantTheme: dominantTheme ?? undefined,
      reasoning: reasons.join(" · "),
      reasoningJson: JSON.stringify(reasons),
    },
  });

  return { tone: macroTone, stability: macroStability };
}
