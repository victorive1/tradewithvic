import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: NextRequest) {
  try {
  const account = await prisma.executionAccount.findUnique({ where: { name: "paper-default" } });
  if (!account) {
    return NextResponse.json({ account: null, positions: [], trades: [], portfolio: null, events: [] });
  }

  const [positions, trades, portfolio, events, rejectedOrders, portfolioDecisions, latestSnapshotsRaw, latestCycle, pendingOrders, monitoringAlerts, recentCycles] = await Promise.all([
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
    prisma.executionOrder.findMany({
      where: { accountId: account.id, status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.monitoringAlert.findMany({
      where: { status: { in: ["open", "acknowledged"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.scanCycle.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
  ]);

  // Build signal log: every TradeSetup from the last 200 with its execution action.
  const signalSetups = await prisma.tradeSetup.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const orders = signalSetups.length > 0
    ? await prisma.executionOrder.findMany({ where: { setupId: { in: signalSetups.map((s: any) => s.id) } } })
    : [];
  const orderMap = new Map<string, any>(orders.map((o: any) => [o.setupId, o]));

  type Action = "EXECUTED" | "SKIPPED" | "QUEUED" | "DETECTED" | "EXPIRED" | "CLOSED";
  const signals = signalSetups.map((s: any) => {
    const order = orderMap.get(s.id) ?? null;
    let action: Action = "DETECTED";
    let actionReason: string | null = null;
    if (order?.status === "filled") {
      action = s.status === "closed" ? "CLOSED" : "EXECUTED";
    } else if (order?.status === "rejected") {
      action = "SKIPPED";
      actionReason = order.rejectReason;
    } else if (s.status === "expired") {
      action = "EXPIRED";
    } else if (s.status === "closed") {
      action = "CLOSED";
    } else if (s.status === "active" && (s.qualityGrade === "A+" || s.qualityGrade === "A")) {
      action = "QUEUED";
    } else {
      action = "DETECTED";
      actionReason = `Grade ${s.qualityGrade} not in execution whitelist`;
    }
    return {
      id: s.id,
      time: s.createdAt,
      source: "ALGO",
      strategy: s.setupType,
      symbol: s.symbol,
      timeframe: s.timeframe,
      direction: s.direction,
      entry: s.entry,
      stopLoss: s.stopLoss,
      takeProfit1: s.takeProfit1,
      takeProfit2: s.takeProfit2,
      takeProfit3: s.takeProfit3,
      riskReward: s.riskReward,
      confidenceScore: s.confidenceScore,
      qualityGrade: s.qualityGrade,
      action,
      actionReason,
      status: s.status,
    };
  });

  // Dedupe: keep only the latest snapshot per symbol.
  const seen = new Set<string>();
  const latestSnapshots: any[] = [];
  for (const row of latestSnapshotsRaw) {
    if (seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    latestSnapshots.push(row);
  }

  // Health snapshot — everything the Dashboard health panel needs
  const cycleErrors = recentCycles.filter((c: any) => c.status === "failed" || c.errorCount > 0).length;
  const cycleAgeSec = latestCycle ? Math.round((Date.now() - latestCycle.startedAt.getTime()) / 1000) : null;
  const latestCandle = await prisma.candle.findFirst({
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true },
  });
  const feedAgeSec = latestCandle ? Math.round((Date.now() - latestCandle.fetchedAt.getTime()) / 1000) : null;
  const scanHealth: "healthy" | "degraded" | "critical" =
    !cycleAgeSec || cycleAgeSec < 180 ? "healthy" : cycleAgeSec < 600 ? "degraded" : "critical";
  const feedHealth: "healthy" | "degraded" | "critical" =
    !feedAgeSec || feedAgeSec < 300 ? "healthy" : feedAgeSec < 900 ? "degraded" : "critical";
  const errorHealth: "healthy" | "degraded" | "critical" =
    cycleErrors === 0 ? "healthy" : cycleErrors < 3 ? "degraded" : "critical";
  const engineHealth = account.killSwitchEngaged ? "critical"
    : !account.autoExecuteEnabled ? "degraded"
      : "healthy";
  const critical = [scanHealth, feedHealth, errorHealth, engineHealth].filter((s) => s === "critical").length;
  const degraded = [scanHealth, feedHealth, errorHealth, engineHealth].filter((s) => s === "degraded").length;
  const overall: "healthy" | "degraded" | "critical" = critical > 0 ? "critical" : degraded > 0 ? "degraded" : "healthy";

  return NextResponse.json({
    account,
    positions,
    trades,
    portfolio,
    events,
    rejectedOrders,
    portfolioDecisions,
    pendingOrders,
    quotes: latestSnapshots,
    latestCycle,
    signals,
    health: {
      overall,
      scanHealth,
      scanAgeSec: cycleAgeSec,
      feedHealth,
      feedAgeSec,
      errorHealth,
      cycleErrors,
      engineHealth,
      openAlerts: monitoringAlerts,
      recentCycles,
    },
    fetchedAt: Date.now(),
  });
  } catch (err: any) {
    console.error("[brain/execution/state] failed:", err);
    return NextResponse.json({
      account: null,
      positions: [],
      trades: [],
      portfolio: null,
      events: [],
      rejectedOrders: [],
      portfolioDecisions: [],
      pendingOrders: [],
      quotes: [],
      latestCycle: null,
      signals: [],
      health: null,
      error: err?.message ?? String(err),
      fetchedAt: Date.now(),
    }, { status: 200 });
  }
}
