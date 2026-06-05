import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { loadBacklog } from "@/lib/setups/backlog-query";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * Gated 30-day trade-setup backlog. Agent + admin only. Powers the
 * "Backlog" tab on the Smart Alerts page; the /dashboard/backlog page
 * loads the same data directly as a server component.
 */
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, "agent");
  if (gate instanceof NextResponse) return gate;

  const result = await loadBacklog();
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
