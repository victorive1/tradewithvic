import { NextResponse } from "next/server";
import { getAlerts, createAlert, deleteAlert } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || "default";
  return NextResponse.json({ success: true, data: getAlerts(userId) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const alert = createAlert(body.userId || "default", {
      symbol: body.symbol,
      alertType: body.alertType,
      condition: body.condition,
      message: body.message,
    });
    return NextResponse.json({ success: true, data: alert });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Alert ID required" }, { status: 400 });
  deleteAlert(id);
  return NextResponse.json({ success: true });
}
