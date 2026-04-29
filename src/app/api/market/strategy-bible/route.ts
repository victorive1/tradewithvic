// Strategy Bible — unified view over every brain-detected TradeSetup row,
// filterable by strategy / timeframe / grade. Pulls directly from the
// brain's TradeSetup table — no external API hits, no per-strategy
// HTTP calls. Whatever detectors the brain runs, they automatically
// appear here.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseCsv(value: string | null): string[] | "all" {
  if (!value) return "all";
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "all") return "all";
  return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const strategy = parseCsv(url.searchParams.get("strategy"));
    const timeframe = parseCsv(url.searchParams.get("timeframe"));
    const grade = parseCsv(url.searchParams.get("grade"));

    // 24h window — live, not historical archive.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Build the WHERE filter. Each "all" passes through.
    const where: Record<string, unknown> = {
      status: "active",
      createdAt: { gte: since },
    };
    if (Array.isArray(strategy)) where.setupType = { in: strategy };
    if (Array.isArray(timeframe)) where.timeframe = { in: timeframe };
    if (Array.isArray(grade)) where.qualityGrade = { in: grade };

    // Fetch rows + the distinct facets (so the UI can build filter chips
    // from what's actually live, not a hardcoded whitelist). Both
    // queries run in parallel.
    const [rows, distinctStrategies, distinctTimeframes, distinctGrades] = await Promise.all([
      prisma.tradeSetup.findMany({
        where,
        orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
        take: 200,
        include: {
          instrument: { select: { displayName: true, category: true, decimalPlaces: true } },
        },
      }),
      // Distinct facets are computed against the SAME 24h window with
      // status=active so the chip list reflects what the user could
      // actually click into, not stale strategy types.
      prisma.tradeSetup.findMany({
        where: { status: "active", createdAt: { gte: since } },
        distinct: ["setupType"],
        select: { setupType: true },
      }),
      prisma.tradeSetup.findMany({
        where: { status: "active", createdAt: { gte: since } },
        distinct: ["timeframe"],
        select: { timeframe: true },
      }),
      prisma.tradeSetup.findMany({
        where: { status: "active", createdAt: { gte: since } },
        distinct: ["qualityGrade"],
        select: { qualityGrade: true },
      }),
    ]);

    return NextResponse.json(
      {
        signals: rows.map((r) => {
          let metadata: unknown = null;
          if (r.metadataJson) {
            try { metadata = JSON.parse(r.metadataJson); }
            catch { /* malformed metadata — fall through */ }
          }
          return {
            id: r.id,
            symbol: r.symbol,
            displayName: r.instrument?.displayName ?? r.symbol,
            category: r.instrument?.category ?? "forex",
            decimalPlaces: r.instrument?.decimalPlaces ?? 5,
            timeframe: r.timeframe,
            direction: r.direction,
            setupType: r.setupType,
            entry: r.entry,
            stopLoss: r.stopLoss,
            takeProfit1: r.takeProfit1,
            takeProfit2: r.takeProfit2,
            takeProfit3: r.takeProfit3,
            riskReward: r.riskReward,
            confidenceScore: r.confidenceScore,
            qualityGrade: r.qualityGrade,
            explanation: r.explanation,
            invalidation: r.invalidation,
            validUntil: r.validUntil?.toISOString() ?? null,
            createdAt: r.createdAt.toISOString(),
            metadata,
          };
        }),
        facets: {
          strategies: distinctStrategies.map((r) => r.setupType).sort(),
          timeframes: distinctTimeframes.map((r) => r.timeframe).sort(timeframeSort),
          grades: distinctGrades.map((r) => r.qualityGrade).sort(gradeSort),
        },
        timestamp: Date.now(),
        count: rows.length,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "strategy_bible_failed";
    return NextResponse.json(
      { signals: [], facets: { strategies: [], timeframes: [], grades: [] }, timestamp: Date.now(), error: msg },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}

// Order timeframes shortest → longest for chip display.
function timeframeSort(a: string, b: string): number {
  const order = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
  return order.indexOf(a) - order.indexOf(b);
}
// A+ first, then A, B, C, D.
function gradeSort(a: string, b: string): number {
  const order = ["A+", "A", "B", "C", "D"];
  return order.indexOf(a) - order.indexOf(b);
}
