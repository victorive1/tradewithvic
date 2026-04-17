import { NextResponse } from "next/server";
import { runMonitoringSnapshot, getOpenAlerts, acknowledgeAlert, resolveAlert, getRecentSnapshots } from "@/lib/learning/monitoring";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    if (type === "alerts") {
      const alerts = await getOpenAlerts();
      return NextResponse.json({ success: true, data: alerts });
    }

    if (type === "snapshots") {
      const snapshots = await getRecentSnapshots();
      return NextResponse.json({ success: true, data: snapshots });
    }

    // Default: run a new snapshot
    const snapshot = await runMonitoringSnapshot();
    return NextResponse.json({ success: true, data: snapshot });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === "acknowledge") {
      const result = await acknowledgeAlert(body.id);
      return NextResponse.json({ success: true, data: result });
    }

    if (body.action === "resolve") {
      const result = await resolveAlert(body.id, body.actionTaken);
      return NextResponse.json({ success: true, data: result });
    }

    if (body.action === "snapshot") {
      const result = await runMonitoringSnapshot();
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
