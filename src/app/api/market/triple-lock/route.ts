// Triple Lock (Power of 3) signals — populated by the brain's 2-min
// scan cron via src/lib/brain/strategies/triple-lock.ts. The route
// hands the client the latest active signals + each signal's 12-gate
// breakdown (parsed out of metadataJson).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface GateBreakdown {
  id: string;
  num: number;
  engine: string;
  label: string;
  pts: number;
  passed: boolean;
  evidence: string;
  source: "direct" | "heuristic";
}

interface TripleLockMetadata {
  strategy: "triple_lock";
  tier: string;
  eps: number;
  score: number;
  maxScore: number;
  gatesPassed: number;
  gatesTotal: number;
  gates: GateBreakdown[];
}

export async function GET() {
  try {
    // 24h window — matches the FVG Inversion tab. Triple Lock signals
    // are short-lived (validHours=0.5) so most of what's returned will
    // already have status=expired beyond ~30 min — front-end filters
    // for status=active anyway.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await prisma.tradeSetup.findMany({
      where: {
        setupType: "triple_lock",
        status: "active",
        createdAt: { gte: since },
      },
      orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: {
        instrument: {
          select: { displayName: true, category: true, decimalPlaces: true },
        },
      },
    });

    return NextResponse.json(
      {
        signals: rows.map((r) => {
          let metadata: TripleLockMetadata | null = null;
          if (r.metadataJson) {
            try { metadata = JSON.parse(r.metadataJson) as TripleLockMetadata; }
            catch { /* malformed metadata — fall through with null */ }
          }
          return {
            id: r.id,
            symbol: r.symbol,
            displayName: r.instrument?.displayName ?? r.symbol,
            category: r.instrument?.category ?? "forex",
            decimalPlaces: r.instrument?.decimalPlaces ?? 5,
            timeframe: r.timeframe,
            direction: r.direction,
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
        timestamp: Date.now(),
        count: rows.length,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "triple_lock_failed";
    return NextResponse.json(
      { signals: [], timestamp: Date.now(), error: msg },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
