import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    success: true,
    data: [],
    message: "Adaptive intelligence engine ready. Connect a hosted database (Vercel Postgres or Supabase) to enable full learning capabilities.",
    status: "awaiting_database",
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    return NextResponse.json({
      success: true,
      message: "Request received. Connect a hosted database to persist learning data.",
      status: "awaiting_database",
      received: Object.keys(body),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
