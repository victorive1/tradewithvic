// GET /api/mini/signals/:id/smart-exit — open smart-exit alerts for a
// signal. UI cards in entry_active/in_trade use this to render warnings.

import { NextRequest, NextResponse } from "next/server";
import { getOpenSmartExitAlerts } from "@/lib/mini/smart-exit";

export const dynamic = "force-dynamic";

interface RouteCtx { params: Promise<{ id: string }>; }

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  try {
    const alerts = await getOpenSmartExitAlerts(id);
    return NextResponse.json(
      {
        alerts: alerts.map((a) => ({
          id: a.id,
          alertType: a.alertType,
          severity: a.severity,
          evidence: a.evidence,
          raisedAt: a.raisedAt.toISOString(),
        })),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    return NextResponse.json(
      { alerts: [], error: err instanceof Error ? err.message : "smart_exit_failed" },
      { status: 500 },
    );
  }
}
