import { NextResponse } from "next/server";
import { listModels, registerModel, promoteToShadow, promoteToActive, rollbackModel } from "@/lib/learning/model-registry";

export async function GET() {
  try {
    const models = await listModels();
    return NextResponse.json({ success: true, data: models });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "register") {
      const result = await registerModel(body);
      return NextResponse.json({ success: true, data: result });
    }
    if (action === "promote_shadow") {
      const result = await promoteToShadow(body.version, body.approvedBy);
      return NextResponse.json({ success: true, data: result });
    }
    if (action === "promote_active") {
      const result = await promoteToActive(body.version, body.approvedBy);
      return NextResponse.json({ success: true, data: result });
    }
    if (action === "rollback") {
      const result = await rollbackModel(body.version, body.approvedBy);
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
