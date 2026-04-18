import { prisma } from "@/lib/prisma";
import { evaluatePortfolio, capturePortfolioSnapshot } from "@/lib/brain/portfolio";
import { reassessAllOpenPositions } from "@/lib/brain/thesis";

const DEFAULT_ACCOUNT_NAME = "paper-default";

export interface ExecutionCycleResult {
  accountId: string;
  balance: number;
  equity: number;
  openPositions: number;
  ordersOpened: number;
  ordersRejected: number;
  positionsClosed: number;
  realizedPnlDelta: number;
  killSwitchEngaged: boolean;
}

async function ensureAccount() {
  let acct = await prisma.executionAccount.findUnique({ where: { name: DEFAULT_ACCOUNT_NAME } });
  if (!acct) {
    acct = await prisma.executionAccount.create({ data: { name: DEFAULT_ACCOUNT_NAME } });
  }
  // Daily PnL reset at UTC midnight
  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  if (!acct.dailyPnlResetAt || acct.dailyPnlResetAt < today) {
    acct = await prisma.executionAccount.update({
      where: { id: acct.id },
      data: { dailyPnl: 0, dailyPnlResetAt: today },
    });
  }
  return acct;
}

function sizeUnitsFromRisk(riskAmount: number, entry: number, stopLoss: number): number {
  const riskPerUnit = Math.abs(entry - stopLoss);
  if (riskPerUnit < 1e-9) return 0;
  return riskAmount / riskPerUnit;
}

function pnlFromPrice(direction: string, entry: number, currentPrice: number, sizeUnits: number): number {
  const isBull = direction === "bullish";
  return isBull
    ? (currentPrice - entry) * sizeUnits
    : (entry - currentPrice) * sizeUnits;
}

interface GuardrailContext {
  account: any;
  openPositions: any[];
  eventRisk: Record<string, any>;
}

function evaluateGuardrails(setup: any, ctx: GuardrailContext): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (!ctx.account.autoExecuteEnabled) reasons.push("auto_execute_disabled");
  if (ctx.account.killSwitchEngaged) reasons.push("kill_switch_engaged");

  const allowedGrades: string[] = (() => {
    try { return JSON.parse(ctx.account.allowedGrades); } catch { return ["A+", "A"]; }
  })();
  if (!allowedGrades.includes(setup.qualityGrade)) reasons.push(`grade_${setup.qualityGrade}_not_allowed`);

  if (ctx.openPositions.length >= ctx.account.maxConcurrentPositions) {
    reasons.push(`max_concurrent_positions_${ctx.account.maxConcurrentPositions}`);
  }

  // No duplicate open position on the same symbol
  if (ctx.openPositions.some((p: any) => p.symbol === setup.symbol)) {
    reasons.push("symbol_already_has_open_position");
  }

  // Daily loss limit
  const dailyLossLimit = -ctx.account.startingBalance * (ctx.account.maxDailyLossPct / 100);
  if (ctx.account.dailyPnl <= dailyLossLimit) {
    reasons.push(`daily_loss_limit_${ctx.account.maxDailyLossPct}pct`);
  }

  // Event risk block
  const eventRisk = ctx.eventRisk[setup.symbol];
  if (eventRisk?.riskLevel === "high") {
    reasons.push("high_event_risk");
  }

  // Minimum RR
  if (setup.riskReward < 1.2) reasons.push(`rr_below_min_1.2`);

  return { passed: reasons.length === 0, reasons };
}

async function openPaperPosition(setup: any, account: any, decisionLogId: string | null, overrideRisk?: number) {
  const riskAmount = overrideRisk ?? account.currentBalance * (account.riskPerTradePct / 100);
  const sizeUnits = sizeUnitsFromRisk(riskAmount, setup.entry, setup.stopLoss);
  if (sizeUnits <= 0) {
    return { rejected: true, reason: "invalid_size" };
  }

  const order = await prisma.executionOrder.create({
    data: {
      accountId: account.id,
      setupId: setup.id,
      decisionLogId: decisionLogId ?? undefined,
      symbol: setup.symbol,
      timeframe: setup.timeframe,
      direction: setup.direction,
      entry: setup.entry,
      stopLoss: setup.stopLoss,
      takeProfit1: setup.takeProfit1,
      takeProfit2: setup.takeProfit2,
      takeProfit3: setup.takeProfit3,
      riskAmount,
      sizeUnits,
      grade: setup.qualityGrade,
      confidenceScore: setup.confidenceScore,
      status: "filled",
      filledAt: new Date(),
      filledPrice: setup.entry,
    },
  });

  const position = await prisma.executionPosition.create({
    data: {
      accountId: account.id,
      orderId: order.id,
      setupId: setup.id,
      decisionLogId: decisionLogId ?? undefined,
      symbol: setup.symbol,
      timeframe: setup.timeframe,
      direction: setup.direction,
      entry: setup.entry,
      stopLoss: setup.stopLoss,
      originalStopLoss: setup.stopLoss,
      takeProfit1: setup.takeProfit1,
      takeProfit2: setup.takeProfit2,
      takeProfit3: setup.takeProfit3,
      sizeUnits,
      riskAmount,
      grade: setup.qualityGrade,
    },
  });

  await prisma.executionEvent.create({
    data: {
      positionId: position.id,
      eventType: "opened",
      price: setup.entry,
      reason: `Opened ${setup.direction} paper position on ${setup.qualityGrade} ${setup.setupType}`,
    },
  });

  return { rejected: false, position };
}

async function manageOpenPositions(account: any): Promise<{ closed: number; realizedPnlDelta: number; unrealizedEquity: number }> {
  const positions = await prisma.executionPosition.findMany({
    where: { accountId: account.id, status: "open" },
  });

  let closed = 0;
  let realizedPnlDelta = 0;
  let unrealizedEquity = 0;

  for (const pos of positions) {
    // Walk candles since last update
    const candles = await prisma.candle.findMany({
      where: {
        symbol: pos.symbol,
        timeframe: pos.timeframe,
        openTime: { gte: pos.openedAt },
        isClosed: true,
      },
      orderBy: { openTime: "asc" },
      select: { openTime: true, high: true, low: true, close: true },
    });

    const isBull = pos.direction === "bullish";
    let exitPrice: number | null = null;
    let exitReason: string | null = null;
    let exitTime: Date | null = null;
    let mfe = pos.mfe;
    let mae = pos.mae;

    for (const c of candles) {
      const favorable = isBull ? c.high - pos.entry : pos.entry - c.low;
      const adverse = isBull ? pos.entry - c.low : c.high - pos.entry;
      if (favorable > mfe) mfe = favorable;
      if (adverse > mae) mae = adverse;

      // SL-first policy: if both triggered in one candle, treat as SL (conservative).
      const slHit = isBull ? c.low <= pos.stopLoss : c.high >= pos.stopLoss;
      if (slHit) {
        exitPrice = pos.stopLoss;
        exitReason = "sl_hit";
        exitTime = c.openTime;
        break;
      }
      const tp1Hit = isBull ? c.high >= pos.takeProfit1 : c.low <= pos.takeProfit1;
      if (tp1Hit) {
        exitPrice = pos.takeProfit1;
        exitReason = "tp1_hit";
        exitTime = c.openTime;
        break;
      }
    }

    // Latest price for unrealized P&L
    const latestCandle = candles.at(-1);
    const mark = latestCandle?.close ?? pos.entry;
    const unrealized = pnlFromPrice(pos.direction, pos.entry, mark, pos.sizeUnits);
    unrealizedEquity += unrealized;

    if (exitPrice !== null && exitReason && exitTime) {
      const realized = pnlFromPrice(pos.direction, pos.entry, exitPrice, pos.sizeUnits);
      const durationMinutes = Math.max(1, Math.round((exitTime.getTime() - pos.openedAt.getTime()) / 60000));
      const rMultiple = pos.riskAmount > 0 ? realized / pos.riskAmount : 0;
      const pnlPct = account.startingBalance > 0 ? (realized / account.startingBalance) * 100 : 0;

      await prisma.executionPosition.update({
        where: { id: pos.id },
        data: {
          status: "closed",
          exitPrice,
          exitReason,
          closedAt: exitTime,
          realizedPnl: realized,
          unrealizedPnl: 0,
          mfe, mae,
          tp1Hit: exitReason === "tp1_hit" || pos.tp1Hit,
        },
      });

      await prisma.executionTrade.create({
        data: {
          accountId: account.id,
          positionId: pos.id,
          setupId: pos.setupId,
          symbol: pos.symbol,
          timeframe: pos.timeframe,
          direction: pos.direction,
          grade: pos.grade,
          entry: pos.entry,
          exit: exitPrice,
          stopLoss: pos.originalStopLoss,
          sizeUnits: pos.sizeUnits,
          riskAmount: pos.riskAmount,
          realizedPnl: realized,
          pnlPct,
          rMultiple,
          exitReason,
          openedAt: pos.openedAt,
          closedAt: exitTime,
          durationMinutes,
          mfe, mae,
        },
      });

      await prisma.executionEvent.create({
        data: {
          positionId: pos.id,
          eventType: exitReason,
          price: exitPrice,
          reason: `Closed ${pos.direction} @ ${exitPrice.toFixed(5)} via ${exitReason}. PnL ${realized.toFixed(2)}.`,
        },
      });

      realizedPnlDelta += realized;
      closed++;
    } else {
      // Update MFE/MAE + unrealized on open position
      if (mfe !== pos.mfe || mae !== pos.mae) {
        await prisma.executionPosition.update({
          where: { id: pos.id },
          data: { mfe, mae, unrealizedPnl: unrealized },
        });
      }
    }
  }

  return { closed, realizedPnlDelta, unrealizedEquity };
}

export async function runExecutionCycle(): Promise<ExecutionCycleResult> {
  let account = await ensureAccount();

  // 0. Reassess thesis for all open positions (Layer 11)
  await reassessAllOpenPositions();

  // 1. Manage existing open positions (check SL/TP hits)
  const management = await manageOpenPositions(account);

  // 2. Update account balance from realized P&L
  if (management.closed > 0 && management.realizedPnlDelta !== 0) {
    const newBalance = account.currentBalance + management.realizedPnlDelta;
    const wins = management.realizedPnlDelta > 0 ? 1 : 0;
    const losses = management.realizedPnlDelta <= 0 ? 1 : 0;
    account = await prisma.executionAccount.update({
      where: { id: account.id },
      data: {
        currentBalance: newBalance,
        equityHigh: Math.max(account.equityHigh, newBalance),
        equityLow: Math.min(account.equityLow, newBalance),
        totalRealizedPnl: account.totalRealizedPnl + management.realizedPnlDelta,
        totalClosedTrades: account.totalClosedTrades + management.closed,
        totalWins: account.totalWins + wins,
        totalLosses: account.totalLosses + losses,
        dailyPnl: account.dailyPnl + management.realizedPnlDelta,
      },
    });
  }

  // 3. Find candidate setups: A+/A, status=active, no existing order
  const candidateSetups = await prisma.tradeSetup.findMany({
    where: {
      status: "active",
      qualityGrade: { in: ["A+", "A"] },
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // last hour
    },
    orderBy: { confidenceScore: "desc" },
    take: 20,
  });

  const existingOrders = await prisma.executionOrder.findMany({
    where: { setupId: { in: candidateSetups.map((s: any) => s.id) } },
    select: { setupId: true },
  });
  const orderedSetupIds = new Set(existingOrders.map((o: any) => o.setupId));
  const openPositions = await prisma.executionPosition.findMany({
    where: { accountId: account.id, status: "open" },
  });
  const eventRiskRows = await prisma.eventRiskSnapshot.findMany();
  const eventRiskMap = Object.fromEntries(eventRiskRows.map((r: any) => [r.symbol, r]));

  let ordersOpened = 0;
  let ordersRejected = 0;

  for (const setup of candidateSetups) {
    if (orderedSetupIds.has(setup.id)) continue;

    const guard = evaluateGuardrails(setup, { account, openPositions, eventRisk: eventRiskMap });
    await prisma.executionGuardrailLog.create({
      data: {
        setupId: setup.id,
        accountId: account.id,
        passed: guard.passed,
        failureReasons: JSON.stringify(guard.reasons),
      },
    });

    if (!guard.passed) {
      await prisma.executionOrder.create({
        data: {
          accountId: account.id,
          setupId: setup.id,
          symbol: setup.symbol,
          timeframe: setup.timeframe,
          direction: setup.direction,
          entry: setup.entry,
          stopLoss: setup.stopLoss,
          takeProfit1: setup.takeProfit1,
          takeProfit2: setup.takeProfit2,
          takeProfit3: setup.takeProfit3,
          riskAmount: 0,
          sizeUnits: 0,
          grade: setup.qualityGrade,
          confidenceScore: setup.confidenceScore,
          status: "rejected",
          rejectReason: guard.reasons.join(","),
        },
      });
      ordersRejected++;
      continue;
    }

    // Portfolio-level evaluation (Layer 6)
    const proposedRisk = account.currentBalance * (account.riskPerTradePct / 100);
    const portfolio = evaluatePortfolio(setup, proposedRisk, account, openPositions);
    await prisma.portfolioDecisionLog.create({
      data: {
        accountId: account.id,
        setupId: setup.id,
        decision: portfolio.decision,
        reasons: JSON.stringify(portfolio.reasons),
        originalRisk: proposedRisk,
        adjustedRisk: portfolio.adjustedRiskAmount,
      },
    });
    if (portfolio.decision === "reject") {
      await prisma.executionOrder.create({
        data: {
          accountId: account.id,
          setupId: setup.id,
          symbol: setup.symbol,
          timeframe: setup.timeframe,
          direction: setup.direction,
          entry: setup.entry,
          stopLoss: setup.stopLoss,
          takeProfit1: setup.takeProfit1,
          takeProfit2: setup.takeProfit2,
          takeProfit3: setup.takeProfit3,
          riskAmount: 0,
          sizeUnits: 0,
          grade: setup.qualityGrade,
          confidenceScore: setup.confidenceScore,
          status: "rejected",
          rejectReason: "portfolio:" + portfolio.reasons.join(","),
        },
      });
      ordersRejected++;
      continue;
    }
    const effectiveRisk = portfolio.adjustedRiskAmount ?? proposedRisk;

    const decisionLog = await prisma.setupDecisionLog.findFirst({
      where: { setupId: setup.id },
      orderBy: { createdAt: "desc" },
    });

    const result = await openPaperPosition(setup, account, decisionLog?.id ?? null, effectiveRisk);
    if (!result.rejected && result.position) {
      ordersOpened++;
      openPositions.push(result.position);
    } else {
      ordersRejected++;
    }
  }

  await capturePortfolioSnapshot(account.id);

  // Final account update with unrealized
  account = await prisma.executionAccount.update({
    where: { id: account.id },
    data: {
      totalUnrealizedPnl: management.unrealizedEquity,
      lastCycleAt: new Date(),
    },
  });

  return {
    accountId: account.id,
    balance: account.currentBalance,
    equity: account.currentBalance + management.unrealizedEquity,
    openPositions: openPositions.length,
    ordersOpened,
    ordersRejected,
    positionsClosed: management.closed,
    realizedPnlDelta: management.realizedPnlDelta,
    killSwitchEngaged: account.killSwitchEngaged,
  };
}
