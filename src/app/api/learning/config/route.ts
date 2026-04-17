import { NextResponse } from "next/server";
import { getActiveConfig, createConfigCandidate, promoteConfig, rollbackConfig, listConfigs } from "@/lib/learning/adaptive-config";

export async function GET() {
  try {
    const active = await getActiveConfig();
    const all = await listConfigs();
    return NextResponse.json({ success: true, active, all });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === "create") {
      const result = await createConfigCandidate(body.config, body.reason);
      return NextResponse.json({ success: true, data: result });
    }

    if (body.action === "promote") {
      const result = await promoteConfig(body.version);
      return NextResponse.json({ success: true, data: result });
    }

    if (body.action === "rollback") {
      const result = await rollbackConfig(body.version);
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
