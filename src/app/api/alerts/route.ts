// User alerts. AUTH-GATED — userId from session, not from request.
// Pre-fix any unauthenticated request could read/create/delete any
// user's alerts (P0 found in the 2026-04-27 audit).
//
// DELETE additionally checks ownership: a session user can only delete
// alerts that belong to their own bucket.

import { NextResponse } from "next/server";
import { getAlerts, createAlert, deleteAlert } from "@/lib/store";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ success: true, data: getAlerts(user.id) });
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const body = await req.json();
    const alert = createAlert(user.id, {
      symbol: body.symbol,
      alertType: body.alertType,
      condition: body.condition,
      message: body.message,
    });
    return NextResponse.json({ success: true, data: alert });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "create_failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "alert_id_required" }, { status: 400 });

  // Ownership check before delete — getAlerts(userId) returns this user's
  // alerts only, so confirm the id is in the user's bucket. Without this,
  // the helper iterates every userId in the in-memory map and deletes
  // wherever it finds the id, allowing cross-user deletes.
  const owned = getAlerts(user.id).some((a) => a.id === id);
  if (!owned) return NextResponse.json({ error: "not_found" }, { status: 404 });
  deleteAlert(id);
  return NextResponse.json({ success: true });
}
