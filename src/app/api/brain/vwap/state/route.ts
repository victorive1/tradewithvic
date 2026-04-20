import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Dashboard feed for the VWAP tab. Returns the latest snapshot per
 * (symbol, anchor) plus the most recent deviation events across all
 * symbols. Read-only, no auth — same posture as /api/brain/execution/state.
 */
export async function GET(_req: NextRequest) {
  try {
    const [snapshots, events] = await Promise.all([
      prisma.vwapSnapshot.findMany({
        orderBy: [{ symbol: "asc" }, { anchor: "asc" }],
        take: 200,
      }),
      prisma.vwapDeviationEvent.findMany({
        orderBy: { detectedAt: "desc" },
        take: 40,
      }),
    ]);

    return NextResponse.json({
      snapshots,
      events,
      fetchedAt: Date.now(),
    });
  } catch (err: any) {
    console.error("[brain/vwap/state] failed:", err);
    return NextResponse.json(
      {
        snapshots: [],
        events: [],
        error: err?.message ?? String(err),
        fetchedAt: Date.now(),
      },
      { status: 200 },
    );
  }
}
