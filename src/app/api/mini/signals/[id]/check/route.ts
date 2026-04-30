// GET /api/mini/signals/:id/check — run guardrails and return whether
// this signal is currently safe to execute. UI uses this to enable /
// disable the Execute button on the live cards.

import { NextRequest, NextResponse } from "next/server";
import { runMiniGuardrails } from "@/lib/mini/guardrails";

export const dynamic = "force-dynamic";

interface RouteCtx { params: Promise<{ id: string }>; }

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  try {
    const verdict = await runMiniGuardrails(id);
    return NextResponse.json(verdict, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: err instanceof Error ? err.message : "guardrail_check_failed" },
      { status: 500 },
    );
  }
}
