import { NextRequest, NextResponse } from "next/server";
import { runScanCycle } from "@/lib/brain/scan";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAdminAuthorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_REFRESH_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runScanCycle("manual-admin");
  return NextResponse.json(result, {
    status: result.status === "completed" ? 200 : 500,
  });
}
