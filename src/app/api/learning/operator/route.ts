import { NextResponse } from "next/server";
import { getOperatorOverview, forceRulesOnly, setHybridWeights, freezeConfigPromotions, getOperatorActionLog } from "@/lib/learning/operator-control";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    if (type === "action-log") {
      const log = await getOperatorActionLog();
      return NextResponse.json({ success: true, data: log });
    }

    const overview = await getOperatorOverview();
    return NextResponse.json({ success: true, data: overview });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const operatorId = body.operatorId || "admin";

    if (body.action === "force_rules_only") {
      const result = await forceRulesOnly(operatorId, body.reason || "Manual operator action");
      return NextResponse.json({ success: true, data: result });
    }

    if (body.action === "set_weights") {
      const result = await setHybridWeights(operatorId, body.rulesWeight, body.modelWeight, body.reason || "Weight adjustment");
      return NextResponse.json({ success: true, data: result });
    }

    if (body.action === "freeze_promotions") {
      const result = await freezeConfigPromotions(operatorId, body.reason || "Freeze promotions");
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
