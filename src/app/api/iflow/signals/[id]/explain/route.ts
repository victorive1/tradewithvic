import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Per-signal deep explain — sub-scores, driver list, evidence snapshot, and
 * nearby contextual events (structure, liquidity) captured at the time of
 * the signal. Powers the /dashboard/institutional-flow/[id] detail page.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const signal = await prisma.institutionalSignal.findUnique({ where: { id } });
  if (!signal) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const since = new Date(signal.capturedAt.getTime() - 60 * 60 * 1000);
  const [structureEvents, liquidityEvents, nearbyFlow] = await Promise.all([
    prisma.structureEvent.findMany({
      where: { symbol: signal.assetSymbol, detectedAt: { gte: since } },
      orderBy: { detectedAt: "desc" },
      take: 10,
    }),
    prisma.liquidityEvent.findMany({
      where: { symbol: signal.assetSymbol, detectedAt: { gte: since } },
      orderBy: { detectedAt: "desc" },
      take: 10,
    }),
    prisma.flowEvent.findMany({
      where: { assetSymbol: signal.assetSymbol, capturedAt: { gte: since } },
      orderBy: { capturedAt: "asc" },
    }),
  ]);

  let drivers: string[] = [];
  try { drivers = JSON.parse(signal.explanationJson); } catch {}
  let evidence: any = {};
  try { evidence = JSON.parse(signal.evidenceJson); } catch {}

  return NextResponse.json({
    signal,
    drivers,
    evidence,
    context: {
      structureEvents,
      liquidityEvents,
      flowTimeline: nearbyFlow,
    },
  });
}
