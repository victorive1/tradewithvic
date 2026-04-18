import { NextRequest, NextResponse } from "next/server";
import { runDailyLearningCycle } from "@/lib/brain/learning";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const adminSecret = process.env.ADMIN_REFRESH_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (adminSecret && auth === `Bearer ${adminSecret}`) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const report = await runDailyLearningCycle();
  return NextResponse.json({
    reportDate: report.reportDate,
    window: report.window,
    totalLogged: report.totalLogged,
    totalLabeled: report.totalLabeled,
    overallWinRate: report.overallWinRate,
    topFeatures: report.featureImportance.slice(0, 5),
    recommendations: report.recommendations,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
