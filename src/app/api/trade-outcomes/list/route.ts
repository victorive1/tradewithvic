import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const source = sp.get("source") ?? "all"; // all | executed | virtual
  const symbol = sp.get("symbol");
  const grade = sp.get("grade");
  const take = Math.min(500, parseInt(sp.get("take") ?? "100"));

  const rows: any[] = [];

  if (source === "all" || source === "executed") {
    const trades = await prisma.executionTrade.findMany({
      where: {
        ...(symbol ? { symbol } : {}),
        ...(grade ? { grade } : {}),
      },
      orderBy: { closedAt: "desc" },
      take,
    });
    for (const t of trades) {
      const outcomeState = t.realizedPnl > 0
        ? (t.rMultiple >= 1.5 ? "tp_full" : "tp_partial")
        : t.realizedPnl < 0 ? "sl_hit" : "breakeven";
      rows.push({
        id: t.id,
        source: "brain_paper",
        sourceLabel: "Brain Paper",
        symbol: t.symbol,
        displayName: t.symbol,
        timeframe: t.timeframe,
        strategy: "—", // ExecutionTrade doesn't carry setupType; audit via setupId for detail
        setupId: t.setupId,
        grade: t.grade,
        direction: t.direction,
        outcomeState,
        entry: t.entry,
        exit: t.exit,
        stopLoss: t.stopLoss,
        sizeUnits: t.sizeUnits,
        riskAmount: t.riskAmount,
        realizedPnl: t.realizedPnl,
        pnlPct: t.pnlPct,
        rMultiple: t.rMultiple,
        exitReason: t.exitReason,
        openedAt: t.openedAt,
        closedAt: t.closedAt,
        durationMinutes: t.durationMinutes,
        mfe: t.mfe,
        mae: t.mae,
      });
    }
  }

  if (source === "all" || source === "virtual") {
    const outcomes = await prisma.setupOutcome.findMany({
      orderBy: { labeledAt: "desc" },
      take,
      include: { setupDecisionLog: true },
    });
    for (const o of outcomes) {
      const log = o.setupDecisionLog;
      if (symbol && log.symbol !== symbol) continue;
      if (grade && log.qualityLabel !== grade) continue;
      const outcomeState = o.outcomeClass === "excellent" ? "tp_full"
        : o.outcomeClass === "good" ? "tp_partial"
          : o.outcomeClass === "poor" ? "sl_hit"
            : o.outcomeClass === "invalid" ? "never_triggered"
              : o.expired ? "expired" : "breakeven";
      rows.push({
        id: o.id,
        source: "brain_virtual",
        sourceLabel: "Brain Virtual",
        symbol: log.symbol,
        displayName: log.symbol,
        timeframe: log.timeframe,
        strategy: log.setupType,
        setupId: log.setupId,
        grade: log.qualityLabel,
        direction: log.direction,
        outcomeState,
        entry: log.entry,
        exit: null,
        stopLoss: log.stopLoss,
        sizeUnits: null,
        riskAmount: null,
        realizedPnl: null,
        pnlPct: null,
        rMultiple: null,
        exitReason: o.tp3Hit ? "tp3_hit" : o.tp2Hit ? "tp2_hit" : o.tp1Hit ? "tp1_hit" : o.slHit ? "sl_hit" : o.expired ? "expired" : o.neverTriggered ? "never_triggered" : "pending",
        openedAt: log.createdAt,
        closedAt: o.labeledAt,
        durationMinutes: o.barsToTrigger && o.barsToTp1 ? (o.barsToTrigger + o.barsToTp1) : null,
        mfe: o.maxFavorableExcursion ?? 0,
        mae: o.maxAdverseExcursion ?? 0,
        outcomeClass: o.outcomeClass,
      });
    }
  }

  // Sort combined list by closedAt desc
  rows.sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());

  return NextResponse.json({ outcomes: rows.slice(0, take), total: rows.length, fetchedAt: Date.now() });
}
