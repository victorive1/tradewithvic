import { prisma } from "@/lib/prisma";
import { evaluatePortfolio, capturePortfolioSnapshot } from "@/lib/brain/portfolio";
import { reassessAllOpenPositions } from "@/lib/brain/thesis";
import { applyAdaptiveProtection } from "@/lib/brain/protection";

const DEFAULT_ACCOUNT_NAME = "paper-default";

export interface ExecutionCycleResult {
  accountId: string;
  balance: number;
  equity: number;
  openPositions: number;
  ordersOpened: number;
  ordersRejected: number;
  ordersPending: number;
  pendingFilled: number;
  pendingCancelled: number;
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

function parseJsonArray(s: string | null | undefined, fallback: string[] = []): string[] {
  if (!s) return fallback;
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}

function sessionForSymbol(symbol: string): string {
  const h = new Date().getUTCHours();
  const day = new Date().getUTCDay();
  if (symbol.startsWith("BTC") || symbol.startsWith("ETH")) return "crypto_24_7";
  if (day === 6 || day === 0) return "closed";
  if (h >= 0 && h < 7) return "asia";
  if (h >= 7 && h < 12) return "london";
  if (h >= 12 && h < 16) return "overlap";
  if (h >= 16 && h < 21) return "newyork";
  return "after_hours";
}

function evaluateGuardrails(setup: any, ctx: GuardrailContext): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (!ctx.account.autoExecuteEnabled) reasons.push("auto_execute_disabled");
  if (ctx.account.killSwitchEngaged) reasons.push("kill_switch_engaged");

  const allowedGrades = parseJsonArray(ctx.account.allowedGrades, ["A+", "A"]);
  if (!allowedGrades.includes(setup.qualityGrade)) reasons.push(`grade_${setup.qualityGrade}_not_allowed`);

  const selectedSymbols = parseJsonArray(ctx.account.selectedSymbolsJson, []);
  if (selectedSymbols.length > 0 && !selectedSymbols.includes(setup.symbol)) {
    reasons.push(`symbol_${setup.symbol}_not_in_whitelist`);
  }

  const allowedSessions = parseJsonArray(ctx.account.allowedSessionsJson, ["london", "newyork", "overlap", "crypto_24_7"]);
  const currentSession = sessionForSymbol(setup.symbol);
  if (!allowedSessions.includes(currentSession)) {
    reasons.push(`session_${currentSession}_not_allowed`);
  }

  const allowedTimeframes = parseJsonArray(ctx.account.allowedTimeframesJson, ["4h", "1h", "15min", "5min"]);
  if (setup.timeframe && !allowedTimeframes.includes(setup.timeframe)) {
    reasons.push(`timeframe_${setup.timeframe}_not_allowed`);
  }

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

  // Event risk block (honor news filter toggle)
  const eventRisk = ctx.eventRisk[setup.symbol];
  if (ctx.account.newsFilterEnabled && eventRisk?.riskLevel === "high") {
    reasons.push("high_event_risk");
  }

  // Friday close protection: block new trades Friday after 20:00 UTC
  if (ctx.account.fridayCloseProtection) {
    const d = new Date();
    if (d.getUTCDay() === 5 && d.getUTCHours() >= 20 && !setup.symbol.startsWith("BTC") && !setup.symbol.startsWith("ETH")) {
      reasons.push("friday_close_protection");
    }
  }

  // Min confidence score + min RR (now configurable)
  if (setup.confidenceScore < ctx.account.minConfidenceScore) {
    reasons.push(`score_${setup.confidenceScore}_below_min_${ctx.account.minConfidenceScore}`);
  }
  if (setup.riskReward < ctx.account.minRiskReward) {
    reasons.push(`rr_${setup.riskReward.toFixed(2)}_below_min_${ctx.account.minRiskReward}`);
  }

  return { passed: reasons.length === 0, reasons };
}

async function getLatestMark(symbol: string, timeframe: string): Promise<number | null> {
  // Prefer the newest closed candle on this timeframe; fall back to any latest quote snapshot.
  const candle = await prisma.candle.findFirst({
    where: { symbol, timeframe, isClosed: true },
    orderBy: { openTime: "desc" },
    select: { close: true },
  });
  if (candle) return candle.close;
  const snap = await prisma.marketSnapshot.findFirst({
    where: { symbol },
    orderBy: { capturedAt: "desc" },
    select: { price: true },
  });
  return snap?.price ?? null;
}

function resolveOrderType(setup: any, mode: string): "instant_market" | "pending_limit" {
  if (mode === "instant_market") return "instant_market";
  if (mode === "pending_limit") return "pending_limit";
  // hybrid: A+ → instant so we don't miss the best setups, A → pending so we get a better fill
  return setup.qualityGrade === "A+" ? "instant_market" : "pending_limit";
}

async function openPaperPosition(setup: any, account: any, decisionLogId: string | null, overrideRisk?: number) {
  const riskAmount = overrideRisk ?? account.currentBalance * (account.riskPerTradePct / 100);
  const sizeUnits = sizeUnitsFromRisk(riskAmount, setup.entry, setup.stopLoss);
  if (sizeUnits <= 0) {
    return { rejected: true, reason: "invalid_size" };
  }

  const orderType = resolveOrderType(setup, account.orderPlacementMode ?? "pending_limit");
  const ttlMs = (account.pendingOrderTtlMinutes ?? 240) * 60_000;
  const validUntil = new Date(Date.now() + ttlMs);

  // Instant market path: fill immediately at the latest mark (if available) else at setup.entry.
  if (orderType === "instant_market") {
    const mark = await getLatestMark(setup.symbol, setup.timeframe);
    const fillPrice = mark ?? setup.entry;
    const order = await prisma.executionOrder.create({
      data: {
        accountId: account.id,
        setupId: setup.id,
        decisionLogId: decisionLogId ?? undefined,
        symbol: setup.symbol,
        timeframe: setup.timeframe,
        direction: setup.direction,
        orderType: "instant_market",
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
        validUntil,
        filledAt: new Date(),
        filledPrice: fillPrice,
      },
    });
    return await createPositionFromOrder(order, setup, account, decisionLogId, fillPrice, sizeUnits, riskAmount);
  }

  // Pending limit path: queue at setup.entry and wait for price to touch the zone.
  const order = await prisma.executionOrder.create({
    data: {
      accountId: account.id,
      setupId: setup.id,
      decisionLogId: decisionLogId ?? undefined,
      symbol: setup.symbol,
      timeframe: setup.timeframe,
      direction: setup.direction,
      orderType: "pending_limit",
      entry: setup.entry,
      stopLoss: setup.stopLoss,
      takeProfit1: setup.takeProfit1,
      takeProfit2: setup.takeProfit2,
      takeProfit3: setup.takeProfit3,
      riskAmount,
      sizeUnits,
      grade: setup.qualityGrade,
      confidenceScore: setup.confidenceScore,
      status: "pending",
      validUntil,
    },
  });
  return { rejected: false, pending: true, orderId: order.id };
}

async function createPositionFromOrder(order: any, setup: any, account: any, decisionLogId: string | null, fillPrice: number, sizeUnits: number, riskAmount: number) {
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
      price: fillPrice,
      reason: `Opened ${setup.direction} paper position on ${setup.qualityGrade} ${setup.setupType ?? "setup"} @ ${fillPrice.toFixed(5)} (${order.orderType})`,
    },
  });

  return { rejected: false, position };
}

/**
 * Process pending limit orders — for each, walk candles since order creation
 * and check if price touched the entry zone. Fill if yes. Cancel if the order
 * has gone stale (TTL exceeded, setup expired, thesis invalidated).
 */
async function processPendingOrders(account: any): Promise<{
  filled: number;
  cancelled: number;
  pending: number;
}> {
  const pendingOrders = await prisma.executionOrder.findMany({
    where: { accountId: account.id, status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  let filled = 0, cancelled = 0;
  const tolerancePct = account.pendingEntryTolerancePct ?? 0.08;

  for (const order of pendingOrders) {
    const nowMs = Date.now();

    // TTL / validity check first
    if (order.validUntil && order.validUntil.getTime() < nowMs) {
      await prisma.executionOrder.update({
        where: { id: order.id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: "ttl_expired",
        },
      });
      cancelled++;
      continue;
    }

    // Setup relevance check — cancel if the upstream TradeSetup has expired/closed
    const setup = await prisma.tradeSetup.findUnique({ where: { id: order.setupId } });
    if (!setup) {
      await prisma.executionOrder.update({
        where: { id: order.id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: "setup_missing",
        },
      });
      cancelled++;
      continue;
    }
    if (setup.status === "expired" || setup.status === "closed") {
      await prisma.executionOrder.update({
        where: { id: order.id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: `setup_${setup.status}`,
        },
      });
      cancelled++;
      continue;
    }

    // Structural invalidation: opposing CHoCH on same symbol/timeframe since order creation
    const opposingEvent = await prisma.structureEvent.findFirst({
      where: {
        symbol: order.symbol,
        timeframe: order.timeframe,
        detectedAt: { gte: order.createdAt },
        eventType: order.direction === "bullish" ? "choch_bearish" : "choch_bullish",
      },
    });
    if (opposingEvent) {
      await prisma.executionOrder.update({
        where: { id: order.id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: "thesis_invalidated",
        },
      });
      cancelled++;
      continue;
    }

    // Walk candles since the order was created to see if price touched the entry zone
    const candles = await prisma.candle.findMany({
      where: {
        symbol: order.symbol,
        timeframe: order.timeframe,
        openTime: { gte: order.createdAt },
        isClosed: true,
      },
      orderBy: { openTime: "asc" },
      select: { openTime: true, high: true, low: true, close: true },
    });

    const entryTol = Math.abs(order.entry) * (tolerancePct / 100);
    const isBull = order.direction === "bullish";
    let touched = false;
    let fillTime: Date | null = null;
    let fillPrice: number | null = null;

    for (const c of candles) {
      if (isBull) {
        // For long: we want to fill when price pulls back into entry (low ≤ entry + tol)
        if (c.low <= order.entry + entryTol) {
          touched = true;
          fillTime = c.openTime;
          fillPrice = order.entry;
          break;
        }
      } else {
        // For short: fill when price rallies into entry (high ≥ entry - tol)
        if (c.high >= order.entry - entryTol) {
          touched = true;
          fillTime = c.openTime;
          fillPrice = order.entry;
          break;
        }
      }
    }

    // Also look at the latest live quote — catch fills in between candle closes
    if (!touched) {
      const latestMark = await getLatestMark(order.symbol, order.timeframe);
      if (latestMark !== null) {
        if (isBull && latestMark <= order.entry + entryTol) {
          touched = true;
          fillTime = new Date();
          fillPrice = Math.min(latestMark, order.entry);
        } else if (!isBull && latestMark >= order.entry - entryTol) {
          touched = true;
          fillTime = new Date();
          fillPrice = Math.max(latestMark, order.entry);
        }
      }
    }

    if (touched && fillPrice !== null && fillTime !== null) {
      await prisma.executionOrder.update({
        where: { id: order.id },
        data: {
          status: "filled",
          filledAt: fillTime,
          filledPrice: fillPrice,
        },
      });
      await createPositionFromOrder(
        { id: order.id, orderType: order.orderType },
        {
          id: order.setupId,
          symbol: order.symbol,
          timeframe: order.timeframe,
          direction: order.direction,
          entry: order.entry,
          stopLoss: order.stopLoss,
          takeProfit1: order.takeProfit1,
          takeProfit2: order.takeProfit2,
          takeProfit3: order.takeProfit3,
          qualityGrade: order.grade,
          setupType: "pending_fill",
        },
        account,
        order.decisionLogId ?? null,
        fillPrice,
        order.sizeUnits,
        order.riskAmount,
      );
      filled++;
    }
  }

  const stillPending = await prisma.executionOrder.count({
    where: { accountId: account.id, status: "pending" },
  });
  return { filled, cancelled, pending: stillPending };
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
      // Respect any prior partial-close: only the remaining portion realizes at SL/TP.
      const remainingUnits = pos.sizeUnits * (1 - (pos.closedPct ?? 0) / 100);
      const realized = pnlFromPrice(pos.direction, pos.entry, exitPrice, remainingUnits);
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

  // 0b. Apply adaptive protection (Layer 12) — partial exits, SL moves, thesis-invalidated closes
  await applyAdaptiveProtection();

  // Reload account since protection may have changed balance
  account = (await prisma.executionAccount.findUnique({ where: { id: account.id } })) ?? account;

  // 0c. Process pending limit orders — fill when price touches entry, cancel when stale
  const pendingResult = await processPendingOrders(account);

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
    if (result.rejected) {
      ordersRejected++;
    } else {
      ordersOpened++;
      // Instant-market result carries a position; pending-limit result doesn't.
      if ("position" in result && result.position) {
        openPositions.push(result.position);
      }
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
    ordersPending: pendingResult.pending,
    pendingFilled: pendingResult.filled,
    pendingCancelled: pendingResult.cancelled,
    positionsClosed: management.closed,
    realizedPnlDelta: management.realizedPnlDelta,
    killSwitchEngaged: account.killSwitchEngaged,
  };
}
