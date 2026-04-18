import { NextRequest, NextResponse } from "next/server";
import { runReplay } from "@/lib/brain/replay";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_REFRESH_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const windowStart = body.windowStart ? new Date(body.windowStart) : new Date(Date.now() - 14 * 86400_000);
  const windowEnd = body.windowEnd ? new Date(body.windowEnd) : new Date();

  const result = await runReplay({
    label: body.label ?? `replay-${Date.now()}`,
    windowStart,
    windowEnd,
    weightsOverride: body.weightsOverride ?? {},
    notes: body.notes,
  });

  return NextResponse.json(result);
}
