// Mini scan cron — runs every 2 minutes, mirrors the brain scan auth
// pattern (Bearer CRON_SECRET via Vercel cron). One scan = one pass
// over every active instrument, every registered Mini template.

import { NextRequest, NextResponse } from "next/server";
import { runMiniScan } from "@/lib/mini/scan";

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
    const result = await runMiniScan();
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - started,
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
