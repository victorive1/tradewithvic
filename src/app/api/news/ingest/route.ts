import { NextRequest, NextResponse } from "next/server";
import { runNewsIngest } from "@/lib/news/ingest";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// Vercel Pro allows up to 300s; 120 gives the first cold fire room to
// upsert 50+ events + headlines without flirting with the timeout.
export const maxDuration = 120;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const header = req.headers.get("x-cron-secret");
  if (header === secret) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runNewsIngest();
  return NextResponse.json(result, {
    status: result.errors.length === 0 ? 200 : 207,
  });
}
