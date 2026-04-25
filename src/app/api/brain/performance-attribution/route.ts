import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Performance Attribution + Strategy Decay — Quant Engine Blueprint § 17.
//
// Breaks closed trades down by strategy / pair / timeframe / session /
// exit reason and assigns each strategy a health state based on
// recent expectancy vs the long-term baseline.

interface AttributionGroup {
  key: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgR: number;
  expectancy: number;
}

type StrategyHealth = "healthy" | "warning" | "degraded" | "paused" | "retired";

interface StrategyHealthRow extends AttributionGroup {
  health: StrategyHealth;
  recentExpectancy: number;
  baselineExpectancy: number;
  dropPct: number;
  notes: string[];
}

export async function GET(req: NextRequest) {
  const dimension = (req.nextUrl.searchParams.get("by") ?? "strategy").toLowerCase();
  const validDims = new Set(["strategy", "symbol", "timeframe", "exit_reason", "grade"]);
  const dim = validDims.has(dimension) ? dimension : "strategy";

  // Pull last 200 closed trades (≈ a month for a moderately active book).
  const trades = await prisma.executionTrade.findMany({
    orderBy: { closedAt: "desc" },
    take: 200,
  });

  if (trades.length === 0) {
    return NextResponse.json({ groups: [], strategyHealth: [], totals: empty(), generatedAt: new Date().toISOString() });
  }

  // Generic dimension grouping.
  const buckets = new Map<string, ExecutionTradeLite[]>();
  for (const t of trades) {
    const key = bucketKey(t, dim);
    const arr = buckets.get(key) ?? [];
    arr.push(t);
    buckets.set(key, arr);
  }

  const groups: AttributionGroup[] = [];
  for (const [key, ts] of buckets) {
    groups.push(toAttributionGroup(key, ts));
  }
  groups.sort((a, b) => b.totalPnl - a.totalPnl);

  // Strategy health: always grouped by setupType (pulled via TradeSetup
  // lookup since ExecutionTrade doesn't carry setupType directly).
  const setupIds = Array.from(new Set(trades.map((t) => t.setupId).filter(Boolean)));
  const setups = setupIds.length > 0
    ? await prisma.tradeSetup.findMany({ where: { id: { in: setupIds } }, select: { id: true, setupType: true } })
    : [];
  const setupTypeById = new Map(setups.map((s) => [s.id, s.setupType]));

  const byStrategy = new Map<string, ExecutionTradeLite[]>();
  for (const t of trades) {
    const setupType = setupTypeById.get(t.setupId) ?? "unknown";
    const arr = byStrategy.get(setupType) ?? [];
    arr.push(t);
    byStrategy.set(setupType, arr);
  }

  const strategyHealth: StrategyHealthRow[] = [];
  for (const [strategy, ts] of byStrategy) {
    const sorted = [...ts].sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime());
    const recent = sorted.slice(0, Math.min(20, Math.floor(sorted.length / 2)));
    const baseline = sorted.slice(recent.length);
    const recentE = expectancy(recent);
    const baselineE = baseline.length > 0 ? expectancy(baseline) : recentE;
    const dropPct = baselineE === 0 ? 0 : ((baselineE - recentE) / Math.max(Math.abs(baselineE), 1e-9)) * 100;

    let health: StrategyHealth = "healthy";
    const notes: string[] = [];
    if (recent.length < 5) {
      health = "warning";
      notes.push(`only ${recent.length} recent trades — sample too small`);
    }
    if (dropPct > 50) { health = "degraded"; notes.push(`expectancy down ${dropPct.toFixed(0)}% vs baseline`); }
    if (recentE < 0 && recent.length >= 5) { health = "degraded"; notes.push("recent expectancy negative"); }
    if (recentE < -0.5 && recent.length >= 8) { health = "paused"; notes.push("strong negative drift — pause recommended"); }

    const all = toAttributionGroup(strategy, ts);
    strategyHealth.push({
      ...all,
      health,
      recentExpectancy: recentE,
      baselineExpectancy: baselineE,
      dropPct,
      notes,
    });
  }
  strategyHealth.sort((a, b) => b.expectancy - a.expectancy);

  const totals: AttributionGroup = toAttributionGroup("ALL", trades);

  return NextResponse.json({
    dimension: dim,
    groups,
    strategyHealth,
    totals,
    generatedAt: new Date().toISOString(),
    sampleSize: trades.length,
  });
}

interface ExecutionTradeLite {
  id: string;
  setupId: string;
  symbol: string;
  timeframe: string;
  grade: string;
  realizedPnl: number;
  rMultiple: number;
  exitReason: string;
  closedAt: Date;
}

function bucketKey(t: ExecutionTradeLite, dim: string): string {
  switch (dim) {
    case "symbol": return t.symbol;
    case "timeframe": return t.timeframe;
    case "exit_reason": return t.exitReason;
    case "grade": return t.grade;
    case "strategy": default: return "all-strategies"; // strategy bucketing happens via setupType lookup below
  }
}

function toAttributionGroup(key: string, ts: readonly ExecutionTradeLite[]): AttributionGroup {
  const wins = ts.filter((t) => t.realizedPnl > 0).length;
  const losses = ts.filter((t) => t.realizedPnl < 0).length;
  const totalPnl = ts.reduce((s, t) => s + t.realizedPnl, 0);
  const avgR = ts.length > 0 ? ts.reduce((s, t) => s + t.rMultiple, 0) / ts.length : 0;
  return {
    key,
    trades: ts.length,
    wins,
    losses,
    winRate: ts.length > 0 ? (wins / ts.length) * 100 : 0,
    totalPnl,
    avgR,
    expectancy: avgR,
  };
}

function expectancy(ts: readonly ExecutionTradeLite[]): number {
  if (ts.length === 0) return 0;
  return ts.reduce((s, t) => s + t.rMultiple, 0) / ts.length;
}

function empty(): AttributionGroup {
  return { key: "ALL", trades: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0, avgR: 0, expectancy: 0 };
}
