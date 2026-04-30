// GET /api/mini/session-state — current session phase + a manual
// re-run hook so the dashboard banner stays in sync without a full
// scan cycle.

import { NextResponse } from "next/server";
import { classifySession } from "@/lib/mini/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = classifySession();
  return NextResponse.json(s, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
