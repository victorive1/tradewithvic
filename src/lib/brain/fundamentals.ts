import { prisma } from "@/lib/prisma";

/**
 * Map of instrument → the currencies whose events meaningfully move it.
 * USD affects everything USD-denominated. Gold reacts to USD + risk tone.
 */
const SYMBOL_CURRENCY_SENSITIVITY: Record<string, string[]> = {
  EURUSD: ["EUR", "USD"],
  GBPUSD: ["GBP", "USD"],
  USDJPY: ["USD", "JPY"],
  USDCHF: ["USD", "CHF"],
  AUDUSD: ["AUD", "USD"],
  NZDUSD: ["NZD", "USD"],
  USDCAD: ["USD", "CAD"],
  EURJPY: ["EUR", "JPY"],
  GBPJPY: ["GBP", "JPY"],
  EURGBP: ["EUR", "GBP"],
  AUDJPY: ["AUD", "JPY"],
  XAUUSD: ["USD"],
  XAGUSD: ["USD"],
  BTCUSD: ["USD"],
  ETHUSD: ["USD"],
};

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD", EU: "EUR", UK: "GBP", JP: "JPY", AU: "AUD",
  NZ: "NZD", CA: "CAD", CH: "CHF", DE: "EUR", FR: "EUR", IT: "EUR",
};

export interface EventRiskResult {
  symbol: string;
  riskLevel: "none" | "low" | "medium" | "high";
  nearestEvent: {
    id: string;
    name: string;
    impact: string;
    minutesAway: number;
  } | null;
}

/**
 * For each tracked symbol, find the nearest upcoming event (in a 4h window) that
 * affects its sensitive currencies, and derive a risk level.
 */
export async function analyzeEventRisk(
  symbols: readonly string[]
): Promise<{ results: EventRiskResult[]; upcomingCount: number }> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  const events = await prisma.fundamentalEvent.findMany({
    where: { eventTime: { gte: now, lt: windowEnd } },
    orderBy: { eventTime: "asc" },
  });

  const results: EventRiskResult[] = [];

  for (const symbol of symbols) {
    const sensitive = SYMBOL_CURRENCY_SENSITIVITY[symbol] ?? [];
    const matching = events.filter((e: any) => {
      const currency = COUNTRY_TO_CURRENCY[e.country] ?? e.country;
      if (sensitive.includes(currency)) return true;
      try {
        const explicit: string[] = JSON.parse(e.affectedSymbolsJson || "[]");
        if (explicit.includes(symbol)) return true;
      } catch {}
      return false;
    });

    const nearest = matching[0];
    const minutesAway = nearest
      ? Math.round((nearest.eventTime.getTime() - now.getTime()) / 60000)
      : null;

    let riskLevel: EventRiskResult["riskLevel"] = "none";
    if (nearest && minutesAway !== null) {
      if (nearest.impact === "high" && minutesAway <= 60) riskLevel = "high";
      else if (nearest.impact === "high" && minutesAway <= 240) riskLevel = "medium";
      else if (nearest.impact === "medium" && minutesAway <= 30) riskLevel = "medium";
      else if (nearest.impact === "medium" && minutesAway <= 120) riskLevel = "low";
      else if (nearest.impact === "low" && minutesAway <= 30) riskLevel = "low";
    }

    await prisma.eventRiskSnapshot.upsert({
      where: { symbol },
      create: {
        symbol,
        riskLevel,
        nearestEventId: nearest?.id ?? null,
        nearestEventName: nearest?.eventName ?? null,
        nearestEventImpact: nearest?.impact ?? null,
        minutesToEvent: minutesAway,
      },
      update: {
        riskLevel,
        nearestEventId: nearest?.id ?? null,
        nearestEventName: nearest?.eventName ?? null,
        nearestEventImpact: nearest?.impact ?? null,
        minutesToEvent: minutesAway,
        computedAt: new Date(),
      },
    });

    results.push({
      symbol,
      riskLevel,
      nearestEvent: nearest && minutesAway !== null
        ? { id: nearest.id, name: nearest.eventName, impact: nearest.impact, minutesAway }
        : null,
    });
  }

  return { results, upcomingCount: events.length };
}

/**
 * Seeds a handful of placeholder events spanning the next 48 hours so the engine
 * has data to reason over before a real feed is wired up. Idempotent — only
 * inserts if there are currently zero future events.
 */
export async function seedPlaceholderEventsIfEmpty(): Promise<number> {
  const count = await prisma.fundamentalEvent.count({
    where: { eventTime: { gte: new Date() } },
  });
  if (count > 0) return 0;

  const now = Date.now();
  const events = [
    { offsetHours: 2, country: "US", eventName: "CPI (YoY)", impact: "high", forecast: "2.8%", previous: "2.9%" },
    { offsetHours: 6, country: "UK", eventName: "BOE Interest Rate", impact: "high", forecast: "4.50%", previous: "4.50%" },
    { offsetHours: 10, country: "EU", eventName: "ECB Speech — Lagarde", impact: "medium", forecast: "—", previous: "—" },
    { offsetHours: 24, country: "US", eventName: "Non-Farm Payrolls", impact: "high", forecast: "180K", previous: "228K" },
    { offsetHours: 32, country: "AU", eventName: "Employment Change", impact: "medium", forecast: "25K", previous: "34K" },
    { offsetHours: 44, country: "CA", eventName: "Retail Sales MoM", impact: "medium", forecast: "0.3%", previous: "0.7%" },
  ];

  const result = await prisma.fundamentalEvent.createMany({
    data: events.map((e) => ({
      eventTime: new Date(now + e.offsetHours * 3600_000),
      country: e.country,
      eventName: e.eventName,
      impact: e.impact,
      forecast: e.forecast,
      previous: e.previous,
      source: "placeholder",
    })),
    skipDuplicates: true,
  });
  return result.count;
}
