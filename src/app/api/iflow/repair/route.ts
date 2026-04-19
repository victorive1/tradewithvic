import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runIFlowCycle } from "@/lib/iflow/engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One-tap repair actions. Admin-gated the same way /api/iflow/refresh is.
 *
 * Body: { action: "refresh" | "invalidate_stuck" | "invalidate_all"
 *                 | "rerun_brain_scan" | "purge_stale_flow" }
 */
export async function POST(req: NextRequest) {
  const adminSecret = process.env.ADMIN_REFRESH_SECRET;
  const sent = req.headers.get("x-admin-token") ?? req.nextUrl.searchParams.get("token");
  if (adminSecret && sent !== adminSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  switch (action) {
    case "refresh": {
      const result = await runIFlowCycle();
      return NextResponse.json({ ok: true, action, ...result });
    }

    case "invalidate_stuck": {
      const cutoff = new Date(Date.now() - 2 * 60 * 60_000);
      const updated = await prisma.institutionalSignal.updateMany({
        where: { active: true, capturedAt: { lt: cutoff } },
        data: { active: false, invalidatedAt: new Date(), invalidationReason: "manual_repair_stuck" },
      });
      return NextResponse.json({ ok: true, action, invalidated: updated.count });
    }

    case "invalidate_all": {
      const updated = await prisma.institutionalSignal.updateMany({
        where: { active: true },
        data: { active: false, invalidatedAt: new Date(), invalidationReason: "manual_repair_full_reset" },
      });
      return NextResponse.json({ ok: true, action, invalidated: updated.count });
    }

    case "rerun_brain_scan": {
      // Delegate to the existing brain refresh endpoint — same entry the cron
      // uses, so whatever fixes the cron would have done, this does now.
      try {
        const { runScanCycle } = await import("@/lib/brain/scan");
        const result = await runScanCycle("repair-manual");
        return NextResponse.json({ ok: true, action, scan: result });
      } catch (err: any) {
        return NextResponse.json({
          ok: false, action, error: err?.message ?? String(err),
        }, { status: 500 });
      }
    }

    case "purge_stale_flow": {
      // Drop FlowEvent rows older than 7 days — keeps the table lean and
      // the health check's cadence signal accurate.
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000);
      const deleted = await prisma.flowEvent.deleteMany({
        where: { capturedAt: { lt: cutoff } },
      });
      return NextResponse.json({ ok: true, action, deleted: deleted.count });
    }

    default:
      return NextResponse.json({
        error: "unknown_action",
        knownActions: ["refresh", "invalidate_stuck", "invalidate_all", "rerun_brain_scan", "purge_stale_flow"],
      }, { status: 400 });
  }
}
