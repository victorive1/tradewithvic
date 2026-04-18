import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function classifyOutcome(t: { realizedPnl: number; exitReason: string }): "win" | "loss" | "breakeven" | "expired" {
  if (Math.abs(t.realizedPnl) < 0.01) return "breakeven";
  if (t.realizedPnl > 0) return "win";
  return "loss";
}

export async function GET() {
  const [trades, virtualOutcomes] = await Promise.all([
    prisma.executionTrade.findMany({
      orderBy: { closedAt: "desc" },
      take: 500,
    }),
    prisma.setupOutcome.findMany({
      orderBy: { labeledAt: "desc" },
      take: 500,
      include: { setupDecisionLog: true },
    }),
  ]);

  const totalExec = trades.length;
  const wins = trades.filter((t: any) => t.realizedPnl > 0).length;
  const losses = trades.filter((t: any) => t.realizedPnl < 0).length;
  const breakeven = totalExec - wins - losses;
  const winRate = totalExec > 0 ? (wins / totalExec) * 100 : 0;

  const totalPnl = trades.reduce((s: number, t: any) => s + t.realizedPnl, 0);
  const avgWin = wins > 0 ? trades.filter((t: any) => t.realizedPnl > 0).reduce((s: number, t: any) => s + t.realizedPnl, 0) / wins : 0;
  const avgLoss = losses > 0 ? Math.abs(trades.filter((t: any) => t.realizedPnl < 0).reduce((s: number, t: any) => s + t.realizedPnl, 0) / losses) : 0;
  const expectancy = totalExec > 0
    ? (wins / totalExec) * avgWin - (losses / totalExec) * avgLoss
    : 0;
  const profitFactor = avgLoss > 0 && losses > 0 && wins > 0
    ? (avgWin * wins) / (avgLoss * losses)
    : null;

  const avgRR = trades.length > 0
    ? trades.reduce((s: number, t: any) => s + (t.rMultiple ?? 0), 0) / trades.length
    : 0;

  // Aggregate by dimension
  const aggregate = (key: string) => {
    const bucket: Record<string, { count: number; wins: number; pnl: number }> = {};
    for (const t of trades) {
      const k = String((t as any)[key] ?? "—");
      if (!bucket[k]) bucket[k] = { count: 0, wins: 0, pnl: 0 };
      bucket[k].count++;
      if (t.realizedPnl > 0) bucket[k].wins++;
      bucket[k].pnl += t.realizedPnl;
    }
    return Object.entries(bucket)
      .map(([k, v]) => ({
        key: k,
        count: v.count,
        wins: v.wins,
        winRate: v.count > 0 ? (v.wins / v.count) * 100 : 0,
        pnl: v.pnl,
      }))
      .sort((a, b) => b.count - a.count);
  };

  const bySymbol = aggregate("symbol");
  const byGrade = aggregate("grade");
  const byStrategy = trades.reduce((acc: Record<string, any>, t: any) => {
    // trades don't carry setupType; fall back to exitReason bucketing
    const k = t.exitReason ?? "unknown";
    if (!acc[k]) acc[k] = { count: 0, wins: 0, pnl: 0 };
    acc[k].count++;
    if (t.realizedPnl > 0) acc[k].wins++;
    acc[k].pnl += t.realizedPnl;
    return acc;
  }, {} as Record<string, any>);

  const virtualWins = virtualOutcomes.filter((o: any) => o.outcomeClass === "excellent" || o.outcomeClass === "good").length;
  const virtualLosses = virtualOutcomes.filter((o: any) => o.outcomeClass === "poor" || o.outcomeClass === "invalid").length;

  return NextResponse.json({
    executed: {
      total: totalExec,
      wins, losses, breakeven,
      winRate,
      totalPnl,
      avgWin,
      avgLoss,
      expectancy,
      profitFactor,
      avgRR,
    },
    virtual: {
      total: virtualOutcomes.length,
      wins: virtualWins,
      losses: virtualLosses,
      neutral: virtualOutcomes.length - virtualWins - virtualLosses,
    },
    bySymbol,
    byGrade,
    byExitReason: Object.entries(byStrategy).map(([k, v]: [string, any]) => ({
      key: k,
      count: v.count,
      wins: v.wins,
      winRate: v.count > 0 ? (v.wins / v.count) * 100 : 0,
      pnl: v.pnl,
    })),
    fetchedAt: Date.now(),
  });
}
