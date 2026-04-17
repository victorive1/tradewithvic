import { NextResponse } from "next/server";
import { logSetupDecision, logUserInteraction } from "@/lib/learning/event-logger";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.type === "interaction") {
      const result = await logUserInteraction(body);
      return NextResponse.json({ success: true, data: result });
    }

    const result = await logSetupDecision(body);
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
