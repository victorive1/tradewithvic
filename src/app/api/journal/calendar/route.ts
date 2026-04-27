// Calendar data — last N days of P&L / trade count / win-loss split per day.
// Used by the journal page's heatmap-style grid.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const daysParam = parseInt(url.searchParams.get("days") ?? "30", 10);
  const days = Math.max(1, Math.min(180, isNaN(daysParam) ? 30 : daysParam));

  const fromDate = new Date(Date.now() - days * 24 * 3600 * 1000);
  const fromStr = fromDate.toISOString().slice(0, 10);

  const rows = await prisma.tradeJournalDay.findMany({
    where: { userId: user.id, date: { gte: fromStr } },
    orderBy: { date: "asc" },
    select: {
      date: true, pnl: true, trades: true, wins: true, losses: true,
      planAdherence: true, hitDailyLimit: true, overtraded: true, topMistake: true,
    },
  });

  return NextResponse.json({
    success: true,
    days: rows,
    range: { from: fromStr, to: new Date().toISOString().slice(0, 10) },
  });
}
