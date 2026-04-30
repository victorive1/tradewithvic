// FlowVision scan cron — same auth pattern as brain/mini scans.
import { NextRequest, NextResponse } from "next/server";
import { runFlowScan } from "@/lib/flow/scan";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const header = req.headers.get("x-cron-secret");
  if (header === secret) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    const result = await runFlowScan();
    return NextResponse.json({ ok: true, durationMs: Date.now() - started, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
