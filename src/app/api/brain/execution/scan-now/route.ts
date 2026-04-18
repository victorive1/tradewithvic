import { NextRequest, NextResponse } from "next/server";
import { runScanCycle } from "@/lib/brain/scan";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// Open endpoint (mirrors the opened config route) so the Refresh button on
// /dashboard/brain-execution can actually force a new scan cycle. Re-lock
// later by adding an auth guard here if needed.

export async function POST(_req: NextRequest) {
  const result = await runScanCycle("manual-user");
  return NextResponse.json(result, {
    status: result.status === "completed" ? 200 : 500,
  });
}
