// GET /api/mini/signals/:id/lifecycle — full state-transition timeline
// for a signal, used by the per-signal Analysis modal.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface RouteCtx { params: Promise<{ id: string }>; }

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  try {
    const events = await prisma.miniSignalLifecycle.findMany({
      where: { miniSignalId: id },
      orderBy: { occurredAt: "asc" },
    });
    return NextResponse.json(
      {
        events: events.map((e) => ({
          id: e.id,
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          evidence: e.evidence,
          priceAtEvent: e.priceAtEvent,
          scoreAtEvent: e.scoreAtEvent,
          occurredAt: e.occurredAt.toISOString(),
        })),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    return NextResponse.json(
      { events: [], error: err instanceof Error ? err.message : "lifecycle_failed" },
      { status: 500 },
    );
  }
}
