import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Calendar page feed — upcoming FundamentalEvents in a 48h window plus
// the most recent EventRiskSnapshot rows so the page can render the
// "risk meter" off live data instead of hardcoded counts.
export async function GET(req: NextRequest) {
  const hoursParam = Number(req.nextUrl.searchParams.get("hours") ?? 48);
  const hours = Math.min(168, Math.max(6, hoursParam));
  const now = new Date();
  const windowEnd = new Date(now.getTime() + hours * 3600_000);

  const [events, riskSnapshots] = await Promise.all([
    prisma.fundamentalEvent.findMany({
      where: { eventTime: { gte: now, lt: windowEnd } },
      orderBy: { eventTime: "asc" },
      take: 100,
    }),
    prisma.eventRiskSnapshot.findMany({
      orderBy: { computedAt: "desc" },
      take: 50,
    }),
  ]);

  const counts = {
    high: events.filter((e) => e.impact === "high").length,
    medium: events.filter((e) => e.impact === "medium").length,
    low: events.filter((e) => e.impact === "low").length,
  };

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      eventTime: e.eventTime.toISOString(),
      country: e.country,
      eventName: e.eventName,
      impact: e.impact,
      forecast: e.forecast,
      previous: e.previous,
      actual: e.actual,
      affectedSymbols: safeParseJSONArray(e.affectedSymbolsJson),
      affectedCurrencies: safeParseJSONArray(e.affectedCurrenciesJson),
      source: e.source,
    })),
    riskSnapshots: riskSnapshots.map((r) => ({
      symbol: r.symbol,
      riskLevel: r.riskLevel,
      nearestEventName: r.nearestEventName,
      nearestEventImpact: r.nearestEventImpact,
      minutesToEvent: r.minutesToEvent,
    })),
    counts,
    generatedAt: now.toISOString(),
  });
}

function safeParseJSONArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
