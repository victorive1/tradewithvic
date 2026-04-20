import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Returns recent AlgoBotExecution rows + today's routed count for the
 * bot status panel. Read-only, same posture as the Brain execution
 * state feed.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ botId: string }> }) {
  const { botId } = await ctx.params;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [config, recent, routedToday, lastRouted] = await Promise.all([
    prisma.algoBotConfig.findUnique({ where: { botId } }),
    prisma.algoBotExecution.findMany({
      where: { botId },
      orderBy: { routedAt: "desc" },
      take: 20,
    }),
    prisma.algoBotExecution.count({
      where: { botId, status: "routed", routedAt: { gte: todayStart } },
    }),
    prisma.algoBotExecution.findFirst({
      where: { botId, status: "routed" },
      orderBy: { routedAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    config,
    recent,
    routedToday,
    lastRoutedAt: lastRouted?.routedAt ?? null,
    fetchedAt: Date.now(),
  });
}
