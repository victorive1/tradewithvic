import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const source = sp.get("source") ?? "all"; // all | executed | virtual | signal
  const symbol = sp.get("symbol");
  const grade = sp.get("grade");
  const take = Math.min(500, parseInt(sp.get("take") ?? "100"));

  const rows: any[] = [];
  // Track which setupIds we've already represented so the "signal" branch
  // can skip TradeSetup rows that already exist in the executed or virtual
  // sources (they'd otherwise appear twice in the "all" view).
  const seenSetupIds = new Set<string>();

  if (source === "all" || source === "executed") {
    const trades = await prisma.executionTrade.findMany({
      where: {
        ...(symbol ? { symbol } : {}),
        ...(grade ? { grade } : {}),
      },
      orderBy: { closedAt: "desc" },
      take,
    });

    // Batch-resolve original confidenceScore from the ExecutionOrder that
    // opened each trade (stored on the order, not the trade row), plus the
    // component breakdown from the originating SetupDecisionLog.
    const setupIds = trades.map((t: any) => t.setupId).filter(Boolean);
    const orders = setupIds.length
      ? await prisma.executionOrder.findMany({
          where: { setupId: { in: setupIds } },
          select: { setupId: true, confidenceScore: true, decisionLogId: true },
        })
      : [];
    const orderBySetupId = new Map(orders.map((o: any) => [o.setupId, o]));

    const decisionLogIds = orders.map((o: any) => o.decisionLogId).filter(Boolean) as string[];
    const decisionLogs = decisionLogIds.length
      ? await prisma.setupDecisionLog.findMany({
          where: { id: { in: decisionLogIds } },
          select: {
            id: true,
            rulesScore: true, hybridScore: true,
            alignmentScore: true, structureScore: true, momentumScore: true,
            entryLocationScore: true, rrScore: true, volatilityScore: true, eventRiskScore: true,
            setupType: true,
          },
        })
      : [];
    const logById = new Map(decisionLogs.map((d: any) => [d.id, d]));

    for (const t of trades) {
      if (t.setupId) seenSetupIds.add(t.setupId);
      const outcomeState = t.realizedPnl > 0
        ? (t.rMultiple >= 1.5 ? "tp_full" : "tp_partial")
        : t.realizedPnl < 0 ? "sl_hit" : "breakeven";
      const order = orderBySetupId.get(t.setupId) as any;
      const log = order?.decisionLogId ? (logById.get(order.decisionLogId) as any) : null;
      const originalScore = order?.confidenceScore ?? null;
      rows.push({
        id: t.id,
        source: "brain_paper",
        sourceLabel: "Brain Paper",
        symbol: t.symbol,
        displayName: t.symbol,
        timeframe: t.timeframe,
        strategy: log?.setupType ?? "—",
        setupId: t.setupId,
        grade: t.grade,
        originalScore,
        scoreBreakdown: log ? {
          rulesScore: log.rulesScore,
          hybridScore: log.hybridScore,
          alignment: log.alignmentScore,
          structure: log.structureScore,
          momentum: log.momentumScore,
          entryLocation: log.entryLocationScore,
          rr: log.rrScore,
          volatility: log.volatilityScore,
          eventRisk: log.eventRiskScore,
        } : null,
        liveScoreRange: {
          max: t.maxThesisScore ?? null,
          min: t.minThesisScore ?? null,
        },
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
      if (log.setupId) seenSetupIds.add(log.setupId);
      const outcomeState = o.outcomeClass === "excellent" ? "tp_full"
        : o.outcomeClass === "good" ? "tp_partial"
          : o.outcomeClass === "poor" ? "sl_hit"
            : o.outcomeClass === "invalid" ? "never_triggered"
              : o.expired ? "expired" : "breakeven";
      const rawScore = log.hybridScore ?? log.rulesScore ?? null;
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
        originalScore: rawScore != null ? Math.round(rawScore) : null,
        scoreBreakdown: {
          rulesScore: log.rulesScore,
          hybridScore: log.hybridScore,
          alignment: log.alignmentScore,
          structure: log.structureScore,
          momentum: log.momentumScore,
          entryLocation: log.entryLocationScore,
          rr: log.rrScore,
          volatility: log.volatilityScore,
          eventRisk: log.eventRiskScore,
        },
        liveScoreRange: { max: null, min: null },
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

  // ── Source 3: raw TradeSetup rows (signals fired by the brain) ───────
  // Most new strategies (FVG variants, BOS/CHoCH, Triple Lock, MMBM, CRT,
  // CISD, Wyckoff, Silver Bullet, London Breakout, SMT, Engulfing+SMC,
  // EPS Aggregation, etc.) don't get auto-executed by the bots and don't
  // get a SetupOutcome until retroactive labeling runs — so they'd
  // disappear from this tab entirely. Surfacing them as "Signal Fired"
  // rows means the user sees every detection the brain has ever made.
  if (source === "all" || source === "signal") {
    const setups = await prisma.tradeSetup.findMany({
      where: {
        ...(symbol ? { symbol } : {}),
        ...(grade ? { qualityGrade: grade } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        instrument: { select: { displayName: true } },
      },
    });
    // Dedup near-identical re-fires the same way the strategy-bible API
    // does — bucket by (symbol, setupType, timeframe, direction, entry±0.1%)
    // so a recurring setup shows once instead of 5-10 times.
    const buckets = new Map<string, typeof setups>();
    for (const s of setups) {
      const entryBucket = Math.round(s.entry / Math.max(s.entry * 0.001, 1e-9));
      const key = `${s.symbol}|${s.setupType}|${s.timeframe}|${s.direction}|${entryBucket}`;
      const arr = buckets.get(key) ?? [];
      arr.push(s);
      buckets.set(key, arr);
    }

    for (const arr of buckets.values()) {
      arr.sort((a, b) => {
        if (a.confidenceScore !== b.confidenceScore) return b.confidenceScore - a.confidenceScore;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
      const s = arr[0];
      // Skip if the executed or virtual branch already represents this setup.
      if (seenSetupIds.has(s.id)) continue;
      // outcomeState — try to infer from the setup's lifecycle status.
      // status === "expired" means the setup's validUntil passed without
      // a recorded execution/outcome. Otherwise it's still live.
      const outcomeState = s.status === "expired" ? "expired" : "pending";
      rows.push({
        id: `setup-${s.id}`,
        source: "brain_signal",
        sourceLabel: "Signal Fired",
        symbol: s.symbol,
        displayName: s.instrument?.displayName ?? s.symbol,
        timeframe: s.timeframe,
        strategy: s.setupType,
        setupId: s.id,
        grade: s.qualityGrade,
        originalScore: s.confidenceScore,
        scoreBreakdown: null,
        liveScoreRange: { max: null, min: null },
        direction: s.direction,
        outcomeState,
        entry: s.entry,
        exit: null,
        stopLoss: s.stopLoss,
        sizeUnits: null,
        riskAmount: null,
        realizedPnl: null,
        pnlPct: null,
        rMultiple: null,
        exitReason: outcomeState === "expired" ? "expired" : "pending",
        openedAt: s.createdAt,
        // No close yet — sort by createdAt so they take their natural slot
        // in the combined timeline.
        closedAt: s.createdAt,
        durationMinutes: null,
        mfe: 0,
        mae: 0,
        duplicateCount: arr.length - 1,
      });
    }
  }

  // Sort combined list by closedAt desc
  rows.sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());

  return NextResponse.json({ outcomes: rows.slice(0, take), total: rows.length, fetchedAt: Date.now() });
}
