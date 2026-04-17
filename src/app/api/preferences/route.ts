import { NextResponse } from "next/server";
import { getPreferences, savePreferences } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || "default";
  return NextResponse.json({ success: true, data: getPreferences(userId) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prefs = savePreferences(body.userId || "default", body);
    return NextResponse.json({ success: true, data: prefs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
