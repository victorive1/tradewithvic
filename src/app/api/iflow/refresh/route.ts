import { NextRequest, NextResponse } from "next/server";
import { runIFlowCycle } from "@/lib/iflow/engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Admin refresh — generates flow events and institutional signals.
 * Gated by ADMIN_REFRESH_SECRET the same way the brain refresh endpoint is.
 * Also invoked opportunistically inside the main brain scan so signals
 * stay current without needing a separate cron.
 */
export async function POST(req: NextRequest) {
  const adminSecret = process.env.ADMIN_REFRESH_SECRET;
  const sent = req.headers.get("x-admin-token") ?? req.nextUrl.searchParams.get("token");
  if (adminSecret && sent !== adminSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runIFlowCycle();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
