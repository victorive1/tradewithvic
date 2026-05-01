// GET /api/mini/signals — returns Mini signals filterable by status,
// template, symbol, and grade. Used by the Intraday Prediction tab.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function csv(v: string | null): string[] | null {
  if (!v || v === "all") return null;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

const ACTIVE_STATUSES = ["scanning", "forming", "waiting_for_entry", "entry_active", "in_trade"];

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const status = csv(sp.get("status")) ?? ACTIVE_STATUSES;
    const template = csv(sp.get("template"));
    const symbol = csv(sp.get("symbol"));
    const grade = csv(sp.get("grade"));
    const take = Math.min(200, parseInt(sp.get("take") ?? "100", 10));

    const where: Record<string, unknown> = {
      status: { in: status },
      ...(template ? { template: { in: template } } : {}),
      ...(symbol   ? { symbol:   { in: symbol   } } : {}),
      ...(grade    ? { grade:    { in: grade    } } : {}),
    };

    const [rows, distinctTemplates, distinctSymbols, distinctGrades] = await Promise.all([
      prisma.miniSignal.findMany({
        where,
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        take,
        include: {
          instrument: { select: { displayName: true, decimalPlaces: true, category: true } },
          scores: true,
        },
      }),
      prisma.miniSignal.findMany({ where: { status: { in: ACTIVE_STATUSES } }, distinct: ["template"], select: { template: true } }),
      prisma.miniSignal.findMany({ where: { status: { in: ACTIVE_STATUSES } }, distinct: ["symbol"  ], select: { symbol:   true } }),
      prisma.miniSignal.findMany({ where: { status: { in: ACTIVE_STATUSES } }, distinct: ["grade"   ], select: { grade:    true } }),
    ]);

    // ── API-side dedup safety net ────────────────────────────────────
    // Even with the per-cycle dedup in scan.ts, historical duplicates
    // can exist in the table (e.g. from before the fix shipped). Bucket
    // alive rows by (symbol, template, direction, entry-±0.2%) and
    // keep the most-recent highest-scoring survivor in each bucket.
    const dedupKey = (r: typeof rows[number]) => {
      const entryMid = (r.entryZoneLow + r.entryZoneHigh) / 2;
      const bucket = Math.round(entryMid / Math.max(entryMid * 0.002, 1e-9));
      return `${r.symbol}|${r.template}|${r.direction}|${r.entryTimeframe}|${bucket}`;
    };
    const buckets = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = dedupKey(r);
      const arr = buckets.get(k) ?? [];
      arr.push(r);
      buckets.set(k, arr);
    }
    const dedupedRows: typeof rows = [];
    for (const arr of buckets.values()) {
      arr.sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
      dedupedRows.push(arr[0]);
    }
    dedupedRows.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return NextResponse.json(
      {
        signals: dedupedRows.map((r) => {
          let metadata: unknown = null;
          if (r.metadataJson) {
            try { metadata = JSON.parse(r.metadataJson); } catch { /* malformed */ }
          }
          return {
            id: r.id,
            symbol: r.symbol,
            displayName: r.instrument?.displayName ?? r.symbol,
            decimalPlaces: r.instrument?.decimalPlaces ?? 5,
            category: r.instrument?.category ?? "forex",
            template: r.template,
            direction: r.direction,
            biasTimeframe: r.biasTimeframe,
            entryTimeframe: r.entryTimeframe,
            speedClass: r.speedClass,
            entryZoneLow: r.entryZoneLow,
            entryZoneHigh: r.entryZoneHigh,
            stopLoss: r.stopLoss,
            takeProfit1: r.takeProfit1,
            takeProfit2: r.takeProfit2,
            takeProfit3: r.takeProfit3,
            entryType: r.entryType,
            score: r.score,
            grade: r.grade,
            biasState: r.biasState,
            session: r.session,
            expectedHoldMinutes: r.expectedHoldMinutes,
            riskReward: r.riskReward,
            explanation: r.explanation,
            invalidation: r.invalidation,
            status: r.status,
            expiresAt: r.expiresAt.toISOString(),
            createdAt: r.createdAt.toISOString(),
            scoreBreakdown: r.scores ? {
              biasAlignment: r.scores.biasAlignment,
              liquidityEvent: r.scores.liquidityEvent,
              microStructure: r.scores.microStructure,
              entryZoneQuality: r.scores.entryZoneQuality,
              momentumDisplacement: r.scores.momentumDisplacement,
              volatilitySpread: r.scores.volatilitySpread,
              riskReward: r.scores.riskReward,
              sessionTiming: r.scores.sessionTiming,
              total: r.scores.total,
            } : null,
            metadata,
          };
        }),
        facets: {
          templates: distinctTemplates.map((r) => r.template).sort(),
          symbols:   distinctSymbols.map((r) => r.symbol).sort(),
          grades:    distinctGrades.map((r) => r.grade).sort(gradeSort),
        },
        timestamp: Date.now(),
        count: dedupedRows.length,
        rawCount: rows.length,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    return NextResponse.json(
      { signals: [], facets: { templates: [], symbols: [], grades: [] }, error: err instanceof Error ? err.message : "mini_signals_failed", timestamp: Date.now() },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}

function gradeSort(a: string, b: string): number {
  const order = ["A+", "A", "watchlist", "no_trade"];
  return order.indexOf(a) - order.indexOf(b);
}
