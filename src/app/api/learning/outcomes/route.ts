import { NextResponse } from "next/server";
import { storeOutcome } from "@/lib/learning/outcome-labeler";
import { getUnlabeledDecisions } from "@/lib/learning/event-logger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await storeOutcome(body.setupDecisionLogId, body);
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const unlabeled = await getUnlabeledDecisions(100);
    return NextResponse.json({ success: true, data: unlabeled, count: unlabeled.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
