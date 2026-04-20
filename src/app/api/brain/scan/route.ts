import { NextRequest, NextResponse } from "next/server";
import { runScanCycle } from "@/lib/brain/scan";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// Pro tier supports up to 300s; 120s gives us headroom for the full
// cycle without burning excess GB-hours on every invocation.
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
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runScanCycle("vercel-cron");
  return NextResponse.json(result, {
    status: result.status === "completed" ? 200 : 500,
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runScanCycle("manual");
  return NextResponse.json(result, {
    status: result.status === "completed" ? 200 : 500,
  });
}
