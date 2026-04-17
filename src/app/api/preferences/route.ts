import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || "default";
    const prefs = await prisma.userPreference.findUnique({ where: { userId } });
    return NextResponse.json({ success: true, data: prefs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId = body.userId || "default";

    const prefs = await prisma.userPreference.upsert({
      where: { userId },
      update: {
        favoriteMarkets: body.favoriteMarkets ? JSON.stringify(body.favoriteMarkets) : undefined,
        defaultTimeframe: body.defaultTimeframe,
        dashboardLayout: body.dashboardLayout ? JSON.stringify(body.dashboardLayout) : undefined,
        alertSettings: body.alertSettings ? JSON.stringify(body.alertSettings) : undefined,
      },
      create: {
        userId,
        favoriteMarkets: JSON.stringify(body.favoriteMarkets || []),
        defaultTimeframe: body.defaultTimeframe || "1h",
        dashboardLayout: JSON.stringify(body.dashboardLayout || []),
        alertSettings: JSON.stringify(body.alertSettings || {}),
      },
    });

    return NextResponse.json({ success: true, data: prefs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
