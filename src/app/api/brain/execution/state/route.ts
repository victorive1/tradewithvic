import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: NextRequest) {
  const account = await prisma.executionAccount.findUnique({ where: { name: "paper-default" } });
  if (!account) {
    return NextResponse.json({ account: null, positions: [], trades: [], portfolio: null, events: [] });
  }

  const [positions, trades, portfolio, events, rejectedOrders, portfolioDecisions, latestSnapshotsRaw, latestCycle] = await Promise.all([
    prisma.executionPosition.findMany({
      where: { accountId: account.id, status: "open" },
      orderBy: { openedAt: "desc" },
    }),
    prisma.executionTrade.findMany({
      where: { accountId: account.id },
      orderBy: { closedAt: "desc" },
      take: 20,
    }),
    prisma.portfolioSnapshot.findFirst({ where: { accountId: account.id }, orderBy: { capturedAt: "desc" } }),
    prisma.executionEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { position: { select: { symbol: true, direction: true, grade: true } } },
    }),
    prisma.executionOrder.findMany({
      where: { accountId: account.id, status: "rejected" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.portfolioDecisionLog.findMany({
      where: { accountId: account.id, decision: { in: ["reduce", "reject"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    // Latest quote per symbol — raw list (we'll dedupe below)
    prisma.marketSnapshot.findMany({
      orderBy: { capturedAt: "desc" },
      take: 200,
      select: { symbol: true, price: true, change: true, changePercent: true, high: true, low: true, capturedAt: true },
    }),
    prisma.scanCycle.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);

  // Dedupe: keep only the latest snapshot per symbol.
  const seen = new Set<string>();
  const latestSnapshots: any[] = [];
  for (const row of latestSnapshotsRaw) {
    if (seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    latestSnapshots.push(row);
  }

  return NextResponse.json({
    account,
    positions,
    trades,
    portfolio,
    events,
    rejectedOrders,
    portfolioDecisions,
    quotes: latestSnapshots,
    latestCycle,
    fetchedAt: Date.now(),
  });
}
